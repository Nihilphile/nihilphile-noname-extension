const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const fixtureFile = path.join(__dirname, 'jie_luofei_behavior_test.js');
const fixtureContext = vm.createContext({ require: createRequire(fixtureFile), __dirname, console, process, Buffer, setTimeout });
const source = fs.readFileSync(fixtureFile, 'utf8');
vm.runInContext(source.slice(0, source.lastIndexOf('(async () => {')) + '\nglobalThis.harness = { fixture, firstSelection, nativeShicheng, nativeMethod, read, eventSource, getSource, librarySource };', fixtureContext);
const harness = fixtureContext.harness;
const clean = value => JSON.parse(JSON.stringify(value));
const cases = [];
const test = (name, run) => cases.push({ name, run });

function fixture() {
    const f = harness.fixture();
    for (const p of f.game.players) {
        p.hp = p.maxHp = 3;
        p.stat.at(-1).card.sha = 0;
        p.countCards = zone => p.zones[zone].length;
        p.countUsed = c => p.getStat('card')[typeof c === 'string' ? c : c.name] || 0;
        p.getKnownCards = viewer => { assert.equal(viewer, f.owner); return p.zones.h.filter(c => c.shown); };
    }
    f.get.attitude = (a, b) => b === f.loser ? 3 : b === f.third ? -3 : 3;
    f.get.subtype = c => f.lib.card[c.name]?.subtype;
    f.get.card = () => f.state.active._get_card || f.ui.selected.cards[0];
    f.get.suit = c => c.suit;
    f.game.hasPlayer2 = f.game.hasPlayer;
    f.game.hasNature = c => !!c.nature;
    f.lib.filter.filterEnable = vm.runInContext(harness.nativeMethod(harness.librarySource, 'filterEnable: function', 4), f.context).filterEnable;
    f.lib.filter.cardUsable = vm.runInContext(harness.nativeMethod(harness.librarySource, 'cardUsable(card, player, event)', 4), f.context).cardUsable;
    f.lib.filter.cardDiscardable = () => true;
    const nativeBasic = harness.read('noname/ai/basic.js').replace(/^import .*;\r?\n/gm, '').replace(/export\s*\{[\s\S]*?\};?\s*$/, 'globalThis.nativeBasic = new Basic();');
    vm.runInContext(nativeBasic, f.context);
    f.context.ai.basic = f.context.nativeBasic;
    f.get.selectableCards = () => f.owner.getCards('h').filter(c => c.classList.contains('selectable') && !f.ui.selected.cards.includes(c));
    f.get.skills = () => [];
    f.get.selectableButtons = () => f.state.active.dialog.buttons.filter(b => b.classList.contains('selectable') && !f.ui.selected.buttons.includes(b));
    f.owner.isUnderControl = () => false;
    f.context.CacheContext.requireCacheContext = () => ({ get: { order: item => f.get.order(item) } });
    f.get.order = vm.runInContext(harness.nativeMethod(harness.getSource, 'order(item, player = get.player() || game.me)', 2), f.context).order;
    f.get.cacheOrder = vm.runInContext(harness.nativeMethod(harness.getSource, 'cacheOrder(item)', 2), f.context).cacheOrder;
    const previousMod = f.game.checkMod;
    f.game.checkMod = (...args) => args[args.length - 2] === 'aiOrder' ? f.lib.skill.nihil_jie_yulei.mod.aiOrder(args[0], args[1], args[2]) ?? args[2] : previousMod(...args);
    f.planner = f.lib.skill.nihil_jie_yulei.aiPlanner;
    f.open = () => { f.state.active = f.phase; const event = f.chooseEvent(); f.state.active = event; event.isOnline = () => false; return event; };
    return f;
}

