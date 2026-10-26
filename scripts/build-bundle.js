#!/usr/bin/env node
/**
 * build-bundle.js — 把 public/ 打成热更新所需的 bundle.zip
 *
 * 用法：
 *   node scripts/build-bundle.js                     # 自动递增版本号
 *   node scripts/build-bundle.js 1.0.5               # 指定版本号
 *   node scripts/build-bundle.js 1.0.5 --push https://你的服务/updates --token abc123
 *
 * 产物：bundle-dist/<version>.zip  +  bundle-dist/latest.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const webDir = path.join(root, 'public');
const outDir = path.join(root, 'bundle-dist');

// 这些不该进热更新包（APK 是旧产物，体积巨大）
const EXCLUDE = ['*.apk', '*.bak', 'node_modules', 'bundle-dist', '.DS_Store', 'Thumbs.db'];

const args = process.argv.slice(2);
let version = args.find(a => !a.startsWith('--'));

const pushIdx = args.indexOf('--push');
const push = pushIdx >= 0;
let pushUrl = pushIdx >= 0 ? args[pushIdx + 1] : '';
if (pushUrl && pushUrl.startsWith('--')) pushUrl = '';
pushUrl = pushUrl || process.env.UPDATE_SERVER || '';

const tokenIdx = args.indexOf('--token');
const token = (tokenIdx >= 0 ? args[tokenIdx + 1] : '') || process.env.PUBLISH_TOKEN || '';

function nextVersion() {
  if (!fs.existsSync(outDir)) return '1.0.1';
  let max = 0;
  fs.readdirSync(outDir)
    .filter(f => /^1\.0\.\d+\.zip$/.test(f))
    .forEach(f => {
      const n = Number(f.replace(/^1\.0\.(\d+)\.zip$/, '$1'));
      if (n > max) max = n;
    });
  return '1.0.' + (max + 1);
}

function pack(zipPath) {
  // ⚠️ 不能直接用 `Get-ChildItem | Compress-Archive`：
  // 走管道时 Compress-Archive 会把子目录里的文件**平铺到压缩包根目录**（src/logic.js → logic.js），
  // 导致 index.html 找不到 src/logic.js 而白屏。
  // 正确做法：先复制到一个干净的临时目录，再用 -Path 参数整体打包，目录结构才会保留。
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-'));
  try {
    fs.cpSync(webDir, tmp, {
      recursive: true,
      filter: (src) => {
        const name = path.basename(src);
        if (/\.(apk|bak)$/i.test(name)) return false;   // APK 是旧产物，体积巨大
        if (name === 'node_modules' || name === 'bundle-dist') return false;
        if (name === '.DS_Store' || name === 'Thumbs.db') return false;
        return true;
      }
    });
    if (process.platform === 'win32') {
      const ps = `Compress-Archive -Path '${tmp}\\*' -DestinationPath '${zipPath}' -Force`;
      execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe' });
    } else {
      execFileSync('zip', ['-rq', zipPath, '.', '-x'].concat(EXCLUDE.map(e => `"${e}"`)), { cwd: tmp, stdio: 'pipe' });
    }
  } finally {
    // 清理临时目录失败不影响产物（最多留个临时文件夹）
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

(async function main() {
  if (!version) version = nextVersion();
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const zipPath = path.join(outDir, `${version}.zip`);
  // 不预先删除：Compress-Archive -Force 会覆盖。
  // （某些受限环境下删除操作会被拦截，交给压缩工具覆盖更稳妥）

  console.log(`打包 public/ → ${version}.zip ...`);
  pack(zipPath);

  if (!fs.existsSync(zipPath)) { console.error('打包失败：未生成 zip'); process.exit(1); }
  const buf = fs.readFileSync(zipPath);
  const checksum = crypto.createHash('sha256').update(buf).digest('hex');

  const manifest = { version, file: `${version}.zip`, checksum, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(manifest, null, 2));

  console.log(`✅ 已生成 bundle-dist/${version}.zip  (${(buf.length / 1024).toFixed(1)} KB)`);
  console.log(`   sha256: ${checksum.slice(0, 16)}...`);

  if (push) {
    if (!pushUrl) { console.error('❌ --push 需要提供服务器地址，或设置环境变量 UPDATE_SERVER'); process.exit(1); }
    const target = `${String(pushUrl).replace(/\/+$/, '')}/publish?version=${encodeURIComponent(version)}`;
    try {
      const r = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip', 'x-update-token': token },
        body: buf
      });
      const text = await r.text();
      console.log(`发布 → ${target}`);
      console.log(`结果 ${r.status}: ${text}`);
      if (!r.ok) process.exitCode = 1;
    } catch (e) {
      console.error('❌ 发布失败:', e.message);
      process.exitCode = 1;
    }
  } else {
    console.log('\n下一步：把 bundle-dist/ 放到更新服务器，或执行');
    console.log(`  node update-server.js   然后  node scripts/build-bundle.js ${version} --push http://<你的服务>/updates --token <token>`);
  }
})();
