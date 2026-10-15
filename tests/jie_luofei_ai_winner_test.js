const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const runtimeFile = path.join(__dirname, 'jie_luofei_ai_runtime_test.js');
const runtimeSource = fs.readFileSync(runtimeFile, 'utf8');
const context = vm.createContext({ require: createRequire(runtimeFile), __dirname, console, process, Buffer, setTimeout });
vm.runInContext(runtimeSource.slice(0, runtimeSource.indexOf("test('native Basic")) + '\nglobalThis.makeFixture = fixture; globalThis.nativeHarness = harness;', context);
const fixture = context.makeFixture, harness = context.nativeHarness;
const clean = value => JSON.parse(JSON.stringify(value));
const winnerSource = fs.readFileSync(path.join(__dirname, '../luofei-benchmark/design/challenge-winner.cjs'), 'utf8');
const aiSource = fs.readFileSync(path.join(__dirname, '../nihilphile武将包/module/jie_luofei_ai.js'), 'utf8');
const tests = [];
const test = (name, run) => tests.push({ name, run });
function original() {
    const sandbox = vm.createContext({ module: { exports: {} } });
    vm.runInContext(winnerSource, sandbox);
    return sandbox.module.exports;
}
function prepare() {
    const f = fixture();
    f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    f.open();
    return f;
}
function identityFixture(roles = ['zhu', 'zhong', 'nei']) {
    const f = prepare();
    while (f.game.players.length < roles.length) f.player('identity-' + f.game.players.length);
    f.game.players.forEach((p, i) => {
        p.identity = roles[i]; p.identityShown = false; p.ai = { shown: 0, identity_mark: 'zhong' };
        p.countCards = zone => [...zone].reduce((count, key) => count + p.zones[key].length, 0);
        p.getKnownCards = () => p.zones.h.filter(c => c.shown);
    });
    f.game.zhu = f.game.players.find(p => p.identity === 'zhu'); f.game.zhu.isZhu = true;
    f.get.population = role => f.game.players.filter(p => p.identity === role).length;
    f.get.situation = () => f.state.situation || 0;
    f.get.aiStrategy = () => f.state.strategy || 1;
    const source = harness.read('mode/identity.js').replace(/\t/g, '    ');
    f.get.realAttitude = vm.runInContext(harness.nativeMethod(source, 'realAttitude: function', 12), f.context).realAttitude;
    f.get.attitude = () => 0;
    return f;
}
function mapped(a, owner) {
    return a.type === 'play' ? { kind: a.mode, card: a.card, user: a.user, targets: a.targets } : a.type === 'endPlay' ? { kind: 'stop', card: null, user: owner, targets: [] } : { kind: a.option, card: null, user: a.option === 'damage' ? a.target : owner, targets: [a.option === 'damage' ? owner : a.target] };
}
test('embedded source is byte-identical to the pinned benchmark winner', () => {
    assert.equal(crypto.createHash('sha256').update(winnerSource).digest('hex'), 'cec479fc1c341422f5dec35aa090253642a9f3d34ade4940bd74a640aa342cb1');
    const embedded = aiSource.split('// BEGIN EXACT BENCHMARK WINNER\n')[1].split('// END EXACT BENCHMARK WINNER')[0];
    assert.equal(embedded, winnerSource);
});
test('original and fresh embedded winner choose identical native roots across public positions', () => {
    for (const names of [['sha'], ['tao', 'jiu', 'sha'], ['jiedao', 'sha'], ['nanman', 'wanjian'], ['juedou', 'tiesuo'], ['qinglong', 'shan']]) {
        const f = prepare(); f.mark(f.loser); f.loser.hp = 2;
        names.forEach(name => f.move(f.card(name), 'h', f.owner));
        const result = f.planner.inspect(f.owner).decision;
        assert.equal(result.source, 'benchmark-winner');
        const view = clean(result.observation);
        const expected = original().decide(clean(view));
        assert.deepEqual(clean(f.context.window.nihilJieLuofeiAI.winnerFactory().decide(clean(view))), clean(expected));
        assert.deepEqual(clean(result.firstAction), mapped(clean(expected), view.owner));
        assert.equal(result.ranked.length, view.legalActions.length - 1);
        assert.equal(Object.hasOwn(result, 'evidence'), false);
    }
});
test('native chooseToUse executes the benchmark recommendation', async () => {
    const f = prepare(), sha = f.card('sha'); f.move(sha, 'h', f.owner);
    const event = f.state.active;
    const decision = f.planner.inspect(f.owner).decision;
    assert.equal(decision.source, 'benchmark-winner');
    assert.deepEqual(clean(decision.firstAction), { kind: 'normal', card: sha.cardid, user: f.owner.playerid, targets: [f.third.playerid] });
    Object.assign(event, { result: 'ai', filterCard: c => c === sha, selectCard: 1, position: 'h', filterTarget: (c, p, t) => p !== t, selectTarget: 1, ai1: f.get.cacheOrder, custom: { add: {}, replace: {} }, _aiexclude: [] });
    await f.content.chooseToUse[1](event, null, f.owner);
    assert.equal(event.result.bool, true);
    assert.equal(event.result.targets[0], f.third);
    assert.equal(f.ui.selected.cards[0], sha);
});
test('borrowed sword execution leaves an unused puppet sha quota unused', async () => {
    const f = prepare(); f.mark(f.loser);
    const weapon = f.card('qinglong'), sword = f.card('jiedao');
    f.move(weapon, 'e', f.owner); f.move(sword, 'h', f.owner);
    f.owner.getEquips = slot => f.owner.zones.e.filter(c => !slot || f.lib.card[c.name].subtype === 'equip' + slot);
    f.loser.getEquips = () => []; f.third.getEquips = () => [];
    f.state.targetChoices.push([f.owner, f.third]);
    await f.active(sword, f.loser);
    assert.equal(f.state.uses.length, 1);
    assert.equal(f.state.uses[0].player, f.loser);
    assert.equal(f.state.uses[0].targets[0], f.owner);
    assert.equal(f.state.uses[0].addedTarget, f.third);
    assert.equal(f.phase.nihilPuppetShaUsed, undefined);
});
test('public rank, sex, attitudes and spent quotas survive snapshot rebasing', () => {
    const f = prepare(); f.mark(f.loser); f.owner.sex = 'female'; f.loser.sex = 'male';
    f.get.number = c => c.number; const sha = f.card('sha'); sha.number = 12; f.move(sha, 'h', f.owner);
    f.phase.nihilPuppetShaUsed = true; f.owner.getStat('card').sha = 2; f.owner.getStat('card').jiu = 1;
    f.actualTurn.nihilJieXueyinUsedSources = [f.loser];
    f.get.attitude = (a, b) => b === f.loser ? 3 : -3;
    const view = f.planner.inspect(f.owner).decision.observation;
    assert.equal(view.ownerHand[0].rank, 12); assert.equal(view.players[0].sex, 'female'); assert.equal(view.players[1].sex, 'male');
    assert.deepEqual(clean(view.players.map(p => p.team)), ['ally', 'ally', 'enemy']);
    assert.deepEqual(clean(view.quotas), { puppetSha: true, shishengDamage: true, shishengRemove: true, normalSha: 2, normalJiu: 1, usedSources: [f.loser.playerid] });
    assert.deepEqual(clean(view.events), []);
});
test('neutral attitudes remain neutral and permit a useful Sha after healing the ally', () => {
    const f = prepare();
    f.owner.hp = 2; f.loser.hp = 2; f.mark(f.owner);
    f.actualTurn.nihilJieXueyinUsedSources = [f.loser];
    f.get.attitude = (a, b) => b === f.third ? 0 : 3;
    const cards = Array.from({ length: 4 }, () => f.card('sha'));
    cards.forEach(c => f.move(c, 'h', f.owner));
    Object.defineProperty(f.third, 'identity', { get() { throw new Error('concealed identity read'); } });
    const getCards = f.third.getCards;
    f.third.getCards = function (zone, ...rest) { assert.ok(!zone.includes('h')); return getCards.call(this, zone, ...rest); };
    const { snapshot, decision } = f.planner.inspect(f.owner);
    assert.equal(decision.source, 'native-fallback');
    assert.equal(decision.fallbackReason, 'unsupported-neutral-attitude');
    assert.equal(snapshot.players.find(p => p.id === f.third.playerid).attitude, 0);
    assert.deepEqual(clean(decision.firstAction), { kind: 'normal', card: cards[0].cardid, user: f.owner.playerid, targets: [f.third.playerid] });
    assert.ok(decision.score > 0);
    assert.ok(snapshot.roots.some(a => JSON.stringify(a) === JSON.stringify(decision.firstAction)));
    assert.equal(decision.coverage.roots, snapshot.roots.length);
    assert.equal(decision.coverage.rootsComplete, true);
    assert.equal(f.owner.getCards('h').length, 4);
    assert.equal(f.owner.getStat('card').sha, 0);
    assert.equal(f.phase.nihilPuppetShaUsed, undefined);
});
test('same-event attitude changes refresh fallback and benchmark routes', () => {
    const f = prepare(); f.move(f.card('sha'), 'h', f.owner);
    let attitude = 0;
    f.get.attitude = (a, b) => b === f.third ? attitude : 3;
    assert.equal(f.planner.inspect(f.owner).decision.fallbackReason, 'unsupported-neutral-attitude');
    attitude = -3;
    const signed = f.planner.inspect(f.owner);
    assert.equal(signed.decision.source, 'benchmark-winner');
    assert.equal(signed.snapshot.players.find(p => p.id === f.third.playerid).attitude, -1);
    assert.deepEqual(clean(signed.decision.firstAction), mapped(clean(original().decide(clean(signed.decision.observation))), f.owner.playerid));
    attitude = 0;
    const neutral = f.planner.inspect(f.owner);
    assert.equal(neutral.decision.source, 'native-fallback');
    assert.equal(neutral.decision.fallbackReason, 'unsupported-neutral-attitude');
    assert.equal(neutral.snapshot.players.find(p => p.id === f.third.playerid).attitude, 0);
});
test('unsupported public cards and hujia use the native fallback explicitly', () => {
    const f = prepare(); f.move(f.card('sha'), 'h', f.owner);
    f.owner.hujia = 1;
    let decision = f.planner.inspect(f.owner).decision;
    assert.equal(decision.source, 'native-fallback'); assert.equal(decision.fallbackReason, 'unsupported-hujia');
    f.owner.hujia = 0; f.lib.card.custom = f.lib.card.sha;
    f.move(f.card('custom'), 'h', f.owner);
    decision = f.planner.inspect(f.owner).decision;
    assert.equal(decision.source, 'native-fallback'); assert.equal(decision.fallbackReason, 'unsupported-card:custom');
});
test('human, online and resumed AI callbacks recheck control on every call', () => {
    const f = prepare(), sha = f.card('sha'); f.move(sha, 'h', f.owner); const event = f.state.active;
    assert.equal(f.planner.score('order', f.owner, { card: sha }), 100);
    for (const change of [() => { event.isMine = () => true; }, () => { event.isMine = () => false; event.isOnline = () => true; }, () => { event.isOnline = () => false; f.context._status.connectMode = true; }, () => { f.context._status.connectMode = false; f.game.online = true; }]) {
        change(); assert.equal(f.planner.score('order', f.owner, { card: sha }), undefined);
    }
    f.game.online = false;
    assert.equal(f.planner.score('order', f.owner, { card: sha }), 100);
    assert.equal(f.planner.inspect().decision.source, 'benchmark-winner');
});
test('unsupported identity context keeps hidden hands and identities out of the winner observation', () => {
    const f = prepare(); f.move(f.card('juedou'), 'h', f.owner);
    const hidden = f.card('sha'); f.move(hidden, 'h', f.third);
    const before = clean(f.planner.inspect(f.owner, { cache: false }));
    hidden.name = 'tao'; hidden.suit = 'heart'; hidden.number = 13;
    Object.defineProperty(f.third, 'identity', { get() { throw new Error('concealed identity read'); } });
    const getCards = f.third.getCards;
    f.third.getCards = function (zone, ...rest) { assert.ok(!zone.includes('h')); return getCards.call(this, zone, ...rest); };
    assert.deepEqual(clean(f.planner.inspect(f.owner)), before);
    assert.ok(before.decision.observation.players.every(p => !Object.hasOwn(p, 'hand') && !Object.hasOwn(p, 'role')));
});