test('native Basic.chooseCard and GameEvent.backup select the planned puppet material and actual user', () => {
    const f = fixture(); f.mark(f.loser); f.owner.disabled = true; f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    const attack = f.card('sha'), defense = f.card('shan'); f.move(attack, 'h', f.owner); f.move(defense, 'h', f.owner);
    const event = harness.firstSelection(f);
    assert.equal(f.context.ai.basic.chooseCard(f.lib.skill.nihil_jie_yulei_active.check), true);
    assert.equal(f.ui.selected.cards[0], attack);
    assert.equal(f.context.ai.basic.chooseTarget(event.ai2), true);
    assert.equal(f.ui.selected.targets[0], f.loser);
    assert.equal(f.phase.nihilPuppetShaUsed, undefined);
    assert.equal(f.owner.getCards('h').length, 2);
});
test('native chooseTarget executes a complete borrowed sword target sequence with rebuilt callback', async () => {
    const f = fixture(); f.mark(f.loser); f.mark(f.owner); f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    const weapon = f.card('qinglong'), sword = f.card('jiedao'), attack = f.card('sha');
    f.move(weapon, 'e', f.owner); f.move(sword, 'h', f.owner); f.move(attack, 'h', f.owner);
    f.phase.nihilPuppetShaUsed = true; f.owner.getStat('card').sha = 1;
    f.owner.getEquips = slot => f.owner.zones.e.filter(c => !slot || f.lib.card[c.name].subtype === 'equip' + slot);
    f.loser.getEquips = () => []; f.third.getEquips = () => [];
    f.state.autoTargets = true;
    f.state.onTargetRequest = event => { event.ai = vm.runInContext('(' + event.ai.toString() + ')', f.context); };
    await f.active(sword, f.loser);
    assert.equal(f.state.uses.length, 1);
    assert.equal(f.state.uses[0].player.playerid, f.loser.playerid);
    assert.equal(f.state.uses[0].targets[0].playerid, f.owner.playerid);
    assert.equal(f.state.uses[0].addedTarget.playerid, f.third.playerid);
    assert.equal(f.phase.nihilPuppetShaUsed, true);
});
test('native chooseButton.check and rebuilt backup ai2 choose positive damage and correct source', async () => {
    const f = fixture(), api = harness.nativeShicheng(f);
    const event = f.open();
    const button = { name: 'chooseButton', player: f.owner, parent: event, getParent: event.getParent, selectButton: 1, dialog: { buttons: [{ link: ['damage', true], classList: { contains: () => true, add() {} } }, { link: ['remove', false], classList: { contains: () => false, add() {} } }] } };
    f.state.active = button;
    const originalCheck = f.game.check; f.game.check = () => true;
    assert.equal(f.context.ai.basic.chooseButton(f.lib.skill.nihil_jie_shicheng.chooseButton.check), true);
    assert.equal(f.ui.selected.buttons[0].link[0], 'damage'); f.ui.selected.buttons = []; f.game.check = originalCheck;
    f.state.active = f.phase;
    const selected = (await api.choose('damage')).event;
    selected.ai2 = vm.runInContext('(' + selected.ai2.toString() + ')', f.context);
    assert.equal(f.context.ai.basic.chooseTarget(selected.ai2), true);
    assert.notEqual(f.ui.selected.targets[0], f.owner);
    assert.equal(f.phase.nihilJieShichengUsed, undefined);
});
test('ordinary native order and target scoring share the same complete plan', () => {
    const f = fixture(); f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    const attack = f.card('sha'); f.move(attack, 'h', f.owner);
    const event = f.open();
    assert.equal(f.get.order(attack, f.owner), 100);
    f.ui.selected.cards = [attack];
    assert.ok(event.ai2(f.third) > 0); assert.ok(event.ai2(f.loser) < 0);
});
test('hidden cards cannot affect snapshot or score, including borrowed duel and fire attack', () => {
    const f = fixture(); f.phase.nihilJieShichengUsed = ['damage', 'remove']; f.mark(f.loser);
    const duel = f.card('juedou'), fire = f.card('huogong'); f.move(duel, 'h', f.owner); f.move(fire, 'h', f.owner);
    const hidden = f.card('sha'); f.move(hidden, 'h', f.third);
    f.open();
    const before = f.planner.inspect(f.owner, { cache: false }); hidden.name = 'tao'; hidden.suit = 'club';
    const after = f.planner.inspect(f.owner, { cache: false });
    assert.deepEqual(clean(after), clean(before));
    for (const p of [f.loser, f.third]) {
        const original = p.getCards; p.getCards = function (zone, ...rest) { assert.ok(!zone.includes('h'), 'capture must not request another private hand'); return original.call(this, zone, ...rest); };
    }
    assert.doesNotThrow(() => f.planner.inspect(f.owner));
});
test('repeated cached and uncached queries preserve real resources, selections and field existence', () => {
    const f = fixture(); f.mark(f.loser); const attack = f.card('sha'); f.move(attack, 'h', f.owner); f.open();
    const event = f.state.active, selected = f.ui.selected.targets, cards = f.ui.selected.cards;
    const state = () => JSON.stringify({ people: f.game.players.map(p => ({ hp: p.hp, marks: p.marks, stat: p.stat, storage: p.storage, hand: p.zones.h.map(c => c.cardid), custom: p.getHistory('custom') })), phase: [f.phase.nihilJieShichengUsed, f.phase.nihilPuppetShaUsed], turn: f.actualTurn.nihilJieXueyinUsedSources, eventKeys: Object.keys(event).sort() });
    const before = state(), first = f.planner.inspect(f.owner);
    for (let i = 0; i < 3; i++) assert.deepEqual(clean(f.planner.inspect(f.owner)), clean(first));
    assert.deepEqual(clean(f.planner.inspect(f.owner, { cache: false })), clean(first));
    assert.equal(state(), before); assert.equal(f.ui.selected.targets, selected); assert.equal(f.ui.selected.cards, cards);
    assert.equal(Object.hasOwn(event, '_get_card'), false); assert.equal(Object.hasOwn(event, 'addCount_extra'), false);
});
test('other skill backup, response, human control and restored human choice fall back natively', () => {
    const f = fixture(); const attack = f.card('sha'); f.move(attack, 'h', f.owner);
    f.state.active = f.phase; const event = f.chooseEvent();
    const other = f.action('chooseToUse', async () => {}, { player: f.owner, type: 'phase', ai2: () => 37, parent: f.phase });
    f.state.active = other; f.planner.decorateChoice(other); const wrapper = other.ai2;
    other.skill = 'unrelated_backup'; assert.equal(wrapper(f.third), 37); assert.equal(f.planner.score('order', f.owner, { card: attack }), undefined);
    delete other.skill; other.type = 'respond'; assert.equal(wrapper(f.third), 37);
    other.type = 'phase'; other.isMine = () => true; assert.equal(wrapper(f.third), 37);
    other.isMine = () => false; assert.notEqual(wrapper(f.third), 37);
    other.isMine = () => true; assert.equal(wrapper(f.third), 37);
    assert.equal(f.ui.selected.cards.length, 0); assert.equal(f.ui.selected.targets.length, 0); assert.equal(event.result, undefined);
});
test('native chooseToUse AI branch chooses an ordinary card and its planned target', async () => {
    const f = fixture(); f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    const sha = f.card('sha'); f.move(sha, 'h', f.owner); const event = f.open();
    Object.assign(event, { result: 'ai', filterCard: c => c === sha, selectCard: 1, position: 'h', filterTarget: (c, p, t) => p !== t, selectTarget: 1, ai1: f.get.cacheOrder, custom: { add: {}, replace: {} }, _aiexclude: [] });
    await f.content.chooseToUse[1](event, null, f.owner);
    assert.equal(event.result.bool, true); assert.equal(event.result.targets[0].playerid, f.third.playerid);
    assert.equal(f.ui.selected.cards[0].cardid, sha.cardid);
});
test('terminal capture uses public lord and two-player sides without reading concealed identities', () => {
    const f = fixture(); f.open(); f.get.mode = () => 'identity'; f.game.zhu = f.owner; f.owner.identity = 'zhu';
    Object.defineProperty(f.loser, 'identity', { get() { throw new Error('concealed identity was read'); } });
    Object.defineProperty(f.third, 'identity', { get() { throw new Error('concealed identity was read'); } });
    const identity = clean(f.planner.inspect(f.owner, { cache: false }).snapshot.ending);
    assert.deepEqual(identity.roles, { [f.owner.playerid]: 'zhu' });
    f.get.mode = () => 'versus'; f.context._status.mode = 'two'; f.owner.side = true; f.loser.side = true; f.third.side = false;
    const teams = clean(f.planner.inspect(f.owner).snapshot.ending);
    assert.equal(teams.kind, 'two'); assert.equal(teams.sides[f.third.playerid], false);
    f.context._status.replacetwo = true;
    assert.equal(f.planner.inspect(f.owner).snapshot.ending, undefined);
});

