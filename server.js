const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();

// ======================================================
// 設定
// ======================================================
const FRAME_DIR = path.join(__dirname, 'frames');
const SAVE_FPS = 30;
let frameId = 0;
let latestImageBuffer = null;

// 保存ディレクトリ作成
if (!fs.existsSync(FRAME_DIR)) {
    fs.mkdirSync(FRAME_DIR);
}

// ======================================================
// JPEG 受信（Unity → Render）
// ======================================================
app.use(express.raw({ type: 'image/jpeg', limit: '10mb' }));

app.post('/upload', (req, res) => {
    latestImageBuffer = req.body;

    // frameId 採番
    frameId++;
    const filename = `frame_${String(frameId).padStart(4, '0')}.jpg`;
    const filepath = path.join(FRAME_DIR, filename);

    fs.writeFileSync(filepath, req.body);

    res.status(200).send('Image received');
});

// ======================================================
// MJPEG 配信（ブラウザ表示用）
// ======================================================
app.get('/screen', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const interval = 1000 / SAVE_FPS;

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

// ======================================================
// ZIP ダウンロード
// ======================================================
app.get('/download', (req, res) => {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=frames.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    archive.directory(FRAME_DIR, false);
    archive.finalize();
});

// ======================================================
// 起動
// ======================================================
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