test('true identity removes concealed nei and global loyalist masks, refreshes roles, and preserves hidden cards', () => {
    const f = identityFixture();
    assert.equal(f.get.realAttitude(f.owner, f.loser), 0);
    assert.equal(f.get.realAttitude(f.owner, f.third), 0);
    const hidden = f.card('sha'); f.move(hidden, 'h', f.third);
    const first = clean(f.planner.inspect(f.owner));
    assert.deepEqual(first.snapshot.players.map(p => p.attitude), [1, 1, -1 / 6]);
    assert.deepEqual(first.snapshot.ending.roles, { owner: 'zhu', loser: 'zhong', third: 'nei' });
    assert.equal(first.decision.source, 'benchmark-winner');
    hidden.name = 'tao'; hidden.suit = 'heart'; hidden.number = 13;
    const getCards = f.third.getCards;
    f.third.getCards = function (zone, ...rest) { assert.ok(!zone.includes('h')); return getCards.call(this, zone, ...rest); };
    assert.deepEqual(clean(f.planner.inspect(f.owner, { cache: false })), first);
    f.third.identity = 'fan';
    const changed = clean(f.planner.inspect(f.owner, { cache: true }));
    assert.deepEqual(changed.snapshot.players.map(p => p.attitude), [1, 1, -1]);
    assert.deepEqual(changed.snapshot.ending.roles, { owner: 'zhu', loser: 'zhong', third: 'fan' });
    assert.deepEqual(changed.decision.observation.players.map(p => p.team), ['ally', 'ally', 'enemy']);
    assert.deepEqual(clean(f.game.players.map(p => [p.ai.shown, p.identityShown])), [[0, false], [0, false], [0, false]]);
});

