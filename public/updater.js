/**
 * updater.js — 热更新（基于 @capgo/capacitor-updater）
 *
 * 设计原则：
 * - 未配置服务器地址时**不发起任何网络请求**，App 保持原有纯离线行为。
 * - 浏览器预览环境自动禁用（只有打包安装的原生 App 才有意义）。
 * - 采用 next() 策略：下载完成后**不打断当前使用**，下次启动或切后台时生效。
 * - 失败绝不影响主功能：更新出错只在状态栏提示，原 App 照常用。
 */
(function (root) {
  'use strict';

  var cached = null;

  // 与 capacitor.config.json 的 CapacitorUpdater.updateUrl 保持一致：
  // 重装/首次打开时本地没存地址，用它兜底，避免被“请先填写服务器地址”卡住。
  var DEFAULT_UPDATE_URL = 'https://clockin-update-server.onrender.com/updates';

  // 取插件实例：原生环境返回插件对象，浏览器预览返回 false（缓存避免反复判断）
  function plugin() {
    if (cached === null) {
      var C = root.Capacitor;
      cached = (C && C.Plugins && C.Plugins.CapacitorUpdater) ? C.Plugins.CapacitorUpdater : false;
    }
    return cached;
  }

  var el = {};
  var busy = false;

  function setStatus(text, kind) {
    if (!el.status) return;
    el.status.textContent = text;
    el.status.className = 'upd-status' + (kind ? ' ' + kind : '');
  }

  function setEnabledUI(on) {
    if (el.urlRow) el.urlRow.classList.toggle('disabled', !on);
  }

  function disableCard(tip) {
    if (el.tip) el.tip.textContent = tip;
    if (el.toggle) el.toggle.disabled = true;
    setEnabledUI(false);
    setStatus('当前环境不可用');
  }

  function isHttpUrl(u) {
    return /^https?:\/\/\S+$/.test(String(u || '').trim());
  }

  // 更新就绪后用系统通知提示用户（静默 next() 不会自动弹窗，需主动告知）
  function notifyUpdateReady(ver) {
    var C = root.Capacitor;
    var LN = C && C.Plugins && C.Plugins.LocalNotifications;
    if (!LN) return;
    LN.schedule({
      notifications: [{
        id: 9911,
        title: '更新已就绪 · ' + ver,
        body: '新版本已下载，重启 App 后立即生效',
        channelId: 'checkin_reminder'
      }]
    }).catch(function () {});
  }

  /**
   * 检查并安装更新
   * @param {boolean} silent 静默模式（自动检查，失败不打扰）
   */
  async function checkUpdate(silent) {
    var p = plugin();
    if (!p) { if (!silent) setStatus('当前环境不支持自动更新', 'err'); return; }
    if (busy) return;

    var cfg = root.CheckinStorage.getUpdateSettings();
    // 重装/首次打开时本地 url 为空，用写死的默认服务器兜底（与 capacitor.config 一致）
    var effUrl = isHttpUrl(cfg.url) ? cfg.url : DEFAULT_UPDATE_URL;
    if (!isHttpUrl(effUrl)) {
      if (!silent) setStatus('未配置更新服务器', 'err');
      return;
    }

    busy = true;
    if (el.check) el.check.disabled = true;
    setStatus('正在检查更新…');
    var latest = null;
    try {
      // 始终尝试把地址告诉插件（需 allowModifyUrl=true）；失败则退回 capacitor.config 写死的默认地址
      try { await p.setUpdateUrl({ url: effUrl }); }
      catch (e) { console.warn('setUpdateUrl failed, fall back to config default', e); }

      latest = await p.getLatest();
      var remote = latest && latest.version ? String(latest.version) : '';
      if (!remote) { setStatus('已是最新版 · ' + (cfg.installedVersion || '内置版本'), 'ok'); return; }
      if (remote === cfg.installedVersion) { setStatus('已是最新版 · ' + remote, 'ok'); return; }

      if (!latest.url) { setStatus('服务端未提供下载地址', 'err'); return; }

      setStatus('发现新版本 ' + remote + '，下载中…');
      // 必须传完整 latest 对象（含 checksum / sessionKey），否则原生层
      // requireBundleChecksum 会因 checksum 为空抛 "Checksum required" 导致更新失败。
      var bundle = await p.download(latest);
      if (!bundle || !bundle.id) { setStatus('下载失败，请稍后重试', 'err'); return; }

      // next() 而非 set()：不打断用户当前操作，下次启动生效
      await p.next({ id: bundle.id });
      root.CheckinStorage.setUpdateSettings({ installedVersion: remote, url: effUrl, enabled: true });
      setStatus('新版本 ' + remote + ' 已就绪，下次打开生效', 'ok');
      notifyUpdateReady(remote);
    } catch (e) {
      var msg = (e && e.message) ? e.message : String(e || '未知错误');
      // 把服务端返回的版本号一并带出，便于定位（例如 1.0.4 仍失败说明下载/校验环节出错）
      var extra = (latest && latest.version) ? ' (ver ' + latest.version + ')' : '';
      if (silent) setStatus('离线或服务器不可达，继续使用当前版本');
      else setStatus('更新失败：' + msg + extra, 'err');
      console.error('[updater] checkUpdate error:', msg, 'latest=', latest);
    } finally {
      busy = false;
      if (el.check) el.check.disabled = false;
    }
  }

  function bindUI() {
    if (el.toggle) {
      el.toggle.addEventListener('change', function () {
        var on = el.toggle.checked;
        root.CheckinStorage.setUpdateSettings({ enabled: on });
        setEnabledUI(on);
        if (on) checkUpdate(false);
        else setStatus('已关闭自动更新');
      });
    }
    if (el.url) {
      el.url.addEventListener('change', function () {
        var u = el.url.value.trim();
        if (!u) {
          root.CheckinStorage.setUpdateSettings({ url: '', enabled: false });
          if (el.toggle) { el.toggle.checked = false; setEnabledUI(false); }
          setStatus('未配置服务器');
          return;
        }
        if (!isHttpUrl(u)) { setStatus('地址必须以 http:// 或 https:// 开头', 'err'); return; }
        root.CheckinStorage.setUpdateSettings({ url: u, enabled: el.toggle ? el.toggle.checked : true });
        setStatus('服务器已保存，点「检查更新」试试');
      });
    }
    if (el.check) {
      el.check.addEventListener('click', function () { checkUpdate(false); });
    }
  }

  var Updater = {
    init: function () {
      el = {
        card: document.getElementById('updaterCard'),
        toggle: document.getElementById('updToggle'),
        url: document.getElementById('updUrl'),
        urlRow: document.getElementById('updUrlRow'),
        tip: document.getElementById('updTip'),
        status: document.getElementById('updStatus'),
        check: document.getElementById('updCheck')
      };

      var p = plugin();
      if (!p) { disableCard('浏览器预览不支持自动更新，打包安装 App 后可用。'); return; }

      // 声明 app ready：否则插件会判定本次启动失败并回滚到内置版本
      p.notifyAppReady().catch(function () {});

      var cfg = root.CheckinStorage.getUpdateSettings();
      if (el.toggle) el.toggle.checked = cfg.enabled;
      if (el.url) el.url.value = cfg.url;
      setEnabledUI(cfg.enabled);
      bindUI();

      setStatus(cfg.installedVersion
        ? ('当前版本 ' + cfg.installedVersion)
        : '当前：随 APK 内置版本');

      // 已启用则自动静默检查（失败不打扰）
      if (cfg.enabled && cfg.url) checkUpdate(true);
    },

    check: function () { checkUpdate(false); }
  };

  root.CheckinUpdater = Updater;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
