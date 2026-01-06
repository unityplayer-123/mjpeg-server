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

// ✅ Renderのヘルスチェック対策（必ず200を返す）
app.get('/', (req, res) => {
  res.status(200).send('OK');
});
app.get('/health', (req, res) => {
  res.status(200).send('healthy');
});

// ===== JPEG 受信（Unity → Render） =====
app.use(express.raw({ type: 'image/jpeg', limit: '10mb' }));

app.post('/upload', (req, res) => {
  // Unity 側：?id=123
  const frameId = req.query.id;

  if (!frameId) {
    res.status(400).send('Missing frame id');
    return;
  }

  latestFrameId = frameId;
  latestImageBuffer = req.body;

  // ① ユーザが実際に見る JPEG を保存
  const jpegPath = path.join(FRAME_DIR, `mjpeg_${frameId}.jpg`);
  fs.writeFileSync(jpegPath, req.body);

  res.status(200).send('Image received');
});

// ===== HTML 用：最新フレームID取得 =====
app.get('/latest-id', (req, res) => {
  res.json({ frameId: latestFrameId });
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

// ===== HTML → PNG 保存 =====
app.post(
  '/save-frame',
  express.raw({ type: 'image/png', limit: '10mb' }),
  (req, res) => {
    const frameId = req.query.id;

    if (!frameId) {
      res.status(400).send('Missing frame id');
      return;
    }

    const pngPath = path.join(FRAME_DIR, `html_${frameId}.png`);
    fs.writeFileSync(pngPath, req.body);

    res.status(200).send('Saved');
  }
);

// ===== ZIP ダウンロード =====
app.get('/download', (req, res) => {
  res.attachment('frames.zip');

  const archive = archiver('zip');
  archive.pipe(res);
  archive.directory(FRAME_DIR, false);
  archive.finalize();
});

const port = process.env.PORT || 3000;

// ✅ 0.0.0.0 を明示（外部から到達できるようにする）
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
