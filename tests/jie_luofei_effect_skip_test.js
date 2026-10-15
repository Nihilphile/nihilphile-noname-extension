const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = require(path.join(root, 'tests/fixtures/luofei_effect_harness'));
const candidate = path.join(root, 'nihilphile武将包/module/jie_luofei_ai.js');
const api = load(fs.readFileSync(candidate, 'utf8'));
const clean = value => JSON.parse(JSON.stringify(value));
function fixture() {
    const f = api.fixture();
    for (const p of f.game.players) { p.mayHaveShan = () => false; p.mayHaveSha = () => false; }
    f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    f.lib.card.sha.ai.result.target = -1.5;
    const card = f.card('sha'); f.move(card, 'h', f.owner); f.open();
    return { f, card };
}
function skill(f, player, name, effect) { f.lib.skill[name] = { ai: { effect } }; player.skills.push(name); }
function inspect(f) { return clean(f.planner.inspect(f.owner).decision); }
function evidence(decision, card, user = 'owner', target = 'third') { return decision.guard.evidence[`normal|${card.cardid}|${user}|${target}`]; }
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('missing effects cause no ignoreSkill scans while existing effects retain exact payload', () => {
    const { f, card } = fixture();
    for (const [name, effect] of [['absent', undefined], ['nullEffect', null], ['falseEffect', false], ['zeroEffect', 0]]) skill(f, f.third, name, effect);
    skill(f, f.third, 'empty', {});
    skill(f, f.third, 'actorOnly', { player_use: () => [1, -40] });
    skill(f, f.third, 'constantTarget', { target_use: 3, target: -4 });
    const callbacks = [], scans = [];
    skill(f, f.third, 'retaliation', { target_use: (c, u, t, value, link) => { callbacks.push([c.cardid, u.playerid, t.playerid, value, link]); return [1, 0, 1, -4]; } });
    f.owner.hasSkillTag = function (tag, hidden, payload) {
        if (tag === 'ignoreSkill') scans.push([this.playerid, hidden, payload.card.cardid, payload.target.playerid, payload.skill, payload.isLink]);
        return false;
    };
    const d = inspect(f);
    assert.equal(d.source, 'conservative-risk');
    assert.equal(evidence(d, card).blocked, true);
    assert.equal(d.ranked.some(row => row.action.targets.includes('loser')), true);
    assert.deepEqual(scans, ['empty', 'actorOnly', 'constantTarget', 'retaliation'].map(name => ['owner', true, card.cardid, 'third', name, undefined]));
    assert.deepEqual(callbacks, [[card.cardid, 'owner', 'third', -1.5, undefined]]);
});

test('ignoreSkill can replace an existing target callback before its invocation', () => {
    for (const key of ['target_use', 'target']) {
        const { f, card } = fixture(); const calls = [];
        const effect = { [key]: () => { calls.push('original'); return 1; } };
        skill(f, f.third, 'changing', effect);
        f.owner.hasSkillTag = (tag, hidden, payload) => {
            if (tag === 'ignoreSkill' && payload.skill === 'changing') {
                calls.push('tag');
                effect[key] = function (c, u, t) { calls.push([this === effect, c.cardid, u.playerid, t.playerid]); return [1, 0, 1, -4]; };
            }
            return false;
        };
        const d = inspect(f);
        assert.equal(d.source, 'conservative-risk'); assert.equal(evidence(d, card).blocked, true);
        assert.deepEqual(calls, ['tag', [true, card.cardid, 'owner', 'third']]);
    }
});

test('dynamic ignoreSkill changes refresh same-event decisions and do not call ignored target', () => {
    const { f, card } = fixture(); let callbacks = 0, scans = 0;
    skill(f, f.third, 'retaliation', { target_use: () => { callbacks++; return [1, 0, 1, -4]; } });
    f.owner.hasSkillTag = tag => { if (tag !== 'ignoreSkill') return false; scans++; return !!f.owner.storage.ignore; };
    assert.equal(evidence(inspect(f), card).blocked, true);
    f.owner.storage.ignore = true;
    const safe = inspect(f); assert.equal(safe.source, 'benchmark-winner'); assert.equal(safe.guard, undefined);
    f.owner.storage.ignore = false;
    assert.equal(evidence(inspect(f), card).blocked, true);
    assert.equal(callbacks, 2); assert.equal(scans, 3);
});

