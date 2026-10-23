/**
 * storage.js — 数据层（Capacitor 原生 Preferences / localStorage 双后端）
 *
 * - 原生 App（Capacitor）环境：用 @capacitor/preferences 持久化到手机本地
 *   （Android=SharedPreferences / iOS=UserDefaults），彻底离线、不依赖任何服务器。
 * - 浏览器 / 桌面预览：自动回退 localStorage。
 *
 * 数据按 user_id 隔离；单机默认 DEFAULT_USER_ID=1，预留未来切换为后端 API。
 * 用法：先 `await Storage.init()` 一次性把数据载入内存，之后所有方法同步调用。
 */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'checkin_mobile_state_v1';
  const DEFAULT_USER_ID = 1;

  // 运行环境检测：是否真机原生（有 Capacitor 桥 + Preferences 插件）
  function isNativePlatform() {
    const C = root.Capacitor;
    if (!C) return false;
    if (typeof C.isNativePlatform === 'function') return C.isNativePlatform();
    if (C.Plugins && C.Plugins.Preferences) return true;
    return false;
  }
  const NATIVE = isNativePlatform();
  const L = root.CheckinLogic;

  function emptyState() {
    return {
      users: [{ id: DEFAULT_USER_ID, username: '我', created_at: L.todayStr() }],
      tasks: [],
      checkins: []
    };
  }

  function readRaw() {
    if (NATIVE) {
      const P = root.Capacitor.Plugins.Preferences;
      return P.get({ key: STORAGE_KEY }).then(function (r) {
        return (r && r.value) ? JSON.parse(r.value) : null;
      });
    }
    const raw = root.localStorage.getItem(STORAGE_KEY);
    return Promise.resolve(raw ? JSON.parse(raw) : null);
  }

  function writeRaw(json) {
    if (NATIVE) {
      const P = root.Capacitor.Plugins.Preferences;
      return P.set({ key: STORAGE_KEY, value: json });
    }
    root.localStorage.setItem(STORAGE_KEY, json);
    return Promise.resolve();
  }

  let state = null;
  let seq = 1;
  let pendingSave = null;

  // 持久化：覆盖式写入完整 state。原生环境异步（防抖 fire-and-forget），浏览器同步。
  function persist() {
    if (!state) return;
    const json = JSON.stringify(state);
    if (NATIVE) {
      if (pendingSave) clearTimeout(pendingSave);
      pendingSave = setTimeout(function () { writeRaw(json).catch(function () {}); }, 150);
    } else {
      root.localStorage.setItem(STORAGE_KEY, json);
    }
  }

  function nextId() { return seq++; }

  const Storage = {
    DEFAULT_USER_ID: DEFAULT_USER_ID,
    backend: NATIVE ? 'capacitor' : 'local',
    isNative: NATIVE,

    // 一次性加载到内存；之后内存同步操作，写操作经 persist() 落盘。
    init: function () {
      return readRaw().then(function (s) {
        if (!s || !Array.isArray(s.tasks) || !Array.isArray(s.checkins)) s = emptyState();
        state = s;
        seq = Math.max(0,
          state.tasks.reduce(function (m, t) { return Math.max(m, t.id || 0); }, 0),
          state.checkins.reduce(function (m, c) { return Math.max(m, c.id || 0); }, 0)
        ) + 1;
        return state;
      });
    },

    getState: function () { return state; },

    getTasks: function (userId) {
      userId = userId == null ? DEFAULT_USER_ID : userId;
      return state.tasks.filter(function (t) { return t.user_id === userId; });
    },

    getCheckins: function (userId) {
      userId = userId == null ? DEFAULT_USER_ID : userId;
      return state.checkins.filter(function (c) { return c.user_id === userId; });
    },

    addTask: function (input) {
      const v = L.validateTask(input);
      if (!v.ok) return { ok: false, error: v.error };
      const task = {
        id: nextId(),
        user_id: DEFAULT_USER_ID,
        title: v.title,
        description: v.description,
        category: v.category,
        created_at: L.todayStr(),
        archived: false
      };
      state.tasks.push(task);
      persist();
      return { ok: true, task: task };
    },

    updateTask: function (id, patch) {
      const t = state.tasks.find(function (x) { return x.id === id; });
      if (!t) return { ok: false, error: '任务不存在' };
      if (patch.title !== undefined) {
        const v = L.validateTask({ title: patch.title, description: patch.description, category: patch.category });
        if (!v.ok) return { ok: false, error: v.error };
        t.title = v.title; t.description = v.description; t.category = v.category;
      }
      if (patch.archived !== undefined) t.archived = !!patch.archived;
      persist();
      return { ok: true, task: t };
    },

    deleteTask: function (id) {
      state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
      state.checkins = state.checkins.filter(function (c) { return c.task_id !== id; });
      persist();
      return { ok: true };
    },

    isChecked: function (taskId, date) {
      date = date || L.todayStr();
      return state.checkins.some(function (c) {
        return c.user_id === DEFAULT_USER_ID && c.task_id === taskId && c.date === date;
      });
    },

    toggleCheckin: function (taskId, date) {
      date = date || L.todayStr();
      const idx = state.checkins.findIndex(function (c) {
        return c.user_id === DEFAULT_USER_ID && c.task_id === taskId && c.date === date;
      });
      if (idx >= 0) {
        state.checkins.splice(idx, 1);
        persist();
        return { ok: true, checked: false };
      }
      state.checkins.push({ id: nextId(), user_id: DEFAULT_USER_ID, task_id: taskId, date: date });
      persist();
      return { ok: true, checked: true };
    },

    // 预留多用户：导出可序列化快照（未来后端同步用）
    exportSnapshot: function () { return JSON.parse(JSON.stringify(state)); },

    // 导出备份：返回带版本与导出时间的 JSON 字符串，可直接写文件/分享。
    exportData: function () {
      return JSON.stringify({
        app: 'checkin-mobile',
        version: 1,
        exportedAt: new Date().toISOString(),
        state: JSON.parse(JSON.stringify(state))
      }, null, 2);
    },

    // 导入备份：接受包裹格式 {app,state} 或裸 state 对象。
    // 校验结构，替换当前 state 并重算 id 序列，写入持久层。
    importData: function (jsonString) {
      if (typeof jsonString !== 'string' || !jsonString.trim()) {
        return { ok: false, error: '备份内容为空' };
      }
      let parsed;
      try { parsed = JSON.parse(jsonString); }
      catch (e) { return { ok: false, error: '文件不是有效的 JSON' }; }

      var incoming = (parsed && parsed.state) ? parsed.state : parsed;
      if (!incoming || !Array.isArray(incoming.tasks) || !Array.isArray(incoming.checkins)) {
        return { ok: false, error: '备份格式不正确（缺少 tasks/checkins）' };
      }
      // 规整：确保 users 存在、字段类型正确，避免脏数据污染。
      var users = (Array.isArray(incoming.users) && incoming.users.length)
        ? incoming.users
        : [{ id: DEFAULT_USER_ID, username: '我', created_at: L.todayStr() }];
      var tasks = incoming.tasks.map(function (t) { return Object.assign({ user_id: DEFAULT_USER_ID, archived: false }, t); });
      var checkins = incoming.checkins.map(function (c) { return Object.assign({ user_id: DEFAULT_USER_ID }, c); });

      state = { users: users, tasks: tasks, checkins: checkins };
      seq = Math.max(0,
        state.tasks.reduce(function (m, t) { return Math.max(m, t.id || 0); }, 0),
        state.checkins.reduce(function (m, c) { return Math.max(m, c.id || 0); }, 0)
      ) + 1;
      persist();
      return { ok: true, tasks: tasks.length, checkins: checkins.length };
    }
  };

  root.CheckinStorage = Storage;
  if (typeof module !== 'undefined' && module.exports) module.exports = Storage;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
