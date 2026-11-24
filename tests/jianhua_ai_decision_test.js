// Fixture regressions; these checks do not certify a native match.
const assert = require("node:assert/strict");
const { fixture } = require("./jianhua_ai_fixture.js");
const cases = [], test = (name, run) => cases.push({ name, run });
const snapshot = f => f.ai.buildSnapshot(f.owner, f.root());
function decide(f) { const r = f.root(); f.ai.prepare(r); return { r, d: r._nihilJianhuaDecision }; }
function step(f, s, select) {
    const action = f.ai.candidates(s.state, s.env, false).find(select); assert.ok(action, "concrete action");
    const result = f.ai.evaluate(s.state, action, s.env); assert.equal(result.invalid, undefined);
    const outcome = result.outcomes.find(o => o.events.some(e => e.kind === "damage")) || result.outcomes[0];
    return { ...s, state: outcome.state, action, outcome };
}
test("three zero-flow slashes expose normal and both forms and preserve three attacks", () => {
    const f = fixture(); f.player("enemy", -5, 12); f.owner.hand = [f.card("a"), f.card("b"), f.card("c")];
    const s = snapshot(f); for (const form of ["nihil_zhuofeng", "nihil_hengsha"]) assert.ok(s.candidates.some(a => a.form === form));
    assert.ok(s.candidates.some(a => a.kind === "NORMAL_SHA")); const { d } = decide(f); assert.ok(d.score > 0);
    assert.ok(d.witness.flatMap(x => x.events).filter(e => e.kind === "damage").length >= 3);
});
test("six-flow one-slash A empty-slot five-step four-attack witness", () => {
    const f = fixture(); f.player("enemy", -5, 20); f.owner.hand = [f.card("A", "sword"), f.card("S")]; f.owner.storage.nihil_xinliu = 6;
    let s = snapshot(f), flows = [], attacks = 0;
    for (const select of [a => a.form === "nihil_zhuofeng", a => a.form === "sword", a => a.form === "nihil_hengsha", a => a.form === "sword", a => a.kind === "NORMAL_SHA"]) {
        s = step(f, s, select); flows.push(s.state.flow); attacks += s.outcome.events.filter(e => e.kind === "damage").length;
    }
    assert.deepEqual(flows, [9, 6, 4, 0, 3]); assert.equal(attacks, 4);
    const { d } = decide(f); assert.ok(d.witness.length >= 5); assert.equal(d.witness.flatMap(x => x.events).filter(e => e.kind === "damage").length, 4);
});
test("misses never borrow flow and distinguish hand shan from Bagua", () => {
    const f = fixture(), enemy = f.player("enemy", -5, 10); enemy.hand = [f.card("secret1"), f.card("secret2")]; f.equip(enemy, "bagua");
    f.owner.hand = [f.card("S"), f.card("A", "sword")]; const s = snapshot(f);
    const results = f.ai.evaluate(s.state, s.candidates.find(a => a.form === "nihil_zhuofeng"), s.env).outcomes;
    const hit = results.find(o => o.events.some(e => e.kind === "damage")), hand = results.find(o => o.events.some(e => e.source === "hand")), bagua = results.find(o => o.events.some(e => e.source === "bagua"));
    assert.equal(hit.state.flow, 3); assert.equal(hand.state.flow, 0); assert.equal(bagua.state.flow, 0);
    assert.equal(hand.state.people.find(p => p.id === "enemy").hands, 1); assert.equal(bagua.state.people.find(p => p.id === "enemy").hands, 2);
    assert.equal(hand.combat, 1); assert.equal(bagua.combat, 0);
});
test("non-vulnerable attacks stay positive without reading enemy hand identities", () => {
    const f = fixture(), enemy = f.player("enemy"); enemy.hand = [f.card("secret1"), f.card("secret2")];
    const name = f.get.name; f.get.name = card => { assert.ok(!enemy.hand.includes(card)); return name(card); };
    f.owner.hand = [f.card("S")]; assert.ok(decide(f).d.score > 0);
});
test("all five reported standard weapons receive complete evaluations despite a Shan-only global mod", () => {
    const f = fixture(); f.player("enemy", -5, 8); const names = ["cixiong", "zhangba", "qilin", "guanshi", "zhuge"];
    f.owner.hand = names.map((n, i) => f.card("W" + i, n)).concat(f.card("S"), f.card("D", "shan"), f.card("P1", "tao"), f.card("P2", "tao"));
    f.lib.skill.only_shan = { mod: { cardEnabled(card) { if (card.name === "shan") return false; } } }; f.lib.skill.global.push("only_shan");
    const { d } = decide(f); for (const name of names) { const c = d.trace.candidates.find(c => c.form === name); assert.ok(c, name); assert.ok(c.results > 0); assert.ok(Number.isFinite(c.score)); }
    assert.ok(d.score > 0); assert.ok(d.trace.expanded <= 8192); assert.ok(d.trace.candidates.every(c => c.expanded <= 256));
});
test("stolen public weapons become concrete follow-up materials", () => {
    const f = fixture(), enemy = f.player("enemy", -5, 10); f.equip(enemy, "zhuge"); f.owner.hand = [f.card("S")];
    const s = step(f, snapshot(f), a => a.form === "nihil_zhuofeng"); assert.ok(s.state.hand.some(c => c.id === "equip-zhuge"));
    assert.ok(f.ai.candidates(s.state, s.env, false).some(a => a.form === "zhuge")); assert.equal(s.state.people.find(p => p.id === "enemy").equips.length, 0);
});
test("crossbow normal attacks and Lingren compete after the normal quota was used", () => {
    const f = fixture(); f.player("enemy", -5, 20); f.equip(f.owner, "zhuge"); f.owner.storage.nihil_jianhua_skill_used = ["zhuge"]; f.owner.used = 1;
    f.owner.hand = [f.card("a"), f.card("b"), f.card("c")]; const { d } = decide(f);
    assert.ok(d.trace.candidates.some(c => c.kind === "NORMAL_SHA" && c.score > 0)); assert.ok(d.trace.candidates.some(c => c.kind === "LINGREN" && c.score > 0));
});
test("Guohe must preserve a crossbow for Zhuofeng's steal-and-equip follow-up", () => {
    const f = fixture(), enemy = f.player("enemy"); f.equip(enemy, "zhuge"); f.equip(f.owner, "nihil_zhuofeng", f.card("old"));
    f.owner.storage.nihil_jianhua_skill_used = ["nihil_zhuofeng", "nihil_hengsha"]; f.owner.hand = [f.card("S"), f.card("G", "guohe")];
    const { d } = decide(f); assert.equal(d.kind, "NORMAL_SHA"); assert.ok(d.witness.some(x => x.action.includes("zhuge"))); assert.ok(d.trace.candidates.some(c => c.kind === "CONTROL"));
});
test("public armor removal can beat a blocked black slash", () => {
    const f = fixture(), enemy = f.player("enemy"); f.equip(enemy, "renwang"); f.owner.storage.nihil_jianhua_skill_used = ["nihil_zhuofeng", "nihil_hengsha"];
    f.owner.hand = [{ ...f.card("S"), color: "black" }, f.card("G", "guohe")]; const { d } = decide(f);
    assert.equal(d.kind, "CONTROL"); assert.equal(d.controlId, "equip-renwang");
});
test("Wine cannot close a positive Hengsha attack by causing an ally to enter dying", () => {
    const f = fixture(); for (let n = 1; n <= 3; n++) f.player("enemy" + n); f.player("friend", 5, 2); f.equip(f.owner, "nihil_hengsha", f.card("old"));
    f.owner.hadDamage = true; f.owner.storage.nihil_jianhua_skill_used = ["nihil_zhuofeng", "nihil_hengsha"]; f.owner.hand = [f.card("W", "jiu"), f.card("S")];
    const { d } = decide(f); assert.equal(d.kind, "NORMAL_SHA"); assert.ok(d.score > 0); assert.ok(d.trace.candidates.find(c => c.kind === "WINE").score <= 0);
});
test("Wine competes again with a healthy ally and a public enemy dying opportunity", () => {
    const f = fixture(); for (let n = 1; n <= 3; n++) f.player("enemy" + n, -5, 2); f.player("friend", 5, 5); f.equip(f.owner, "nihil_hengsha", f.card("old"));
    f.owner.hadDamage = true; f.owner.storage.nihil_jianhua_skill_used = ["nihil_zhuofeng", "nihil_hengsha"]; f.owner.hand = [f.card("W", "jiu"), f.card("S")]; assert.equal(decide(f).d.kind, "WINE");
});
test("a horse cannot precede a safe Hengsha slash when its distance change would kill an ally", () => {
    const f = fixture(); for (let n = 1; n <= 3; n++) f.player("enemy" + n); f.player("friend", 5, 1);
    f.equip(f.owner, "nihil_hengsha", f.card("old")); f.owner.distances.friend = 2;
    f.owner.hadDamage = true; f.owner.storage.nihil_jianhua_skill_used = ["nihil_zhuofeng", "nihil_hengsha"];
    f.owner.hand = [f.card("S"), f.card("M", "chitu")];
    const { r, d } = decide(f); assert.equal(d.kind, "NORMAL_SHA"); assert.equal(d.selection.physicalCardId, "S");
    assert.equal(r.ai1(f.owner.hand[0]), 3); assert.equal(r.ai1(f.owner.hand[1]), 0);
    assert.equal(f.mod.skill.nihil_jianhua_skill.mod.aiOrder(f.owner, f.owner.hand[1]), 0);
    const equipped = step(f, snapshot(f), a => a.kind === "PREP_EQUIP");
    const attacks = f.ai.candidates(equipped.state, equipped.env, false).filter(a => a.sha);
    assert.ok(attacks.length > 0); assert.ok(attacks.every(a => f.ai.evaluate(equipped.state, a, equipped.env).invalid.includes("DYING")));
});
test("a horse is scheduled first when it opens a safe Hengsha attack", () => {
    const f = fixture(); for (let n = 1; n <= 3; n++) { f.player("enemy" + n); f.owner.distances["enemy" + n] = 2; }
    f.player("friend", 5, 1); f.owner.distances.friend = 3; f.equip(f.owner, "nihil_hengsha", f.card("old"));
    f.owner.hadDamage = true; f.owner.storage.nihil_jianhua_skill_used = ["nihil_zhuofeng", "nihil_hengsha"];
    f.owner.hand = [f.card("S"), f.card("M", "chitu")];
    const { r, d } = decide(f); assert.equal(d.kind, "PREP_EQUIP"); assert.equal(d.selection.physicalCardId, "M");
    assert.equal(r.ai1(f.owner.hand[1]), 3); assert.equal(r.ai1(f.owner.hand[0]), 0);
    const equipped = step(f, snapshot(f), a => a.kind === "PREP_EQUIP"), attacked = step(f, equipped, a => a.kind === "NORMAL_SHA");
    assert.deepEqual(Array.from(attacked.action.targets), ["enemy1", "enemy2", "enemy3"]);
    assert.equal(attacked.state.people.find(p => p.id === "friend").hp, 1);
    for (let n = 1; n <= 3; n++) assert.equal(attacked.state.people.find(p => p.id === "enemy" + n).hp, 3);
});
test("preparation equipment retains native fallback when no complete plan has positive value", () => {
    for (const name of ["bagua", "dilu", "chitu", "test_equip6"]) {
        const f = fixture(); f.lib.card.test_equip6 = { type: "equip", subtype: "equip6" };
        f.owner.hadDamage = true; f.owner.hand = [f.card("M", name)];
        const { r, d } = decide(f); assert.equal(d.kind, "NATIVE");
        assert.equal(r.ai1(f.owner.hand[0]), 7); assert.equal(f.get.order(f.owner.hand[0], f.owner), 5);
    }
});
test("armor absorption grants source flow while HP-loss reward remains zero", () => {
    const f = fixture({ discardSha: true }), enemy = f.player("enemy"); enemy.hujia = 1; f.owner.hand = [f.card("S")]; const s = step(f, snapshot(f), a => a.kind === "NORMAL_SHA");
    const e = s.outcome.events.find(e => e.kind === "damage"); assert.equal(e.num, 1); assert.equal(e.hpLoss, 0); assert.equal(e.armorLoss, 1);
    assert.equal(s.state.flow, 3); assert.equal(s.outcome.combat, 2); assert.equal(f.ai.fallbackValue(s.state), 0);
});
test("end-phase pickup is only opportunity cost and never a current usable card", () => {
    const f = fixture({ discardSha: true }); f.player("enemy"); f.owner.hand = [f.card("S")]; const s = snapshot(f);
    assert.equal(f.ai.fallbackValue(s.state), 1.5); assert.equal(s.state.hand.length, 1); assert.ok(decide(f).d.score > 0);
    assert.equal(f.ai.fallbackValue(step(f, s, a => a.kind === "NORMAL_SHA").state), 0);
});
test("black Lingren material creates a colorless additional slash against Renwang", () => {
    const f = fixture(), enemy = f.player("enemy"); f.equip(enemy, "renwang"); f.owner.hand = [{ ...f.card("S"), color: "black" }]; const s = snapshot(f);
    assert.ok(f.ai.evaluate(s.state, s.candidates.find(a => a.kind === "NORMAL_SHA"), s.env).outcomes.every(o => !o.events.some(e => e.kind === "damage")));
    const hit = step(f, s, a => a.form === "nihil_zhuofeng"); assert.equal(hit.action.sha.color, "none"); assert.ok(hit.outcome.events.some(e => e.kind === "damage"));
});
test("chain self-hit recovers own Zhuofeng without fee and removes its continuing effect", () => {
    const f = fixture(), enemy = f.player("enemy", -5, 8); f.owner.linked = enemy.linked = true; f.equip(f.owner, "nihil_zhuofeng", f.card("old"));
    f.owner.storage.nihil_jianhua_skill_used = ["nihil_zhuofeng"]; f.owner.hand = [f.card("fire", "sha", "fire")]; const s = step(f, snapshot(f), a => a.kind === "NORMAL_SHA");
    const self = s.state.people.find(p => p.id === "owner"); assert.equal(self.hp, 3); assert.equal(self.equips.length, 0);
    assert.ok(s.state.hand.some(c => c.id === "old")); assert.equal(s.state.cost, 6); assert.equal(s.state.flow, 6); assert.equal(s.outcome.combat, -2);
});
test("self dying chain risk rejects only the attribute actions", () => {
    const f = fixture(), enemy = f.player("enemy"); f.owner.hp = 1; f.owner.linked = enemy.linked = true; f.owner.hand = [f.card("fire", "sha", "fire"), f.card("normal")];
    const { d } = decide(f); assert.ok(d.selection.materialIds.includes("normal")); assert.ok(d.trace.candidates.filter(c => c.materials.includes("fire")).every(c => c.reason.includes("DYING")));
});
test("later Hengsha target keeps its direct damage after taking chain damage and unlinking", () => {
    const f = fixture(), first = f.player("first", -5, 8), later = f.player("later", -5, 8); first.linked = later.linked = true; f.equip(f.owner, "nihil_hengsha"); f.owner.hand = [f.card("fire", "sha", "fire")];
    const s = step(f, snapshot(f), a => a.kind === "NORMAL_SHA"); assert.equal(s.state.people.find(p => p.id === "first").hp, 7); assert.equal(s.state.people.find(p => p.id === "later").hp, 6); assert.equal(s.state.flow, 9);
});
test("real seat links order targets even if game.players begins at another seat", () => {
    const f = fixture(), a = f.player("a", -5, 8), b = f.player("b", -5, 8); f.owner.nextSeat = b; b.nextSeat = a; a.nextSeat = f.owner; f.game.players = [a, f.owner, b];
    f.equip(f.owner, "nihil_hengsha"); f.owner.hand = [f.card("S")]; assert.deepEqual(Array.from(snapshot(f).candidates.find(x => x.kind === "NORMAL_SHA").targets), ["b", "a"]);
});
test("native fallback never re-admits a known ally-dying Hengsha slash", () => {
    const f = fixture(); f.player("enemy"); f.player("friend", 5, 1); f.equip(f.owner, "nihil_hengsha"); f.owner.storage.nihil_jianhua_skill_used = ["nihil_zhuofeng", "nihil_hengsha"]; f.owner.hand = [f.card("S")];
    const { r, d } = decide(f); assert.equal(d.kind, "NATIVE"); assert.equal(r.ai1(f.owner.hand[0]), 0); assert.equal(f.mod.skill.nihil_jianhua_skill.mod.aiOrder(f.owner, f.owner.hand[0]), 0);
});
test("heal and information scheduling retain native attack order", () => {
    const f = fixture(); f.player("enemy", -5, 8); f.owner.hp = 2; f.owner.hand = [f.card("S"), f.card("P", "tao"), f.card("D", "wuzhong")]; assert.equal(decide(f).d.kind, "HEAL");
    f.owner.hp = 4; assert.equal(decide(f).d.kind, "INFORMATION"); f.owner.hand = [f.card("S")];
    f.owner.storage.nihil_jianhua_skill_used = ["nihil_zhuofeng", "nihil_hengsha"];
    const { r } = decide(f); assert.equal(r.ai1(f.owner.hand[0]), 3);
});
test("planning never mutates real hand, equipment, marks, HP or armor", () => {
    const f = fixture(), enemy = f.player("enemy", -5, 10); f.equip(enemy, "sword"); enemy.hujia = 2; f.owner.hand = [f.card("S"), f.card("A", "zhuge")]; f.owner.storage.nihil_xinliu = 6;
    const before = JSON.stringify([f.owner.hand, f.owner.weapons, f.owner.storage, enemy.weapons, enemy.hp, enemy.hujia]); decide(f); assert.equal(JSON.stringify([f.owner.hand, f.owner.weapons, f.owner.storage, enemy.weapons, enemy.hp, enemy.hujia]), before);
});
test("discard prices exclude real weapons and preserve Peach/Shan/Sha", () => {
    const f = fixture(), result = f.ai.chooseKeepCards({ hp: 2, limit: 3, cards: [{ id: "weapon", name: "sword", weapon: true }, { id: "peach", name: "tao" }, { id: "shan", name: "shan" }, { id: "sha", name: "sha" }, { id: "wine", name: "jiu" }] });
    assert.deepEqual(Array.from(result.keepIds), ["peach", "shan", "sha"]); assert.ok(!result.entries.some(c => c.id === "weapon"));
});
test("complete-state cycle keys ignore irrelevant hand ordering", () => {
    const f = fixture(); f.player("enemy"); f.owner.hand = [f.card("a", "sword"), f.card("b", "long")]; const s = snapshot(f), reordered = JSON.parse(JSON.stringify(s.state)); reordered.hand.reverse(); assert.equal(f.ai.stateKey(s.state), f.ai.stateKey(reordered));
});
test("Guding applies mandatory empty-hand damage and rejects that allied dying upper bound", () => {
    const f = fixture(), enemy = f.player("enemy", -5, 8); f.owner.hand = [f.card("W", "guding")];
    const s = step(f, snapshot(f), a => a.form === "guding"); assert.equal(s.state.people.find(p => p.id === "enemy").hp, 6);
    const g = fixture(); g.player("friend", 5, 2); g.owner.hand = [g.card("W", "guding")]; const { d } = decide(g);
    assert.ok(d.trace.candidates.filter(c => c.form === "guding").every(c => c.reason.includes("DYING")));
});
test("Zhuque optional fire wins against Vine and is refused for a dying self-chain", () => {
    const f = fixture(), enemy = f.player("enemy", -5, 8); f.equip(enemy, "tengjia"); f.owner.hand = [f.card("W", "zhuque")];
    const { d } = decide(f); assert.equal(d.fireFan, true);
    f.owner.linked = enemy.linked = true; f.owner.hp = 1; const second = decide(f).d;
    assert.ok(second.trace.candidates.filter(c => c.id.endsWith(":fire")).every(c => c.reason.includes("DYING")));
});
async function run() {
    for (const c of cases) {
        await c.run();
        console.log("PASS", c.name);
    }
    console.log(cases.length + " v2 decision checks passed (fixture, no native match)");
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run };
