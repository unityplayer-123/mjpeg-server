const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();

let latestImageBuffer = null;
let latestFrameId = null;

// 保存ディレクトリ
const FRAME_DIR = path.join(__dirname, 'frames');
if (!fs.existsSync(FRAME_DIR)) {
    fs.mkdirSync(FRAME_DIR);
}

// JPEG 受信（Unity → Render）
app.use(express.raw({ type: 'image/jpeg', limit: '10mb' }));

app.post('/upload', (req, res) => {
    // ★ Unity から ?id=123 で来る
    const frameId = req.query.id;

    if (!frameId) {
        res.status(400).send('Missing frame id');
        return;
    }

    latestFrameId = frameId;
    latestImageBuffer = req.body;

    // ★ 実際にユーザが見る JPEG を ID 付きで保存
    const jpegPath = path.join(FRAME_DIR, `mjpeg_${frameId}.jpg`);
    fs.writeFileSync(jpegPath, req.body);

    res.status(200).send('Image received');
});

// MJPEG 配信（ユーザ閲覧用）
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

// ZIP ダウンロード
app.get('/download', (req, res) => {
    res.attachment('frames.zip');

    const archive = archiver('zip');
    archive.pipe(res);
    archive.directory(FRAME_DIR, false);
    archive.finalize();
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

