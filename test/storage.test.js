/**
 * storage.test.js — 验证存储层（Node 环境，mock localStorage）
 * 覆盖：init / addTask / toggleCheckin / isChecked / deleteTask / 持久化回写 / 重载恢复
 */
const assert = require('assert');

// 1) mock localStorage（模拟浏览器，写到内存对象）
const store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};

// 2) 载入逻辑层（挂到 globalThis.CheckinLogic）
global.CheckinLogic = require('../public/src/logic.js');
// 3) 载入存储层（IIFE root=globalThis，读到 globalThis.CheckinLogic）
const S = require('../public/src/storage.js');

async function run() {
  await S.init();
  assert.strictEqual(S.backend, 'local', 'web 预览应走 local 后端');
  assert.strictEqual(S.isNative, false, 'Node 环境非原生');

  // 添加任务
  const a = S.addTask({ title: '运动 30 分钟', category: '健康' });
  assert.ok(a.ok, 'addTask 成功: ' + (a.error || ''));
  assert.strictEqual(a.task.id, 1, '首个任务 id=1');
  assert.strictEqual(S.getTasks().length, 1, '任务数=1');

  // 打卡 / 取消打卡
  assert.ok(S.toggleCheckin(1).checked, '今日打卡成功');
  assert.ok(S.isChecked(1), 'isChecked 应为 true');
  assert.ok(!S.toggleCheckin(1).checked, '取消打卡成功');
  assert.ok(!S.isChecked(1), 'isChecked 应为 false');

  // 持久化：localStorage 已同步写入
  const raw = global.localStorage.getItem('checkin_mobile_state_v1');
  assert.ok(raw, 'localStorage 已写入');
  assert.strictEqual(JSON.parse(raw).tasks.length, 1, '持久化任务数=1');

  // 删除任务
  assert.ok(S.deleteTask(1).ok, '删除成功');
  assert.strictEqual(S.getTasks().length, 0, '删除后任务数=0');

  // 重新载入模块，模拟 App 重启从 localStorage 恢复
  delete require.cache[require.resolve('../public/src/storage.js')];
  const S2 = require('../public/src/storage.js');
  await S2.init();
  assert.strictEqual(S2.getTasks().length, 0, '重启后从 localStorage 恢复（任务仍为0）');

  // ---- 导出 / 导入备份 ----
  const b = S2.addTask({ title: '背单词', category: '学习' });
  assert.ok(b.ok, '添加备份测试任务');
  assert.ok(S2.toggleCheckin(b.task.id).checked, '备份测试任务打卡');

  const backup = S2.exportData();
  assert.ok(typeof backup === 'string' && backup.indexOf('checkin-mobile') >= 0, 'exportData 返回带标识的 JSON 字符串');

  // 导入损坏内容 -> 失败
  const bad = S2.importData('{ not valid');
  assert.strictEqual(bad.ok, false, '导入非法 JSON 应失败');

  // 导入格式不正确的内容 -> 失败
  const bad2 = S2.importData(JSON.stringify({ foo: 1 }));
  assert.strictEqual(bad2.ok, false, '导入缺少 tasks/checkins 应失败');

  // 导入合法备份 -> 替换 state 并持久化
  const good = S2.importData(backup);
  assert.ok(good.ok, '导入合法备份成功');
  assert.strictEqual(good.tasks, 1, '导入后任务数=1');
  assert.ok(S2.isChecked(b.task.id), '导入后打卡状态恢复');

  // 导入后再次写入 localStorage，模拟跨设备/重装后恢复
  const raw2 = global.localStorage.getItem('checkin_mobile_state_v1');
  assert.ok(raw2 && JSON.parse(raw2).tasks.length === 1, '导入结果已持久化');

  console.log('storage self-test: ALL PASSED (15 assertions)');
}

run().catch(function (e) {
  console.error('storage self-test FAILED:', e.message);
  process.exit(1);
});
