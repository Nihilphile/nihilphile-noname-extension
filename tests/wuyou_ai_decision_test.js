const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fixture } = require('./wuyou_behavior_test');

function person(id, team, hp = 3, hand = 0, extra = {}) {
    return { id, team, hp, maxHp: 4, hand, armor: 0, dead: false,
        rescueUnknown: false, effectUnknown: false, ...extra };
}
function snapshot(players, memory = {}, extra = {}) {
    return { selfId: 'owner', selfRole: 'fan', mode: 'unknown', hp: players[0].hp,
        maxHp: players[0].maxHp, handLimit: 4,
        memory: { spade: 0, heart: 0, club: 0, diamond: 0, ...memory },
        players, ownHand: [], ...extra };
}
function use(name, targets, extraTargets = [], extra = {}) {
    return { name, type: ['sha', 'tao'].includes(name) ? 'basic' : 'trick', suit: 'heart',
        damage: 1, effectCount: 1, targets, extraTargets, recastSuit: null, recastKnown: 0, ...extra };
}
function almost(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }
const api = fixture().skills.nihil_menglong.wuyouAI;
const blank = { extraTarget: null, gain: false, directHit: false, repeat: false };
async function main() {
    for (let k = 1; k <= 4; k++) {
        const dist = [0, 0, 0, 0, 0];
        for (let n = 0; n < 4 ** k; n++) {
            let digits = n, matched = new Set();
            for (let j = 0; j < k; j++, digits = Math.floor(digits / 4))
                if (digits % 4 < k) matched.add(digits % 4);
            dist[matched.size] += 1 / 4 ** k;
        }
        assert.deepEqual(Array.from(api.probabilities[k]), dist.slice(0, k + 1));
    }
    console.log('PASS matched suit distribution');

    const owner = person('owner', 'ally', 2), friend = person('friend', 'ally', 2);
    const peach = use('tao', [owner], [friend]);
    assert.equal(api.planZhuihuan(snapshot([owner, friend], { heart: 1 }), peach).action, 'DECLINE');
    const surplus = api.planZhuihuan(snapshot([owner, friend], { heart: 3 }), peach);
    assert.equal(surplus.action, 'SPEND'); almost(surplus.score, 0.25);
    assert.equal(api.planZhuihuan(snapshot([owner, friend], { heart: 1 }),
        use('wuzhong', [owner], [friend])).action, 'DECLINE');
    const healthyOwner = person('owner', 'ally', 3);
    const recast = use('tao', [healthyOwner], [friend], { recastSuit: 'heart', recastKnown: 1 });
    assert.equal(api.planZhuihuan(snapshot([healthyOwner, friend], { heart: 1 }), recast).action, 'DECLINE');
    const recastPay = api.planZhuihuan(snapshot([healthyOwner, friend], { heart: 2 }), recast);
    assert.equal(recastPay.action, 'SPEND');
    almost(recastPay.cost, 0.25); almost(recastPay.instantCost, 1.10);
    almost(api.memoryValue({ heart: 2 }) - api.memoryValue({ heart: 1 }), 1.10);
    almost(api.memoryValue({ heart: 3 }) - api.memoryValue({ heart: 2 }), 0.25);
    console.log('PASS last memory, surplus memory, and recast endpoint');

    const all = [person('owner', 'ally', 2), person('f1', 'ally', 2), person('f2', 'ally', 2),
        person('f3', 'ally', 2), person('e1', 'enemy', 2, 2), person('e2', 'enemy', 2, 2),
        person('e3', 'enemy', 2, 2)];
    const memory = { spade: 1, heart: 1, club: 1, diamond: 1 };
    const rich = api.planZhuihuan(snapshot(all, memory), use('taoyuan', all));
    assert.equal(rich.action, 'SPEND'); assert.ok(rich.spendSuits.length >= 3);
    assert.deepEqual(Array.from(rich.spendSuits), ['spade', 'heart', 'club', 'diamond']);
    assert.ok(rich.budget <= 32768);
    const fullFoes = all.map(p => p.team === 'enemy' ? { ...p, hp: p.maxHp } : p);
    assert.equal(api.planZhuihuan(snapshot(fullFoes, memory), use('taoyuan', fullFoes)).action, 'DECLINE');
    console.log('PASS global gain, enemy healing, and full health skip');

    const contested = [person('owner', 'ally', 2), ...Array.from({ length: 3 }, (_, i) =>
        person('friend' + i, 'ally', 2)), ...Array.from({ length: 4 }, (_, i) =>
        person('foe' + i, 'enemy', 2, 2))];
    const contestedUse = use('taoyuan', contested, [], { materialCost: 0.8 });
    const contestedCard = { id: 'contested', name: 'taoyuan', suit: 'heart', legal: true,
        candidates: [contestedUse] };
    const contestedSnapshot = snapshot(contested, memory, { ownHand: [contestedCard] });
    const contestedBase = api.summarize(api.compare(api.context(contestedSnapshot, contestedUse),
        [], blank, [], blank, 'forward', true), true);
    assert.ok(contestedBase.score < 0);
    const contestedPlan = api.planUse(contestedSnapshot).contested;
    assert.equal(contestedPlan.action, 'USE');
    assert.equal(contestedPlan.payment.action, 'SPEND');
    assert.ok(contestedPlan.score > 0);
    const hidden = person('hidden', 'unknown', 2, 2);
    const hiddenCard = { id: 'hiddenAttack', name: 'sha', suit: 'heart', legal: true,
        candidates: [use('sha', [hidden], [], { materialCost: 0.8 })] };
    assert.equal(api.planUse(snapshot([person('owner', 'ally', 3), hidden], memory,
        { mode: 'identity', ownHand: [hiddenCard] })).hiddenAttack, null);
    console.log('PASS negative base becomes positive after payment; hidden identity uses native fallback');

    const ally = person('friend', 'ally', 2), e1 = person('e1', 'enemy', 2),
        e2 = person('e2', 'enemy', 2), safe = person('owner', 'ally', 3);
    const repeat = { ...blank, repeat: true };
    const one = api.context(snapshot([safe, ally, e1]), use('nanman', [ally, e1]));
    assert.equal(api.summarize(api.compare(one, [], blank, [], repeat, 'forward', false), true).reason,
        'ALLY_DEATH_BAD_TRADE');
    const two = api.context(snapshot([safe, ally, e1, e2]), use('nanman', [ally, e1, e2]));
    const twoResult = api.summarize(api.compare(two, [], blank, [], repeat, 'forward', false), true);
    assert.equal(twoResult.ok, true); assert.ok(twoResult.score > 0);
    console.log('PASS 1:1 rejection and paired 2:1 reachability');

    const marginalSwap = api.summarize({ budget: { count: 0 }, unknownMass: 0, paths: [
        { p: 0.5, root: { utility: -100, h: 0, terminal: 'LOSS', deadAlly: [], deadEnemy: [], damageAlly: 0 },
            candidate: { utility: 0, h: 0, terminal: 'NONE', deadAlly: [], deadEnemy: [], damageAlly: 0 } },
        { p: 0.5, root: { utility: 0, h: 0, terminal: 'NONE', deadAlly: [], deadEnemy: [], damageAlly: 0 },
            candidate: { utility: -100, h: 0, terminal: 'LOSS', deadAlly: [], deadEnemy: [], damageAlly: 0 } }
    ] }, true);
    assert.equal(marginalSwap.reason, 'EARLY_TERMINAL_LOSS');
    assert.ok(marginalSwap.lossUpper >= 0.5);
    console.log('PASS paired loss detects equal marginal rates');

    const unknownEnemy = person('foe', 'enemy', 1, 1, { rescueUnknown: true });
    const unknownContext = api.context(snapshot([safe, unknownEnemy]), use('sha', [unknownEnemy]));
    const unknown = api.summarize(api.compare(unknownContext, [], blank, [], blank, 'forward', true), true);
    assert.notEqual(unknown.reason, 'TERMINAL_WIN');
    assert.equal(unknown.lossUpper, 0);
    const paid = api.planZhuihuan(snapshot([owner, friend], { heart: 3 }), peach);
    const actual = api.planOutcome(snapshot([owner, friend], { heart: 3 }), peach, 1, {}, ['heart']);
    assert.deepEqual({ extraTarget: actual.extraTarget, gain: actual.gain,
        directHit: actual.directHit, repeat: actual.repeat }, JSON.parse(JSON.stringify(paid.policies[1].option)));
    console.log('PASS unknown enemy rescue and executable suffix policy');

    const simpleWorld = { response: {}, steal: {} };
    const defended = person('owner', 'ally', 3, 0);
    const ownHit = use('sha', [defended]);
    const throughDirect = api.run(snapshot([defended], { heart: 2 }), ownHit,
        { ...blank, directHit: true }, [], { response: {}, steal: {} }, { count: 0 }, 'forward');
    assert.equal(throughDirect.people.owner.hp, 3);
    assert.equal(throughDirect.memory.heart, 0);
    const foeWithResponses = person('foe', 'enemy', 3, 3);
    const stealUse = use('wanjian', [foeWithResponses]);
    const s = snapshot([person('owner', 'ally', 3), foeWithResponses]);
    const getsResponse = api.run(s, stealUse, { ...blank, gain: true, repeat: true }, [],
        { response: { foe: 2 }, steal: { foe: [0.25, 0.25] } }, { count: 0 }, 'forward');
    const missesResponse = api.run(s, stealUse, { ...blank, gain: true, repeat: true }, [],
        { response: { foe: 2 }, steal: { foe: [0.75, 0.75] } }, { count: 0 }, 'forward');
    assert.equal(getsResponse.people.foe.hp, 2);
    assert.equal(missesResponse.people.foe.hp, 3);
    console.log('PASS direct hit retains huanghu and theft shares response inventory');

    const lead = person('owner', 'ally', 1), firstEnemy = person('e1', 'enemy', 1),
        secondEnemy = person('e2', 'enemy', 1);
    const ordered = use('wanjian', [secondEnemy, lead, firstEnemy], [],
        { orderIds: ['owner', 'e1', 'e2'], bidirectional: true });
    const orderSnapshot = snapshot([lead, firstEnemy, secondEnemy], {}, { mode: 'versus_two' });
    const forward = api.run(orderSnapshot, ordered, blank, [], simpleWorld, { count: 0 }, 'forward');
    const reverse = api.run(orderSnapshot, ordered, blank, [], simpleWorld, { count: 0 }, 'reverse');
    assert.equal(forward.terminal, 'LOSS');
    assert.equal(forward.people.e1.hp, 1);
    assert.equal(reverse.terminal, 'WIN');
    assert.equal(reverse.people.owner.hp, 1);
    const lord = person('lord', 'enemy', 1, 0, { publicRole: 'zhu' });
    const rebelFriend = person('rebelFriend', 'ally', 1);
    const identityUse = use('nanman', [rebelFriend, lord], [], { orderIds: ['lord', 'rebelFriend'] });
    const identityResult = api.run(snapshot([person('owner', 'ally', 3), lord, rebelFriend], {},
        { mode: 'identity', selfRole: 'fan' }), identityUse, blank, [], simpleWorld, { count: 0 }, 'forward');
    assert.equal(identityResult.terminal, 'WIN');
    assert.equal(identityResult.people.rebelFriend.hp, 1);
    console.log('PASS seat order, reverse direction, and identity terminal absorption');

    const noFlow = use('tao', [owner], [], { recastSuit: 'heart', recastKnown: 1 });
    const expensiveFlow = { ...noFlow, recastFlow: -2 };
    const first = api.run(snapshot([owner], { heart: 1 }), expensiveFlow, blank, [], simpleWorld,
        { count: 0 }, 'forward');
    const second = api.run(snapshot([owner], { heart: 1 }), expensiveFlow, blank, [], simpleWorld,
        { count: 0 }, 'forward');
    const neutral = api.run(snapshot([owner], { heart: 1 }), noFlow, blank, [], simpleWorld,
        { count: 0 }, 'forward');
    almost(first.utility, second.utility);
    almost(neutral.utility - first.utility, 2);
    console.log('PASS recast card flow is counted once without mutable scoring');

    const match = [person('owner', 'ally', 3), person('friend', 'ally', 3, 2),
        person('e1', 'enemy', 3, 2), person('e2', 'enemy', 3, 2)];
    const crowded = api.planZhuihuan(snapshot(match, memory, { mode: 'versus_two' }),
        use('wanjian', match.slice(1)));
    assert.ok(crowded.context.budget.count <= 32768);
    assert.ok((crowded.rejected || []).some(item => item.suits.length === 4));
    console.log('PASS four-suit and 2v2 public-hand planning stay within budget',
        rich.context.budget.count, crowded.context.budget.count);

    for (const hand of [2, 3, 4, 5]) {
        const protectedFriend = person('friend', 'ally', 3, hand, { armor: 1 });
        const opponents = [person('foe1', 'enemy', 3, 2), person('foe2', 'enemy', 3, 2)];
        const group = [protectedFriend, ...opponents];
        const normalUse = use('wanjian', group, [], { materialCost: 0.8 });
        const normalSnapshot = snapshot([person('owner', 'ally', 3), ...group],
            { spade: 3, heart: 3, club: 3 }, { mode: 'versus_two', ownHand: [
                { id: 'arrow', name: 'wanjian', suit: 'heart', legal: true, candidates: [normalUse] }
            ] });
        const noGainWorlds = api.worlds(normalSnapshot, normalUse);
        const gainWorlds = api.worlds(normalSnapshot, normalUse, { ...blank, gain: true });
        almost(noGainWorlds.unknownMass, 0);
        almost(gainWorlds.unknownMass, 0);
        const normalPayment = api.planZhuihuan(normalSnapshot, normalUse);
        const normalEntry = api.planUse(normalSnapshot).arrow;
        assert.equal(normalPayment.action, 'SPEND');
        assert.equal(normalEntry.action, hand >= 4 ? 'USE' : 'HOLD',
            `hand=${hand}, score=${normalEntry.score}, payment=${normalPayment.score}, reason=${normalEntry.reason}`);
        if (hand >= 4) assert.ok(normalEntry.score > 0);
        assert.ok(normalPayment.context.budget.count <= 32768);
    }
    console.log('PASS ordinary 2v2 multi-target gain and paid native entry remain conditional on friend loss');

    const armorFixture = fixture(), shielded = Object.assign(armorFixture.target('shielded', 2),
        { side: false, hp: 3, maxHp: 4 });
    let armor = null, weapon = null, stripArmor = false, bypass = false;
    Object.assign(armorFixture.player, { side: true, hp: 3, maxHp: 4,
        countCards() { return this.hand.length; }, getHandcardLimit() { return 4; },
        hasUseTarget() { return true; }, canUse(_card, target) { return target !== this; },
        getEquip(name) { return weapon && (name === weapon.name || name === 'equip1') ? weapon : null; },
        hasSkill(name) { return !!weapon && name === weapon.name + '_skill'; },
        hasSkillTag(name, hidden) {
            assert.equal(hidden, name === 'unequip' ? false : null);
            return name === 'unequip' && bypass;
        } });
    shielded.getEquip = name => armor && (name === armor.name || name === 'equip2') ? armor : null;
    shielded.hasSkill = name => !!armor && (
        armor.name === 'renwang' && name === 'renwang_skill' ||
        armor.name === 'tengjia' && ['tengjia1', 'tengjia2', 'tengjia3'].includes(name) ||
        armor.name === 'baiyin' && name === 'baiyin_skill');
    shielded.hasSkillTag = (name, hidden) => {
        assert.equal(hidden, null); return name === 'unequip2' && stripArmor;
    };
    armorFixture.game.players = [armorFixture.player, shielded];
    armorFixture.context._status = { mode: 'two' };
    armorFixture.get.mode = () => 'versus';
    armorFixture.get.name = card => card.name;
    armorFixture.get.color = card => ['spade', 'club'].includes(card.suit) ? 'black' : 'red';
    const blackSlash = { cardid: 'blackSlash', name: 'sha', type: 'basic', suit: 'club' };
    armorFixture.player.hand = [blackSlash];
    armorFixture.player.storage.nihil_liulian = { club: 3, heart: 3, spade: 3, diamond: 0 };
    const armorPhase = { name: 'chooseToUse', type: 'phase', player: armorFixture.player,
        _aiexclude: [], filterCard: () => true, filterTarget: () => true, ai1: () => 1, ai2: () => 1 };
    armorFixture.state.active = armorPhase;
    armorFixture.skills.nihil_menglong.onChooseToUse(armorPhase);
    assert.equal(armorFixture.skills.nihil_menglong.wuyouAI.preparedCard(armorFixture.player, blackSlash).action, 'USE');
    armor = { cardid: 'shield', name: 'renwang' };
    armorFixture.skills.nihil_menglong.mod.aiOrder(armorFixture.player, blackSlash, 0);
    const blockedPlan = armorFixture.skills.nihil_menglong.wuyouAI.preparedCard(armorFixture.player, blackSlash);
    assert.equal(blockedPlan.action, 'HOLD');
    const blockedUse = use('sha', armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase)
        .ownHand[0].candidates[0].targets);
    assert.equal(blockedUse.targets[0].effectCancelled, true);
    const actualBlockedUse = armorFixture.skills.nihil_menglong.wuyouAI.useSnapshot(armorFixture.player,
        { card: blackSlash, targets: [shielded], excluded: [], directHit: [], effectCount: 1 });
    assert.equal(actualBlockedUse.targets[0].effectCancelled, true);
    assert.equal(armorFixture.skills.nihil_menglong.wuyouAI.planZhuihuan(
        armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player),
        actualBlockedUse).action, 'DECLINE');
    const cancelled = api.run(snapshot([person('owner', 'ally', 3), blockedUse.targets[0]]), blockedUse,
        { extraTarget: null, gain: true, directHit: true, repeat: true }, [],
        { response: { shielded: 0 }, steal: {} }, { count: 0 }, 'forward');
    assert.equal(cancelled.people.shielded.hp, 3);
    assert.equal(cancelled.people.shielded.hand, 2);
    weapon = { cardid: 'blade', name: 'qinggang' };
    armorFixture.skills.nihil_menglong.mod.aiOrder(armorFixture.player, blackSlash, 0);
    assert.equal(armorFixture.skills.nihil_menglong.wuyouAI.preparedCard(armorFixture.player, blackSlash).action, 'USE');
    assert.equal(armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase)
        .ownHand[0].candidates[0].targets[0].effectCancelled, false);
    weapon = null; stripArmor = true;
    assert.equal(armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase)
        .ownHand[0].candidates[0].targets[0].effectCancelled, false);
    stripArmor = false; bypass = true;
    assert.equal(armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase)
        .ownHand[0].candidates[0].targets[0].effectCancelled, false);
    bypass = false; armor = { cardid: 'vine', name: 'tengjia' };
    for (const name of ['sha', 'nanman', 'wanjian']) {
        blackSlash.name = name;
        assert.equal(armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase)
            .ownHand[0].candidates[0].targets[0].effectCancelled, true);
    }
    blackSlash.name = 'sha'; blackSlash.nature = 'fire';
    assert.equal(armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase)
        .ownHand[0].candidates[0].targets[0].effectCancelled, false);
    console.log('PASS public armor cancellation, whole-effect skip, Qinggang and unequip bypass');

    const fireFriend = shielded;
    fireFriend.side = true; fireFriend.hp = 2; fireFriend.hand = 0;
    const fireFoes = [Object.assign(armorFixture.target('fireFoe1', 0), { side: false, hp: 1, maxHp: 4 }),
        Object.assign(armorFixture.target('fireFoe2', 0), { side: false, hp: 3, maxHp: 4 })];
    armorFixture.game.players = [armorFixture.player, fireFriend, ...fireFoes];
    const fireSnapshot = armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase);
    const fireCandidate = fireSnapshot.ownHand[0].candidates.find(candidate => candidate.targets[0].id === 'shielded');
    assert.equal(fireCandidate.targets[0].fireDamageBonus, 1);
    const fireState = api.run(fireSnapshot, fireCandidate, blank, [], simpleWorld, { count: 0 }, 'forward');
    assert.equal(fireState.people.shielded.dead, true);
    assert.equal(api.planUse({ ...fireSnapshot, ownHand: [{ ...fireSnapshot.ownHand[0], candidates: [fireCandidate] }] })
        .blackSlash.action, 'HOLD');
    const firePayment = api.planZhuihuan(fireSnapshot, fireCandidate);
    const paidRoot = api.compare(firePayment.context, [], blank, [], blank, 'forward', false);
    assert.ok(paidRoot.paths.every(path => path.root.deadAlly.includes('shielded')));
    assert.notEqual(firePayment.reason, 'TERMINAL_WIN');
    armor = null;
    const normalFire = armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase);
    const normalCandidate = normalFire.ownHand[0].candidates.find(candidate => candidate.targets[0].id === 'shielded');
    assert.equal(normalCandidate.targets[0].fireDamageBonus, 0);
    assert.equal(api.planUse({ ...normalFire, ownHand: [{ ...normalFire.ownHand[0], candidates: [normalCandidate] }] })
        .blackSlash.action, 'USE');
    armor = { cardid: 'vine2', name: 'tengjia' }; stripArmor = true;
    const strippedFire = armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase);
    const strippedCandidate = strippedFire.ownHand[0].candidates.find(candidate => candidate.targets[0].id === 'shielded');
    assert.equal(strippedCandidate.targets[0].fireDamageBonus, 0);
    assert.equal(api.planUse({ ...strippedFire, ownHand: [{ ...strippedFire.ownHand[0], candidates: [strippedCandidate] }] })
        .blackSlash.action, 'USE');
    stripArmor = false; weapon = { cardid: 'blade2', name: 'qinggang' };
    const piercedFire = armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase);
    const piercedCandidate = piercedFire.ownHand[0].candidates.find(candidate => candidate.targets[0].id === 'shielded');
    assert.equal(piercedCandidate.targets[0].fireDamageBonus, 0);
    assert.equal(api.planUse({ ...piercedFire, ownHand: [{ ...piercedFire.ownHand[0], candidates: [piercedCandidate] }] })
        .blackSlash.action, 'USE');
    weapon = null; armor = null;
    fireFriend.isLinked = () => true; armorFixture.player.isLinked = () => true;
    const chainSnapshot = armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase);
    const chainCandidate = chainSnapshot.ownHand[0].candidates.find(candidate => candidate.targets[0].id === 'shielded');
    assert.equal(chainCandidate.targets[0].chainUnknown, true);
    assert.equal(api.planUse({ ...chainSnapshot, ownHand: [{ ...chainSnapshot.ownHand[0], candidates: [chainCandidate] }] })
        .blackSlash.action, 'HOLD');
    blackSlash.nature = undefined; weapon = { cardid: 'fan', name: 'zhuque' };
    const optionalFire = armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player, armorPhase);
    assert.equal(optionalFire.ownHand[0].candidates.find(candidate => candidate.targets[0].id === 'shielded')
        .targets[0].chainUnknown, true);
    weapon = null; blackSlash.nature = 'fire';
    delete fireFriend.isLinked; delete armorFixture.player.isLinked;
    fireFriend.side = false; fireFriend.hp = 2; armor = { cardid: 'silver', name: 'baiyin' };
    blackSlash.nature = undefined;
    const silverUse = armorFixture.skills.nihil_menglong.wuyouAI.useSnapshot(armorFixture.player,
        { card: blackSlash, targets: [fireFriend], excluded: [], directHit: [], baseDamage: 2, effectCount: 1 });
    assert.equal(silverUse.targets[0].damageCap, 1);
    const silverState = api.run(armorFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(armorFixture.player),
        silverUse, blank, [], simpleWorld, { count: 0 }, 'forward');
    assert.equal(silverState.people.shielded.hp, 1);
    const doomedFriend = person('doomedFriend', 'ally', 1), cappedEnemy = person('shielded', 'enemy', 2);
    const silverTrade = use('sha', [doomedFriend], [silverUse.targets[0]],
        { damage: 2, materialCost: 0.8 });
    const silverTradeSnapshot = snapshot([person('owner', 'ally', 3), doomedFriend, cappedEnemy],
        { heart: 3, spade: 3, club: 3 }, { mode: 'versus_two', ownHand: [
            { id: 'silverAttack', name: 'sha', suit: 'heart', legal: true, candidates: [silverTrade] }
        ] });
    const cappedTrade = api.run(silverTradeSnapshot, silverTrade, { ...blank, extraTarget: 'shielded' },
        [], simpleWorld, { count: 0 }, 'forward');
    assert.notEqual(cappedTrade.terminal, 'WIN');
    assert.equal(cappedTrade.people.doomedFriend.dead, true);
    assert.equal(cappedTrade.people.shielded.dead, false);
    assert.equal(api.planUse(silverTradeSnapshot).silverAttack.action, 'HOLD');
    weapon = { cardid: 'blade3', name: 'qinggang' };
    assert.equal(armorFixture.skills.nihil_menglong.wuyouAI.useSnapshot(armorFixture.player,
        { card: blackSlash, targets: [fireFriend], excluded: [], directHit: [], baseDamage: 2, effectCount: 1 })
        .targets[0].damageCap, null);
    console.log('PASS Tengjia fire bonus, linked damage uncertainty and Silver Lion cap');

    const thunderFriend = person('friend', 'ally', 1, 3, { armor: 2 });
    const thunderOwner = person('owner', 'ally', 3, 4);
    const thunderFoes = [person('foe1', 'enemy', 3, 2), person('foe2', 'enemy', 3, 2)];
    const thunderUse = use('sha', [thunderFriend], [], { suit: 'spade', materialId: 'thunder',
        materialCost: 0.8, recastSuit: 'spade', recastKnown: 2, orderIds: ['owner', 'friend', 'foe1', 'foe2'] });
    const thunderSnapshot = snapshot([thunderOwner, thunderFriend, ...thunderFoes],
        { spade: 1, heart: 2 }, { mode: 'versus_two', ownHand: [
            { id: 'thunder', name: 'sha', suit: 'spade', legal: true, candidates: [thunderUse] },
            { id: 'recast1', name: 'shunshou', suit: 'spade', legal: true, candidates: [] },
            { id: 'recast2', name: 'jiu', suit: 'spade', legal: true, candidates: [] }
        ] });
    const thunderContext = api.context(thunderSnapshot, thunderUse);
    const thunderPaths = api.compare(thunderContext, [], blank, [], blank, 'forward', true).paths;
    assert.ok(thunderPaths.some(path => path.candidate.people.friend.armor === 1));
    assert.ok(thunderPaths.every(path => path.candidate.people.friend.hp === 1));
    assert.equal(api.planUse(thunderSnapshot).thunder.action, 'HOLD');
    const sameArmorPaths = api.compare(thunderContext, [], blank, ['spade'], blank, 'forward', false).paths;
    assert.ok(sameArmorPaths.every(path => path.root.armorAllyLoss === path.candidate.armorAllyLoss));
    const armorValueFixture = fixture(), actualFriend = Object.assign(armorValueFixture.target('friend', 3),
        { side: true, hp: 1, maxHp: 4, hujia: 2 });
    const actualFoes = [0, 1].map(i => Object.assign(armorValueFixture.target('foe' + i, 2),
        { side: false, hp: 3, maxHp: 4 }));
    Object.assign(armorValueFixture.player, { side: true, hp: 3, maxHp: 3,
        countCards() { return this.hand.length; }, getHandcardLimit() { return 4; },
        hasUseTarget() { return true; }, canUse(_card, target) { return target === actualFriend; } });
    armorValueFixture.context._status = { mode: 'two' };
    armorValueFixture.get.mode = () => 'versus'; armorValueFixture.get.name = card => card.name;
    armorValueFixture.game.players = [armorValueFixture.player, actualFriend, ...actualFoes];
    armorValueFixture.context.lib.filter.targetEnabled2 = (_card, _player, target) => target === actualFriend;
    armorValueFixture.player.storage.nihil_liulian = { spade: 1, heart: 2, club: 0, diamond: 0 };
    const actualThunder = { cardid: 'actualThunder', name: 'sha', type: 'basic', suit: 'spade' };
    armorValueFixture.player.hand = [actualThunder,
        { cardid: 'recastA', name: 'shunshou', type: 'trick', suit: 'spade' },
        { cardid: 'recastB', name: 'jiu', type: 'basic', suit: 'spade' }];
    const armorValuePhase = { name: 'chooseToUse', type: 'phase', player: armorValueFixture.player,
        _aiexclude: [], filterCard: () => true, filterTarget: (_card, _player, target) => target === actualFriend };
    const liveArmorSnapshot = armorValueFixture.skills.nihil_menglong.wuyouAI.buildSnapshot(
        armorValueFixture.player, armorValuePhase);
    assert.equal(liveArmorSnapshot.ownHand[0].candidates[0].targets[0].armor, 2);
    assert.equal(liveArmorSnapshot.ownHand[0].candidates[0].recastKnown, 2);
    assert.equal(api.planUse(liveArmorSnapshot).actualThunder.action, 'HOLD');
    const unarmoredEnemy = person('enemy', 'enemy', 3), armoredEnemy = person('enemy', 'enemy', 3, 0, { armor: 2 });
    for (const enemy of [unarmoredEnemy, armoredEnemy]) {
        const attack = use('sha', [enemy], [], { materialCost: 0.8 });
        const enemySnapshot = snapshot([person('owner', 'ally', 3), enemy], {}, { ownHand: [
            { id: 'attack', name: 'sha', suit: 'heart', legal: true, candidates: [attack] }
        ] });
        assert.equal(api.planUse(enemySnapshot).attack.action, 'USE');
    }
    const armoredFriend = person('friend', 'ally', 3, 3, { armor: 1 });
    const armoredFoes = [person('enemy1', 'enemy', 3, 0, { armor: 1 }),
        person('enemy2', 'enemy', 3, 0, { armor: 1 })];
    const mixedTargets = [armoredFriend, ...armoredFoes];
    const mixedUse = use('wanjian', mixedTargets, [], { materialCost: 0.8 });
    const mixedSnapshot = snapshot([person('owner', 'ally', 3), ...mixedTargets], {}, { mode: 'versus_two',
        ownHand: [{ id: 'mixed', name: 'wanjian', suit: 'heart', legal: true, candidates: [mixedUse] }] });
    assert.equal(api.planUse(mixedSnapshot).mixed.action, 'USE');
    console.log('PASS armor loss prices friend attacks while enemy and multi-target gains remain reachable');

    const f = fixture();
    f.context._status = { mode: 'two' };
    f.get.mode = () => 'versus'; f.get.name = c => c.name; f.get.card = () => f.selectedCard;
    f.get.attitude = (_, t) => t.side === true ? 1 : -1;
    Object.assign(f.player, { side: true, hp: 2, maxHp: 4,
        countCards() { return this.hand.length; }, getHandcardLimit() { return 4; },
        hasUseTarget() { return true; }, canUse() { return true; } });
    const targets = [f.player, ...Array.from({ length: 3 }, (_, i) =>
        Object.assign(f.target('f' + i, 0), { side: true, hp: 2, maxHp: 4 })),
        ...Array.from({ length: 3 }, (_, i) =>
            Object.assign(f.target('e' + i, 2), { side: false, hp: 2, maxHp: 4 }))];
    f.game.players = targets;
    targets.slice(1).forEach(target => {
        target.getCards = zone => { if (zone === 'h') throw new Error('hidden hand read');
            assert.ok(['e', 'j'].includes(zone)); return []; };
        target.hasSkillTag = (_, hidden) => {
            assert.equal(hidden, null, 'hidden skills must not be inspected'); return false;
        };
    });
    f.get.cards = () => { throw new Error('pile read'); };
    const material = { cardid: 'garden', name: 'taoyuan', type: 'trick', suit: 'heart',
        info: { selectTarget: -1 }, classList: { add() {} } };
    f.player.hand = [material]; f.player.storage.nihil_liulian = memory;
    const phase = { name: 'chooseToUse', type: 'phase', player: f.player, _aiexclude: [],
        filterCard: () => true, filterTarget: () => true, selectCard: [1, 1], selectTarget: [1, -1],
        ai1: () => -9, ai2: () => -9 };
    f.state.active = phase;
    const skill = f.skills.nihil_menglong;
    skill.onChooseToUse(phase);
    const decision = skill.wuyouAI.preparedCard(f.player, material);
    assert.equal(decision.action, 'USE'); assert.ok(phase.ai1(material) > 0);
    f.selectedCard = material;
    const nativeBasicPaths = [
        path.join(__dirname, '../../e2e/game/resources/app/noname/ai/basic.js'),
        path.join(__dirname, '../artifacts/wuyou-ai-v1/e2e/game/resources/app/noname/ai/basic.js'),
    ];
    const source = fs.readFileSync(nativeBasicPaths.find(file => fs.existsSync(file)), 'utf8');
    const classSource = source.slice(source.indexOf('class Basic {'), source.lastIndexOf('export {'));
    class CacheContext { static setCacheContext() {} static setInCacheEnvironment() {} static removeCacheContext() {} }
    const selectedCards = [];
    selectedCards.add = card => { selectedCards.push(card); };
    const engine = { CacheContext, _status: { event: phase },
        get: { select: range => range, selectableCards: () => [material], skills: () => [] },
        ui: { selected: { cards: selectedCards, targets } }, game: { check() {} }, lib: {} };
    vm.createContext(engine);
    vm.runInContext(classSource + '\nglobalThis.basic = new Basic();', engine);
    assert.equal(engine.basic.chooseCard(card => phase.ai1(card)), true);
    assert.equal(selectedCards[0], material);
    const remoteAi1 = vm.runInContext('(' + phase.ai1.toString() + ')', f.context);
    const remoteAi2 = vm.runInContext('(' + phase.ai2.toString() + ')', f.context);
    assert.ok(remoteAi1(material) > 0);
    assert.equal(remoteAi2(targets[0]), 1);
    assert.equal(engine.basic.chooseTarget(() => -9), false);
    assert.equal(engine.basic.chooseTarget(target => phase.ai2(target)), true);
    assert.equal(targets.length, 7);
    const previous = phase._nihilWuyouPlan;
    skill.mod.aiOrder(f.player, material, 0);
    assert.equal(phase._nihilWuyouPlan, previous);
    phase._aiexclude.push(material);
    skill.mod.aiOrder(f.player, material, 0);
    assert.notEqual(phase._nihilWuyouPlan, previous);
    assert.equal(skill.wuyouAI.preparedCard(f.player, material).action, 'HOLD');
    console.log('PASS native ai2 full-target gate and cache invalidation');

    const auditFixture = fixture(), extra = Object.assign(auditFixture.target('friend', 0), { hp: 2, maxHp: 4 });
    Object.assign(auditFixture.player, { hp: 2, maxHp: 4, identity: 'fan',
        countCards() { return this.hand.length; } });
    auditFixture.get.name = card => card.name;
    auditFixture.get.attitude = () => 1;
    auditFixture.game.players = [auditFixture.player, extra];
    auditFixture.player.storage.nihil_liulian = { spade: 0, heart: 3, club: 0, diamond: 0 };
    const actualUse = auditFixture.use('basic', 'heart');
    actualUse.card.name = 'tao'; actualUse.targets.add(auditFixture.player);
    auditFixture.state.button = { bool: true, links: ['heart:1'] };
    auditFixture.state.pile = [{ suit: 'heart' }];
    auditFixture.state.targets = [{ bool: true, targets: [extra] }];
    await auditFixture.skills.nihil_zhuihuan.content({}, actualUse, auditFixture.player);
    const audit = auditFixture.game._nihilWuyouAudit;
    assert.ok(audit.length >= 2);
    assert.equal(audit[0].phase, 'payment'); assert.equal(audit[0].matched, 1);
    assert.deepEqual(Array.from(audit[0].actualPaidSuits), ['heart']);
    assert.equal(audit[1].phase, 'suffix_target');
    assert.equal(audit[1].actual, 'friend');
    assert.equal(audit[0].seq + 1, audit[1].seq);
    assert.equal(JSON.stringify(audit).includes('cards'), false);
    console.log('PASS production payment and suffix emit public bounded audit entries');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