test('native dynamic nei attitudes retain magnitude and genuine zero fallback in the same event', () => {
    const f = identityFixture(['nei', 'zhu', 'fan']);
    for (const [strategy, attitude, source] of [[6, -1 / 3, 'benchmark-winner'], [4, 0, 'native-fallback'], [5, 1, 'benchmark-winner']]) {
        f.state.strategy = strategy;
        const result = f.planner.inspect(f.owner);
        assert.equal(result.snapshot.players[1].attitude, attitude);
        assert.equal(result.decision.source, source);
        if (strategy === 4) assert.equal(result.decision.fallbackReason, 'unsupported-neutral-attitude');
    }
    const before = clean(f.planner.inspect(f.owner));
    f.third.identity = 'zhong';
    const changed = clean(f.planner.inspect(f.owner));
    assert.deepEqual(changed.snapshot.players, before.snapshot.players);
    assert.deepEqual(changed.snapshot.ending.roles, { owner: 'nei', loser: 'zhu', third: 'zhong' });
});

test('identity batch restores absent, configurable readonly and nonconfigurable writable shown descriptors', () => {
    const f = identityFixture();
    f.status.mode = 'normal';
    delete f.owner.ai.shown;
    Object.defineProperty(f.loser.ai, 'shown', { value: 0.2, writable: false, enumerable: false, configurable: true });
    Object.defineProperty(f.third.ai, 'shown', { value: 0.4, writable: true, enumerable: false, configurable: false });
    const descriptors = () => f.game.players.map(p => Object.getOwnPropertyDescriptor(p.ai, 'shown'));
    const before = descriptors();
    f.loser.getKnownCards = () => { assert.deepEqual(descriptors(), before); return []; };
    assert.deepEqual(clean(f.planner.inspect(f.owner).snapshot.players.map(p => p.attitude)), [1, 1, -1 / 6]);
    assert.deepEqual(descriptors(), before);
    f.owner.ai = f.loser.ai;
    f.loser.getKnownCards = () => [];
    assert.deepEqual(clean(f.planner.inspect(f.owner).snapshot.players.map(p => p.attitude)), [1, 1, -1 / 6]);
    assert.deepEqual(Object.getOwnPropertyDescriptor(f.owner.ai, 'shown'), before[1]);
});

