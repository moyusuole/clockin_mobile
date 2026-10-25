/**
 * daily.test.js — 每日卡片（冷知识/名言） + 时间胶囊 的回归测试
 * 覆盖：跨天自动刷新、手动刷新不重复、胶囊写入校验、到期弹出逻辑、备份向后兼容。
 */
const storage_path = require('path');

global.self = global;
// 浏览器模式所需的 localStorage 桩
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

// logic.js 是 UMD：Node 下只走 module.exports，不会自动挂全局。
// 必须在 require storage 之前挂上，因为 storage 内部取的是 root.CheckinLogic。
global.CheckinLogic = require(storage_path.join(__dirname, '../public/src/logic.js'));
const L = global.CheckinLogic;
const S = require(storage_path.join(__dirname, '../public/src/storage.js'));
const D = require(storage_path.join(__dirname, '../public/daily-content.js'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}

const TODAY = L.todayStr();
const YESTERDAY = L.addDays(TODAY, -1);
const TOMORROW = L.addDays(TODAY, 1);

console.log('\n[每日卡片]');

// —— 抽取算法 ——
const a1 = D.drawFacts(TODAY, 0, 2);
const a2 = D.drawFacts(TODAY, 0, 2);
check('同一天同一 offset → 结果稳定', JSON.stringify(a1) === JSON.stringify(a2), { a1, a2 });

const b1 = D.drawFacts(TOMORROW, 0, 2);
check('跨天 → 自动换新', JSON.stringify(a1) !== JSON.stringify(b1), { today: a1, tomorrow: b1 });

const c1 = D.drawFacts(TODAY, 1, 2);
check('手动刷新 offset+1 → 内容不同', JSON.stringify(a1) !== JSON.stringify(c1), { before: a1, after: c1 });

const seen = [];
for (let o = 0; o < 10; o++) D.drawFacts(TODAY, o, 2).forEach(x => seen.push(x));
check('连续刷新 10 轮（20 条）无重复', new Set(seen).size === seen.length, { unique: new Set(seen).size, total: seen.length });

const q1 = D.drawQuotes(TODAY, 0, 2);
check('名言返回 2 条且带作者', q1.length === 2 && q1.every(q => q.t && q.a), q1);

const cnt = D.count();
check('语料规模充足（>100 条）', cnt.facts > 100 && cnt.quotes > 100, cnt);

// —— 进度存储（跨天自动重置 —— 自动刷新的核心）——
S.init().then(() => {
  const p0 = S.getDailyCards(TODAY);
  check('首次读取 → offset 归零', p0.date === TODAY && p0.factOffset === 0 && p0.quoteOffset === 0, p0);

  S.bumpDailyCard('fact', TODAY);
  check('刷新冷知识 → factOffset=1', S.getDailyCards(TODAY).factOffset === 1);

  S.bumpDailyCard('fact', TODAY);
  S.bumpDailyCard('quote', TODAY);
  const p2 = S.getDailyCards(TODAY);
  check('两类计数互相独立', p2.factOffset === 2 && p2.quoteOffset === 1, p2);

  const p3 = S.getDailyCards(TOMORROW);
  check('跨天自动重置为 0（每天自动换新）', p3.date === TOMORROW && p3.factOffset === 0 && p3.quoteOffset === 0, p3);

  console.log('\n[时间胶囊]');

  check('空内容 → 拒绝', S.addCapsule({ content: '', openAt: TOMORROW }).ok === false);
  check('开启日期为今天 → 拒绝', S.addCapsule({ content: 'x', openAt: TODAY }).ok === false);
  check('开启日期为过去 → 拒绝', S.addCapsule({ content: 'x', openAt: YESTERDAY }).ok === false);
  check('日期格式非法 → 拒绝', S.addCapsule({ content: 'x', openAt: '明天' }).ok === false);

  const ok1 = S.addCapsule({ content: '致一年后的我：愿你还在坚持。', openAt: TOMORROW });
  check('正常封存 → 成功', ok1.ok === true, ok1);
  const cid = ok1.capsule.id;

  check('未到期 → 到期列表为空', S.getDueCapsules(TODAY).length === 0);
  check('到期当天 → 能查到（触发自动弹信）', S.getDueCapsules(TOMORROW).length === 1);
  check('错过日期后仍能取到（不怕漏）', S.getDueCapsules(L.addDays(TOMORROW, 30)).length === 1);

  const opened = S.openCapsule(cid);
  check('拆封成功', opened.ok === true && opened.capsule.opened === true, opened);
  check('拆封后不再重复弹出', S.getDueCapsules(TOMORROW).length === 0);

  const long = 'x'.repeat(2500);
  const okLong = S.addCapsule({ content: long, openAt: L.addDays(TODAY, 7) });
  check('超长内容被截断到 2000 字', okLong.ok === true && okLong.capsule.content.length === 2000);

  const cntBefore = S.getCapsules().length;
  S.deleteCapsule(okLong.capsule.id);
  check('删除胶囊生效', S.getCapsules().length === cntBefore - 1);

  console.log('\n[备份兼容]');

  const backup = S.exportData();
  check('导出→导入成功', S.importData(backup).ok === true);
  check('导入后胶囊不丢', S.getCapsules().length === cntBefore - 1);

  // 旧版本备份：完全没有 dailyCards / capsules 字段
  const legacy = JSON.stringify({ version: 1, state: { users: [], tasks: [], checkins: [] } });
  check('旧备份可导入（向后兼容）', S.importData(legacy).ok === true);
  const pc = S.getDailyCards(TODAY);
  check('旧备份导入后每日卡片仍可用', pc && pc.factOffset === 0, pc);
  check('旧备份导入后胶囊为空数组', Array.isArray(S.getCapsules()) && S.getCapsules().length === 0);

  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败\n');
  process.exit(fail ? 1 : 0);
}).catch(e => { console.error('测试异常:', e); process.exit(1); });