test('native canceled AI target selection excludes only that complete combination until visible state changes', async () => {
    const f = fixture(); f.mark(f.loser); f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    const sha = f.card('sha'); f.move(sha, 'h', f.owner); f.open();
    const before = f.planner.inspect(f.owner, { cache: false });
    const tried = clean(before.decision.ranked.find(r => r.action.kind === 'puppet' && r.action.user === f.loser.playerid).action);
    f.state.autoTargets = true; f.state.onTargetRequest = event => { event.ai = () => -1; };
    await f.active(sha, f.loser);
    assert.equal(f.state.autoResult.bool, false); assert.equal(f.state.uses.length, 0);
    f.open();
    const after = clean(f.planner.inspect(f.owner).decision.ranked);
    assert.ok(!after.some(r => JSON.stringify(r.action) === JSON.stringify(tried)));
    assert.ok(after.some(r => r.action.kind === 'puppet' && r.action.card === tried.card && r.action.user === tried.user));
    assert.equal(f.phase.nihilPuppetShaUsed, undefined);
    f.third.hp--;
    assert.ok(clean(f.planner.inspect(f.owner).decision.ranked).some(r => JSON.stringify(r.action) === JSON.stringify(tried)));
});
test('switching a pending AI attempt to human control does not record the human cancellation', async () => {
    const f = fixture(); f.mark(f.loser); f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    const sha = f.card('sha'); f.move(sha, 'h', f.owner); f.open();
    const before = clean(f.planner.inspect(f.owner).decision.ranked);
    const chooseTarget = f.owner.chooseTarget;
    f.owner.chooseTarget = function (...args) {
        const event = chooseTarget.apply(this, args), forResult = event.forResult;
        event.forResult = async function () { const result = await forResult.call(this); this.isMine = () => true; return result; };
        return event;
    };
    f.state.autoTargets = true; f.state.onTargetRequest = event => { event.ai = () => -1; };
    await f.active(sha, f.loser); f.open();
    assert.deepEqual(clean(f.planner.inspect(f.owner).decision.ranked), before);
});

