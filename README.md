# 每日打卡 · 手机原生 App

制定任务 + 每天打卡的移动端应用。**用 Capacitor 封装成真·原生 App（安卓 APK / iOS）**，数据只存在你这部手机本地，彻底离线、**不依赖任何服务器**——没带电脑、没网也能照常打卡。

> 之前用「电脑当服务器 + 手机访问」的方案，出门不带电脑就访问不了。这个原生 App 方案彻底解决了该问题：App 装进手机后，一切都在手机里跑。

## 功能
- 制定任务（标题 / 分类 / 备注），可编辑、归档、删除
- 每日打卡：勾选完成，实时进度条
- 统计：连续打卡天数、近 30 天完成率、每个任务的连续天数
- 历史回看 / 补打卡：切换任意日期
- **数据备份**：一键导出 JSON 备份文件，随时导入恢复（换手机 / 误删 App 不丢数据）

## 技术栈
- 前端：原生 HTML / CSS / JS（`public/`）
- 存储：原生 App 用 `@capacitor/preferences`（手机 SharedPreferences）；电脑预览时自动回退 localStorage
- 封装：Capacitor（安卓 APK / iOS），`webDir = public`

## 本地预览（电脑浏览器，开发用）
```bash
cd checkin-mobile
npm install
npm run build:vendor   # 可选：生成热更新桥接文件 public/vendor/capacitor-updater.js（不影响本地预览）
node server.js
# 打开 http://localhost:8080
```
预览走 localStorage 分支，功能与真机一致；要真·原生体验请打包 APK。

## 云端打包 APK（推荐：本机什么都不用装）
你电脑上**没有 Android Studio / Android SDK / JDK17**，本机出包要装好几个 G。最省事的办法是推到 GitHub，用 GitHub Actions 云端编译：

1. 在 GitHub 新建一个空仓库（例如 `checkin-mobile`），**不要**勾选自动生成 README/LICENSE（保持空仓库）。
2. 在 `checkin-mobile/` 目录里执行（仓库已 `git init` 并提交，你只需连远程 + push）：
   ```bash
   git remote add origin https://github.com/<你的用户名>/checkin-mobile.git
   git branch -M main
   git push -u origin main
   ```
3. 打开仓库的 **Actions** 标签页 → 首次会提示「允许 workflow」→ 允许后 Actions 会自动开始运行（或在 Actions 页点 **Run workflow** 手动触发）。
4. 等待约 3–6 分钟，状态变绿后，在最近一次运行页底部 **Artifacts** 处下载 `app-debug-apk`。
5. 解压得到 `app-debug.apk`，用数据线传到安卓手机安装即可。

> workflow 已配好：`.github/workflows/build-apk.yml`（setup-java17 + Node + `npx cap sync android` + `./gradlew assembleDebug` + 上传 APK 产物）。
> 改了 `public/` 后，重新 `git push` 就会自动重新出包。

## 打包成安卓 APK（在你自己的电脑上）
前提：电脑已装 **Node.js**、**Java JDK 17**、**Android Studio**（含 Android SDK + 命令行工具）。

```bash
cd checkin-mobile
npm install                  # 安装依赖（含 @capacitor/*）
npx cap sync android        # 把 public/ 最新代码同步进 android 工程
npx cap build android       # 编译生成 APK（首次需联网下载 Gradle 依赖）
```
生成位置：`android/app/build/outputs/apk/debug/app-debug.apk`
用数据线传到安卓手机安装即可——**无需联网、无需电脑常开**。

> 改了 `public/` 下的前端代码后，重新 `npx cap sync android` 再 `npx cap build android`。

## 打包成 iOS（需 macOS + Xcode）
```bash
npm install
npx cap add ios
npx cap sync ios
npx cap open ios            # 用 Xcode 打开，运行 / Archive 出 ipa
```

## 数据说明
- 任务与打卡记录**只存在你这部手机**（SharedPreferences / App 沙盒），不上传任何服务器。
- 卸载 App 会清空数据，**务必定期导出备份**：在 App 内点「数据备份 → 导出备份」，会把全部任务与打卡记录导出为 `checkin-backup-日期.json`。
  - 原生 App：优先调用系统分享（可存到微信文件传输助手 / 邮件 / 网盘等）。
  - 电脑预览：直接下载到本机。
- 恢复：点「导入备份」选中备份文件即可一键还原。
- 已预留多用户结构（数据按 `user_id` 隔离），未来接后端时只需切换 storage 后端。

## 工程结构
- `public/index.html` `styles.css` `app.js` — 界面与交互
- `public/src/logic.js` — 纯逻辑（连续天数 / 完成率，已单测）
- `public/src/storage.js` — 数据层（Capacitor 优先 + localStorage 回退）
- `capacitor.config.json` — Capacitor 配置（appId / appName / webDir）
- `android/` — Capacitor 生成的安卓工程（`npx cap sync` 维护，勿手改）
- `server.js` — 零依赖本地预览服务器
- `test/` — 逻辑与存储层自测

## 热更新（自托管，免重装 APK）
原生 App 的代码是「烤」进安装包的，但**网页层（HTML/JS/CSS）可以走 Capacitor 热更新（live update）**：push 后手机上的 App 自动拉取新版网页资源，**不用重新装 APK**。页面样式 / 打卡逻辑这类改动都属于网页层，配置好一次后，以后改页面直接 push 即可，手机会在下次打开时自动更新。

> 热更新**只更新网页层**。若以后改了原生层（`android/` 里的 Java、新增 Capacitor 插件），仍需重新出 APK 安装。

### 一次性准备（之后就不用了）
1. **改一处代码**：打开 `public/app.js` 顶部，把
   `var UPDATER_SERVER = 'https://clockin-update.onrender.com';`
   改成你的更新服务地址（第 3 步拿到地址后再改，或先用占位、首次出包前改对）。
2. **在 Render 建更新服务**：New → Web Service → 连 GitHub 选本仓库 → 选 **"Use render.yaml"**（自动读仓库里的 `render.yaml`）；或手动建：Build `npm install`、Start `node update-server.js`、Node 20。部署后在环境变量里设置 **`UPDATE_TOKEN`** = 任意自定字符串（记下来）。等部署完成，记下服务地址，形如 `https://clockin-update-xxxx.onrender.com`。
3. **在 GitHub 加两个 Secret**（仓库 Settings → Secrets and variables → Actions）：
   - `UPDATE_SERVER` = 上一步的 Render 服务地址
   - `UPDATE_TOKEN` = 与第 2 步 Render 里设的 `UPDATE_TOKEN` **完全一致**
4. 回到第 1 步，把 `app.js` 里的 `UPDATER_SERVER` 改成第 2 步地址，然后 `git push`。

### 之后怎么用
- **改页面**（HTML/CSS/JS/打卡逻辑）→ `git push` 即可。GitHub Actions 自动：出 APK（保留，首次或改原生时用）+ 把 `public/` 打包上传到更新服务。
- **手机 App 下次打开时**自动检测并下载新版网页资源、即时生效，**无需重装**。
- 数据始终在手机本地（SharedPreferences），更新不影响。

### 本地调试更新服务（可选）
```bash
npm install
npm run build:vendor        # 生成 public/vendor/capacitor-updater.js
node update-server.js       # 默认 http://localhost:3000
cd public && zip -r ../web.zip . && cd ..
curl -F "file=@web.zip" -F "version=1" "http://localhost:3000/upload?token=你的TOKEN"
```

## 测试
```bash
npm test
```
