const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();

let latestImageBuffer = null;
let latestFrameId = null;

const FRAME_DIR = path.join(__dirname, 'frames');
if (!fs.existsSync(FRAME_DIR)) fs.mkdirSync(FRAME_DIR);

// 保存をしたいときだけ true にする（普段は false 推奨）
const SAVE_JPEG = process.env.SAVE_JPEG === '0'; // Renderの環境変数で制御できる

app.get('/', (req, res) => res.status(200).send('OK'));
app.get('/health', (req, res) => res.status(200).send('healthy'));

app.get('/count', (req, res) => {
  try {
    const files = fs.readdirSync(FRAME_DIR);
    res.json({ count: files.length, files: files.slice(0, 30) });
  } catch (e) {
    res.status(500).send(String(e));
  }
});

app.get('/latest-id', (req, res) => {
  res.json({ frameId: latestFrameId });
});

// raw jpeg body
app.use(express.raw({ type: 'image/jpeg', limit: '10mb' }));

app.post('/upload', async (req, res) => {
  const frameId = req.query.id;
  if (!frameId) {
    res.status(400).send('Missing frame id. Use /upload?id=123');
    return;
  }

  latestFrameId = String(frameId);
  // 念のため Buffer 化（express.raw は Buffer だけど保険）
  latestImageBuffer = Buffer.from(req.body);

  // 返事は先に返す（配信優先）
  res.status(200).send('Image received');

  // JPG保存は「必要なときだけ」＆「非同期」
  if (SAVE_JPEG) {
    const jpegPath = path.join(FRAME_DIR, `mjpeg_${String(frameId).padStart(6, '0')}.jpg`);
    try {
      await fs.promises.writeFile(jpegPath, latestImageBuffer);
    } catch (e) {
      console.error('Failed to write JPEG:', e);
    }
  }

  // デバッグログ（多すぎるなら間引き推奨）
  // console.log('UPLOAD OK', frameId, 'bytes=', latestImageBuffer.length);
});

// MJPEG配信
app.get('/screen', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Connection': 'keep-alive',
  });

  // これを入れるとプロキシ環境で安定することがある
  res.flushHeaders?.();

  const interval = 1000 / 15;

  const timer = setInterval(() => {
    if (!latestImageBuffer) return;

    res.write(`--frame\r\n`);
    res.write(`Content-Type: image/jpeg\r\n`);
    res.write(`Content-Length: ${latestImageBuffer.length}\r\n\r\n`);
    res.write(latestImageBuffer);
    res.write(`\r\n`);
  }, interval);

  req.on('close', () => clearInterval(timer));
});

// PNG保存（これは保存中だけ呼ばれる前提なのでOK。ただし負荷が高ければ async化推奨）
app.post('/save-frame', express.raw({ type: 'image/png', limit: '10mb' }), async (req, res) => {
  const frameId = req.query.id;
  if (!frameId) return res.status(400).send('Missing frame id');

  const filePath = path.join(FRAME_DIR, `html_${String(frameId).padStart(6, '0')}.png`);
  try {
    await fs.promises.writeFile(filePath, req.body);
    res.status(200).send('Saved');
  } catch (e) {
    console.error('Failed to write PNG:', e);
    res.status(500).send('Failed to save png');
  }
});

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
app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));
