/**
 * server.js — 零依赖本地静态预览服务器（仅用于手机/桌面浏览器预览，生产可托管任意静态空间）
 * 用法: node server.js   然后浏览器打开 http://127.0.0.1:8080
 * 真部署到手机：把 public/ 整个目录传到任意静态托管（或 Capacitor 打包成原生 App）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

http.createServer(function (req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const safePath = path.normalize(path.join(ROOT, urlPath));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(safePath, function (err, data) {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', function () {
  console.log('Checkin-mobile preview: http://127.0.0.1:' + PORT);
});
