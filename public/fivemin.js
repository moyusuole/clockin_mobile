/**
 * fivemin.js — 随机五分钟小任务（独立模块，不依赖 app.js）
 * 在 index.html 末尾先引入 fivemin-tasks.js（500+ 条任务池），再引入本文件。
 * 任务池来自 window.FIVE_MIN_TASKS；若数据文件缺失，用内置 FALLBACK 兜底，保证模块可用。
 * 功能：随机抽取（本轮不重复）+ 手动刷新 + 5 分钟计时 + 今日完成计数 + 完成记录心情/备注。
 */
(function () {
  'use strict';

  // 内置兜底任务（仅当 fivemin-tasks.js 未加载时使用）
  var FALLBACK = [
    { title: '做 20 个深蹲', category: '健康', tip: '分两组做，膝盖别超过脚尖' },
    { title: '喝一杯温水', category: '健康', tip: '小口慢饮，顺手拉伸肩颈' },
    { title: '整理手机相册 5 分钟', category: '整理', tip: '删掉模糊截图和无用表情包' },
    { title: '读 5 页书', category: '学习', tip: '纸质书最佳，关掉手机通知' },
    { title: '深呼吸放松 5 分钟', category: '正念', tip: '4 秒吸、7 秒屏、8 秒呼，循环' }
  ];
  var TASKS = (window.FIVE_MIN_TASKS && window.FIVE_MIN_TASKS.length) ? window.FIVE_MIN_TASKS : FALLBACK;
  var S = window.CheckinStorage;

  // Fisher-Yates 洗牌
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  var el = {
    cat: document.getElementById('fmCat'),
    title: document.getElementById('fmTitle'),
    tip: document.getElementById('fmTip'),
    refresh: document.getElementById('fmRefresh'),
    start: document.getElementById('fmStart'),
    done: document.getElementById('fmDone'),
    timer: document.getElementById('fmTimer'),
    clock: document.getElementById('fmClock'),
    info: document.getElementById('fmDoneInfo'),
    mood: document.getElementById('fmMood'),
    moodRow: document.getElementById('moodRow'),
    note: document.getElementById('fmNote'),
    record: document.getElementById('fmRecord')
  };
  if (!el.title) return; // 页面没有该模块则直接跳过

  var today = todayStr();
  var lastTitle = null;
  var timerId = null;
  var remain = 0;
  var selectedMood = null;
  var deck = []; // 本轮未展示过的任务牌堆，抽完再洗牌，保证不重复

  function refillDeck() { deck = shuffle(TASKS.slice()); }
  function nextTask() {
    if (deck.length === 0) refillDeck();
    return deck.pop();
  }

  function key() { return 'fm_done_' + today; }
  function getDone() { return parseInt(localStorage.getItem(key()) || '0', 10) || 0; }
  function setDone(n) { try { localStorage.setItem(key(), String(n)); } catch (e) {} }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 1600);
  }

  function resetMood() {
    selectedMood = null;
    if (el.mood) {
      el.mood.hidden = true;
      if (el.note) el.note.value = '';
      var btns = el.moodRow ? el.moodRow.querySelectorAll('button') : [];
      for (var i = 0; i < btns.length; i++) btns[i].classList.remove('sel');
    }
  }

  function render() {
    resetMood();
    var t = nextTask();
    lastTitle = t.title;
    el.cat.textContent = t.category || '小任务';
    el.title.textContent = t.title;
    el.tip.textContent = t.tip || '';
    el.info.textContent = '今日已完成 ' + getDone() + ' 个五分钟小任务';
  }

  function showClock() {
    var m = Math.floor(remain / 60), s = remain % 60;
    el.clock.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function stopTimer(auto) {
    if (timerId) { clearInterval(timerId); timerId = null; }
    el.timer.hidden = true;
    el.start.disabled = false;
    if (auto) toast('5 分钟到，记得点「完成」');
  }
  function startTimer() {
    if (timerId) return;
    remain = 300;
    el.timer.hidden = false;
    el.start.disabled = true;
    showClock();
    timerId = setInterval(function () {
      remain--;
      showClock();
      if (remain <= 0) stopTimer(true);
    }, 1000);
  }
  function complete() {
    stopTimer(false);
    var n = getDone() + 1;
    setDone(n);
    el.info.textContent = '今日已完成 ' + n + ' 个五分钟小任务 🎉';
    toast('完成 +1');
    // 展示心情 / 备注记录区（不影响计数）
    if (el.mood) el.mood.hidden = false;
  }

  // 选择心情
  if (el.moodRow) {
    el.moodRow.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mood]');
      if (!b) return;
      var btns = el.moodRow.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) btns[i].classList.remove('sel');
      b.classList.add('sel');
      selectedMood = b.getAttribute('data-mood');
    });
  }

  // 记录心情 / 备注
  if (el.record) {
    el.record.addEventListener('click', function () {
      if (S && typeof S.addFiveMinLog === 'function') {
        try {
          S.addFiveMinLog({ title: lastTitle, mood: selectedMood, note: el.note ? el.note.value.trim() : '' });
          toast('已记录心情 / 备注');
        } catch (e) { toast('记录失败'); }
      }
      render(); // 进入下一个任务，并隐藏心情区
    });
  }

  el.refresh.addEventListener('click', function () {
    stopTimer(false);
    render();
    toast('换了一个任务');
  });
  el.start.addEventListener('click', startTimer);
  el.done.addEventListener('click', complete);

  render();
})();
