const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../nihilphile武将包/module/shencangfeng.js"), "utf8"), context);
const h = context.window.nihilModules.shencangfeng.aiHelpers;
function target(id, extras = {}) {
    return { id, hp: 4, hujia: 0, relation: -1, handCount: 0, linked: false,
        armor: "", knownShan: false, critical: false, distance: 1, tieLegal: true, ...extras };
}
function state(extras = {}) {
    const targets = extras.targets || [target("enemy")];
    const effects = Object.fromEntries(targets.map(t => [t.id, t.relation < 0 ? 2 : -2]));
    const ids = targets.filter(t => t.id !== "self").map(t => t.id);
    const card = { id: "sha1", name: "sha", nature: "", color: "red", value: 5,
        legalTargets: ids, futureTargets: ids, effects };
    return { window: "PLAY", selfId: "self", shi: 1, hp: 4, canBank: true, canRefill: false,
        recastRecoverable: true, baseRange: 1, wine: 0, qinggang: false, targets,
        cards: [card], shan: 1, rescue: 0, handLimit: 4, cashSlots: 3,
        defenseGap: false, betterRecovery: false, growthUseful: false,
        refillTargets: ids, refillEffects: effects, ...extras };
}
let count = 0;
function test(name, run) { run(); count++; console.log("PASS", name); }
const ids = result => Array.from(result.cardIds);
test("fixed one Peach requires strict overkill regardless of obsolete rescue or skill fields", () => {
    for (const extras of [{}, { knownSave: 0, saveMargin: 0 }, { knownSave: 9 },
        { unknown: true, unknownSave: true, autoShan: true, responseUnknown: true }]) {
        const s = state({ shi: 0, targets: [target("enemy", { hp: 1, ...extras })] });
        assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).killSignal, false);
        assert.equal(h.decideSlash(s).action, "HOLD_BANK");
        s.shi = 1;
        assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).killSignal, true);
        assert.equal(h.decideSlash(s).action, "ATTACK_KILL");
    }
});
test("zero through two Shi bank ordinary damage", () => {
    for (let shi = 0; shi < 3; shi++) assert.equal(h.decideSlash(state({ shi })).action, "HOLD_BANK");
});
test("two Shi can break bank for a real kill signal", () => {
    assert.equal(h.decideSlash(state({ shi: 2, targets: [target("enemy", { hp: 2 })] })).action, "ATTACK_KILL");
});
test("no bank after prior slash damage and outside turn guards", () => {
    assert.equal(h.decideSlash(state({ shi: 0, canBank: false })).action, "ATTACK_NORMAL");
    assert.equal(h.decideSlash(state({ shi: 1, canBank: false, window: "USE_OUTSIDE" })).action, "HOLD");
});
test("Renwang, vine, silver lion and Qinggang use actual elemental damage", () => {
    const s = state({ shi: 3, targets: [target("enemy", { armor: "renwang" })] });
    s.cards[0].color = "black";
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).hitTier, "BLOCKED");
    s.qinggang = true;
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).damage, 4);
    s.qinggang = false; s.targets[0].armor = "baiyin";
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).damage, 1);
    s.targets[0].armor = "tengjia";
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).damage, 5);
});
test("high value allied chain start counts entire chain once", () => {
    const s = state({ targets: [target("ally", { hp: 4, relation: 1, linked: true }),
        ...[1, 2, 3].map(i => target("e" + i, { hp: 3, linked: true }))] });
    s.cards[0].nature = "thunder";
    const c = h.analyzeSlash(s, s.cards[0], s.targets[0]);
    assert.equal(c.E, 6); assert.equal(c.F, 2); assert.equal(c.net, 4); assert.equal(c.largeChain, true);
    assert.equal(h.decideSlash(s, [c]).candidate.targetId, "ally");
    s.targets[0].hp = 2;
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).largeChain, false);
    s.targets[0].hp = 1; s.targets.slice(1).forEach(t => t.hp = 1);
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).largeChain, true);
    s.targets[0].critical = true;
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).largeChain, false);
});
test("public Shan and unsupported own source cannot promise allied chain or kill", () => {
    const s = state({ shi: 3, sourceUnknown: true, targets: [target("enemy", { hp: 1 })] });
    assert.equal(h.decideSlash(s).action, "HOLD");
    s.sourceUnknown = false; s.targets[0].knownShan = true;
    assert.equal(h.decideSlash(s).action, "HOLD");
    s.targets[0].knownShan = false; s.targets[0].hujia = 4;
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).killSignal, false);
});
test("zero cost and actual death are separate from predicted lethality", () => {
    assert.equal(h.chooseBadaoCost(state({ shi: 0 }), {}).action, "CLEAR_SHI");
    assert.equal(h.chooseBadaoCost(state(), { killed: true }).action, "NO_PAYMENT");
    assert.equal(h.chooseBadaoCost(state({ shi: 3, hp: 2 }), { killed: false }).action, "CLEAR_SHI");
});
test("keep Shi for next turn without current slash uses", () => {
    const s = state({ shi: 3, canBank: false, targets: [target("enemy", { hp: 2, handCount: 1 })] });
    s.cards[0].legalTargets = [];
    assert.equal(h.chooseBadaoCost(s, {}).reason, "KEEP_FOR_NEXT_TURN");
    s.hp = 3;
    assert.equal(h.chooseBadaoCost(s, {}).action, "CLEAR_SHI");
    s.rescue = 1;
    assert.equal(h.chooseBadaoCost(s, {}).action, "LOSE_HP");
    s.nextTurnBlocked = true;
    assert.equal(h.chooseBadaoCost(s, {}).action, "CLEAR_SHI");
});
test("refill enables future attack; both cost branches include end-phase Shi", () => {
    const s = state({ shi: 3, cards: [], canRefill: true,
        targets: [target("enemy", { hp: 2, handCount: 1 })] });
    assert.equal(h.chooseBadaoCost(s, {}).action, "LOSE_HP");
    s.targets[0].hp = 1;
    assert.equal(h.chooseBadaoCost(s, {}).action, "CLEAR_SHI");
    s.canBank = false; s.canRefill = false;
    assert.equal(h.chooseBadaoCost(s, {}).action, "CLEAR_SHI");
});
test("future color is unknown and cannot assume red refill beats Renwang", () => {
    const s = state({ shi: 3, cards: [], canRefill: true,
        targets: [target("enemy", { hp: 2, armor: "renwang", handCount: 1 })] });
    assert.equal(h.chooseBadaoCost(s, {}).action, "CLEAR_SHI");
});
test("clear Shi rechecks range and nested payments remain conservative", () => {
    const s = state({ shi: 3, canBank: false, targets: [target("enemy", { hp: 1, distance: 3 })] });
    assert.equal(h.chooseBadaoCost(s, {}).action, "LOSE_HP");
    assert.equal(h.chooseBadaoCost(s, { nested: true }).action, "CLEAR_SHI");
    assert.equal(h.decideSlash({ ...s, shi: 0 }).action, "HOLD");
});
test("recast all at two Shi, native element only below two, one without refill", () => {
    const s = state();
    s.cards.push({ ...s.cards[0], id: "thunder", nature: "thunder" });
    assert.deepEqual(ids(h.chooseRecastCards(s)), ["sha1"]);
    s.shi = 2;
    assert.deepEqual(ids(h.chooseRecastCards(s)), ["sha1", "thunder"]);
    s.canBank = false;
    assert.equal(h.chooseRecastCards(s).cardIds.length, 1);
    s.defenseGap = true;
    assert.equal(h.chooseRecastCards(s).cardIds.length, 2);
    s.defenseGap = false; s.canBank = true; s.shi = 1; s.recastRecoverable = false;
    assert.equal(h.chooseRecastCards(s).cardIds.length, 1);
});
test("link cancellation, threatened ally unlinking, profitable mixed chain preserved", () => {
    const s = state({ shi: 2, canRefill: true, targets: [target("ally", { hp: 5, relation: 1, linked: true }),
        target("e1", { hp: 4, linked: true }), target("e2", { hp: 4, linked: true })] });
    assert.equal(h.chooseLinkTargets(s, 2).reason, "NO_LINK_GAIN");
    s.nextTurnBlocked = true;
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 2).targetIds), ["ally"]);
    s.targets.forEach(t => t.linked = false);
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 2).targetIds), ["e1", "e2"]);
});
test("defense outranks attack in normal discard and decisions are pure", () => {
    const s = state({ handLimit: 2, canBank: false });
    s.cards.push({ id: "shan", name: "shan", value: 5 }, { id: "tao", name: "tao", value: 6 });
    const original = JSON.stringify(s);
    assert.deepEqual(ids(h.chooseKeepCards(s)), ["tao", "shan"]);
    assert.equal(JSON.stringify(h.decideSlash(s)), JSON.stringify(h.decideSlash(s)));
    assert.equal(JSON.stringify(s), original);
});
test("two recasts can seed a new enemy chain from no linked players", () => {
    const s = state({ shi: 2, canRefill: true, targets: [target("e1"), target("e2")] });
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 2).targetIds), ["e1", "e2"]);
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 1).targetIds), ["e1"]);
});
test("enemy layout ignores hands, rescue uncertainty, low Shi and absent elemental material", () => {
    const s = state({ shi: 0, canRefill: false, cards: [], nextTurnBlocked: true,
        enemyElementalThreat: true, targets: [target("e1", { handCount: 3, unknownSave: true }),
        target("e2", { handCount: 3 }), target("neutral", { relation: 0 }),
        target("linkedEnemy", { linked: true }), target("illegalEnemy", { tieLegal: false })] });
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 2).targetIds), ["e1", "e2"]);
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 1).targetIds), ["e1"]);
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 0).targetIds), []);
});
test("three links evaluate an ordinary sacrificial native ally with two enemies together", () => {
    const s = state({ shi: 3, canBank: false, targets: [target("ally", { relation: 1, hp: 1,
        nativeAI: true, friendlySource: true, handCount: 3 }),
        target("e1", { hp: 3, handCount: 3 }), target("e2", { hp: 3, handCount: 3 })] });
    assert.deepEqual(new Set(Array.from(h.chooseLinkTargets(s, 3).targetIds)), new Set(["ally", "e1", "e2"]));
    s.targets[0].critical = true;
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 3).targetIds), ["e1", "e2"]);
    s.targets[0].critical = false; s.targets[0].id = "self";
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 3).targetIds), ["e1", "e2"]);
});
test("friend layout needs real material, trusted cooperation and worthwhile whole-chain damage", () => {
    const s = state({ shi: 3, canBank: false, targets: [target("ally", { relation: 1, hp: 1,
        nativeAI: true, friendlySource: true, handCount: 3 }),
        target("e1", { hp: 6, handCount: 3 }), target("e2", { hp: 6, handCount: 3 })] });
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 3).targetIds), ["e1", "e2"]);
    s.targets.slice(1).forEach(t => { t.hp = 3; });
    for (const extras of [{ enemyElementalThreat: true }, { sourceUnknown: true }, { cards: [] },
        { shi: 0 }, { nextTurnBlocked: true }]) {
        assert.deepEqual(Array.from(h.chooseLinkTargets({ ...s, ...extras }, 3).targetIds), ["e1", "e2"]);
    }
    s.targets[0].nativeAI = false;
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 3).targetIds), ["e1", "e2"]);
});
test("safe native friend already linked stays linked against three-hand enemies", () => {
    const s = state({ shi: 3, canBank: false, targets: [target("ally", { relation: 1, hp: 5,
        linked: true, nativeAI: true, friendlySource: true, handCount: 3 }),
        target("e1", { hp: 4, handCount: 3, linked: true }), target("e2", { hp: 4, handCount: 3, linked: true })] });
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 2).targetIds), []);
    s.enemyElementalThreat = true;
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 2).targetIds), ["ally"]);
});
test("enemy layout neither forces an attack nor mutates its prediction", () => {
    const s = state({ shi: 3, targets: [target("e1", { handCount: 3 }),
        target("e2", { handCount: 3 })] });
    const before = JSON.stringify(s);
    const plan = h.chooseLinkTargets(s, 2);
    assert.deepEqual(Array.from(plan.targetIds), ["e1", "e2"]);
    assert.equal(JSON.stringify(s), before);
    const linked = { ...s, targets: s.targets.map(t => ({ ...t, linked: true })) };
    assert.equal(h.decideSlash(linked).action, "HOLD");
    assert.ok(linked.targets.every(t => !h.analyzeSlash(linked, linked.cards[0], t).largeChain));
});
test("other player uncertainty cannot veto extending an existing safe allied chain", () => {
    const s = state({ shi: 3, canBank: false, targets: [target("ally", { relation: 1, hp: 5,
        linked: true, nativeAI: true, friendlySource: true, handCount: 3 }),
        target("e1", { hp: 3, handCount: 3, linked: true }), target("e2", { hp: 3, handCount: 3, linked: true }),
        target("unknownEnemy", { unknown: true })] });
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 1).targetIds), ["unknownEnemy"]);
});
test("a native ally may replace any one of the enemy layout slots", () => {
    const s = state({ shi: 3, canBank: false, targets: [target("ally", { relation: 1, hp: 1,
        nativeAI: true, friendlySource: true, handCount: 3 }), target("tank", { hp: 20, handCount: 3 }),
        target("e1", { hp: 3, handCount: 3 }), target("e2", { hp: 3, handCount: 3 })] });
    assert.deepEqual(new Set(Array.from(h.chooseLinkTargets(s, 3).targetIds)), new Set(["ally", "e1", "e2"]));
});
test("public team victory can sacrifice an ordinary ally but never self or protected lord", () => {
    const s = state({ shi: 3, publicTeams: true, targets: [target("ally", { relation: 1, hp: 1, linked: true }),
        target("e1", { hp: 1, linked: true }), target("e2", { hp: 1, linked: true })] });
    const analyze = () => h.analyzeSlash(s, s.cards[0], s.targets[0]);
    assert.equal(analyze().victorySignal, true);
    assert.ok(analyze().E < 2 * analyze().F, "victory crosses the ordinary sacrifice threshold");
    assert.equal(h.decideSlash(s).action, "ATTACK_CHAIN");
    assert.notEqual(h.chooseBadaoCost(s, { killed: false }).action, "NO_PAYMENT");
    s.targets[0].critical = true;
    assert.equal(analyze().largeChain, false);
    s.targets[0].critical = false;
    s.targets.push(target("self", { relation: 1, hp: 1, linked: true }));
    assert.equal(analyze().largeChain, false);
});
test("hidden identity and a surviving enemy cannot claim a team victory", () => {
    const s = state({ shi: 3, targets: [target("ally", { relation: 1, hp: 1, linked: true }),
        target("e1", { hp: 1, linked: true }), target("e2", { hp: 1, linked: true })] });
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).largeChain, false);
    s.publicTeams = true;
    s.targets.push(target("survivor"));
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).victorySignal, false);
    s.targets.pop(); s.sourceUnknown = true;
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).victorySignal, false);
});
test("native friendly elemental cooperation precedes Shan and Bagua but requires safe chain", () => {
    const s = state({ shi: 3, targets: [target("ally", { relation: 1, hp: 5, linked: true,
        nativeAI: true, friendlySource: true, knownShan: true, armor: "bagua", handCount: 4 }),
        target("e1", { hp: 4, linked: true }), target("e2", { hp: 4, linked: true })] });
    const analyze = () => h.analyzeSlash(s, s.cards[0], s.targets[0]);
    assert.equal(analyze().hitTier, "HIGH");
    assert.equal(analyze().largeChain, true);
    s.targets[0].nativeAI = false;
    assert.equal(analyze().hitTier, "NORMAL");
    s.targets[0].nativeAI = true; s.targets[0].friendlySource = false;
    assert.equal(analyze().hitTier, "NORMAL");
    s.targets[0].friendlySource = true;
    assert.equal(analyze().hitTier, "HIGH");
    s.targets[0].critical = true; s.targets[0].hp = 1;
    assert.equal(analyze().largeChain, false);
});
test("linking a native ally may unlock a profitable existing enemy chain", () => {
    const s = state({ shi: 3, canBank: false, targets: [target("ally", { relation: 1, hp: 5,
        nativeAI: true, friendlySource: true, knownShan: true }),
        target("e1", { hp: 5, handCount: 3, linked: true }), target("e2", { hp: 5, handCount: 3, linked: true })] });
    assert.deepEqual(Array.from(h.chooseLinkTargets(s, 1).targetIds), ["ally"]);
    s.targets[0].hp = 1; s.targets[0].critical = true;
    assert.equal(h.chooseLinkTargets(s, 1).targetIds.length, 0);
});
test("one legal strip crosses two hands to a kill or pressure and never assumes known Shan disappears", () => {
    const s = state({ shi: 3, targets: [target("enemy", { hp: 1, handCount: 2, ejCount: 0 })] });
    s.cards.push({ id: "strip", name: "guohe", handTargets: ["enemy"] });
    assert.equal(h.choosePreparation(s).action, "PREPARE_STRIP");
    assert.equal(h.choosePreparation(s).cardId, "strip");
    s.targets[0].hp = 6;
    assert.equal(h.choosePreparation(s).candidate.hitTier, "HIGH");
    s.targets[0].handCount = 3;
    assert.equal(h.choosePreparation(s), null);
    s.targets[0].handCount = 2; s.targets[0].knownShan = true;
    assert.equal(h.choosePreparation(s), null);
    s.targets[0].knownShan = false; s.targets[0].ejCount = 1;
    assert.equal(h.choosePreparation(s), null);
    s.targets[0].ejCount = 0; s.cards[1].handTargets = [];
    assert.equal(h.choosePreparation(s), null);
});
test("discard defense wins before a single reserved strip, which wins before spare offense", () => {
    const s = state({ handLimit: 3, canBank: false });
    s.cards.push({ id: "strip", name: "guohe" }, { id: "strip2", name: "shunshou" },
        { id: "shan", name: "shan" }, { id: "tao", name: "tao" });
    assert.deepEqual(ids(h.chooseKeepCards(s)), ["tao", "shan", "strip"]);
});
test("future two-to-three Shi uses sampled fire effect against Vine", () => {
    const s = state({ shi: 2, canRefill: true, targets: [target("enemy", { hp: 2, handCount: 1, armor: "tengjia" })] });
    s.cards[0].effects.enemy = 0;
    s.cards[0].futureEffects = { fire: { enemy: 2 } };
    s.refillEffects.enemy = 0; s.refillFutureEffects = { fire: { enemy: 2 } };
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).hitTier, "BLOCKED");
    const future = { ...s, shi: 3, future: true };
    assert.equal(h.analyzeSlash(future, future.cards[0], future.targets[0]).normal, true);
    assert.equal(h.chooseBadaoCost(s, {}).reason, "KEEP_FOR_NEXT_TURN");
});
test("other player rescue uncertainty does not veto fixed-Peach public victory", () => {
    const s = state({ shi: 3, publicTeams: true, targets: [target("ally", { hp: 1, relation: 1, linked: true }),
        target("e1", { hp: 1, linked: true, unknownSave: true }), target("e2", { hp: 1, linked: true })] });
    assert.equal(h.analyzeSlash(s, s.cards[0], s.targets[0]).victorySignal, true);
});
test("unknown source damage cannot attack a chain with a friend even when predicted armor absorbs all friend damage", () => {
    const s = state({ shi: 3, canBank: false, sourceUnknown: true, targets: [
        target("lord", { hp: 1, hujia: 4, relation: 1, critical: true, linked: true }),
        target("e1", { hp: 4, linked: true }), target("e2", { hp: 4, linked: true })] });
    assert.equal(h.decideSlash(s).action, "HOLD");
    s.targets[0].linked = false;
    assert.equal(h.decideSlash(s).action, "HOLD", "unsupported source cannot establish a reliable hit");
});
test("many hands, public Shan and effective Bagua always hold without vulnerability evidence", () => {
    for (const defense of [{ handCount: 3 }, { handCount: 3, knownShan: true }, { handCount: 0, armor: "bagua" }]) {
        const s = state({ shi: 17, targets: [target("enemy", { hp: 4, ...defense })] });
        const plan = h.decideSlash(s);
        assert.equal(plan.action, "HOLD");
        const candidate = h.analyzeSlash(s, s.cards[0], s.targets[0]);
        assert.equal(candidate.hitTier, "NORMAL");
        assert.equal(candidate.normal, false);
        assert.equal(candidate.killSignal, false);
        assert.equal(candidate.victorySignal, false);
        assert.equal(h.chooseBadaoCost(s, { killed: false }).action, "CLEAR_SHI");
    }
});
test("vulnerability memory permits many-hand pressure but never overrides public defenses", () => {
    const base = state({ shi: 17, targets: [target("enemy", { hp: 4, handCount: 3 })] });
    for (const extras of [{ growthUseful: true }, { window: "USE_OUTSIDE" }, { sourceUnknown: true }]) {
        assert.equal(h.decideSlash({ ...base, ...extras }).action, "HOLD");
    }
    assert.equal(h.decideSlash({ ...base, shi: 2 }).action, "HOLD_BANK");
    for (const extras of [{ unknown: true }, { unknownSave: true }, { knownSave: 14 }]) {
        const s = { ...base, targets: [target("enemy", { hp: 4, handCount: 3, ...extras })] };
        assert.equal(h.decideSlash(s).action, "HOLD");
    }
    for (const hp of [18, 19]) {
        assert.equal(h.decideSlash({ ...base, targets: [target("enemy", { hp, handCount: 3 })] }).action, "HOLD");
    }
    assert.equal(h.decideSlash({ ...base, targets: [target("enemy", { hp: 17, handCount: 3 })] }).action, "HOLD");
    assert.equal(h.decideSlash({ ...base, targets: [target("enemy", { hp: 4, handCount: 3, hujia: 18 })] }).action, "HOLD");
    const friend = target("ally", { relation: 1, hp: 20, linked: true });
    const linked = { ...base, targets: [target("enemy", { hp: 4, handCount: 3, linked: true }), friend] };
    assert.equal(h.decideSlash(linked).action, "HOLD");
    const marked = state({ shi: 3, targets: [target("enemy", { hp: 2, handCount: 5, noShanRecord: true })] });
    assert.equal(h.decideSlash(marked).action, "ATTACK_KILL");
    for (const defense of [{ knownShan: true }, { armor: "bagua" }]) {
        marked.targets[0] = target("enemy", { hp: 2, handCount: 5, noShanRecord: true, ...defense });
        assert.equal(h.decideSlash(marked).action, "HOLD");
    }
});
test("effective two-to-one preparation opens a reliable hit from holding", () => {
    const s = state({ shi: 17, targets: [target("enemy", { hp: 4, handCount: 2, ejCount: 0 })] });
    s.cards.push({ id: "strip", name: "guohe", handTargets: ["enemy"] });
    assert.equal(h.decideSlash(s).action, "HOLD");
    const preparation = h.choosePreparation(s);
    assert.equal(preparation.action, "PREPARE_STRIP");
    assert.equal(preparation.candidate.hitTier, "HIGH");
});
test("every normal attack and defense cash gate requires vulnerability even at two enemy HP", () => {
    for (const shi of [0, 1, 2, 3, 17]) for (const canBank of [false, true]) {
        const s = state({ shi, canBank, hp: 1, defenseGap: true, cashSlots: 2,
            targets: [target("enemy", { hp: 2, handCount: 5 })] });
        assert.ok(!h.decideSlash(s).action.startsWith("ATTACK"));
        s.targets[0].armor = "renwang"; s.cards[0].color = "black";
        assert.ok(!h.decideSlash(s).action.startsWith("ATTACK"));
        if (shi >= 2) {
            s.targets[0].noShanRecord = true;
            assert.equal(h.decideSlash(s).action, "ATTACK_CASH");
        }
    }
});
console.log(`${count} decision tests passed`);