test('native borrowed-sword response bypasses spent normal quota and only advises Luofei', () => {
    const f = fixture(); f.mark(f.owner); f.owner.getStat('card').sha = 99; f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    const sha = f.card('sha'), weapon = f.card('qinglong'), sword = f.card('jiedao'); f.move(sha, 'h', f.owner); f.move(weapon, 'e', f.owner);
    const parent = f.action('jiedao', async () => {}, { player: f.loser, parent: f.phase });
    const event = f.action('chooseToUse', async () => {}, { player: f.owner, parent, addCount: false, sourcex: f.third, respondTo: [f.loser, sword], selectCard: 1, selectTarget: 1, position: 'h', custom: { add: {}, replace: {} }, _aiexclude: [], ai2: () => 31 });
    event.filterCard = (c, p) => c.name === 'sha' && f.lib.filter.cardEnabled(c, p) && f.lib.filter.cardUsable(c, p, event);
    event.filterTarget = (c, p, t) => t === event.sourcex && f.lib.filter.targetEnabled(c, p, t) && f.lib.filter.targetInRange(c, p, t);
    f.state.active = event; f.planner.decorateChoice(event); event.ai2 = vm.runInContext('(' + event.ai2.toString() + ')', f.context); f.game.check();
    assert.equal(f.context.ai.basic.chooseCard(f.get.cacheOrder), true);
    assert.equal(f.ui.selected.cards[0].cardid, sha.cardid);
    assert.equal(f.context.ai.basic.chooseTarget(event.ai2), true);
    assert.equal(f.ui.selected.targets[0].playerid, f.third.playerid);
    assert.equal(f.owner.getStat('card').sha, 99); assert.equal(f.phase.nihilPuppetShaUsed, undefined);
    event.isMine = () => true; assert.equal(event.ai2(f.loser), 31);
    event.player = f.loser; assert.equal(f.planner.score('order', f.owner, { card: sha }), undefined);
});


