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
      checkins: [],
      theme: 'light',
      reminder: { enabled: false, time: '20:00' },
      fiveMinLogs: [],
      // 每日卡片：记录「哪天 + 手动刷新了几次」，跨天自动重置实现每日自动刷新
      dailyCards: { date: '', factOffset: 0, quoteOffset: 0 },
      // 时间胶囊：写给未来的信
      capsules: []
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

    // ---- 主题（浅色/深色）----
    getTheme: function () { return (state && state.theme === 'dark') ? 'dark' : 'light'; },
    setTheme: function (theme) {
      if (!state) return;
      state.theme = (theme === 'dark') ? 'dark' : 'light';
      persist();
    },

    // ---- 打卡提醒 ----
    getReminder: function () {
      var r = (state && state.reminder) || { enabled: false, time: '20:00' };
      return { enabled: !!r.enabled, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : '20:00' };
    },
    setReminder: function (r) {
      if (!state) return;
      state.reminder = {
        enabled: !!(r && r.enabled),
        time: (r && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) ? r.time : '20:00'
      };
      persist();
    },

    // ---- 五分钟小任务「心情 / 备注」记录 ----
    getFiveMinLogs: function () {
      return (state && Array.isArray(state.fiveMinLogs)) ? state.fiveMinLogs : [];
    },
    addFiveMinLog: function (log) {
      if (!state) return { ok: false };
      if (!Array.isArray(state.fiveMinLogs)) state.fiveMinLogs = [];
      state.fiveMinLogs.push(Object.assign({ date: L.todayStr(), ts: Date.now() }, log));
      persist();
      return { ok: true };
    },

    // ---- 每日卡片（冷知识 / 名言）----
    // 若记录的日期不是今天，说明跨天了 → 自动把 offset 归零，实现"每天自动刷新两条"。
    getDailyCards: function (today) {
      today = today || L.todayStr();
      var d = state && state.dailyCards;
      if (!d || d.date !== today) {
        d = { date: today, factOffset: 0, quoteOffset: 0 };
        state.dailyCards = d;
        persist();
      }
      return { date: d.date, factOffset: (d.factOffset | 0), quoteOffset: (d.quoteOffset | 0) };
    },

    // 手动刷新：对应类型的 offset +1（滑到洗牌序列的下一组，当天不会立刻重复）
    bumpDailyCard: function (type, today) {
      today = today || L.todayStr();
      this.getDailyCards(today);
      var d = state.dailyCards;
      if (type === 'quote') d.quoteOffset = (d.quoteOffset | 0) + 1;
      else d.factOffset = (d.factOffset | 0) + 1;
      persist();
      return { factOffset: d.factOffset, quoteOffset: d.quoteOffset };
    },

    // ---- 时间胶囊 ----
    getCapsules: function () {
      return (state && Array.isArray(state.capsules)) ? state.capsules : [];
    },

    addCapsule: function (input) {
      if (!state) return { ok: false, error: '存储未初始化' };
      if (!Array.isArray(state.capsules)) state.capsules = [];
      var content = String((input && input.content) || '').trim();
      var openAt = String((input && input.openAt) || '');
      if (!content) return { ok: false, error: '写点什么再封存吧' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(openAt)) return { ok: false, error: '请选择开启日期' };
      if (openAt <= L.todayStr()) return { ok: false, error: '开启日期要选明天以后' };
      var capsule = {
        id: nextId(),
        content: content.slice(0, 2000),
        createdAt: L.todayStr(),
        openAt: openAt,
        opened: false,
        openedAt: null
      };
      state.capsules.push(capsule);
      persist();
      return { ok: true, capsule: capsule };
    },

    // 到期且未开启的胶囊（按开启日期升序）
    getDueCapsules: function (today) {
      today = today || L.todayStr();
      return this.getCapsules()
        .filter(function (c) { return !c.opened && c.openAt <= today; })
        .sort(function (a, b) { return a.openAt < b.openAt ? -1 : (a.openAt > b.openAt ? 1 : 0); });
    },

    // 拆封：只标记，不删除，保留可回看
    openCapsule: function (id) {
      var c = this.getCapsules().find(function (x) { return x.id === id; });
      if (!c) return { ok: false, error: '胶囊不存在' };
      c.opened = true;
      c.openedAt = L.todayStr();
      persist();
      return { ok: true, capsule: c };
    },

    deleteCapsule: function (id) {
      if (!state) return { ok: false };
      state.capsules = this.getCapsules().filter(function (c) { return c.id !== id; });
      persist();
      return { ok: true };
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

      state = {
        users: users,
        tasks: tasks,
        checkins: checkins,
        theme: (incoming.theme === 'dark') ? 'dark' : 'light',
        reminder: (incoming.reminder && incoming.reminder.enabled)
          ? { enabled: true, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(incoming.reminder.time) ? incoming.reminder.time : '20:00' }
          : { enabled: false, time: '20:00' },
        fiveMinLogs: Array.isArray(incoming.fiveMinLogs) ? incoming.fiveMinLogs : [],
        dailyCards: { date: '', factOffset: 0, quoteOffset: 0 },
        capsules: Array.isArray(incoming.capsules) ? incoming.capsules : []
      };
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
