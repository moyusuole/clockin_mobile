/**
 * app.js — 前端主逻辑：连接 storage + logic，渲染 UI，处理交互。
 * 依赖：src/logic.js（CheckinLogic）、src/storage.js（CheckinStorage）。
 */
(function () {
  'use strict';
  // ⚠️ 部署后改成你的 Render 更新服务地址（首次出 APK 前必须改对，否则手机拉不到第一次热更新）
  var UPDATER_SERVER = 'https://clockin-update.onrender.com';
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
    toast: document.getElementById('toast')
  };

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
  }

  // ---- 事件 ----
  els.viewDate.value = today;
  els.viewDate.addEventListener('change', function () {
    viewDate = els.viewDate.value || today;
    renderChecklist();
  });

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

  // 仅在浏览器（非原生 App）下注册 Service Worker；原生 App 本身已离线。
  if ('serviceWorker' in navigator && !window.Capacitor) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  // ---- 热更新（仅原生 App 生效，浏览器开发环境自动跳过）----
  function setupUpdater() {
    var updater = window.CapacitorUpdater;
    if (!updater || !window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;
    try { updater.notifyAppReady(); } catch (e) {}
    if (!UPDATER_SERVER) return;
    fetch(UPDATER_SERVER + '/update', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.version || !data.url) return;
        var cur = parseInt(localStorage.getItem('cu_version') || '0', 10);
        var next = parseInt(data.version, 10);
        if (next > cur) {
          // 先写回版本号：set 会刷新页面，写早一点避免刷新后再次判定需要更新而循环下载
          localStorage.setItem('cu_version', String(next));
          updater.download({ url: data.url, version: String(next) })
            .then(function (b) { return updater.set({ id: b.id }); })
            .catch(function (e) {
              localStorage.setItem('cu_version', String(cur)); // 失败回滚，下次打开重试
              console.warn('热更新失败', e);
            });
        }
      })
      .catch(function (e) { console.warn('检查更新失败', e); });
  }

  // 先初始化存储（原生异步、浏览器同步），再渲染。
  S.init().then(function () {
    renderAll();
    setupUpdater();
  }).catch(function (e) {
    console.error('storage init failed', e);
    renderAll();
  });
})();
