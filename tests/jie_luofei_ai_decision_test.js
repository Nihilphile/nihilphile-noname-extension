const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../nihilphile武将包/module/jie_luofei_ai.js'), 'utf8'), context);
const engine = context.window.nihilJieLuofeiAI;
const clean = value => JSON.parse(JSON.stringify(value));
const plan = (s, options = { budget: 0 }) => clean(engine.plan(s, options));
const simulate = (s, a) => clean(engine.simulate(s, a));
const person = (id, attitude, extra = {}) => ({ id, attitude, hp: 3, maxHp: 3, ...extra });
let serial = 0;
const card = (name, extra = {}) => ({ id: 'c' + ++serial, name, type: ['sha', 'shan', 'jiu', 'tao'].includes(name) ? 'basic' : 'trick', suit: 'heart', color: 'red', ...extra });
const position = (hand = [], extra = {}) => ({ owner: 'self', players: [person('self', 1), person('ally', 1), person('enemy', -1)], hand, quota: { damage: true, remove: true }, ...extra });
const use = (c, user, targets, kind = 'puppet') => ({ kind, card: c.id, user, targets });
const get = (s, id) => s.players.find(p => p.id === id);
const cases = [];
const test = (name, run) => cases.push({ name, run });

test('external mark belongs to Luofei and beats self damage after the same two draws and recovery', () => {
    const s = position([], { quota: {} });
    const d = plan(s);
    assert.equal(d.firstAction.kind, 'damage');
    assert.notEqual(d.firstAction.user, 'self');
    assert.equal(d.continuation[0].kind, 'remove');
    assert.equal(d.continuation[0].targets[0], 'self');
    assert.ok(d.score > 2 && d.score < 2.3);
});
test('spent self source still obtains its pre-damage mark and the fixed draw', () => {
    const s = position([], { quota: {} }); get(s, 'self').used = true;
    const next = simulate(s, { kind: 'damage', user: 'self', card: null, targets: ['self'] })[0].state;
    assert.equal(get(next, 'self').mark, true);
    assert.equal(get(next, 'self').unknown, 1);
    assert.equal(get(next, 'self').hp, 2);
    const healed = simulate(next, { kind: 'remove', user: 'self', card: null, targets: ['self'] })[0].state;
    assert.equal(get(healed, 'self').hp, 3);
    assert.equal(get(healed, 'self').mark, false);
});
test('one HP does not borrow future recovery but marked-source pre-recovery is safe', () => {
    const s = position([], { quota: {} }); get(s, 'self').hp = 1;
    assert.equal(plan(s).firstAction.kind, 'stop');
    get(s, 'enemy').mark = true;
    const result = simulate(s, { kind: 'damage', user: 'enemy', targets: ['self'] })[0].state;
    assert.equal(get(result, 'self').alive, true);
    assert.equal(get(result, 'self').hp, 1);
    assert.equal(get(result, 'self').unknown, 1);
});
test('overflow is discarded at the end and armor does not suppress a damage reward', () => {
    const s = position(Array.from({ length: 6 }, () => card('shan')), { quota: { remove: true } });
    assert.equal(plan(s).firstAction.kind, 'stop');
    get(s, 'self').armor = 1;
    const result = simulate(s, { kind: 'damage', user: 'enemy', targets: ['self'] })[0].state;
    assert.equal(get(result, 'self').hp, 3);
    assert.equal(get(result, 'self').armor, 0);
    assert.equal(get(result, 'self').unknown, 2);
});
test('several borrowed peaches heal their actual user and leave the mark', () => {
    const hand = [card('tao'), card('tao'), card('tao'), card('shan'), card('shan'), card('shan')];
    const s = position(hand); Object.assign(get(s, 'ally'), { mark: true, hp: 1, maxHp: 4 });
    const d = plan(s);
    assert.equal(d.firstAction.kind, 'puppet'); assert.equal(d.firstAction.user, 'ally');
    assert.equal(d.continuation.filter(a => a.user === 'ally' && hand.find(c => c.id === a.card)?.name === 'tao').length, 1);
    const next = simulate(s, d.firstAction)[0].state;
    assert.equal(get(next, 'ally').hp, 2); assert.equal(get(next, 'self').hp, 3); assert.equal(get(next, 'ally').mark, true);
});
test('normal and puppet Sha have separate counts while all puppet users share one', () => {
    const c = card('sha'), s = position([c]); get(s, 'ally').mark = true; get(s, 'self').mark = true;
    s.quota.normalSha = 1;
    const d = plan(s);
    assert.ok(d.ranked.some(r => r.action.kind === 'puppet' && r.action.user === 'ally'));
    assert.ok(!d.ranked.some(r => r.action.kind === 'normal'));
    s.quota.normalSha = 0; s.quota.puppetSha = true;
    const other = plan(s);
    assert.ok(other.ranked.some(r => r.action.kind === 'normal'));
    assert.ok(!other.ranked.some(r => r.action.kind === 'puppet'));
});
test('borrowed sword followup consumes neither Sha count and closes the three-attack chain', () => {
    const borrowed = card('jiedao'), attacks = [card('sha'), card('sha'), card('sha')];
    const s = position([borrowed, ...attacks]);
    get(s, 'self').equips = [card('qinglong', { type: 'equip', subtype: 'equip1', range: 3 })];
    get(s, 'self').mark = true; get(s, 'ally').mark = true;
    const root = use(borrowed, 'ally', ['self', 'enemy']);
    const next = simulate(s, root)[0].state;
    assert.equal(next.quota.normalSha, 0); assert.equal(next.quota.puppetSha, false);
    assert.equal(next.hand.filter(c => c.name === 'sha').length, 2);
    const d = plan(s), r = d.ranked.find(r => JSON.stringify(r.action) === JSON.stringify(root));
    assert.ok(r);
    assert.equal(r.continuation.filter(a => attacks.some(c => c.id === a.card)).length, 2);
    assert.equal(new Set(r.continuation.filter(a => a.card).map(a => a.kind)).size, 2);
});
test('duel consumes the two actors own responses and rewards only the eventual marked source', () => {
    const c = card('juedou'), s = position([c, card('sha'), card('sha')]);
    Object.assign(get(s, 'ally'), { attitude: -1, mark: true });
    get(s, 'enemy').known = [card('sha')];
    const next = simulate(s, use(c, 'ally', ['enemy']))[0].state;
    assert.equal(get(next, 'ally').hp, 2); assert.equal(get(next, 'enemy').hp, 3);
    assert.equal(next.hand.filter(c => c.name === 'sha').length, 2);
    assert.equal(get(next, 'self').unknown, 0);
    get(s, 'enemy').mark = true;
    assert.equal(get(simulate(s, use(c, 'ally', ['enemy']))[0].state, 'self').unknown, 1);
});
test('equipment preparation opens a previously unreachable puppet attack without mutating input', () => {
    const weapon = card('qinglong', { type: 'equip', subtype: 'equip1', range: 3 }), sha = card('sha');
    const s = position([weapon, sha], { distances: { 'self:enemy': 5, 'ally:enemy': 3 } });
    get(s, 'ally').mark = true; get(s, 'enemy').hp = 1;
    const before = JSON.stringify(s), d = plan(s);
    assert.equal(d.firstAction.card, weapon.id); assert.equal(d.firstAction.user, 'ally');
    assert.equal(d.continuation[0].card, sha.id); assert.equal(d.continuation[0].user, 'ally');
    assert.equal(JSON.stringify(s), before);
});
test('enemy vine armor is a valid fire preparation and zero hand excludes fire attack', () => {
    const armor = card('tengjia', { type: 'equip', subtype: 'equip2' }), fire = card('sha', { nature: 'fire' });
    const s = position([armor, fire]); Object.assign(get(s, 'enemy'), { mark: true, hp: 2 });
    const d = plan(s);
    assert.equal(d.firstAction.card, armor.id); assert.equal(d.firstAction.user, 'enemy');
    assert.ok(d.continuation.some(a => a.card === fire.id && a.targets[0] === 'enemy'));
    const burn = card('huogong'); s.hand = [armor, burn];
    assert.ok(!plan(s).ranked.some(r => r.action.card === burn.id && r.action.targets[0] === 'enemy'));
});
test('fire attack payment belongs to the puppet and cannot use controller spare suits', () => {
    const burn = card('huogong'), s = position([burn, card('shan', { suit: 'heart' })]);
    get(s, 'ally').mark = true; get(s, 'enemy').known = [card('shan', { suit: 'heart' })];
    const result = simulate(s, use(burn, 'ally', ['enemy']));
    assert.equal(result.length, 1); assert.equal(get(result[0].state, 'enemy').hp, 3);
    get(s, 'ally').known = [card('shan', { suit: 'heart' })];
    const next = simulate(s, use(burn, 'ally', ['enemy']))[0].state;
    assert.equal(get(next, 'enemy').hp, 2); assert.equal(get(next, 'ally').known.length, 0); assert.equal(next.hand.length, 1);
});
test('all five wines survive the ordinary four-step budget and enable a lethal Sha', () => {
    const wine = Array.from({ length: 5 }, () => card('jiu')), sha = card('sha');
    const s = position([...wine, sha, card('tao', { rescueEnabled: true })]); get(s, 'self').mark = true; Object.assign(get(s, 'enemy'), { hp: 6, maxHp: 6 });
    const d = plan(s);
    assert.equal(s.hand.find(c => c.id === d.firstAction.card).name, 'jiu');
    assert.equal(d.continuation.filter(a => wine.some(c => c.id === a.card)).length, 4);
    assert.ok(d.continuation.some(a => a.card === sha.id));
    assert.equal(d.coverage.ordinaryNodes, 0); assert.ok(d.coverage.coreNodes > 0);
});
test('AOE order updates source mark and pays one reward, linked friendly fire is included', () => {
    const aoe = card('nanman'), s = position([aoe]); get(s, 'ally').mark = true;
    const firstSelf = simulate(s, use(aoe, 'ally', ['self', 'enemy']))[0].state;
    assert.equal(get(firstSelf, 'self').unknown, 0); assert.equal(get(firstSelf, 'ally').mark, false);
    const lastSelf = simulate(s, use(aoe, 'ally', ['enemy', 'self']));
    assert.ok(lastSelf.some(o => get(o.state, 'self').unknown === 1));
    lastSelf.forEach(o => { assert.equal(o.state.events.filter(e => e.type === 'blood').length, 1); assert.equal(get(o.state, 'enemy').mark, true); });
    const fire = card('sha', { nature: 'fire' }); s.hand = [fire]; get(s, 'enemy').linked = true; get(s, 'ally').linked = true;
    const next = simulate(s, use(fire, 'self', ['enemy'], 'normal'))[0].state;
    assert.equal(get(next, 'enemy').hp, 2); assert.equal(get(next, 'ally').hp, 2);
});
test('known defense is consumed so the second attack does not reuse the first dodge', () => {
    const a = card('sha'), b = card('sha'), s = position([a, b]); get(s, 'ally').mark = true; get(s, 'enemy').known = [card('shan')];
    const first = simulate(s, use(a, 'self', ['enemy'], 'normal'))[0].state;
    assert.equal(get(first, 'enemy').known.length, 0); assert.equal(get(first, 'enemy').hp, 3);
    assert.equal(get(simulate(first, use(b, 'ally', ['enemy']))[0].state, 'enemy').hp, 2);
});
test('nonstandard legal cards stay in root coverage', () => {
    const c = card('extension_public_draw', { draw: 2, groups: { self: [['self']], ally: [['ally']] } });
    const s = position([c]); get(s, 'ally').mark = true;
    const d = plan(s); assert.equal(d.coverage.roots, 2); assert.ok(d.ranked.some(r => r.action.card === c.id));
});
test('zero ordinary budget still closes mark creation with six peaches and equipment with five wines', () => {
    const peaches = Array.from({ length: 6 }, () => card('tao'));
    const s = position([...peaches, card('shan'), card('shan'), card('shan')], { quota: { remove: true } });
    Object.assign(get(s, 'ally'), { hp: 1, maxHp: 7 });
    const d = plan(s), root = d.ranked.find(r => r.action.kind === 'damage' && r.action.user === 'ally');
    assert.equal(root.continuation.filter(a => peaches.some(c => c.id === a.card)).length, 6);
    const weapon = card('qinglong', { type: 'equip', subtype: 'equip1', range: 3 }), wines = Array.from({ length: 5 }, () => card('jiu')), sha = card('sha');
    const equipped = position([weapon, ...wines, sha, card('tao')], { distances: { 'self:enemy': 5, 'ally:enemy': 3 } });
    get(equipped, 'ally').mark = true; Object.assign(get(equipped, 'enemy'), { hp: 6, maxHp: 6 });
    const prep = plan(equipped).ranked.find(r => r.action.card === weapon.id && r.action.user === 'ally');
    assert.equal(prep.continuation.filter(a => wines.some(c => c.id === a.card)).length, 5);
    assert.ok(prep.continuation.some(a => a.card === sha.id));
});
test('iron chain has a thunder Sha continuation at zero ordinary budget', () => {
    const chain = card('tiesuo'), thunder = card('sha', { nature: 'thunder' }), s = position([chain, thunder]);
    get(s, 'ally').attitude = -1; get(s, 'ally').hp = 1; get(s, 'enemy').hp = 1;
    const row = plan(s).ranked.find(r => r.action.card === chain.id && r.action.targets.includes('ally') && r.action.targets.includes('enemy'));
    assert.ok(row.continuation.some(a => a.card === thunder.id));
});
test('Qinggang bypass is local to Sha and does not disable armor for fire attack, duel or arrows', () => {
    const qinggang = card('qinggang', { type: 'equip', subtype: 'equip1' });
    const fire = card('huogong'), s = position([fire, card('shan')]);
    get(s, 'self').equips = [qinggang]; get(s, 'enemy').equips = [card('tengjia', { type: 'equip', subtype: 'equip2' })]; get(s, 'enemy').known = [card('shan')];
    assert.equal(get(simulate(s, use(fire, 'self', ['enemy'], 'normal'))[0].state, 'enemy').hp, 1);
    const arrows = card('wanjian'); s.hand = [arrows]; get(s, 'enemy').equips = [card('bagua', { type: 'equip', subtype: 'equip2' })]; get(s, 'enemy').known = [];
    const outcomes = simulate(s, use(arrows, 'self', ['enemy'], 'normal'));
    assert.equal(outcomes.length, 2); assert.equal(outcomes[0].probability, 0.5); assert.equal(get(outcomes[0].state, 'enemy').hp, 3);
    const duel = card('juedou', { baseDamage: 2 }); s.hand = [duel]; get(s, 'enemy').equips = [card('baiyin', { type: 'equip', subtype: 'equip2' })];
    assert.equal(get(simulate(s, use(duel, 'self', ['enemy'], 'normal'))[0].state, 'enemy').hp, 2);
});
test('Qinglong followups and Guanshi payments use the actual user materials', () => {
    const sha = card('sha'), spare = card('sha'), s = position([sha, spare]);
    get(s, 'ally').mark = true; get(s, 'ally').equips = [card('qinglong', { type: 'equip', subtype: 'equip1', range: 3 })]; get(s, 'enemy').known = [card('shan')]; get(s, 'enemy').hp = 1;
    const absent = simulate(s, use(sha, 'ally', ['enemy']))[0].state;
    assert.equal(get(absent, 'enemy').hp, 1); assert.equal(absent.hand.length, 1);
    get(s, 'ally').known = [card('sha')];
    const follows = simulate(s, use(sha, 'ally', ['enemy']))[0].state;
    assert.equal(get(follows, 'enemy').alive, false); assert.equal(get(follows, 'ally').known.length, 0); assert.equal(follows.hand.length, 1);
    get(s, 'ally').equips = [card('guanshi', { type: 'equip', subtype: 'equip1', range: 3 })]; get(s, 'ally').known = [];
    assert.equal(get(simulate(s, use(sha, 'ally', ['enemy']))[0].state, 'enemy').alive, true);
    get(s, 'ally').known = [card('shan'), card('shan')];
    const paid = simulate(s, use(sha, 'ally', ['enemy']))[0].state;
    assert.equal(get(paid, 'enemy').alive, false); assert.equal(get(paid, 'ally').known.length, 0); assert.equal(paid.hand.length, 1);
});
test('Zhuque ordinary Sha can ignite vine armor and linked targets', () => {
    const sha = card('sha'), s = position([sha]);
    get(s, 'self').equips = [card('zhuque', { type: 'equip', subtype: 'equip1', range: 4 })]; get(s, 'enemy').equips = [card('tengjia', { type: 'equip', subtype: 'equip2' })]; get(s, 'enemy').linked = true;
    Object.assign(get(s, 'ally'), { attitude: -1, linked: true });
    const next = simulate(s, use(sha, 'self', ['enemy'], 'normal'))[0].state;
    assert.equal(get(next, 'enemy').hp, 1); assert.equal(get(next, 'ally').hp, 1);
});
test('unknown self-save or friendly Peach resources retain both survival and death outcomes', () => {
    const sha = card('sha'), s = position([sha]); get(s, 'enemy').hp = 1;
    const empty = simulate(s, use(sha, 'self', ['enemy'], 'normal'));
    assert.ok(empty.every(o => !get(o.state, 'enemy').alive));
    get(s, 'enemy').unknown = 1;
    const possible = simulate(s, use(sha, 'self', ['enemy'], 'normal'));
    assert.ok(possible.some(o => get(o.state, 'enemy').alive)); assert.ok(possible.some(o => !get(o.state, 'enemy').alive));
    assert.ok(Math.abs(possible.reduce((n, o) => n + o.probability, 0) - 1) < 1e-9);
    get(s, 'enemy').unknown = 0; get(s, 'ally').attitude = -1; get(s, 'ally').unknown = 2;
    assert.ok(simulate(s, use(sha, 'self', ['enemy'], 'normal')).some(o => get(o.state, 'enemy').alive));
});
test('unknown counterspell produces cancellation without borrowing hidden card identities', () => {
    const draw = card('wuzhong'), s = position([draw]); get(s, 'enemy').unknown = 2;
    const outcomes = simulate(s, use(draw, 'self', ['self'], 'normal'));
    assert.ok(outcomes.some(o => get(o.state, 'self').unknown === 2));
    assert.ok(outcomes.some(o => get(o.state, 'self').unknown === 0 && get(o.state, 'enemy').unknown === 1));
    assert.ok(Math.abs(outcomes.reduce((n, o) => n + o.probability, 0) - 1) < 1e-9);
});
test('counterspells cancel individual area targets without undoing earlier targets', () => {
    const arrows = card('wanjian'), s = position([arrows]); get(s, 'enemy').known = [card('wuxie')];
    get(s, 'ally').attitude = -1;
    const outcomes = simulate(s, use(arrows, 'self', ['ally', 'enemy'], 'normal'));
    assert.ok(outcomes.some(o => get(o.state, 'ally').hp === 2 && get(o.state, 'enemy').hp === 3));
    assert.ok(outcomes.some(o => get(o.state, 'ally').hp === 3 && get(o.state, 'enemy').hp === 2));
    assert.ok(Math.abs(outcomes.reduce((n, o) => n + o.probability, 0) - 1) < 1e-9);
});
test('Hanbing cancels damage, blood rewards and chains and works with one discardable card', () => {
    const sha = card('sha', { nature: 'fire' }), s = position([sha]);
    get(s, 'ally').mark = true; get(s, 'ally').equips = [card('hanbing', { type: 'equip', subtype: 'equip1', range: 2 })];
    Object.assign(get(s, 'enemy'), { hp: 1, attitude: 1, linked: true, known: [card('sha'), card('sha')] }); get(s, 'self').linked = true;
    const canceled = simulate(s, use(sha, 'ally', ['enemy']))[0].state;
    assert.equal(get(canceled, 'enemy').hp, 1); assert.equal(get(canceled, 'self').hp, 3);
    assert.equal(get(canceled, 'enemy').known.length, 0); assert.equal(get(canceled, 'enemy').mark, false); assert.equal(get(canceled, 'ally').used, false);
    assert.ok(canceled.events.some(e => e.type === 'hanbing')); assert.ok(!canceled.events.some(e => ['damage', 'blood'].includes(e.type)));
    get(s, 'enemy').known = [card('sha')];
    assert.equal(get(simulate(s, use(sha, 'ally', ['enemy']))[0].state, 'enemy').hp, 1);
    get(s, 'enemy').known = []; get(s, 'enemy').hp = 3; get(s, 'enemy').attitude = -1; get(s, 'enemy').linked = false;
    assert.equal(get(simulate(s, use(sha, 'ally', ['enemy']))[0].state, 'enemy').hp, 2);
});