test('native attitude exceptions restore every exposure descriptor before propagating', () => {
    const f = identityFixture(), native = f.get.realAttitude;
    delete f.owner.ai.shown;
    const before = f.game.players.map(p => Object.getOwnPropertyDescriptor(p.ai, 'shown'));
    f.get.realAttitude = (from, to) => {
        assert.deepEqual(clean(f.game.players.map(p => p.ai.shown)), [1, 1, 1]);
        const value = native(from, to);
        if (to === f.third) throw new Error('native attitude failure');
        return value;
    };
    assert.throws(() => f.planner.inspect(f.owner), /native attitude failure/);
    assert.deepEqual(f.game.players.map(p => Object.getOwnPropertyDescriptor(p.ai, 'shown')), before);
    f.get.realAttitude = native;
    assert.deepEqual(clean(f.planner.inspect(f.owner).snapshot.players.map(p => p.attitude)), [1, 1, -1 / 6]);
});

test('unsupported identity modes and descriptors preserve the existing attitude and public role path', () => {
    const cases = [
        f => { f.status.mode = 'zhong'; }, f => { f.status.mode = 'stratagem'; }, f => { f.status.mode = 'purple'; },
        f => { f.status.brawl = {}; }, f => { f.game.zhu.isZhu = false; f.game.zhu.identityShown = true; },
        f => { delete f.get.realAttitude; }, f => { f.get.mode = () => 'versus'; f.status.mode = 'two'; f.game.players.forEach((p, i) => { p.side = i !== 2; }); },
        f => { f.owner._trueMe = f.loser; }, f => { f.owner.isMad = () => true; }, f => { f.third.isMad = () => true; },
        f => { f.owner.ai.modAttitudeFrom = () => 0.6; }, f => { f.third.ai.modAttitudeTo = () => 0.6; },
        f => { f.status.ai = { customAttitude: [() => 0.6] }; },
        f => { Object.defineProperty(f.third.ai, 'shown', { writable: false, configurable: false }); },
        f => { Object.defineProperty(f.third.ai, 'shown', { get: () => 0, configurable: true }); },
        f => { delete f.third.ai.shown; Object.preventExtensions(f.third.ai); },
    ];
    for (const configure of cases) {
        const f = identityFixture(); configure(f);
        const before = f.game.players.map(p => Object.getOwnPropertyDescriptor(p.ai, 'shown'));
        f.get.attitude = () => 0.6;
        if (f.get.realAttitude) f.get.realAttitude = () => { throw new Error('unsupported native batch'); };
        const result = f.planner.inspect(f.owner);
        assert.deepEqual(clean(result.snapshot.players.map(p => p.attitude)), [1, 0.6 / 3, 0.6 / 3]);
        assert.deepEqual(f.game.players.map(p => Object.getOwnPropertyDescriptor(p.ai, 'shown')), before);
        if (result.snapshot.ending?.kind === 'identity') assert.deepEqual(clean(result.snapshot.ending.roles), { owner: 'zhu' });
        if (f.get.mode() === 'versus') assert.deepEqual(clean(result.snapshot.ending), { kind: 'two', side: true, sides: { owner: true, loser: true, third: false } });
    }
});