test('same-event target storage and actor seed mutations refresh risk signature', () => {
    const { f, card } = fixture();
    skill(f, f.third, 'retaliation', { target_use: (c, u, t) => [1, 0, -4, -(t.storage.penalty || 0)] });
    f.lib.card.sha.ai.result.player = u => u.storage.seed || 0;
    const safe = inspect(f); assert.equal(safe.source, 'benchmark-winner'); assert.equal(safe.guard, undefined);
    f.third.storage.penalty = 4;
    const storageRisk = inspect(f); assert.equal(evidence(storageRisk, card).blocked, true);
    f.third.storage.penalty = 0;
    assert.equal(inspect(f).source, 'benchmark-winner');
    f.owner.storage.seed = 1;
    const seedRisk = inspect(f); assert.equal(evidence(seedRisk, card).blocked, true);
    assert.notEqual(seedRisk.guard.signature, storageRisk.guard.signature);
    f.owner.storage.seed = 0;
    assert.deepEqual(inspect(f), safe);
});

test('legacy, target_use and target callbacks preserve receiver, precedence and order', () => {
    for (const protocol of ['legacy', 'target_use', 'target']) {
        const { f, card } = fixture(); const calls = [];
        function callback(c, u, t, value) { calls.push([this.marker, c.cardid, u.playerid, t.playerid, value]); return [2, 0, 1, -4]; }
        const effect = protocol === 'legacy' ? callback : protocol === 'target_use' ? { marker: protocol, target_use: callback, target: () => { calls.push('wrong precedence'); } } : { marker: protocol, target_use: 7, target: callback };
        skill(f, f.third, 'first', effect); f.lib.skill.first.ai.marker = protocol;
        skill(f, f.third, 'second', { target: (c, u, t, value) => { calls.push(['second', value]); return 1; } });
        const d = inspect(f);
        assert.equal(evidence(d, card).blocked, true);
        assert.deepEqual(calls, [[protocol, card.cardid, 'owner', 'third', -1.5], ['second', -3]]);
    }
});

test('actual puppet user owns ignoreSkill and callback invocation', () => {
    const { f, card } = fixture(); f.mark(f.loser); f.owner.disabled = true;
    const calls = [], scans = [];
    skill(f, f.third, 'retaliation', { target_use: (c, u, t) => { calls.push([c.cardid, u.playerid, t.playerid]); return [1, 0, 1, -4]; } });
    f.owner.hasSkillTag = tag => tag === 'ignoreSkill';
    f.loser.hasSkillTag = function (tag, hidden, payload) { if (tag === 'ignoreSkill') scans.push([this.playerid, payload.target.playerid]); return false; };
    const d = inspect(f);
    assert.equal(d.source, 'conservative-risk'); assert.equal(d.firstAction.kind, 'stop');
    assert.equal(d.guard.evidence[`puppet|${card.cardid}|loser|third`].blocked, true);
    assert.deepEqual(calls, [[card.cardid, 'loser', 'third']]);
    assert.deepEqual(scans, [['loser', 'third']]);
});

test('target callback and ignoreSkill exceptions preserve event and selection context', () => {
    for (const throwing of ['callback', 'ignoreSkill']) {
        const { f, card } = fixture(); const event = f.state.active;
        const selected = f.ui.selected, cards = selected.cards, targets = selected.targets;
        Object.defineProperty(event, 'marker', { value: 7, writable: true, configurable: true, enumerable: false });
        const before = Object.getOwnPropertyDescriptors(event);
        function mutate() { event.marker = 8; event.added = 9; selected.cards.push(card); selected.targets = [f.third]; throw Error('h01'); }
        skill(f, f.third, 'throwing', { target_use: throwing === 'callback' ? mutate : () => [1, 0, 1, -4] });
        if (throwing === 'ignoreSkill') f.owner.hasSkillTag = tag => { if (tag === 'ignoreSkill') mutate(); return false; };
        const d = inspect(f);
        assert.equal(d.source, 'benchmark-winner'); assert.equal(evidence(d, card).blocked, false);
        assert.deepEqual(d.guard.diagnostics.map(row => row.reason), [throwing === 'callback' ? 'callback-threw' : 'probe-threw: h01']);
        assert.deepEqual(Object.getOwnPropertyDescriptors(event), before);
        assert.equal(f.ui.selected, selected); assert.equal(selected.cards, cards); assert.equal(selected.targets, targets);
        assert.deepEqual(clean(cards), []); assert.deepEqual(clean(targets), []);
    }
});

let passed = 0;
for (const { name, run } of tests) {
    try { run(); passed++; console.log('PASS ' + name); }
    catch (error) { console.error('FAIL ' + name + '\n' + error.stack); }
}
const expected = tests.length;
console.log(`${passed}/${expected} H01 regression cases passed`);
if (passed !== expected) process.exitCode = 1;