test('certain public lord death cannot be paid for by multiple enemy chain deaths', () => {
    const sha = card('sha', { nature: 'fire' }), s = position([sha], { players: [person('self', 1, { hp: 1, drunk: 1, linked: true }), person('enemy1', -1, { hp: 1, linked: true }), person('enemy2', -1, { hp: 1, linked: true }), person('survivor', -1)], ending: { kind: 'identity', leader: 'self', role: 'zhu', roles: { self: 'zhu', enemy1: 'fan', enemy2: 'fan', survivor: 'fan' } } });
    const roots = [use(sha, 'self', ['enemy1'], 'normal')]; s.roots = roots;
    assert.equal(plan(s, { budget: 0 }).firstAction.kind, 'stop');
    const outcomes = simulate(s, roots[0]);
    assert.ok(outcomes.every(o => o.state.ended && o.state.terminal === -1));
    assert.ok(outcomes.every(o => get(o.state, 'enemy2').alive));
    delete s.ending;
    assert.equal(plan(s, { budget: 0 }).firstAction.kind, 'stop', 'v2 preserves self even without a known public terminal');
});
test('public victory stops the chain before later linked self damage and blood rewards', () => {
    const sha = card('sha', { nature: 'fire' }), s = position([sha], { players: [person('self', 1, { hp: 1, linked: true, mark: true }), person('enemy', -1, { hp: 1, linked: true })], ending: { kind: 'identity', leader: 'self', role: 'zhu', roles: { self: 'zhu', enemy: 'fan' } } });
    s.roots = [use(sha, 'self', ['enemy'], 'normal')];
    const won = simulate(s, s.roots[0])[0].state;
    assert.equal(won.terminal, 1); assert.equal(get(won, 'self').hp, 1); assert.equal(get(won, 'self').used, false); assert.equal(get(won, 'self').unknown, 0);
    assert.equal(plan(s, { budget: 0 }).firstAction.kind, 'normal');
    s.ending = { kind: 'two', side: true, sides: { self: true, enemy: false } };
    assert.equal(simulate(s, s.roots[0])[0].state.terminal, 1);
    s.players.push(person('survivor', -1)); s.ending.sides.survivor = false; get(s, 'self').mark = false;
    assert.equal(simulate(s, s.roots[0])[0].state.terminal, -1);
    assert.equal(plan(s, { budget: 0 }).firstAction.kind, 'stop');
});
test('unshown identity prevents claiming that the last publicly known rebel was the last opponent', () => {
    const sha = card('sha', { nature: 'fire' }), s = position([sha], { ending: { kind: 'identity', leader: 'self', role: 'zhu', roles: { self: 'zhu', enemy: 'fan' } } });
    get(s, 'enemy').hp = 1;
    assert.equal(simulate(s, use(sha, 'self', ['enemy'], 'normal'))[0].state.ended, undefined);
});
test('public terminal follows captured chain seat order rather than array order', () => {
    const sha = card('sha', { nature: 'fire' }), s = position([sha], { players: [person('self', 1, { hp: 1, linked: true }), person('enemy', -1, { hp: 1, linked: true }), person('last', -1, { hp: 1, linked: true })], chainOrder: ['last', 'self', 'enemy'], ending: { kind: 'identity', leader: 'self', role: 'zhu', roles: { self: 'zhu', enemy: 'fan', last: 'fan' } } });
    const won = simulate(s, use(sha, 'self', ['enemy'], 'normal'))[0].state;
    assert.equal(won.terminal, 1); assert.equal(get(won, 'self').hp, 1);
    s.chainOrder = ['self', 'last', 'enemy'];
    assert.equal(simulate(s, use(sha, 'self', ['enemy'], 'normal'))[0].state.terminal, -1);
});


