#!/usr/bin/env node
/**
 * update-server.js — 极简热更新服务端（零依赖，只用到 Node 内置模块）
 *
 * 用法一：独立启动
 *     PORT=3000 PUBLISH_TOKEN=xxx BUNDLE_DIR=./bundle-dist node update-server.js
 *
 * 用法二：挂到已有 Express 服务后面（不改现有依赖）
 *     const updateHandler = require('./update-server');
 *     app.use('/updates', (req,res,next)=>{
 *       // 把 baseUrl 下的路径截掉后交给 handler
 *       req.url = req.originalUrl.replace('/updates','') || '/';
 *       updateHandler(req,res,next);
 *     });
 *
 * 接口：
 *   GET  /check?version=<客户端当前版本>  →  有新版本返回 {version,url,checksum,message}；无则返回 {}
 *   GET  /download/<file>               →  下载 bundle zip
 *   POST /publish?version=x             →  上传 zip（Header: x-update-token），更新最新版本
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BUNDLE_DIR = process.env.BUNDLE_DIR || path.join(__dirname, 'bundle-dist');
const TOKEN = process.env.PUBLISH_TOKEN || 'change-me';
const BASE_URL = process.env.PUBLIC_BASE_URL || ''; // 例：https://xxx.onrender.com/updates

const MAX_BODY = 60 * 1024 * 1024; // 60MB 上限

if (!fs.existsSync(BUNDLE_DIR)) fs.mkdirSync(BUNDLE_DIR, { recursive: true });

const latestFile = () => path.join(BUNDLE_DIR, 'latest.json');

function readLatest() {
  if (!fs.existsSync(latestFile())) return null;
  try { return JSON.parse(fs.readFileSync(latestFile(), 'utf8')); }
  catch (e) { return null; }
}

function safeJoin(dir, name) {
  const target = path.join(dir, path.basename(String(name || '')));
  const resolved = path.resolve(target);
  return resolved.startsWith(path.resolve(dir)) ? resolved : null;
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function handler(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  // 检查更新（兼容两种访问路径）
  //  - /check            : 我们自测用的接口
  //  - /capacitor-updater: @capgo/capacitor-updater 客户端 getLatest() 实际请求的端点
  const CHECK_PATHS = ['/check', '/capacitor-updater', '/updates', ''];
  if (req.method === 'GET' && CHECK_PATHS.includes(pathname)) {
    const latest = readLatest();
    if (!latest || !latest.version) return sendJSON(res, 200, {});
    // 客户端带 ?version=<当前版本> 时，若已是最新返回 {}（capgo 据此判定无需更新）
    if (url.searchParams.get('version') === latest.version) return sendJSON(res, 200, {});
    // Render 等代理会注入 x-forwarded-proto，用它生成 https 下载地址
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const base = BASE_URL || `${proto}://${req.headers.host}`;
    return sendJSON(res, 200, {
      version: latest.version,
      url: `${base}/download/${latest.file}`,
      checksum: latest.checksum || '',
      message: latest.message || '有新版本可用'
    });
  }

  // 下载 bundle
  if (req.method === 'GET' && pathname.startsWith('/download/')) {
    const file = safeJoin(BUNDLE_DIR, pathname.slice('/download/'.length));
    if (!file || !fs.existsSync(file)) return sendJSON(res, 404, { error: 'not found' });
    // bundle 体积通常只有几十 KB，直接一次性发送比流式 pipe 更稳（避免不同 Node 版本 pipe 行为差异）
    const data = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': data.length
    });
    return res.end(data);
  }

  // 发布新版本
  if (req.method === 'POST' && pathname === '/publish') {
    if (req.headers['x-update-token'] !== TOKEN) return sendJSON(res, 401, { error: 'unauthorized' });
    const version = String(url.searchParams.get('version') || '').replace(/[^0-9a-zA-Z.\-_]/g, '_');
    if (!version) return sendJSON(res, 400, { error: 'missing version' });

    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (!buf.length) return sendJSON(res, 400, { error: 'empty body' });
      const file = `${version}.zip`;
      fs.writeFileSync(path.join(BUNDLE_DIR, file), buf);
      const checksum = crypto.createHash('sha256').update(buf).digest('hex');
      fs.writeFileSync(latestFile(), JSON.stringify({ version, file, checksum }, null, 2));
      sendJSON(res, 200, { ok: true, version, file, size: buf.length, checksum });
    });
    req.on('error', () => sendJSON(res, 500, { error: 'upload failed' }));
    return;
  }

  // 概览
  if (req.method === 'GET' && pathname === '/') {
    const latest = readLatest();
    return sendJSON(res, 200, {
      ok: true,
      service: 'capacitor-updater',
      latest: latest ? { version: latest.version, file: latest.file } : null
    });
  }

  if (next) return next();
  sendJSON(res, 404, { error: 'not found' });
}

module.exports = handler;

if (require.main === module) {
  // 独立模式：把 /updates 前缀和根路径都交给 handler
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/updates')) {
      req.url = req.url.replace('/updates', '') || '/';
      return handler(req, res);
    }
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('update server ok\ntry /updates/\n'); }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found\n');
  });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`update server listening on :${port}`);
    console.log(`bundle dir: ${BUNDLE_DIR}`);
    console.log(`check url:  http://localhost:${port}/updates/check`);
  });
}
