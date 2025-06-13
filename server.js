const express = require('express');
const multer = require('multer');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 10000;

// メモリに一時保存する multer 設定
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 最新画像のURLで画像を返す（jpg）
app.use('/latest.jpg', (req, res) => {
    res.sendFile(__dirname + '/uploads/latest.jpg');
});

// POSTでJPEGを受け取って保存
app.post('/upload', upload.single('frame'), (req, res) => {
    if (!req.file) return res.status(400).send('No file');
    fs.writeFileSync(__dirname + '/uploads/latest.jpg', req.file.buffer);
    res.send('OK');
});

// HTML等の静的ファイル公開
app.use('/', express.static(__dirname + '/public'));

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
