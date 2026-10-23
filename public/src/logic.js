/**
 * logic.js — 纯业务逻辑（无任何浏览器/Node 依赖）
 * 同时支持浏览器（挂到 window.CheckinLogic）与 Node（module.exports）做单测。
 *
 * 数据模型（内存对象，由 storage 层持久化）：
 *   tasks:    [{ id, user_id, title, description, category, created_at, archived }]
 *   checkins: [{ id, user_id, task_id, date }]   // date 为本地 'YYYY-MM-DD'
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CheckinLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 本地日期 -> 'YYYY-MM-DD'
  function todayStr(d) {
    d = d || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  // 'YYYY-MM-DD' 加减 n 天
  function addDays(dateStr, n) {
    const p = dateStr.split('-').map(Number);
    const dt = new Date(p[0], p[1] - 1, p[2]);
    dt.setDate(dt.getDate() + n);
    return todayStr(dt);
  }

  // 校验任务输入
  function validateTask(input) {
    const title = (input && input.title || '').trim();
    if (!title) return { ok: false, error: '标题不能为空' };
    if (title.length > 60) return { ok: false, error: '标题过长（最多 60 字）' };
    return {
      ok: true,
      title: title,
      description: (input.description || '').trim(),
      category: (input.category || '').trim()
    };
  }

  // 某天某用户已打卡的 task_id 数组
  function checkinsForDate(checkins, dateStr, userId) {
    return checkins
      .filter(function (c) { return c.date === dateStr && (userId == null || c.user_id === userId); })
      .map(function (c) { return c.task_id; });
  }

  /**
   * 连续打卡天数：
   * - 若今天已打卡，从今天往前连续计数；
   * - 若今天未打卡，则从昨天开始算（避免刚打开 App 就显示「断签」），昨天也没有则返回 0。
   */
  function computeStreak(dateSet, today) {
    today = today || todayStr();
    let cursor = today;
    if (!dateSet.has(today)) {
      cursor = addDays(today, -1);
      if (!dateSet.has(cursor)) return 0;
    }
    let streak = 0;
    while (dateSet.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  /**
   * 近 days 天完成率（%）：
   * 对每一天 d，完成度 = 当天已打卡任务数 / 当天应打卡任务数（未归档且 created_at<=d）。
   * 仅统计「当天有应打卡任务」的日子，求平均。
   */
  function completionRate(tasks, checkins, days, userId, today) {
    days = days || 30;
    today = today || todayStr();
    userId = userId == null ? 1 : userId;
    const active = tasks.filter(function (t) {
      return t.user_id === userId && !t.archived && t.created_at <= today;
    });
    if (active.length === 0) return 0;
    let sum = 0, count = 0;
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      const due = active.filter(function (t) { return t.created_at <= d; });
      if (due.length === 0) continue;
      const done = checkinsForDate(checkins, d, userId).filter(function (tid) {
        return due.some(function (t) { return t.id === tid; });
      }).length;
      sum += done / due.length;
      count++;
    }
    return count ? Math.round((sum / count) * 100) : 0;
  }

  // 汇总统计
  function computeStats(tasks, checkins, opts) {
    opts = opts || {};
    const userId = opts.userId == null ? 1 : opts.userId;
    const today = opts.today || todayStr();
    const activeTasks = tasks.filter(function (t) {
      return t.user_id === userId && !t.archived;
    });
    const myCheckins = checkins.filter(function (c) { return c.user_id === userId; });
    const dateSet = new Set(myCheckins.map(function (c) { return c.date; }));
    const todayDone = checkinsForDate(checkins, today, userId);
    const perTask = activeTasks.map(function (t) {
      const taskDates = new Set(myCheckins
        .filter(function (c) { return c.task_id === t.id; })
        .map(function (c) { return c.date; }));
      return {
        task_id: t.id,
        title: t.title,
        category: t.category,
        streak: computeStreak(taskDates, today),
        total: taskDates.size
      };
    });
    return {
      streak: computeStreak(dateSet, today),
      todayTotal: activeTasks.length,
      todayChecked: todayDone.length,
      completionRate30: completionRate(tasks, checkins, 30, userId, today),
      perTask: perTask
    };
  }

  return {
    todayStr: todayStr,
    addDays: addDays,
    validateTask: validateTask,
    checkinsForDate: checkinsForDate,
    computeStreak: computeStreak,
    completionRate: completionRate,
    computeStats: computeStats
  };
});