function chainFixture(lordHp, targetHp, name = 'sha', nature = 'fire') {
    const f = identityFixture(['zhong', 'zhu', 'fan', 'fan']);
    const target = f.game.players[3];
    for (const p of f.game.players) { p.hp = p.maxHp = 3; p.isLinked = () => p !== f.third; }
    f.loser.hp = lordHp; target.hp = targetHp;
    f.mark(f.third); f.owner.getStat('card').sha = 1;
    const card = f.card(name); if (nature) card.nature = nature;
    f.move(card, 'h', f.owner);
    return { f, target, card, api: f.context.window.nihilJieLuofeiAI };
}

for (const [lordHp, targetHp] of [[1, 1], [2, 2], [2, 3], [3, 2], [3, 3]]) {
    test('identity friendly chain stops with lord HP ' + lordHp + ' and enemy HP ' + targetHp, () => {
        const { f, api } = chainFixture(lordHp, targetHp);
        const { snapshot, decision } = f.planner.inspect(f.owner);
        assert.equal(decision.firstAction.kind, 'stop', 'lord ' + lordHp + ', enemy ' + targetHp);
        assert.equal(decision.source, 'native-fallback');
        assert.equal(decision.fallbackReason, 'identity-friendly-elemental-chain');
        assert.deepEqual(clean(decision.firstAction), clean(api.winnerPlan(snapshot).firstAction));
    });
}