test('native automatic complete target group accepts a positive equipment route', () => {
    const f = fixture(); f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    const weapon = f.card('qinglong'); f.move(weapon, 'h', f.owner);
    const event = f.open();
    Object.assign(event, { filterCard: c => c === weapon, selectCard: 1, position: 'h', filterTarget: (c, p, t) => p === t, selectTarget: -1, forced: false, custom: { add: {}, replace: {} }, _aiexclude: [] });
    f.ui.selected.cards = [weapon]; f.game.check();
    assert.deepEqual(clean(f.ui.selected.targets.map(p => p.playerid)), [f.owner.playerid]);
    assert.equal(f.context.ai.basic.chooseTarget(event.ai2), true);
});
test('native card and skill exclusions reselect a remaining concrete root without banning borrowed materials', () => {
    const f = fixture(); f.phase.nihilJieShichengUsed = ['damage', 'remove']; f.mark(f.loser);
    const sha = f.card('sha'), weapon = f.card('qinglong'); f.move(sha, 'h', f.owner); f.move(weapon, 'h', f.owner);
    const event = f.open(); const first = f.planner.inspect(f.owner).decision.firstAction;
    event._aiexclude = [first.kind === 'puppet' ? 'nihil_jie_yulei_active' : f.owner.getCards('h').find(c => c.cardid === first.card)];
    const next = f.planner.inspect(f.owner).decision;
    assert.notDeepEqual(clean(next.firstAction), clean(first));
    assert.notEqual(next.firstAction.kind, 'stop');
    event._aiexclude = [sha];
    const remaining = f.planner.inspect(f.owner).decision.ranked;
    assert.ok(!remaining.some(r => r.action.kind === 'normal' && r.action.card === sha.cardid));
    assert.ok(remaining.some(r => r.action.kind === 'puppet' && r.action.card === sha.cardid));
    event._aiexclude = ['nihil_jie_yulei_active'];
    assert.ok(!f.planner.inspect(f.owner).decision.ranked.some(r => r.action.kind === 'puppet'));
});
function responseFixture(name) {
    const f = fixture(); const attack = f.card(name), defense = f.card(['sha', 'wanjian'].includes(name) ? 'shan' : 'sha');
    f.move(defense, 'h', f.owner); f.get.nature = c => c.nature || '';
    const parent = f.action(name, async () => {}, { player: f.third, source: f.third, turn: f.owner, card: attack, baseDamage: 1, extraDamage: 0, parent: null });
    const event = f.action(name === 'sha' ? 'chooseToUse' : 'chooseToRespond', async () => {}, { player: f.owner, parent, type: name === 'sha' ? 'respondShan' : undefined,
        filterCard: c => c === defense, selectCard: 1, position: 'h', selectTarget: 0, filterTarget: () => false, forced: false,
        custom: { add: {}, replace: {} }, _aiexclude: [], toUse: true, toRespond: true, ai1: name === 'sha' ? () => 8 : undefined, ai: () => 8, ai2: () => 8 });
    event.isOnline = () => false; f.state.active = event;
    const hook = name === 'sha' ? 'onChooseToUse' : 'onChooseToRespond'; f.lib.skill.nihil_jie_xueyin[hook](event);
    return { f, event, parent, defense, score: () => (event.ai1 || event.ai)(defense) };
}
for (const name of ['sha', 'nanman', 'wanjian', 'juedou']) test('native ' + name + ' response compares full-health one-damage refusal and dynamically restores human scoring', () => {
    const { f, event, parent, defense, score } = responseFixture(name);
    if (name === 'juedou') { const reply = f.card('sha'); reply.shown = true; f.move(reply, 'h', f.third); }
    const before = JSON.stringify({ storage: f.owner.storage, hp: f.owner.hp, phase: f.phase, toUse: event.toUse, toRespond: event.toRespond }, (key, value) => ['parent', 'player', 'childEvents'].includes(key) ? undefined : value);
    assert.equal(score(), -1, 'a legal defense is worse than this safe profitable one-damage refusal');
    f.game.check(); assert.equal(f.context.ai.basic.chooseCard(event.ai1 || event.ai), false);
    assert.equal(f.ui.selected.cards.length, 0);
    assert.equal(JSON.stringify({ storage: f.owner.storage, hp: f.owner.hp, phase: f.phase, toUse: event.toUse, toRespond: event.toRespond }, (key, value) => ['parent', 'player', 'childEvents'].includes(key) ? undefined : value), before);
    f.owner.hp = 2; assert.equal(score(), 8); f.owner.hp = 3;
    parent.extraDamage = 1; assert.equal(score(), 8); parent.extraDamage = 0;
    event.isMine = () => true; assert.equal(score(), 8); event.isMine = () => false;
    event.isOnline = () => true; assert.equal(score(), 8); event.isOnline = () => false;
    f.context._status.connectMode = true; assert.equal(score(), 8); f.context._status.connectMode = false;
    event.filterCard = () => false; assert.equal(score(), 8);
    assert.equal(event.toRespond, true); assert.equal(event.toUse, true);
});
test('duel continues its legal response when it can immediately hurt the opponent', () => {
    const { score } = responseFixture('juedou'); assert.equal(score(), 8);
});
test('generic incoming-damage effect supplies no out-of-gate blood-selling incentive', () => {
    const { f, parent } = responseFixture('sha'); f.mark(f.third); f.owner.hp = 2;
    assert.equal(f.planner.score('effect', f.owner, { card: parent.card, source: f.third, target: f.owner }), undefined);
});