test('v2 keeps reliable timely self-rescue in both random branches of the same root', () => {
    const steal = card('guohe'), peach = card('tao'), sha = card('sha');
    const s = position([steal, peach, sha], { players: [person('self', 1, { hp: 1 }), person('enemy', -1, { hp: 1, known: [card('shan'), card('wuxie')] })], ending: { kind: 'identity', leader: 'self', role: 'zhu', roles: { self: 'zhu', enemy: 'fan' } } });
    s.roots = [use(steal, 'self', ['enemy'], 'normal')];
    const d = plan(s, { budget: 4096 });
    assert.equal(d.firstAction.card, steal.id);
    assert.equal(d.branches.length, 2);
    assert.ok(d.branches.every(b => b.continuation[0].card === peach.id), 'retain the self rescue alternative even where attacking immediately can win');
    assert.equal(d.evidence.selfRescue, 2);
});
test('v2 last self-save peach is not lent but remains usable on oneself', () => {
    const peach = card('tao'), s = position([peach]); Object.assign(get(s, 'ally'), { hp: 1, mark: true });
    assert.equal(plan(s).firstAction.kind, 'stop');
    get(s, 'self').hp = 1;
    const d = plan(s); assert.equal(d.firstAction.kind, 'normal'); assert.equal(d.firstAction.card, peach.id);
});
test('v2 surplus peaches are repeatedly allocated across marked allies', () => {
    const peaches = [card('tao'), card('tao'), card('tao')], s = position(peaches, { players: [person('self', 1), person('a', 1, { hp: 1, mark: true }), person('b', 1, { hp: 1, mark: true }), person('enemy', -1)] });
    const d = plan(s), actions = [d.firstAction, ...d.continuation].filter(a => peaches.some(c => c.id === a.card));
    assert.equal(actions.length, 2); assert.deepEqual(new Set(actions.map(a => a.user)), new Set(['a', 'b']));
});
test('v2 spare armor improves a marked ally while the owner keeps the useful armor', () => {
    const spare = card('bagua', { type: 'equip', subtype: 'equip2' }), s = position([spare]);
    get(s, 'self').equips = [card('baiyin', { type: 'equip', subtype: 'equip2' })]; get(s, 'ally').mark = true;
    const d = plan(s); assert.equal(d.firstAction.user, 'ally'); assert.equal(d.firstAction.card, spare.id);
});
test('v2 borrowed spent-source kill and non-damage theft precede nonurgent mark removal', () => {
    const sha = card('sha'), s = position([sha], { quota: { damage: true }, distances: { 'self:enemy': 5 } });
    Object.assign(get(s, 'ally'), { mark: true, used: true, hp: 2 }); get(s, 'enemy').hp = 1;
    let d = plan(s); assert.equal(d.firstAction.card, sha.id); assert.equal(d.firstAction.user, 'ally');
    assert.ok(d.continuation.some(a => a.kind === 'remove' && a.targets[0] === 'ally'));
    const steal = card('shunshou'); s.hand = [steal]; get(s, 'enemy').hp = 3; get(s, 'enemy').equips = [card('qinglong', { type: 'equip', subtype: 'equip1', range: 3 })];
    d = plan(s); assert.equal(d.firstAction.card, steal.id); assert.equal(d.firstAction.user, 'ally');
    assert.ok(d.continuation.some(a => a.kind === 'remove' && a.targets[0] === 'ally'));
});
test('v2 zero ordinary budget retains normal plus puppet two-attack closure', () => {
    const s = position([card('sha'), card('sha')]); get(s, 'ally').mark = true; get(s, 'enemy').hp = 2;
    const d = plan(s), strikes = [d.firstAction, ...d.continuation].filter(a => s.hand.some(c => c.id === a.card));
    assert.equal(strikes.length, 2); assert.deepEqual(new Set(strikes.map(a => a.kind)), new Set(['normal', 'puppet']));
});
test('v2 keeps one legal wine reserve while all five remain an enumerated offensive route with an alternative peach', () => {
    const wines = Array.from({ length: 5 }, () => card('jiu')), sha = card('sha');
    const s = position([...wines, sha], { distances: { 'self:enemy': 5 } }); get(s, 'ally').mark = true; Object.assign(get(s, 'enemy'), { hp: 6, maxHp: 6 });
    const d = plan(s), spent = [d.firstAction, ...d.continuation].filter(a => wines.some(c => c.id === a.card));
    assert.ok(spent.length < 5);
    s.hand.push(card('tao')); const all = plan(s); assert.equal([all.firstAction, ...all.continuation].filter(a => wines.some(c => c.id === a.card)).length, 5);
});

