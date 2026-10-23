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
node server.js
# 打开 http://localhost:8080
```
预览走 localStorage 分支，功能与真机一致；要真·原生体验请打包 APK。

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

## 测试
```bash
npm test
```
