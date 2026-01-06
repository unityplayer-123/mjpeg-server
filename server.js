const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();

let latestImageBuffer = null;
let latestFrameId = null;

// ===== 保存ディレクトリ =====
const FRAME_DIR = path.join(__dirname, 'frames');
if (!fs.existsSync(FRAME_DIR)) {
  fs.mkdirSync(FRAME_DIR);
}

// ✅ Render ヘルスチェック対策
app.get('/', (req, res) => res.status(200).send('OK'));
app.get('/health', (req, res) => res.status(200).send('healthy'));

// ✅ 保存状況確認（デバッグ用）
app.get('/count', (req, res) => {
  try {
    const files = fs.readdirSync(FRAME_DIR);
    res.json({ count: files.length, files: files.slice(0, 30) });
  } catch (e) {
    res.status(500).send(String(e));
  }
});

// ✅ HTML同期用：最新フレームID
app.get('/latest-id', (req, res) => {
  res.json({ frameId: latestFrameId });
});

// ===== JPEG 受信（Unity → Render） =====
// Unity側で Content-Type: image/jpeg で送ってくる想定
app.use(express.raw({ type: 'image/jpeg', limit: '10mb' }));

app.post('/upload', (req, res) => {
  // ★Unity側は /upload?id=123 の形で送る必要あり
  const frameId = req.query.id;

  if (!frameId) {
    res.status(400).send('Missing frame id. Use /upload?id=123');
    return;
  }

  latestFrameId = String(frameId);
  latestImageBuffer = req.body;

  // ★ユーザが実際に見るJPEGを保存（これがZIPの中身になる）
  const jpegPath = path.join(FRAME_DIR, `mjpeg_${String(frameId).padStart(6, '0')}.jpg`);
  try {
    fs.writeFileSync(jpegPath, req.body);
  } catch (e) {
    console.error('Failed to write JPEG:', e);
    res.status(500).send('Failed to save jpeg');
    return;
  }

  // デバッグログ（Render Logsで確認できる）
  console.log('UPLOAD OK', frameId, 'bytes=', req.body?.length);

  res.status(200).send('Image received');
});

// ===== MJPEG 配信（閲覧用） =====
app.get('/screen', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const interval = 1000 / 15;

  const timer = setInterval(() => {
    if (latestImageBuffer) {
      res.write(`--frame\r\n`);
      res.write(`Content-Type: image/jpeg\r\n`);
      res.write(`Content-Length: ${latestImageBuffer.length}\r\n\r\n`);
      res.write(latestImageBuffer);
      res.write(`\r\n`);
    }
  }, interval);

  req.on('close', () => clearInterval(timer));
});

// ===== HTML から PNG 保存（必要なら使う） =====
app.post('/save-frame', express.raw({ type: 'image/png', limit: '10mb' }), (req, res) => {
  const frameId = req.query.id;
  if (!frameId) {
    res.status(400).send('Missing frame id');
    return;
  }

  const filePath = path.join(FRAME_DIR, `html_${String(frameId).padStart(6, '0')}.png`);
  try {
    fs.writeFileSync(filePath, req.body);
  } catch (e) {
    console.error('Failed to write PNG:', e);
    res.status(500).send('Failed to save png');
    return;
  }

  res.status(200).send('Saved');
});

// ===== ZIP ダウンロード =====
app.get('/download', (req, res) => {
  res.attachment('frames.zip');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('ZIP error:', err);
    res.status(500).send('ZIP error');
  });

  archive.pipe(res);
  archive.directory(FRAME_DIR, false);
  archive.finalize();
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