test('identity friendly chain retains a worthwhile kill and its lord HP cost', () => {
    const { f, target, card, api } = chainFixture(3, 1);
    const { snapshot, decision } = f.planner.inspect(f.owner);
    assert.equal(decision.source, 'native-fallback');
    assert.deepEqual(clean(decision.firstAction), { kind: 'puppet', card: card.cardid, user: 'third', targets: ['loser'] });
    const outcomes = api.simulate(snapshot, decision.firstAction);
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].state.players.find(p => p.id === 'loser').hp, 2);
    assert.equal(outcomes[0].state.players.find(p => p.id === target.playerid).alive, false);
});

test('identity victory stops propagation before a linked lord would die', () => {
    const { f, target, api } = chainFixture(1, 1);
    f.third.identity = 'zhong';
    const { snapshot, decision } = f.planner.inspect(f.owner);
    assert.equal(decision.source, 'native-fallback');
    assert.deepEqual(clean(decision.firstAction.targets), [target.playerid]);
    const outcomes = api.simulate(snapshot, decision.firstAction);
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].state.terminal, 1);
    assert.equal(outcomes[0].state.players.find(p => p.id === 'loser').hp, 1);
    assert.equal(outcomes[0].state.players.find(p => p.id === target.playerid).alive, false);
});

test('chain boundary preserves winner for physical, nonidentity and enemy-only chains', () => {
    for (const scenario of ['physical', 'nonidentity', 'enemy-only', 'unlinked-target']) {
        const { f, api } = chainFixture(3, 1, 'sha', scenario === 'physical' ? null : 'fire');
        const snapshot = f.planner.inspect(f.owner).snapshot;
        if (scenario === 'nonidentity') delete snapshot.ending;
        if (scenario === 'enemy-only') snapshot.players.forEach(p => { p.linked = p.attitude < 0; });
        if (scenario === 'unlinked-target') snapshot.players[3].linked = false;
        const decision = api.winnerPlan(snapshot);
        assert.equal(decision.source, 'benchmark-winner', scenario);
        assert.equal(decision.firstAction.kind, 'puppet', scenario);
    }
});

