/**
 * logic.test.js — 纯逻辑自测（node test/logic.test.js）
 * 全部断言通过才退出 0，否则退出 1，作为可验证证据。
 */
const L = require('../public/src/logic.js');

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ok  -', msg); }
  else { fail++; console.log('  FAIL-', msg, '\n        expected:', e, '\n        got     :', a); }
}

const TODAY = '2026-10-22';

// 1) 任务校验
eq(L.validateTask({ title: '  读书 ' }).ok, true, 'validateTask 去除首尾空格后通过');
eq(L.validateTask({ title: '' }).ok, false, '空标题被拒绝');
eq(L.validateTask({ title: 'x'.repeat(61) }).ok, false, '超长标题被拒绝');

// 2) 连续天数：今天未打卡但昨天有 -> 不算断，从昨天算 3 天
eq(L.computeStreak(new Set(['2026-10-21', '2026-10-20', '2026-10-19']), TODAY), 3,
  'computeStreak: 今天空、昨天起连续 3 天');
// 今天也打卡 -> 4 天
eq(L.computeStreak(new Set(['2026-10-22', '2026-10-21', '2026-10-20', '2026-10-19']), TODAY), 4,
  'computeStreak: 含今天连续 4 天');
// 昨天断 -> 0
eq(L.computeStreak(new Set(['2026-10-20', '2026-10-19']), TODAY), 0,
  'computeStreak: 昨天断签返回 0');

// 3) 完成率：task 创建于 10-01，近30天只打了 10-21/10-22 两天
{
  const tasks = [{ id: 1, user_id: 1, title: 'a', created_at: '2026-10-01', archived: false }];
  const checkins = [
    { user_id: 1, task_id: 1, date: '2026-10-22' },
    { user_id: 1, task_id: 1, date: '2026-10-21' }
  ];
  // 有效天数 = 10-01..10-22 共 22 天，完成 2 天 -> 2/22 ≈ 9%
  eq(L.completionRate(tasks, checkins, 30, 1, TODAY), 9, 'completionRate: 部分打卡 ≈9%');
}
// 全勤 -> 100%
{
  const tasks = [{ id: 1, user_id: 1, title: 'a', created_at: '2026-09-22', archived: false }];
  const checkins = [];
  for (let i = 0; i < 30; i++) checkins.push({ user_id: 1, task_id: 1, date: L.addDays(TODAY, -i) });
  eq(L.completionRate(tasks, checkins, 30, 1, TODAY), 100, 'completionRate: 全勤 100%');
}

// 4) 汇总统计
{
  const tasks = [
    { id: 1, user_id: 1, title: '运动', created_at: '2026-10-01', archived: false },
    { id: 2, user_id: 1, title: '阅读', created_at: '2026-10-01', archived: false }
  ];
  const checkins = [
    { user_id: 1, task_id: 1, date: '2026-10-22' },
    { user_id: 1, task_id: 2, date: '2026-10-22' },
    { user_id: 1, task_id: 1, date: '2026-10-21' },
    { user_id: 1, task_id: 2, date: '2026-10-21' }
  ];
  const s = L.computeStats(tasks, checkins, { userId: 1, today: TODAY });
  eq(s.todayTotal, 2, 'stats: 今日任务总数=2');
  eq(s.todayChecked, 2, 'stats: 今日已打卡=2');
  eq(s.streak, 2, 'stats: 整体连续天数=2');
  eq(s.perTask.length, 2, 'stats: 每任务统计条目=2');
  eq(s.perTask[0].streak, 2, 'stats: 单任务连续天数=2');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
