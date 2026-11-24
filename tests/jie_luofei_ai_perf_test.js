const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/jie_luofei_ai_reconstructed_eight.json')));
const override = process.argv.find(arg => arg.startsWith('--helper='));
const helper = override ? override.slice(9) : path.join(__dirname, '../nihilphile武将包/module/jie_luofei_ai.js');
const source = fs.readFileSync(helper, 'utf8');
const inputBefore = JSON.stringify(fixture.position);
const context = vm.createContext({ window: {}, input: fixture.position });
vm.runInContext(source, context);
const started = performance.now();
const result = vm.runInContext('window.nihilJieLuofeiAI.plan(input)', context, { timeout: 10000 });
const elapsedMs = performance.now() - started;
const own = fixture.position.owner;
assert.equal(result.coverage.roots, 37);
assert.equal(result.coverage.rootsComplete, true);
assert.equal(result.ranked.length, 37);
assert.deepEqual(JSON.parse(JSON.stringify(result.firstAction)), { kind: 'remove', card: null, user: own, targets: ['562083914'] });
assert.equal(result.evidence.reserveSafe, true);
assert.equal(result.evidence.selfAlive, true);
assert.equal(result.evidence.allyRescues['562083914'], 1);
assert.ok(result.coverage.refusedTransitions > 0);
assert.ok(result.coverage.ordinaryWork <= 512);
assert.ok(result.coverage.coreWork <= 37 * 1024);
const area = result.ranked.filter(r => r.action.card === '4605266174');
assert.equal(area.length, 3);
for (const row of result.ranked) {
  assert.ok(Number.isFinite(row.score));
  assert.ok(Math.abs(row.branches.reduce((sum, b) => sum + b.probability, 0) - 1) < 1e-9);
}
for (const row of area) {
  assert.equal(row.action.targets.length, 7);
  assert.equal(new Set(row.action.targets).size, 7);
  assert.ok(!row.action.targets.includes(row.action.user));
}
assert.equal(JSON.stringify(fixture.position), inputBefore);
const report = {
  scope: fixture.notice,
  elapsedMs,
  errors: 0,
  node: process.version,
  helperSha256: crypto.createHash('sha256').update(source).digest('hex'),
  outputSha256: crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex'),
  coverage: result.coverage,
  firstAction: result.firstAction,
};
console.log(JSON.stringify(report));