for (const axe of [false, true]) test('review partial ally rescue survives an unreachable emergency companion with axe=' + axe, () => {
        const peaches = [card('tao'), card('tao')], sha = card('sha');
        const s = position([...peaches, sha], { players: [person('self', 1), person('ally', 1, { hp: 1, mark: true }), person('unreachable', 1, { hp: 1 }), person('enemy', -1, { hp: 1, known: axe ? [card('shan')] : [] }), person('otherEnemy', -1)] });
        if (axe) get(s, 'self').equips = [card('guanshi', { type: 'equip', subtype: 'equip1', range: 3 })];
        const d = plan(s);
        console.log('REVIEW partial rescue', axe, JSON.stringify(d.firstAction), JSON.stringify(d.evidence));
        assert.ok(peaches.some(c => c.id === d.firstAction.card), 'save reachable A before a nonterminal attack despite unreachable B');
        assert.equal(d.firstAction.user, 'ally');
        assert.equal(simulate(s, d.firstAction)[0].state.hand.filter(c => c.name === 'tao').length, 1);
});
test('review nonsavable wine is offensive material while a legal peach remains', () => {
    const peach = card('tao', { rescueEnabled: true }), wine = card('jiu', { rescueEnabled: false }), sha = card('sha');
    const s = position([peach, wine, sha]); get(s, 'ally').mark = true; get(s, 'enemy').hp = 2;
    const d = plan(s), r = d.ranked.find(r => r.action.card === wine.id && r.action.user === 'ally');
    console.log('REVIEW nonsavable wine', JSON.stringify(r));
    assert.equal(r.evidence.reserveSafe, true);
    assert.equal(d.firstAction.card, wine.id);
});
test('review axe preserves the last legal rescue and keeps a legal unpaid attack', () => {
    const peach = card('tao', { rescueEnabled: true }), sha = card('sha'), spare = card('wuxie');
    const s = position([peach, sha, spare], { players: [person('self', 1, { equips: [card('guanshi', { type: 'equip', subtype: 'equip1', range: 3 })] }), person('enemy', -1, { hp: 1, known: [card('shan')] }), person('otherEnemy', -1)] });
    const a = use(sha, 'self', ['enemy'], 'normal'), next = simulate(s, a)[0].state;
    console.log('REVIEW axe', next.hand.map(c => c.name), get(next, 'enemy').alive, JSON.stringify(plan(s).ranked.find(r => r.action.card === sha.id)));
    assert.ok(next.hand.some(c => c.id === peach.id), 'decline optional axe payment that spends the last self-save');
    assert.equal(get(next, 'enemy').alive, true);
    assert.ok(plan(s).ranked.some(r => r.action.card === sha.id));
});
test('review owner offensive wine spends its last reserve but actual self healing is allowed', () => {
    const wine = card('jiu', { rescueEnabled: true }), sha = card('sha');
    const s = position([wine, sha]); get(s, 'enemy').hp = 2;
    const r = plan(s).ranked.find(r => r.action.card === wine.id && r.action.user === 'self');
    assert.equal(r.evidence.reserveSafe, false);
    const peach = card('tao', { rescueEnabled: true }), injured = position([peach]); get(injured, 'self').hp = 1;
    assert.equal(plan(injured).firstAction.card, peach.id);
    assert.equal(plan(injured).evidence.reserveSafe, true);
});
test('review axe compares safe spare payments and public victory over reserve preservation', () => {
    const peach = card('tao', { rescueEnabled: true }), sha = card('sha'), spare = card('wuxie');
    const s = position([peach, sha, spare], { players: [person('self', 1, { equips: [card('guanshi', { type: 'equip', subtype: 'equip1', range: 3 })] }), person('enemy', -1, { hp: 1, known: [card('shan')] })], ending: { kind: 'two', side: true, sides: { self: true, enemy: false } } });
    const d = plan(s);
    assert.equal(d.firstAction.card, sha.id);
    assert.equal(d.evidence.reserveSafe, false);
    const next = simulate(s, d.firstAction)[0].state;
    assert.equal(next.terminal, 1); assert.equal(next.reserveUnsafe, true);
    assert.equal(next.hand.length, 0);
    delete s.ending; s.hand.push(card('shan'));
    const safe = simulate(s, use(sha, 'self', ['enemy'], 'normal'))[0].state;
    assert.equal(get(safe, 'enemy').alive, false);
    assert.equal(safe.hand[0].id, peach.id);
    assert.equal(safe.reserveUnsafe, false);
});
test('review reserve expenditure persists across state copies and actual self rescue uses legal material', () => {
    const peach = card('tao', { rescueEnabled: true });
    const s = position([peach]); Object.assign(get(s, 'ally'), { hp: 1, mark: true });
    const lent = simulate(s, use(peach, 'ally', ['ally']))[0].state;
    assert.equal(lent.reserveUnsafe, true);
    assert.equal(simulate(lent, { kind: 'stop', user: 'self', targets: [] })[0].state.reserveUnsafe, true);
    assert.equal(plan(lent).evidence.reserveSafe, false);
    const wine = card('jiu', { rescueEnabled: true }), dying = position([wine], { quota: {} });
    get(dying, 'self').hp = 1;
    const saved = simulate(dying, { kind: 'damage', user: 'enemy', targets: ['self'] })[0].state;
    assert.equal(get(saved, 'self').alive, true); assert.equal(saved.reserveUnsafe, false);
    wine.rescueEnabled = false;
    const dead = simulate(dying, { kind: 'damage', user: 'enemy', targets: ['self'] })[0].state;
    assert.equal(get(dead, 'self').alive, false);
});
test('future stochastic work refusal keeps every immediate branch and stops before the refused action', () => {
    const draw = card('wuzhong'), area = card('nanman'), peach = card('tao');
    const s = position([draw, area, peach], { quota: { damage: true, remove: true }, players: [person('self', 1), person('ally', 1, { hp: 1 }), ...Array.from({ length: 6 }, (_, i) => person('enemy' + i, -1, { unknown: 4 }))] });
    s.roots = [use(draw, 'self', ['self'], 'normal')];
    const before = clean(s), immediate = simulate(s, s.roots[0]);
    const d = plan(s, { budget: 512 }), root = d.ranked[0];
    assert.ok(d.coverage.refusedTransitions > 0);
    assert.equal(d.coverage.rootsComplete, true);
    assert.equal(root.branches.length, immediate.length);
    assert.ok(Math.abs(root.branches.reduce((sum, b) => sum + b.probability, 0) - 1) < 1e-10);
    assert.ok(root.branches.every(b => b.continuation.length === 0 && b.terminal === 0));
    assert.equal(root.terminal, 0);
    assert.equal(root.evidence.selfAlive, true);
    assert.equal(root.evidence.reserveSafe, true);
    assert.ok(immediate.every(o => o.state.hand.some(c => c.id === peach.id)));
    assert.deepEqual(s, before);
});
test('a future work refusal cannot erase a current last-rescue expenditure', () => {
    const peach = card('tao'), area = card('nanman'), draw = card('wuzhong');
    const s = position([area, peach, draw], { quota: { damage: true, remove: true }, players: [person('self', 1), person('ally', 1, { hp: 1 }), ...Array.from({ length: 6 }, (_, i) => person('enemy' + i, -1, { unknown: 3 }))] });
    s.roots = [use(area, 'self', s.players.slice(1).map(p => p.id), 'normal')];
    const d = plan(s, { budget: 0 }), root = d.ranked[0];
    assert.equal(root.evidence.reserveSafe, false);
    assert.equal(root.terminal, 0);
    assert.ok(Math.abs(root.branches.reduce((sum, b) => sum + b.probability, 0) - 1) < 1e-10);
    assert.equal(d.coverage.roots, 1);
});
test('bounded planning still selects a profitable current eight-seat area attack', () => {
    const area = card('nanman');
    const s = position([area], { quota: { damage: true, remove: true }, players: [person('self', 1), ...Array.from({ length: 7 }, (_, i) => person('enemy' + i, -1, { hp: 1 }))] });
    const d = plan(s, {});
    assert.equal(d.firstAction.card, area.id);
    assert.equal(d.firstAction.kind, 'normal');
    assert.equal(d.firstAction.targets.length, 7);
    assert.ok(d.score > 100);
    assert.equal(d.evidence.selfAlive, true);
    assert.equal(d.coverage.rootsComplete, true);
});
test('rare current death outcomes cannot become reliable safety after future truncation', () => {
    const attack = card('sha', { nature: 'fire' });
    const s = position([attack], { quota: { damage: true, remove: true }, players: [person('self', 1, { hp: 1, linked: true, unknown: 100 }), person('enemy', -1, { hp: 3, linked: true })] });
    s.roots = [use(attack, 'self', ['enemy'], 'normal')];
    const d = plan(s, { budget: 0 }), root = d.ranked[0];
    assert.equal(root.evidence.selfAlive, false);
    assert.equal(root.evidence.ownDanger, true);
    assert.ok(root.branches.some(b => b.probability > 0 && b.probability < 0.01 && !b.evidence.selfAlive));
    assert.ok(Math.abs(root.branches.reduce((sum, b) => sum + b.probability, 0) - 1) < 1e-10);
    assert.equal(d.firstAction.kind, 'stop');
});
let passed = 0;
for (const { name, run } of cases) {
    try { run(); passed++; console.log('PASS ' + name); }
    catch (error) { console.error('FAIL ' + name + '\n' + error.stack); }
}
console.log(passed + '/' + cases.length + ' decision tests passed');
if (passed !== cases.length) process.exitCode = 1;
if (process.argv.includes('--profile')) {
    const sample = position([card('sha', { nature: 'fire' }), card('sha'), card('jiu'), card('tao'), card('tiesuo'), card('guohe'), card('qinglong', { type: 'equip', subtype: 'equip1', range: 3 })], {
        owner: 'p0', players: Array.from({ length: 8 }, (_, i) => person('p' + i, i < 3 ? 1 : -1, { maxHp: 4, mark: i < 3, unknown: i ? 3 : 0 })), quota: {},
    });
    const begin = process.hrtime.bigint(), result = plan(sample, { budget: 4096 });
    const report = { scope: 'One uncached pure visible-state plan, 8 players, 3 marks, 7 held cards including equipment and multi-target trick; no full-game latency or speedup claim.', elapsedMs: Number(process.hrtime.bigint() - begin) / 1e6, coverage: result.coverage, firstAction: result.firstAction, score: result.score, node: process.version, errors: 0, aiModuleSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../nihilphile武将包/module/jie_luofei_ai.js'))).digest('hex') };
    assert.ok(result.coverage.ordinaryWork <= 4096); assert.ok(result.coverage.roots > 100); assert.ok(Number.isFinite(result.score));
    const directory = path.join(__dirname, '../artifacts/jieluofei-ai-v1'); fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'performance.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
}
