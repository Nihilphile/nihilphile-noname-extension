// Time the production planner on public snapshots, including the first call.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const replay = require('./fixtures/jie_luofei_ai_reconstructed_eight.json');
const golden = require('./fixtures/luofei_blank_baseline.json');
const source = fs.readFileSync(path.join(__dirname, '../nihilphile武将包/module/jie_luofei_ai.js'), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const planner = context.window.nihilJieLuofeiAI;
function measure(position, roots) {
    const start = performance.now();
    const decision = planner.winnerPlan(position);
    const ms = performance.now() - start;
    assert.equal(decision.source, 'benchmark-winner');
    assert.equal(decision.ranked.length, roots);
    assert.ok(decision.firstAction.kind === 'stop' || decision.ranked.some(row => row.action === decision.firstAction));
    return { ms: Math.round(ms * 10) / 10, firstAction: JSON.parse(JSON.stringify(decision.firstAction)) };
}
const cold = measure(replay.position, 37);
const repeats = Array.from({ length: 5 }, () => measure(replay.position, 37));
for (const repeat of repeats) assert.deepEqual(repeat.firstAction, cold.firstAction);
const cases = [];
for (const record of golden.records) {
    for (const { view } of record.steps) {
        const sample = measure(view.snapshot, view.snapshot.roots.length);
        assert.deepEqual(sample.firstAction, view.decision.firstAction);
        cases.push({ scenario: record.scenario, ms: sample.ms });
    }
}
console.log(JSON.stringify({ eightFirstMs: cold.ms, eightRepeatMs: repeats.map(r => r.ms), firstAction: cold.firstAction, cases }));
const limitArg = process.argv.find(arg => arg.startsWith('--max-ms='));
if (limitArg) {
    const limit = Number(limitArg.slice('--max-ms='.length));
    assert.ok(Number.isFinite(limit) && limit > 0, 'expected a positive millisecond limit');
    for (const sample of [cold, ...repeats, ...cases]) {
        assert.ok(sample.ms < limit, `${sample.scenario || 'eight-player replay'} took ${sample.ms} ms (limit ${limit} ms)`);
    }
}
