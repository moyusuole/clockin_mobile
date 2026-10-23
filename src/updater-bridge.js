// updater-bridge.js — 把 capacitor-updater 插件暴露为 window.CapacitorUpdater，
// 供原生 App 的 app.js 调用（手动热更新模式）。
// 由 esbuild 打包进 public/vendor/capacitor-updater.js（见 npm run build:vendor）。
import { CapacitorUpdater } from '@capgo/capacitor-updater';

if (typeof window !== 'undefined') {
  window.CapacitorUpdater = CapacitorUpdater;
}