test('native Check.skill enumeration and Basic.chooseCard enter the actual puppet active skill', async () => {
    const f = fixture(); f.mark(f.loser); f.owner.disabled = true; f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    const sha = f.card('sha'); f.move(sha, 'h', f.owner);
    const event = f.open(); delete event._skillChoice;
    Object.assign(event, vm.runInContext(harness.nativeMethod(harness.eventSource, 'backup(skill)', 2), f.context));
    Object.assign(event, { filterCard: c => f.lib.filter.cardEnabled(c, f.owner), selectCard: 1, selectTarget: 1, position: 'h', filterTarget: (c, p, t) => p !== t, ai1: f.get.cacheOrder, _aiexclude: [], custom: { add: {}, replace: {} } });
    f.ui.create = {};
    for (const key of ['skills', 'skills2', 'skills3']) f.ui.create[key] = skills => { f.ui[key] = { skills, close() { delete f.ui[key]; } }; };
    f.get.skills = vm.runInContext(harness.nativeMethod(harness.getSource, 'skills()', 2), f.context).skills;
    f.ui.click.skill = vm.runInContext(harness.nativeMethod(harness.read('noname/ui/click/index.js'), 'skill(skill)', 2), f.context).skill;
    f.game.check();
    assert.ok(f.get.skills().includes('nihil_jie_yulei_active'));
    assert.equal(f.context.ai.basic.chooseCard(event.ai1), true);
    assert.equal(event.skill, 'nihil_jie_yulei_active'); assert.equal(f.ui.selected.cards[0], sha);
    assert.equal(f.context.ai.basic.chooseTarget(event.ai2), true); assert.equal(f.ui.selected.targets[0], f.loser);
});
test('native response content invokes the hook in all four real callback slots outside own phase', async () => {
    for (const name of ['sha', 'nanman', 'wanjian', 'juedou']) {
        const { f, event } = responseFixture(name);
        if (name === 'juedou') { const reply = f.card('sha'); reply.shown = true; f.move(reply, 'h', f.third); }
        await f.content[event.name][0](event, null, f.owner);
        assert.equal(event.result, 'ai');
        await f.content[event.name][1](event, null, f.owner);
        assert.equal(event.result.bool, false, name);
        assert.equal(f.owner.getCards('h').length, 1);
    }
});
test('source quota is renewed by any fresh role turn and shicheng consumes its actual source immediately', async () => {
    const f = fixture(); f.mark(f.loser); const sha = f.card('sha'); f.move(sha, 'h', f.owner);
    f.actualTurn.nihilJieXueyinUsedSources = [f.loser]; f.open();
    assert.equal(f.planner.inspect(f.owner).snapshot.players.find(p => p.id === f.loser.playerid).used, true);
    f.actualTurn.nihilJieXueyinUsedSources = []; f.open();
    assert.equal(f.planner.inspect(f.owner).snapshot.players.find(p => p.id === f.loser.playerid).used, false);
    f.loser.removeMark('nihil_jie_xueou', 1); await f.shicheng(f.loser, 'damage'); f.open();
    assert.equal(f.planner.inspect(f.owner).snapshot.players.find(p => p.id === f.loser.playerid).used, true);
});

test('fire amplification, missing source and one maximum HP cannot trigger voluntary refusal', () => {
    const { f, event, parent, score } = responseFixture('sha');
    const vine = f.card('tengjia'); f.move(vine, 'e', f.owner); parent.card.nature = 'fire'; assert.equal(score(), 8);
    parent.card.nature = ''; f.move(vine, 'd'); f.owner.hp = f.owner.maxHp = 1; assert.equal(score(), 8);
    f.owner.hp = f.owner.maxHp = 3; parent.player = null; assert.equal(score(), 8);
    assert.equal(event.toUse, true);
});
test('legal native self-save filtering and discard retention preserve exactly the preferred rescue', () => {
    const f = fixture(), peach = f.card('tao'), wine = f.card('jiu'); f.move(peach, 'h', f.owner); f.move(wine, 'h', f.owner); f.open();
    const previous = f.game.checkMod;
    f.game.checkMod = (...args) => args[args.length - 2] === 'cardSavable' && args[0] === wine ? false : previous(...args);
    const snapshot = f.planner.inspect(f.owner).snapshot;
    assert.equal(snapshot.hand.find(c => c.id === wine.cardid).rescueEnabled, false);
    const discardPhase = f.action('phaseDiscard', async () => {}, { player: f.owner, parent: f.actualTurn });
    f.state.active = f.action('chooseToDiscard', async () => {}, { player: f.owner, parent: discardPhase });
    assert.equal(f.planner.score('keep', f.owner, { card: peach }), 100);
    assert.ok(f.planner.score('keep', f.owner, { card: wine }) < 100);
});

