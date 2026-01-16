const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();

let latestImageBuffer = null;
let latestFrameId = null;

const FRAME_DIR = path.join(__dirname, 'frames');
if (!fs.existsSync(FRAME_DIR)) fs.mkdirSync(FRAME_DIR);

// ✅ "1" のときだけ保存する（バグ修正）
const SAVE_JPEG = process.env.SAVE_JPEG === '1';

// ✅ public 配信（index.html を確実に出す）
app.use(express.static(path.join(__dirname, 'public')));

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
  if (!frameId) return res.status(400).send('Missing frame id. Use /upload?id=123');

  latestFrameId = String(frameId);
  latestImageBuffer = Buffer.from(req.body);

  // 返事は先に返す（配信優先）
  res.status(200).send('Image received');

  if (SAVE_JPEG) {
    const jpegPath = path.join(FRAME_DIR, `mjpeg_${String(frameId).padStart(6, '0')}.jpg`);
    try {
      await fs.promises.writeFile(jpegPath, latestImageBuffer);
    } catch (e) {
      console.error('Failed to write JPEG:', e);
    }
  }
});

// ✅ 比較用：単発JPEG（ポーリング型の比較がしやすい）
app.get('/latest.jpg', (req, res) => {
  if (!latestImageBuffer) return res.status(404).send('No frame yet');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.end(latestImageBuffer);
});

// ✅ 公開MJPEG配信（multipart）
app.get('/screen', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.flushHeaders?.();

  const fps = Math.min(30, Math.max(1, Number(req.query.fps ?? 15) || 15));
  const interval = Math.round(1000 / fps);

  let closed = false;
  req.on('close', () => { closed = true; });

  let waitingDrain = false;

  const timer = setInterval(() => {
    if (closed) {
      clearInterval(timer);
      return;
    }
    if (!latestImageBuffer) return;
    if (waitingDrain) return;

    const header =
      `--frame\r\n` +
      `Content-Type: image/jpeg\r\n` +
      `Content-Length: ${latestImageBuffer.length}\r\n` +
      `X-Frame-Id: ${latestFrameId ?? ''}\r\n` +
      `\r\n`;

    // backpressure 対応（詰まったら drain を待つ）
    const ok1 = res.write(header);
    const ok2 = res.write(latestImageBuffer);
    const ok3 = res.write('\r\n');

    if (!(ok1 && ok2 && ok3)) {
      waitingDrain = true;
      res.once('drain', () => {
        waitingDrain = false;
      });
    }
  }, interval);
});

// PNG保存
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
