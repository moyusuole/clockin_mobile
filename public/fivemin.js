/**
 * fivemin.js — 随机五分钟小任务（独立模块，不依赖 app.js）
 * 在 index.html 末尾通过 <script src="fivemin.js"></script> 引入。
 * 任务池 + 随机抽取 + 手动刷新 + 5 分钟计时 + 今日完成计数，纯前端、离线可用。
 */
(function () {
  'use strict';

  // 五分钟小任务池（每个约 5 分钟可完成的小动作）
  var TASKS = [
    { title: '做 20 个深蹲', category: '健康', tip: '分两组做，膝盖别超过脚尖' },
    { title: '靠墙静蹲 1 分钟 ×3 组', category: '健康', tip: '大腿与地面平行，背贴墙' },
    { title: '喝一杯温水', category: '健康', tip: '小口慢饮，顺手拉伸一下肩颈' },
    { title: '整理手机相册 5 分钟', category: '整理', tip: '删掉模糊截图和无用表情包' },
    { title: '清空微信/短信未读', category: '整理', tip: '顺手回复重要消息' },
    { title: '收拾桌面 5 分钟', category: '整理', tip: '只留下当下要用的东西' },
    { title: '背 10 个单词', category: '学习', tip: '用 app 或卡片，重在坚持' },
    { title: '读 5 页书', category: '学习', tip: '纸质书最佳，关掉手机通知' },
    { title: '看一节短视频课', category: '学习', tip: '学一个能马上用上的小技巧' },
    { title: '写 3 条今日待办', category: '效率', tip: '按重要程度排序，只写 3 条' },
    { title: '给明天列个计划', category: '效率', tip: '想清楚最重要的一件事' },
    { title: '清理邮箱收件箱', category: '效率', tip: '能两分钟处理的立刻做' },
    { title: '深呼吸放松 5 分钟', category: '正念', tip: '4 秒吸、7 秒屏、8 秒呼，循环' },
    { title: '闭眼冥想 5 分钟', category: '正念', tip: '只关注呼吸，走神了就拉回来' },
    { title: '写今日三件感恩小事', category: '正念', tip: '具体一点，比如"今天的阳光"' },
    { title: '给家人/朋友发条消息', category: '关系', tip: '不用长，问声好就好' },
    { title: '给一位老朋友点赞评论', category: '关系', tip: '保持弱联系的温暖' },
    { title: '做一组肩颈拉伸', category: '健康', tip: '低头族必备，动作慢而稳' },
    { title: '快走 / 原地踏步 5 分钟', category: '健康', tip: '出点微汗，精神会好很多' },
    { title: '写一条日记', category: '成长', tip: '今天发生了什么、有何感受' },
    { title: '画一张今日心情涂鸦', category: '创意', tip: '不用画得好，随手就好' },
    { title: '听一首没听过的歌', category: '放松', tip: '关掉视频，只听声音' },
    { title: '站着办公 / 活动 5 分钟', category: '健康', tip: '打断久坐，护腰护颈' },
    { title: '整理一个常用的文件夹', category: '整理', tip: '桌面或下载目录都行' },
    { title: '复习昨天学的知识点', category: '学习', tip: '用费曼法讲给自己听' },
    { title: '给房间通个风', category: '生活', tip: '开窗 5 分钟，换换空气' },
    { title: '泡一杯茶慢慢喝', category: '放松', tip: '放下手机，专注这一杯' },
    { title: '计划本周运动安排', category: '效率', tip: '先定 2-3 次，别贪多' },
    { title: '清理一个社交 App 关注列表', category: '整理', tip: '取关不再想看的内容' },
    { title: '对着镜子夸自己一句', category: '正念', tip: '真诚一点，今天你辛苦了' }
  ];

  function pick(exclude) {
    if (TASKS.length === 1) return TASKS[0];
    var pool = TASKS;
    if (exclude) {
      var f = pool.filter(function (t) { return t.title !== exclude; });
      if (f.length) pool = f;
    }
    return pool[Math.floor(Math.random() * pool.length)];
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
    info: document.getElementById('fmDoneInfo')
  };
  if (!el.title) return; // 页面没有该模块则直接跳过

  var today = todayStr();
  var lastTitle = null;
  var timerId = null;
  var remain = 0;

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

  function render() {
    var t = pick(lastTitle);
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
    render();
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