test('native material scoring follows the benchmark healing recommendation', () => {
    const f = fixture(); f.mark(f.loser); f.loser.hp = 1; f.owner.disabled = true;
    f.phase.nihilJieShichengUsed = ['damage', 'remove']; f.actualTurn.nihilJieXueyinUsedSources = [f.loser];
    const peach = f.card('tao'), sha = f.card('sha'); f.move(peach, 'h', f.owner); f.move(sha, 'h', f.owner);
    const event = harness.firstSelection(f), decision = f.planner.inspect(f.owner).decision;
    assert.equal(decision.source, 'benchmark-winner');
    assert.equal(decision.firstAction.card, peach.cardid);
    assert.equal(f.context.ai.basic.chooseCard(f.lib.skill.nihil_jie_yulei_active.check), true);
    assert.equal(f.ui.selected.cards[0], peach, 'native material must follow the benchmark recommendation to heal the ally');
    assert.equal(f.context.ai.basic.chooseTarget(event.ai2), true); assert.equal(f.ui.selected.targets[0], f.loser);
});
function axeFixture(names) {
    const f = fixture(), cards = names.map(name => f.card(name));
    cards.forEach(c => f.move(c, 'h', f.owner));
    f.move(f.card('guanshi'), 'e', f.owner);
    f.third.hp = 1;
    f.owner.needsToDiscard = () => true;
    f.owner.getCardIndex = (zone, name, card) => f.owner.getCards('h').filter(c => c.name === name).indexOf(card);
    f.owner.canUse = () => true;
    const previousMod = f.game.checkMod;
    f.game.checkMod = (...args) => args[args.length - 2] === 'aiValue' ? f.lib.skill.nihil_jie_yulei.mod.aiValue?.(args[0], args[1], args[2]) ?? args[2] : previousMod(...args);
    f.get.value = vm.runInContext(harness.nativeMethod(harness.getSource, 'value(card, player, method)', 2), f.context).value;
    const oldImport = f.game.import;
    f.game.import = (type, factory) => Object.assign(f.lib.skill, factory().skill);
    vm.runInContext(harness.read('card/standard.js').replace(/^import .*;\r?\n/gm, ''), f.context);
    f.game.import = oldImport;
    const trigger = { player: f.owner, target: f.third, card: f.card('sha'), baseDamage: 1, extraDamage: 0 };
    const parent = f.action('guanshi_skill', async () => {}, { player: f.owner, parent: f.phase });
    f.owner.chooseToDiscard = (prompt, count, zone, filterCard) => {
        f.state.active = f.action('chooseToDiscard', async () => {}, { player: f.owner, parent, getTrigger: () => trigger,
            filterCard, selectCard: count, selectTarget: 0, position: zone, forced: false, custom: { add: {}, replace: {} } });
        f.state.active.isOnline = () => false;
        return f.state.active;
    };
    f.get.prompt = () => 'guanshi';
    const source = f.lib.skill.guanshi_skill.content.toString();
    const step = vm.runInContext('(function(event,trigger,player){' + source.slice(source.indexOf('{') + 1, source.indexOf('"step 1";')) + '})', f.context);
    step(parent, trigger, f.owner);
    f.openAxe = () => { f.game.check(); return f.context.ai.basic.chooseCard(f.state.active.ai); };
    return { f, cards, event: f.state.active, trigger };
}
for (const names of [['tao', 'wuxie'], ['tao', 'tao']]) test('review native axe payment preserves the last self-save from ' + names.join('+'), () => {
        const { f, cards } = axeFixture(names);
        const accepted = f.openAxe();
        console.log('REVIEW native axe', names, accepted, f.ui.selected.cards.map(c => c.name));
        assert.equal(accepted, false, 'two-card axe payment cannot consume the last legal self-save');
        assert.ok(f.ui.selected.cards.length < 2);
        assert.equal(f.owner.getCards('h').length, cards.length, 'scoring does not pay materials');
});
test('review native axe value restores human, online and unrelated discard requests on every call', () => {
    const { f, cards, event } = axeFixture(['tao', 'wuxie']);
    const peach = cards[0], base = f.get.value(cards[1]);
    assert.equal(f.get.value(peach), 100);
    assert.equal(f.planner.score('keep', f.owner, { card: peach }), undefined);
    event.isMine = () => true; assert.ok(f.get.value(peach) < 100);
    event.isMine = () => false; assert.equal(f.get.value(peach), 100);
    event.isOnline = () => true; assert.ok(f.get.value(peach) < 100); event.isOnline = () => false;
    f.context._status.connectMode = true; assert.ok(f.get.value(peach) < 100); f.context._status.connectMode = false;
    f.game.online = true; assert.ok(f.get.value(peach) < 100); f.game.online = false;
    event.logSkill = 'other_skill'; assert.ok(f.get.value(peach) < 100); event.logSkill = 'guanshi_skill';
    event.player = f.loser; assert.equal(f.planner.score('axeCost', f.owner, { card: peach }), undefined); event.player = f.owner;
    assert.equal(f.get.value(cards[1]), base);
    assert.equal(f.get.value(peach), 100);
});
test('review native axe can pay nonsavable wine and spare cards while preserving one peach', () => {
    const { f, cards } = axeFixture(['tao', 'jiu', 'sha']);
    const previous = f.game.checkMod;
    f.game.checkMod = (...args) => args[args.length - 2] === 'cardSavable' && args[0] === cards[1] ? false : previous(...args);
    assert.equal(f.openAxe(), true);
    assert.deepEqual(clean(f.ui.selected.cards.map(c => c.name).sort()), ['jiu', 'sha']);
    assert.equal(f.owner.getCards('h').length, 3);
});
test('native material and user selection follow the benchmark attack with an unreachable emergency companion', () => {
    const f = fixture(); f.mark(f.loser); f.loser.hp = f.third.hp = 1;
    const unreachable = f.player('unreachable'); unreachable.hp = 1;
    const otherEnemy = f.player('otherEnemy');
    f.get.attitude = (a, b) => b === f.third || b === otherEnemy ? -3 : 3;
    f.phase.nihilJieShichengUsed = ['damage', 'remove'];
    const peach = f.card('tao'), spare = f.card('tao'), sha = f.card('sha');
    for (const c of [peach, spare, sha]) f.move(c, 'h', f.owner);
    const event = harness.firstSelection(f);
    assert.equal(f.context.ai.basic.chooseCard(f.lib.skill.nihil_jie_yulei_active.check), true);
    assert.equal(f.planner.inspect(f.owner).decision.source, 'benchmark-winner');
    assert.equal(f.ui.selected.cards[0].name, 'sha');
    assert.equal(f.context.ai.basic.chooseTarget(event.ai2), true);
    assert.equal(f.ui.selected.targets[0], f.loser);
});
test('review native axe allows the last reserve only for a reliable public immediate victory', () => {
    const { f, cards, event, trigger } = axeFixture(['tao', 'wuxie']);
    f.get.mode = () => 'versus'; f.context._status.mode = 'two';
    f.owner.side = f.loser.side = true; f.third.side = false;
    assert.equal(f.get.value(cards[0]), 0);
    assert.equal(f.openAxe(), true);
    assert.equal(f.ui.selected.cards.length, 2);
    f.game.uncheck();
    const reply = f.card('tao'); f.move(reply, 'h', f.third);
    assert.equal(f.get.value(cards[0]), 100, 'unknown enemy rescue cannot prove certain victory');
    f.move(reply, 'd');
    f.get.mode = () => 'identity'; f.context._status.mode = 'normal';
    assert.equal(f.get.value(cards[0]), 100, 'unknown ending cannot override self-save');
    assert.equal(event.logSkill, 'guanshi_skill'); assert.equal(trigger.target, f.third);
});
(async () => {
    let passed = 0;
    for (const { name, run } of cases) {
        try { await run(); passed++; console.log('PASS ' + name); }
        catch (error) { console.error('FAIL ' + name + '\n' + error.stack); }
    }
    console.log(passed + '/' + cases.length + ' native AI runtime tests passed');
    if (passed !== cases.length) process.exitCode = 1;
})();
