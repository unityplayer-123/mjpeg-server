const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();

let latestImageBuffer = null;

// 保存ディレクトリ
const FRAME_DIR = path.join(__dirname, 'frames');
if (!fs.existsSync(FRAME_DIR)) {
    fs.mkdirSync(FRAME_DIR);
}

// JPEG 受信（Unity → Render）
app.use(express.raw({ type: 'image/jpeg', limit: '10mb' }));

app.post('/upload', (req, res) => {
    latestImageBuffer = req.body;
    res.status(200).send('Image received');
});

// MJPEG 配信
app.get('/screen', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const interval = 1000 / 15;

    const sendFrame = () => {
        if (latestImageBuffer) {
            res.write(`--frame\r\n`);
            res.write(`Content-Type: image/jpeg\r\n`);
            res.write(`Content-Length: ${latestImageBuffer.length}\r\n\r\n`);
            res.write(latestImageBuffer);
            res.write(`\r\n`);
        }
    };

    const timer = setInterval(sendFrame, interval);

    req.on('close', () => clearInterval(timer));
});

// HTML から PNG 保存
app.post('/save-frame', express.raw({ type: 'image/png', limit: '10mb' }), (req, res) => {
    const frameId = req.query.id;
    if (!frameId) {
        res.status(400).send('Missing frame id');
        return;
    }

    const filePath = path.join(FRAME_DIR, `frame_${frameId}.png`);
    fs.writeFileSync(filePath, req.body);

    res.status(200).send('Saved');
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
