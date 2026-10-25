/**
 * app.js — 前端主逻辑：连接 storage + logic，渲染 UI，处理交互。
 * 依赖：src/logic.js（CheckinLogic）、src/storage.js（CheckinStorage）。
 */
(function () {
  'use strict';
  var L = window.CheckinLogic;
  var S = window.CheckinStorage;

  var els = {
    todayLabel: document.getElementById('todayLabel'),
    streakNum: document.getElementById('streakNum'),
    viewDate: document.getElementById('viewDate'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    checkList: document.getElementById('checkList'),
    checkEmpty: document.getElementById('checkEmpty'),
    rateVal: document.getElementById('rateVal'),
    rateBar: document.getElementById('rateBar'),
    taskStats: document.getElementById('taskStats'),
    taskForm: document.getElementById('taskForm'),
    taskTitle: document.getElementById('taskTitle'),
    taskCategory: document.getElementById('taskCategory'),
    taskDesc: document.getElementById('taskDesc'),
    taskList: document.getElementById('taskList'),
    editModal: document.getElementById('editModal'),
    editTitle: document.getElementById('editTitle'),
    editCategory: document.getElementById('editCategory'),
    editDesc: document.getElementById('editDesc'),
    editCancel: document.getElementById('editCancel'),
    editSave: document.getElementById('editSave'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importInput: document.getElementById('importInput'),
    toast: document.getElementById('toast'),
    themeBtn: document.getElementById('themeBtn'),
    hmGrid: document.getElementById('hmGrid'),
    hmMonths: document.getElementById('hmMonths'),
    reminderCard: document.getElementById('reminderCard'),
    reminderToggle: document.getElementById('reminderToggle'),
    reminderTime: document.getElementById('reminderTime'),
    reminderTimeRow: document.getElementById('reminderTimeRow'),
    reminderTip: document.getElementById('reminderTip'),
    // 每日卡片
    factList: document.getElementById('factList'),
    quoteList: document.getElementById('quoteList'),
    factRefresh: document.getElementById('factRefresh'),
    quoteRefresh: document.getElementById('quoteRefresh'),
    // 时间胶囊
    capForm: document.getElementById('capForm'),
    capContent: document.getElementById('capContent'),
    capOpenAt: document.getElementById('capOpenAt'),
    capList: document.getElementById('capList'),
    capEmpty: document.getElementById('capEmpty'),
    capModal: document.getElementById('capModal'),
    capModalMeta: document.getElementById('capModalMeta'),
    capModalBody: document.getElementById('capModalBody'),
    capModalOk: document.getElementById('capModalOk')
  };

  // 原生本地通知插件（仅在打包后的原生 App 中可用；浏览器预览为 null）
  var LN = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications)
    ? window.Capacitor.Plugins.LocalNotifications : null;

  var today = L.todayStr();
  var viewDate = today;
  var editingId = null;

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { els.toast.hidden = true; }, 1600);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderHeader() {
    var d = new Date();
    var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    els.todayLabel.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + week;
  }

  function renderStreak() {
    var tasks = S.getTasks();
    var checkins = S.getCheckins();
    var stats = L.computeStats(tasks, checkins, { userId: S.DEFAULT_USER_ID, today: today });
    els.streakNum.textContent = stats.streak;
    els.rateVal.textContent = stats.completionRate30 + '%';
    els.rateBar.style.width = stats.completionRate30 + '%';
    els.taskStats.innerHTML = stats.perTask.length
      ? stats.perTask.map(function (t) {
          return '<li><span>' + esc(t.title) +
            (t.category ? ' <span style="color:#6b7280">· ' + esc(t.category) + '</span>' : '') +
            '</span><span class="ts-streak">连 ' + t.streak + ' 天</span></li>';
        }).join('')
      : '<li style="color:#6b7280">暂无任务</li>';
  }

  function renderChecklist() {
    var tasks = S.getTasks().filter(function (t) { return !t.archived; });
    var total = tasks.length;
    var done = 0;
    els.checkList.innerHTML = tasks.map(function (t) {
      var checked = S.isChecked(t.id, viewDate);
      if (checked) done++;
      return '<li class="check-item">' +
        '<div class="check-box' + (checked ? ' done' : '') + '" data-id="' + t.id + '">' + (checked ? '✓' : '') + '</div>' +
        '<div class="check-main">' +
          '<div class="check-title' + (checked ? ' done' : '') + '">' + esc(t.title) + '</div>' +
          (t.category ? '<div class="check-cat"><span class="tag">' + esc(t.category) + '</span></div>' : '') +
        '</div></li>';
    }).join('');
    els.checkEmpty.hidden = total !== 0;
    var pct = total ? Math.round(done / total * 100) : 0;
    els.progressBar.style.width = pct + '%';
    var label = viewDate === today ? '今日' : (viewDate + ' ');
    els.progressText.textContent = label + '已打卡 ' + done + ' / ' + total;
  }

  function renderTaskList() {
    var tasks = S.getTasks();
    els.taskList.innerHTML = tasks.length
      ? tasks.map(function (t) {
          return '<li class="task-item">' +
            '<div class="ti-top"><span class="ti-title">' + esc(t.title) + '</span>' +
            (t.archived ? '<span class="ti-cat">已归档</span>' : '') + '</div>' +
            (t.category ? '<div class="ti-cat">' + esc(t.category) + '</div>' : '') +
            (t.description ? '<div class="ti-desc">' + esc(t.description) + '</div>' : '') +
            '<div class="ti-actions">' +
              '<button data-edit="' + t.id + '">编辑</button>' +
              (t.archived
                ? '<button data-unarc="' + t.id + '">恢复</button>'
                : '<button data-arc="' + t.id + '">归档</button>') +
              '<button class="del" data-del="' + t.id + '">删除</button>' +
            '</div></li>';
        }).join('')
      : '<li class="ti-cat" style="padding:8px 4px">还没有任务</li>';
  }

  function renderAll() {
    renderHeader();
    renderStreak();
    renderChecklist();
    renderTaskList();
    renderHeatmap();
    renderDaily();
    renderCapsules();
  }

  // ---- 打卡热力图（GitHub 风格：列=周，行=周一~周日）----
  function renderHeatmap() {
    if (!els.hmGrid) return;
    var checkins = S.getCheckins();
    var byDate = {};
    checkins.forEach(function (c) { byDate[c.date] = (byDate[c.date] || 0) + 1; });
    var weeks = 17;
    var lastIndex = weeks * 7 - 1;
    var start = L.addDays(today, -lastIndex);
    // 对齐到周一，保证整周网格
    var sd = new Date(start + 'T00:00:00');
    var sDow = (sd.getDay() + 6) % 7; // 周一=0
    if (sDow > 0) start = L.addDays(start, -sDow);

    var cells = [];
    var monthLabels = new Array(weeks).fill('');
    var prevMonth = -1;
    for (var c = 0; c < weeks; c++) {
      for (var r = 0; r < 7; r++) {
        var dateStr = L.addDays(start, c * 7 + r);
        var count = byDate[dateStr] || 0;
        var future = dateStr > today;
        var lvl = count === 0 ? 0 : (count === 1 ? 1 : (count <= 3 ? 2 : (count <= 6 ? 3 : 4)));
        var cls = 'hm-cell l' + lvl + (future ? ' empty' : '');
        var tip = dateStr + (count ? ' · 完成 ' + count + ' 项' : '');
        cells.push('<i class="' + cls + '" title="' + tip + '"></i>');
        if (r === 0) {
          var m = new Date(dateStr + 'T00:00:00').getMonth();
          monthLabels[c] = (m !== prevMonth) ? (m + 1) + '月' : '';
          prevMonth = m;
        }
      }
    }
    els.hmGrid.innerHTML = cells.join('');
    if (els.hmMonths) {
      els.hmMonths.innerHTML = monthLabels.map(function (t) {
        return '<span style="width:14px;flex:none;display:inline-block">' + t + '</span>';
      }).join('');
    }
  }

  // ---- 每日卡片（冷知识 / 名言）----
  // 数据源：daily-content.js 内置语料，纯本地、零网络。
  // 每天确定性洗牌 → 跨天自动换新；手动刷新 = offset+1，当天不重复。
  var DC = window.DailyContent;

  function renderDaily() {
    if (!DC || !els.factList || !els.quoteList) return;
    var day = L.todayStr();
    var prog = S.getDailyCards(day);
    var facts = DC.drawFacts(day, prog.factOffset, 2);
    var quotes = DC.drawQuotes(day, prog.quoteOffset, 2);
    els.factList.innerHTML = facts.map(function (f, i) {
      return '<li class="daily-item"><span class="daily-idx">' + (i + 1) + '</span>' +
        '<span class="daily-text">' + esc(f) + '</span></li>';
    }).join('');
    els.quoteList.innerHTML = quotes.map(function (q) {
      return '<li class="daily-item"><span class="daily-idx quote-idx">“</span>' +
        '<span class="daily-text">' + esc(q.t) +
        (q.a ? '<span class="daily-author">— ' + esc(q.a) + '</span>' : '') +
        '</span></li>';
    }).join('');
  }

  // ---- 时间胶囊 ----
  function daysBetween(fromDate, toDate) {
    var ms = new Date(toDate + 'T00:00:00') - new Date(fromDate + 'T00:00:00');
    return Math.round(ms / 86400000);
  }

  function renderCapsules() {
    if (!els.capList) return;
    var day = L.todayStr();
    var list = S.getCapsules().slice().sort(function (a, b) {
      return a.openAt < b.openAt ? -1 : (a.openAt > b.openAt ? 1 : 0);
    });
    els.capList.innerHTML = list.map(function (c) {
      var left = daysBetween(day, c.openAt);
      var status = c.opened
        ? (c.openedAt + ' 已开启')
        : (left >= 0 ? ('还有 ' + left + ' 天开启') : ('已到期 ' + Math.abs(left) + ' 天'));
      // 未开启不泄露内容，只显示字数，保留拆封的仪式感
      var body = c.opened
        ? '<div class="cap-body">' + esc(c.content).replace(/\n/g, '<br>') + '</div>'
        : '<div class="cap-body cap-locked">🔒 未开启 · 共 ' + c.content.length + ' 字</div>';
      return '<li class="cap-item' + (c.opened ? ' opened' : '') + '">' +
        '<div class="cap-top">' +
          '<span class="cap-date">' + esc(c.openAt) + '</span>' +
          '<span class="cap-left">' + esc(status) + '</span>' +
          '<button class="cap-del" type="button" data-capdel="' + c.id + '">删除</button>' +
        '</div>' +
        body +
        '<div class="cap-created">写于 ' + esc(c.createdAt) + '</div>' +
        '</li>';
    }).join('');
    if (els.capEmpty) els.capEmpty.hidden = list.length !== 0;
  }

  // 到期的胶囊：打开 App 时依次弹出（只弹一次，弹出即标记已开启）
  var dueQueue = [];
  function showNextCapsule() {
    var c = dueQueue.shift();
    if (!c) { if (els.capModal) els.capModal.hidden = true; return; }
    els.capModalMeta.textContent = '写于 ' + c.createdAt +
      ' · 距今 ' + Math.max(0, daysBetween(c.createdAt, L.todayStr())) + ' 天';
    els.capModalBody.textContent = c.content;
    els.capModal.hidden = false;
    S.openCapsule(c.id);
    renderCapsules();
  }
  function checkDueCapsules() {
    dueQueue = S.getDueCapsules(L.todayStr()).slice();
    if (dueQueue.length) showNextCapsule();
  }

  // 原生本地通知：到期当天上午 9 点提醒一次（id 段位 2000+，避开每日打卡提醒的 id=1）
  function scheduleCapsuleNotice(c) {
    if (!LN || !c || c.opened) return;
    var nid = 2000 + (Number(c.id) % 1000);
    var at = new Date(c.openAt + 'T09:00:00');
    if (!(at > new Date())) at = new Date(Date.now() + 60000);
    var doIt = function () {
      LN.schedule({
        notifications: [{
          id: nid,
          title: '⏳ 时间胶囊到了',
          body: '你曾在 ' + c.createdAt + ' 写给未来的自己，点开看看吧',
          schedule: { at: at }
        }]
      }).catch(function (e) { console.warn('capsule notify fail', e); });
    };
    LN.checkPermissions().then(function (perm) {
      if (perm && perm.display === 'granted') { doIt(); return; }
      LN.requestPermissions().then(function (p) {
        if (p && p.display === 'granted') doIt();
      }).catch(function () {});
    }).catch(function () {});
  }

  function setupCapsules() {
    if (els.capOpenAt) {
      var now = L.todayStr();
      els.capOpenAt.min = L.addDays(now, 1);
      els.capOpenAt.value = L.addDays(now, 30); // 默认一个月后开启
    }
    if (LN) {
      S.getCapsules().forEach(function (c) { if (!c.opened) scheduleCapsuleNotice(c); });
    }
  }

  // ---- 主题（深色 / 浅色）----
  function applyTheme(theme) {
    var dark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (els.themeBtn) els.themeBtn.textContent = dark ? '☀️' : '🌙';
  }

  // ---- 打卡提醒（原生本地通知）----
  function setReminderRowEnabled(on) {
    if (els.reminderTimeRow) els.reminderTimeRow.classList.toggle('disabled', !on);
  }
  function scheduleReminder(time, enabled) {
    if (!LN) return;
    LN.cancel({ notifications: [{ id: 1 }] }).catch(function () {});
    if (!enabled) return;
    var doSchedule = function () {
      var p = String(time).split(':');
      var at = new Date();
      at.setHours(parseInt(p[0], 10), parseInt(p[1], 10), 0, 0);
      if (at <= new Date()) at.setDate(at.getDate() + 1);
      LN.schedule({
        notifications: [{
          id: 1, title: '该打卡啦 🌿',
          body: '今天的目标还没完成，去「每日打卡」看看吧',
          schedule: { every: 'day', at: at }
        }]
      }).catch(function (e) { console.warn('schedule fail', e); });
    };
    LN.checkPermissions().then(function (perm) {
      var ok = perm && (perm.display === 'granted' || perm.receive === 'granted');
      if (ok) { doSchedule(); return; }
      LN.requestPermissions().then(function (gr) {
        var ok2 = gr && (gr.display === 'granted' || gr.receive === 'granted');
        if (ok2) doSchedule();
      }).catch(function () {});
    }).catch(function () {});
  }
  function setupReminderUI() {
    if (!els.reminderToggle) return;
    var r = S.getReminder();
    els.reminderToggle.checked = r.enabled;
    els.reminderTime.value = r.time;
    setReminderRowEnabled(r.enabled);
    els.reminderToggle.addEventListener('change', function () {
      var enabled = els.reminderToggle.checked;
      S.setReminder({ enabled: enabled, time: els.reminderTime.value });
      setReminderRowEnabled(enabled);
      if (enabled && !LN) { toast('提醒需在打包安装的原生 App 中才能用'); return; }
      scheduleReminder(els.reminderTime.value, enabled);
      if (enabled) toast('已开启每日提醒');
    });
    els.reminderTime.addEventListener('change', function () {
      S.setReminder({ enabled: els.reminderToggle.checked, time: els.reminderTime.value });
      if (els.reminderToggle.checked && LN) scheduleReminder(els.reminderTime.value, true);
    });
    if (!LN) {
      if (els.reminderTip) els.reminderTip.textContent = '提醒需打包安装为原生 App 后可用（当前为浏览器预览，已禁用）。';
      els.reminderToggle.disabled = true;
      setReminderRowEnabled(false);
    } else if (r.enabled) {
      scheduleReminder(r.time, true);
    }
  }

  // ---- 事件 ----
  els.viewDate.value = today;
  els.viewDate.addEventListener('change', function () {
    viewDate = els.viewDate.value || today;
    renderChecklist();
  });

  if (els.themeBtn) {
    els.themeBtn.addEventListener('click', function () {
      var next = (S.getTheme() === 'dark') ? 'light' : 'dark';
      S.setTheme(next);
      applyTheme(next);
    });
  }

  els.checkList.addEventListener('click', function (e) {
    var box = e.target.closest('.check-box');
    if (!box) return;
    var id = Number(box.getAttribute('data-id'));
    var r = S.toggleCheckin(id, viewDate);
    if (r.ok) { renderChecklist(); renderStreak(); }
  });

  els.taskForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var r = S.addTask({
      title: els.taskTitle.value,
      category: els.taskCategory.value,
      description: els.taskDesc.value
    });
    if (!r.ok) { toast(r.error); return; }
    els.taskForm.reset();
    renderAll();
    toast('已添加任务');
  });

  els.taskList.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var id = Number(btn.getAttribute('data-del') || btn.getAttribute('data-edit') ||
      btn.getAttribute('data-arc') || btn.getAttribute('data-unarc'));
    if (btn.hasAttribute('data-del')) {
      if (confirm('确定删除该任务？相关打卡记录也会删除。')) {
        S.deleteTask(id); renderAll(); toast('已删除');
      }
    } else if (btn.hasAttribute('data-edit')) {
      openEdit(id);
    } else if (btn.hasAttribute('data-arc')) {
      S.updateTask(id, { archived: true }); renderAll(); toast('已归档');
    } else if (btn.hasAttribute('data-unarc')) {
      S.updateTask(id, { archived: false }); renderAll(); toast('已恢复');
    }
  });

  function openEdit(id) {
    var t = S.getTasks().find(function (x) { return x.id === id; });
    if (!t) return;
    editingId = id;
    els.editTitle.value = t.title;
    els.editCategory.value = t.category || '';
    els.editDesc.value = t.description || '';
    els.editModal.hidden = false;
  }
  function closeEdit() { els.editModal.hidden = true; editingId = null; }
  els.editCancel.addEventListener('click', closeEdit);
  // 点击弹层灰色背景（modal 本身而非 modal-box）也可关闭
  els.editModal.addEventListener('click', function (e) {
    if (e.target === els.editModal) closeEdit();
  });
  els.editSave.addEventListener('click', function () {
    if (editingId == null) return;
    var r = S.updateTask(editingId, {
      title: els.editTitle.value,
      category: els.editCategory.value,
      description: els.editDesc.value
    });
    if (!r.ok) { toast(r.error); return; }
    closeEdit(); renderAll(); toast('已保存');
  });

  // ---- 数据备份：导出 / 导入 ----
  els.exportBtn.addEventListener('click', function () {
    var json = S.exportData();
    var fileName = 'checkin-backup-' + L.todayStr() + '.json';
    var file = new File([json], fileName, { type: 'application/json' });
    // 原生 App / 现代浏览器：优先用系统分享（可存到微信/邮件/网盘）
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: '每日打卡备份' }).catch(function () {});
      return;
    }
    // 回退：浏览器下载链接
    var url = URL.createObjectURL(file);
    var a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
    toast('已导出备份');
  });

  els.importBtn.addEventListener('click', function () { els.importInput.click(); });
  els.importInput.addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var r = S.importData(String(reader.result));
      if (!r.ok) { toast(r.error); return; }
      renderAll();
      toast('已导入备份（任务 ' + r.tasks + ' / 打卡 ' + r.checkins + '）');
    };
    reader.onerror = function () { toast('读取文件失败'); };
    reader.readAsText(file);
    e.target.value = ''; // 允许重复导入同一文件
  });

  // ---- 每日卡片：手动刷新 ----
  if (els.factRefresh) {
    els.factRefresh.addEventListener('click', function () {
      S.bumpDailyCard('fact', L.todayStr());
      renderDaily();
    });
  }
  if (els.quoteRefresh) {
    els.quoteRefresh.addEventListener('click', function () {
      S.bumpDailyCard('quote', L.todayStr());
      renderDaily();
    });
  }

  // ---- 时间胶囊：封存 / 删除 / 拆封 ----
  if (els.capForm) {
    els.capForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = S.addCapsule({ content: els.capContent.value, openAt: els.capOpenAt.value });
      if (!r.ok) { toast(r.error); return; }
      els.capContent.value = '';
      els.capOpenAt.value = L.addDays(L.todayStr(), 30);
      renderCapsules();
      scheduleCapsuleNotice(r.capsule);
      toast('已封存 · ' + r.capsule.openAt + ' 开启');
    });
  }
  if (els.capList) {
    els.capList.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-capdel]');
      if (!btn) return;
      if (!confirm('确定删除这个胶囊吗？')) return;
      S.deleteCapsule(Number(btn.getAttribute('data-capdel')));
      renderCapsules();
      toast('已删除');
    });
  }
  if (els.capModalOk) {
    els.capModalOk.addEventListener('click', function () {
      showNextCapsule();
      if (!dueQueue.length) toast('已收下这封信');
    });
  }
  if (els.capModal) {
    els.capModal.addEventListener('click', function (e) {
      if (e.target === els.capModal) showNextCapsule();
    });
  }

  // 仅在浏览器（非原生 App）下注册 Service Worker；原生 App 本身已离线。
  if ('serviceWorker' in navigator && !window.Capacitor) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  // 先初始化存储（原生异步、浏览器同步），再渲染。
  S.init().then(function () {
    applyTheme(S.getTheme());
    setupReminderUI();
    renderAll();
    setupCapsules();
    checkDueCapsules(); // 到期胶囊：打开即自动弹信
  }).catch(function (e) {
    console.error('storage init failed', e);
    renderAll();
  });
})();
