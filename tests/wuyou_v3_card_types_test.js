const assert = require('node:assert/strict');
const { fixture } = require('./wuyou_behavior_test');

const api = fixture().skills.nihil_menglong.wuyouAI;
const blank = { extraTarget: null, gain: false, directHit: false, repeat: false };
function person(id, team, hand, extra = {}) {
    return { id, team, hp: 3, maxHp: 4, hand, armor: 0, dead: false, moveZones: [], ...extra };
}
function snapshot(targets, memory = {}, ownHand = []) {
    return { selfId: 'owner', selfRole: 'fan', hp: 3, maxHp: 4, handLimit: 4, mode: 'versus_two',
        memory: { spade: 0, heart: 0, club: 0, diamond: 0, ...memory }, players: targets, ownHand };
}
function use(name, targets, extraTargets = [], extra = {}) {
    return { name, type: 'trick', suit: 'heart', damage: 1, effectCount: 1, targets, extraTargets,
        recastSuit: null, recastKnown: 0, ...extra };
}
function run(s, card, option = blank, world = { response: {}, steal: {} }) {
    return api.run(s, card, option, [], world, { count: 0 }, 'forward');
}
function almost(a, b) { assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`); }

async function main() {
    const owner = person('owner', 'ally', 0), one = person('enemy', 'enemy', 1), two = person('enemy', 'enemy', 2);
    const guoOne = use('guohe', [one]);
    const oneBase = run(snapshot([owner, one]), guoOne);
    const oneGain = run(snapshot([owner, one]), guoOne, { ...blank, gain: true, repeat: true });
    almost(oneBase.c, 0.8); almost(oneGain.c, 0.8);
    assert.equal(oneGain.people.enemy.hand, 0); assert.equal(oneGain.people.owner.hand, 0);
    const guoTwo = use('guohe', [two]);
    const twoGain = run(snapshot([owner, two]), guoTwo, { ...blank, gain: true, repeat: true });
    almost(twoGain.c, 2.4);
    assert.equal(twoGain.people.enemy.hand, 0); assert.equal(twoGain.people.owner.hand, 1);
    const shunTwo = run(snapshot([owner, two]), use('shunshou', [two]), { ...blank, gain: true, repeat: true });
    almost(shunTwo.c, 3.2);
    assert.equal(shunTwo.people.enemy.hand, 0); assert.equal(shunTwo.people.owner.hand, 2);
    assert.equal(api.planZhuihuan(snapshot([owner, two], { spade: 3, heart: 3, club: 3 }),
        use('shunshou', [two])).action, 'SPEND');
    const friend = person('friend', 'ally', 2);
    almost(run(snapshot([owner, friend]), use('shunshou', [friend]), { ...blank, gain: true }).c, -2.8);
    const drawnFriend = person('friend', 'ally', 0, { drawCount: 2 });
    almost(run(snapshot([owner, drawnFriend]), use('wuzhong', [drawnFriend]), { ...blank, gain: true }).c, 0.2);
    const cancelled = person('enemy', 'enemy', 2, { effectCancelled: true });
    const cancelledRun = run(snapshot([owner, cancelled]), use('guohe', [cancelled]),
        { ...blank, gain: true, repeat: true });
    almost(cancelledRun.c, 0); assert.equal(cancelledRun.people.enemy.hand, 2);
    const paid = api.planZhuihuan(snapshot([owner, two], { spade: 3, heart: 3, club: 3 }), guoTwo);
    assert.equal(paid.action, 'SPEND');
    const extra = person('extra', 'enemy', 2);
    const multi = use('guohe', [two], [extra]);
    const multiRun = run(snapshot([owner, two, extra]), multi, { ...blank, extraTarget: 'extra', gain: true });
    almost(multiRun.c, 4.8);
    assert.equal(multiRun.people.enemy.hand, 0); assert.equal(multiRun.people.extra.hand, 0);
    console.log('PASS original strip/steal precedes per-End gain; friend transfer, cancellation and repeat share inventory');

    const shield = { id: 'shield', zone: 'e', name: 'renwang', suit: 'heart', bonus: 1.6, recastable: true };
    const mixedTwo = person('enemy', 'enemy', 2, { moveZones: [shield] });
    const mixedUse = use('guohe', [mixedTwo]);
    const mixedSnapshot = snapshot([owner, mixedTwo], { spade: 3, heart: 3, club: 3 });
    const mixedContext = api.context(mixedSnapshot, mixedUse);
    assert.equal(mixedContext.latent.moveAdversarial, true);
    almost(mixedContext.latent.unknownMass, 0);
    const mixedGain = api.summarize(api.compare(mixedContext, [], blank, [], { ...blank, gain: true },
        'forward', false), true);
    assert.equal(mixedGain.ok, true); almost(mixedGain.score, 1.6);
    assert.equal(api.planZhuihuan(mixedSnapshot, mixedUse).action, 'SPEND');
    assert.equal(api.planOutcome(mixedSnapshot, mixedUse, 3, {}, ['spade', 'heart', 'club']).directHit, false);
    const mixedOne = person('enemy', 'enemy', 1, { moveZones: [shield] });
    const mixedOneContext = api.context(snapshot([owner, mixedOne]), use('guohe', [mixedOne]));
    const uncertainGain = api.summarize(api.compare(mixedOneContext, [], blank, [], { ...blank, gain: true },
        'forward', false), true);
    almost(uncertainGain.score, 0);
    console.log('PASS mixed public equip/anonymous hand uses worst paired choice; common 2-hand payment stays reachable');

    const single = person('enemy', 'enemy', 1, { moveZones: [shield], singleMove: true });
    const singleUse = use('guohe', [single]);
    const singleWorlds = api.worlds(snapshot([owner, single]), singleUse);
    assert.equal(singleWorlds.moveAdversarial, false);
    assert.deepEqual(Array.from(singleWorlds.worlds, w => w.p), [0.5, 0.5]);
    const singleBase = api.summarize(api.compare(api.context(snapshot([owner, single]), singleUse),
        [], blank, [], blank, 'forward', true), true);
    almost(singleBase.score, 1.6);
    const badJudge = { id: 'judge', zone: 'j', name: 'lebu', suit: 'spade', bonus: -2, recastable: true };
    const judged = person('enemy', 'enemy', 0, { moveZones: [badJudge] });
    almost(run(snapshot([owner, judged]), use('guohe', [judged])).c, -2);
    const negativeUse = use('guohe', [judged], [], { materialCost: 0.8 });
    assert.equal(api.planUse(snapshot([owner, judged], {}, [{ id: 'negative', name: 'guohe', suit: 'heart',
        legal: true, candidates: [negativeUse] }])).negative.action, 'HOLD');
    const silver = { id: 'silver', zone: 'e', name: 'baiyin', suit: 'spade', bonus: 0,
        recastable: true, healOnLose: true };
    const silverEnemy = person('enemy', 'enemy', 0, { hp: 2, moveZones: [silver] });
    const silverRun = run(snapshot([owner, silverEnemy]), use('guohe', [silverEnemy]));
    assert.equal(silverRun.people.enemy.hp, 3); almost(silverRun.c, -1.2);
    almost(silverRun.h, 0);
    const singleMany = person('enemy', 'enemy', 1, { hp: 2, singleMove: true, moveZones: [shield, silver] });
    const singleManyUse = use('guohe', [singleMany]);
    const singleManySnapshot = snapshot([owner, singleMany]);
    const singleManyWorlds = api.worlds(singleManySnapshot, singleManyUse);
    assert.equal(singleManyWorlds.moveAdversarial, true);
    assert.deepEqual(Array.from(singleManyWorlds.worlds, w => w.p), [0.5, 0.25, 0.25]);
    const singleManyPaths = api.compare(api.context(singleManySnapshot, singleManyUse),
        [], blank, [], blank, 'forward', true).paths;
    assert.deepEqual(Array.from(singleManyPaths, path => path.p), [0.5, 0.5]);
    assert.ok(singleManyPaths.every(path => path.candidate.h === 0));
    almost(api.summarize({ paths: singleManyPaths, unknownMass: 0, budget: { count: 0 } }, true).score, -0.2);
    const unknownMove = person('enemy', 'enemy', 1, { moveZones: [shield], moveUnknown: true });
    const unknownUse = use('guohe', [unknownMove]);
    const unknownContext = api.context(snapshot([owner, unknownMove]), unknownUse);
    const uncertain = api.summarize(api.compare(unknownContext, [], blank, [],
        { ...blank, gain: true }, 'forward', false), true);
    assert.equal(uncertain.ok, false); assert.equal(unknownContext.latents['|1|0|0'].unknownMass, 1);
    console.log('PASS single-mode 50/50 h/e, harmful judgment and Silver Lion heal are priced');

    const publicEquip = person('enemy', 'enemy', 0, { moveZones: [shield] });
    const knownSuit = run(snapshot([owner, publicEquip], { heart: 2 }),
        use('shunshou', [publicEquip], [], { recastSuit: 'heart' }));
    assert.equal(knownSuit.knownOwnRecast, 1); assert.equal(knownSuit.unknownOwnCards, 0);
    almost(knownSuit.endPotential, api.memoryValue({ heart: 3 }));
    const hiddenSuit = run(snapshot([owner, two], { heart: 2 }),
        use('shunshou', [two], [], { recastSuit: 'heart' }));
    assert.equal(hiddenSuit.knownOwnRecast, 0); assert.equal(hiddenSuit.unknownOwnCards, 1);
    console.log('PASS stolen public card suit recasts exactly; hidden stolen card keeps 25% suit uncertainty');

    const live = fixture(), liveTarget = live.target('opponent', 2);
    live.context._status = { mode: 'two', auto: false };
    live.get.mode = () => 'versus'; live.get.name = card => card.name; live.get.is = { single: () => false };
    live.get.card = () => liveCard;
    live.player.side = true; live.player.hp = 3; live.player.maxHp = 4;
    live.player.countCards = () => live.player.hand.length;
    live.player.getHandcardLimit = () => 4;
    live.player.hasUseTarget = () => true;
    live.player.canUse = (_card, target) => target !== live.player;
    liveTarget.side = false; liveTarget.hp = 3; liveTarget.maxHp = 4;
    const visibleShield = { cardid: 'visibleShield', name: 'renwang', suit: 'heart' };
    const forbiddenEquip = { cardid: 'forbiddenEquip', name: 'bagua', suit: 'club' };
    const visibleJudge = { cardid: 'visibleJudge', name: 'lebu', suit: 'spade' };
    liveTarget.equipment = [visibleShield, forbiddenEquip]; liveTarget.judges = [visibleJudge];
    liveTarget.getCards = zone => {
        if (zone === 'h') throw new Error('enemy hidden hand read');
        return zone === 'e' ? liveTarget.equipment : zone === 'j' ? liveTarget.judges : [];
    };
    live.context.lib.filter.canBeDiscarded = card => card !== forbiddenEquip;
    live.context.lib.filter.canBeGained = card => card !== forbiddenEquip;
    live.context.lib.filter.targetEnabled2 = (_card, _player, target) => target !== live.player;
    live.game.players = [live.player, liveTarget];
    const liveCard = { cardid: 'liveGuo', name: 'guohe', type: 'trick', suit: 'heart',
        info: { selectTarget: 1 } };
    live.player.hand = [liveCard];
    live.player.storage.nihil_liulian = { spade: 3, heart: 3, club: 3, diamond: 0 };
    const phase = { name: 'chooseToUse', type: 'phase', player: live.player, _aiexclude: [],
        filterCard: () => true, filterTarget: () => true, ai1: () => -9, ai2: () => -9 };
    live.state.active = phase;
    const liveAI = live.skills.nihil_menglong.wuyouAI;
    live.skills.nihil_menglong.onChooseToUse(phase);
    const liveSnapshot = liveAI.buildSnapshot(live.player, phase);
    const liveFact = liveSnapshot.ownHand[0].candidates[0].targets[0];
    assert.equal(liveFact.hand, 2);
    assert.deepEqual(Array.from(liveFact.moveZones, z => z.id), ['visibleShield', 'visibleJudge']);
    assert.equal(liveFact.moveZones.find(z => z.id === 'visibleShield').bonus, 1.6);
    liveTarget.judges = [];
    live.skills.nihil_menglong.mod.aiOrder(live.player, liveCard, 0);
    assert.equal(liveAI.preparedCard(live.player, liveCard).action, 'USE');
    assert.ok(phase.ai1(liveCard) > 0); assert.ok(phase.ai2(liveTarget) > 0);
    liveTarget.equipment = []; liveTarget.judges = [];
    const afterPublicChange = liveAI.buildSnapshot(live.player, phase);
    assert.equal(afterPublicChange.ownHand[0].candidates[0].targets[0].moveZones.length, 0);
    liveTarget.hand = 0;
    live.skills.nihil_menglong.mod.aiOrder(live.player, liveCard, 0);
    assert.equal(liveAI.preparedCard(live.player, liveCard), null);
    assert.equal(phase.ai1(liveCard), -9);
    assert.equal(liveAI.planZhuihuan(liveAI.buildSnapshot(live.player), liveAI.useSnapshot(live.player,
        { card: liveCard, targets: [liveTarget], excluded: [], directHit: [], effectCount: 1 })).reason, 'MODEL_UNKNOWN');
    console.log('PASS production public e/j legality, hidden-hand exclusion, ai1/ai2 and uncertain native fallback');

    const crowded = [owner, ...Array.from({ length: 4 }, (_, i) =>
        person('enemy' + i, 'enemy', 2, { moveZones: [{ ...shield, id: 'shield' + i }] }))];
    const crowdedUse = use('guohe', crowded.slice(1));
    const cropped = api.worlds(snapshot(crowded), crowdedUse, { ...blank, repeat: true });
    assert.ok(cropped.worlds.length <= 64);
    assert.equal(cropped.unknownMass, 1);
    const cautious = api.summarize(api.compare(api.context(snapshot(crowded), crowdedUse), [], blank,
        [], { ...blank, repeat: true }, 'forward', false), true);
    assert.equal(cautious.ok, false);
    const overfull = [owner, ...Array.from({ length: 7 }, (_, i) =>
        person('foe' + i, 'enemy', 1, { moveZones: [{ ...shield, id: 'equip' + i }] }))];
    const overfullUse = use('guohe', overfull.slice(1), [], { materialCost: 0.8 });
    assert.equal(api.planUse(snapshot(overfull, {}, [{ id: 'overfull', name: 'guohe', suit: 'heart',
        legal: true, candidates: [overfullUse] }])).overfull, null);
    const manyEquips = person('enemy', 'enemy', 0, { moveZones: Array.from({ length: 65 }, (_, i) =>
        ({ ...shield, id: 'gear' + i })) });
    const tinyTail = api.worlds(snapshot([owner, manyEquips]), use('guohe', [manyEquips]));
    assert.equal(tinyTail.worlds.length, 64);
    assert.equal(tinyTail.unknownMass, 1, 'one dropped adversarial choice is not a 1/65 probability tail');
    console.log('PASS bounded region choices retain unknown mass instead of presenting a false safe gain');

    const f = fixture();
    f.player.storage.nihil_liulian = { spade: 3, heart: 3, club: 3, diamond: 3 };
    f.player.getCards = () => { throw new Error('response skip must not build a planning snapshot'); };
    for (const name of ['shan', 'wuxie']) {
        const response = f.use(name === 'shan' ? 'basic' : 'trick', 'heart'); response.card.name = name;
        const decision = f.skills.nihil_menglong.wuyouAI.planZhuihuan(snapshot([owner]),
            use(name, []));
        assert.equal(decision.reason, 'NOT_APPLICABLE'); assert.equal(decision.context, undefined);
        assert.equal(api.planUse(snapshot([owner], {}, [{ id: name, name, suit: 'heart', legal: true,
            candidates: [use(name, [])] }]))[name], null);
        assert.equal(f.skills.nihil_zhuihuan.filter(response, f.player), true);
        await f.skills.nihil_zhuihuan.content({}, response, f.player);
        assert.equal(f.state.dialog, undefined);
        assert.equal(f.game._nihilWuyouAudit.at(-1).actual, 'SKIP');
        assert.equal(f.game._nihilWuyouAudit.at(-1).reason, 'NOT_APPLICABLE');
    }
    const human = fixture(); human.context._status = { auto: false };
    human.player.isUnderControl = () => true;
    human.player.storage.nihil_liulian = { spade: 1, heart: 0, club: 0, diamond: 0 };
    const humanResponse = human.use('basic', 'spade'); humanResponse.card.name = 'shan';
    await human.skills.nihil_zhuihuan.content({}, humanResponse, human.player);
    assert.ok(human.state.dialog, 'a manually controlled player keeps the legal payment UI');
    console.log('PASS AI response-card entry skips payment UI and 15-set search without changing legal trigger');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
