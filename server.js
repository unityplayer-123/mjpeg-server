const express = require('express');
const fs = require('fs');
const app = express();

let latestImageBuffer = null;

app.use(express.raw({ type: 'image/jpeg', limit: '10mb' }));

// JPEGを受け取る
app.post('/upload', (req, res) => {
    latestImageBuffer = req.body;
    res.status(200).send('Image received');
});

// MJPEG表示用
app.get('/screen', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const targetInterval = 1000 / 30; // 30fps → 約33ms間隔
    let lastSentTime = Date.now();
    let isClientConnected = true;

    const sendFrame = () => {
        if (!isClientConnected) return;

        const now = Date.now();
        const elapsed = now - lastSentTime;

        if (latestImageBuffer) {
            res.write(`--frame\r\n`);
            res.write(`Content-Type: image/jpeg\r\n`);
            res.write(`Content-Length: ${latestImageBuffer.length}\r\n\r\n`);
            res.write(latestImageBuffer);
            res.write(`\r\n`);
        }

        lastSentTime = now;
        const nextDelay = Math.max(0, targetInterval - (Date.now() - now));
        setTimeout(sendFrame, nextDelay);
    };

    sendFrame();

    req.on('close', () => {
        isClientConnected = false;
    });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
