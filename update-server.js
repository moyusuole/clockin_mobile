/**
 * update-server.js — 极简 Capacitor 热更新自托管服务。
 * 部署到 Render（见 render.yaml）。职责：
 *   GET  /           健康检查
 *   GET  /update     返回最新版本信息 { version, url }
 *   POST /upload     接收 GitHub Actions 上传的 web.zip（需 token）
 *   /updates/web.zip 公开下载最新更新包
 *
 * 持久目录 UPDATES_DIR：Render 会把持久磁盘挂载到 /app/updates（见 render.yaml disk.mountPath）。
 * 本地未挂载磁盘时，回退到项目根下的 updates/（重启会清空，仅开发用）。
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.UPDATE_TOKEN || '';
const UPDATES_DIR = process.env.UPDATES_DIR || path.join(__dirname, 'updates');
const MANIFEST = path.join(UPDATES_DIR, 'manifest.json');

fs.mkdirSync(UPDATES_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) { cb(null, UPDATES_DIR); },
    filename: function (req, file, cb) { cb(null, 'web.zip'); }
  })
});

app.get('/', function (req, res) {
  res.json({ ok: true, service: 'clockin-update' });
});

app.get('/update', function (req, res) {
  if (!fs.existsSync(MANIFEST)) return res.status(404).json({ error: 'no update yet' });
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const base = process.env.PUBLIC_URL || (req.protocol + '://' + req.get('host'));
  res.json({ version: m.version, url: base + '/updates/web.zip', uploadedAt: m.uploadedAt });
});

app.post('/upload', function (req, res) {
  const token = req.query.token || '';
  if (TOKEN && token !== TOKEN) return res.status(403).json({ error: 'forbidden' });
  upload.single('file')(req, res, function (err) {
    if (err) return res.status(400).json({ error: String(err) });
    if (!req.file) return res.status(400).json({ error: 'missing file' });
    const version = req.body.version || String(Date.now());
    fs.writeFileSync(MANIFEST, JSON.stringify({ version: version, uploadedAt: new Date().toISOString() }));
    res.json({ ok: true, version: version });
  });
});

app.use('/updates', express.static(UPDATES_DIR));

app.listen(PORT, function () {
  console.log('clockin-update listening on ' + PORT);
});