test('fire attack and actual-user Zhuque route identity chains through the native plan', () => {
    for (const variant of ['thunder', 'zhuque-user', 'zhuque-owner', 'huogong']) {
        const { f, target, api } = chainFixture(3, 1, variant === 'huogong' ? 'huogong' : 'sha', variant === 'thunder' ? 'thunder' : null);
        if (variant.startsWith('zhuque')) f.move(f.card('zhuque'), 'e', variant === 'zhuque-user' ? f.third : f.owner);
        if (variant === 'huogong') {
            const revealed = f.card('shan'); revealed.shown = true; revealed.suit = 'spade'; f.move(revealed, 'h', target);
            const payment = f.card('shan'); payment.suit = 'spade'; f.move(payment, 'h', f.owner);
        }
        const snapshot = f.planner.inspect(f.owner).snapshot;
        const decision = api.winnerPlan(snapshot);
        assert.equal(decision.source, variant === 'zhuque-owner' ? 'benchmark-winner' : 'native-fallback', variant);
        if (variant !== 'zhuque-owner') assert.equal(decision.fallbackReason, 'identity-friendly-elemental-chain', variant);
        assert.equal(decision.firstAction.kind, variant === 'huogong' ? 'normal' : 'puppet', variant);
        assert.equal(decision.firstAction.user, variant === 'huogong' ? 'owner' : 'third', variant);
        const outcomes = api.simulate(snapshot, decision.firstAction);
        assert.equal(outcomes.length, 1, variant);
        assert.equal(outcomes[0].state.players.find(p => p.id === target.playerid).alive, false, variant);
    }
});

test('fresh factories isolate repeated queries, owners and games', () => {
    const f = prepare(); f.move(f.card('sha'), 'h', f.owner);
    const first = clean(f.planner.inspect(f.owner, { cache: false }));
    const other = prepare(); other.owner.playerid = 'other-owner'; other.owner.hp = 1; other.move(other.card('tao'), 'h', other.owner);
    assert.equal(other.planner.inspect(other.owner).decision.source, 'benchmark-winner');
    const alternate = clean(first.snapshot); alternate.owner = f.loser.playerid; alternate.hand = []; alternate.roots = [];
    f.context.window.nihilJieLuofeiAI.winnerPlan(alternate);
    assert.deepEqual(clean(f.planner.inspect(f.owner)), first);
});
test('cancellation and native exclusions remove only authoritative roots', () => {
    const f = prepare(); f.mark(f.loser); f.owner.disabled = true;
    const sha = f.card('sha'); f.move(sha, 'h', f.owner); const event = harness.firstSelection(f);
    const before = f.planner.inspect(f.owner).decision; assert.equal(before.source, 'benchmark-winner');
    f.planner.beginAttempt(event, sha, f.loser); f.planner.observeResult(event, { bool: false }, false);
    const after = f.planner.inspect(f.owner).decision;
    assert.ok(!after.ranked.some(r => JSON.stringify(r.action) === JSON.stringify(before.firstAction)));
    event._aiexclude = ['nihil_jie_yulei_active'];
    const excluded = f.planner.inspect(f.owner).decision;
    assert.ok(!excluded.ranked.some(r => r.action.kind === 'puppet'));
    assert.equal(excluded.firstAction.kind, 'stop'); assert.equal(excluded.score, 0);
    assert.equal(f.planner.score('order', f.owner, { skill: 'puppet' }), 0);
});
(async () => {
    let passed = 0;
    for (const { name, run } of tests) {
        try { await run(); passed++; console.log('PASS ' + name); }
        catch (error) { console.error('FAIL ' + name); console.error(error); }
    }
    console.log(`${passed}/${tests.length} benchmark winner port tests passed`);
    if (passed !== tests.length) process.exitCode = 1;
})();
