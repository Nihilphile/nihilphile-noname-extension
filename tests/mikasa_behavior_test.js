"use strict";
// V2 isolated regression. No test in this file is a real-engine E-case result.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const extensionRoot = path.join(root, "nihilphile武将包");
const tests = [];
const list = value => Array.from(value);
function test(name, run) { tests.push({ name, run }); }
function fixture() {
    const ui = { cardPile: { childNodes: [] }, ordering: [], discard: [] }, order = [];
    const game = {
        players: [], phaseNumber: 8, log() {},
        async cardsGotoOrdering(cards) {
            order.push("ordering");
            for (const card of cards) { ui.cardPile.childNodes.splice(ui.cardPile.childNodes.indexOf(card), 1); ui.ordering.push(card); card.position = "o"; }
        },
        async cardsDiscard(cards) {
            order.push("discard");
            for (const card of cards) { assert.equal(card.position, "o"); ui.ordering.splice(ui.ordering.indexOf(card), 1); ui.discard.push(card); card.position = "d"; }
        },
    };
    const status = {}, distances = new Map();
    const get = {
        name: card => card.name, translation: value => typeof value === "string" ? value : value.id,
        autoViewAs: card => ({ ...card, cards: card.position ? [card] : list(card.cards || []) }),
        position: card => card.position,
        distance: (a, b) => distances.get(a.id + ":" + b.id) || 1,
        order: card => card.aiOrder == null ? (card.name === "sha" ? 3.2 : 0) : card.aiOrder,
        effect: target => target.aiEffect || 0,
        value: card => card.aiValue || 0,
        cards() { throw Error("Replenishing get.cards must not be used"); },
    };
    const lib = { filter: {
        cardEnabled: (card, p) => !card.disabled && !p.disabled,
        cardRespondable: (card, p) => !card.unrespondable && !p.unrespondable,
    } };
    const context = { window: {}, game, ui, lib, get, _status: status, console, Set };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(extensionRoot, "module/mikasa.js"), "utf8"), context);
    const skills = context.window.nihilModules.mikasa.skill;
    function player(id) {
        const p = { id, hand: [], storage: {}, inGame: true, selectedCards: [], uses: [], shown: [], choices: [], synced: [], attackRange: 1,
            isIn() { return this.inGame; }, getCards(zone) { assert.equal(zone, "h"); return this.hand; },
            canUse(card, target, distance) { return this.inGame && target.inGame && this !== target && !target.prohibited && !card.disabled && !this.disabled && (distance === false || get.distance(this, target) <= this.attackRange); },
            syncStorage(key) { this.synced.push(key); }, logSkill() {},
            gain() { throw Error("V2 must not gain top cards"); }, chooseButton() { throw Error("V2 must not privately choose top cards"); },
            async showCards(cards, title) { order.push("show"); cards.forEach(c => assert.equal(c.position, "o")); this.shown.push({ cards: list(cards), title }); if (this.onShow) await this.onShow(cards); },
            chooseCard(zone, forced, prompt, filter) {
                assert.equal(zone, "h"); assert.equal(forced, false);
                const choice = { prompt, filter };
                this.choices.push(choice);
                return {
                    set(key, value) { choice[key] = value; return this; },
                    forResult: async () => p.selectedCards.shift() || { bool: false },
                };
            },
            async chooseToUse(config) { this.uses.push(config); },
        }; game.players.push(p); return p;
    }
    function pile(...names) { ui.cardPile.childNodes = names.map((name, id) => ({ name, id, position: "c", suit: "heart", color: "red", number: 7 })); return ui.cardPile.childNodes.slice(); }
    function ring(players) { players.forEach((p, i) => { p.previousSeat = players[(i + players.length - 1) % players.length]; p.nextSeat = players[(i + 1) % players.length]; }); }
    function request(p, name = "sha", targets) { return { name: "chooseToUse", player: p,
        filterCard: card => card.name === name && !card.disabled && !p.disabled && (name !== "sha" || !p.quotaExhausted),
        filterTarget: (card, owner, target) => targets ? targets.includes(target) : owner.canUse(card, target), getParent: () => null }; }
    async function slash(p, target, req = request(p)) {
        const result = { bool: true, card: { name: "sha" }, cards: [], targets: [target], skill: "nihil_fengren" };
        await skills.nihil_fengren.precontent({ result, getParent: () => req }, {}, p); order.push("returnResult"); return result;
    }
    return { game, ui, get, lib, status, skills, player, pile, ring, request, slash, distances, context, order };
}
test("V2-X01/X03: whole multi-target card, dead reference and wraparound", async () => {
    const f = fixture(), p = ["m", "a", "b", "c", "d"].map(f.player); f.ring(p); p[1].inGame = false;
    const use = { card: { name: "sha" }, targets: [p[1], p[3]] };
    assert.equal(f.skills.nihil_xuanzhan.filter(use, p[0]), true); await f.skills.nihil_xuanzhan.content({}, use, p[0]);
    assert.equal(p[0].uses.length, 1); const req = p[0].uses[0];
    for (const t of [p[2], p[4]]) assert.equal(req.filterTarget({ name: "sha" }, p[0], t), true);
    for (const t of [p[0], p[1], p[3]]) assert.equal(req.filterTarget({ name: "sha" }, p[0], t), false);
});
test("V2-X02: only rotation waives range/quota and preserves prohibition", async () => {
    const f = fixture(), p = ["m", "a", "b", "c"].map(f.player); f.ring(p); f.distances.set("m:b", 8); p[0].quotaExhausted = true;
    await f.skills.nihil_xuanzhan.content({}, { card: { name: "sha" }, targets: [p[1]] }, p[0]); const req = p[0].uses[0];
    assert.equal(req.filterTarget({ name: "sha" }, p[0], p[2]), true); assert.equal(req.filterCard({ name: "sha" }, p[0]), true); assert.equal(req.addCount, true);
    p[2].prohibited = true; assert.equal(req.filterTarget({ name: "sha" }, p[0], p[2]), false);
    assert.equal(f.skills.nihil_fengren.filter(f.request(p[0]), p[0]), false);
});
test("V2-X04/X05: physical/virtual shan counter only its sha source", async () => {
    for (const cards of [[], [{ name: "shan" }]]) {
        const f = fixture(), a = f.player("a"), b = f.player("b"), c = f.player("c"); f.distances.set("a:b", 9); a.quotaExhausted = true;
        const use = { card: { name: "shan", cards }, respondTo: [b, { name: "sha" }] };
        assert.equal(f.skills.nihil_xuanzhan.filter(use, a), true); await f.skills.nihil_xuanzhan.content({}, use, a);
        assert.equal(a.uses[0].filterTarget({ name: "sha" }, a, b), true); assert.equal(a.uses[0].filterTarget({ name: "sha" }, a, c), false);
        use.respondTo[1].name = "other"; assert.equal(f.skills.nihil_xuanzhan.filter(use, a), false);
        use.respondTo[1].name = "sha"; b.inGame = false; assert.equal(f.skills.nihil_xuanzhan.filter(use, a), false);
    }
    assert.equal(fixture().skills.nihil_xuanzhan.trigger.player, "useCardAfter");
});
test("V2-X06: no target/dead owner generates no new request", async () => {
    const f = fixture(), a = f.player("a"), b = f.player("b"); f.ring([a, b]); const use = { card: { name: "sha" }, targets: [b] };
    assert.equal(f.skills.nihil_xuanzhan.filter(use, a), false); await f.skills.nihil_xuanzhan.content({}, use, a); assert.equal(a.uses.length, 0);
    a.inGame = false; assert.equal(f.skills.nihil_xuanzhan.filter({ card: { name: "shan" }, respondTo: [b, { name: "sha" }] }, a), false);
});
test("F01: reveal one top sha and use that physical card", async () => {
    for (const names of [["sha", "tao"], ["sha", "sha"]]) {
        const f = fixture(), a = f.player("a"), b = f.player("b"), cards = f.pile(...names, "shan"); cards[0].nature = "fire";
        const result = await f.slash(a, b);
        assert.deepEqual(f.order, ["ordering", "show", "returnResult"]); assert.deepEqual(f.ui.discard, []); assert.deepEqual(f.ui.cardPile.childNodes, cards.slice(1));
        assert.equal(a.shown.length, 1); assert.deepEqual(a.shown[0].cards, [cards[0]]); assert.equal(a.hand.length, 0);
        assert.equal(result.card.name, "sha"); assert.equal(result.card.nature, "fire"); assert.equal(result.card.suit, "heart"); assert.equal(result.card.color, "red"); assert.equal(result.card.number, 7);
        assert.deepEqual(list(result.cards), [cards[0]]); assert.deepEqual(list(result.card.cards), [cards[0]]); assert.equal(result.skill, undefined); assert.deepEqual(f.ui.ordering, [cards[0]]);
    }
});
test("F02: non-sha top is discarded before physical hand sha fallback", async () => {
    const f = fixture(), a = f.player("a"), b = f.player("b"); f.pile("tao", "shan");
    const hand = { name: "sha", nature: "thunder", position: "h" }; a.hand.push(hand); a.selectedCards.push({ bool: true, cards: [hand] }); const r = await f.slash(a, b);
    assert.deepEqual(list(r.cards), [hand]); assert.deepEqual(list(r.targets), [b]); assert.equal(r.card.nature, "thunder"); assert.equal(r.skill, undefined); assert.equal(a.storage.nihil_fengren_failed_turn, undefined);
    assert.deepEqual(f.ui.discard.map(card => card.name), ["tao"]); assert.deepEqual(f.ui.cardPile.childNodes.map(card => card.name), ["shan"]);
});
test("V2-F03: empty/forbidden/cancelled fallback disables only Fengren", async () => {
    for (const kind of ["none", "forbidden", "cancel"]) {
        const f = fixture(), a = f.player("a"), b = f.player("b"); f.pile("tao", "shan"); if (kind !== "none") a.hand.push({ name: "sha", disabled: kind === "forbidden", position: "h" });
        const r = await f.slash(a, b); assert.equal(r.cancel, true); assert.equal(r.card, undefined); assert.equal(a.storage.nihil_fengren_failed_turn, 8);
        assert.equal(f.skills.nihil_fengren.filter(f.request(a), a), false); assert.equal(f.skills.nihil_jidong.filter(f.request(a, "shan"), a), true); assert.equal(a.storage.nihil_jidong_failed_turn, undefined);
    }
});
test("V2-F04: ordinary range/quota/request and rejection remain intact", () => {
    const f = fixture(), a = f.player("a"), b = f.player("b"), req = f.request(a), cards = f.pile("sha", "shan");
    f.distances.set("a:b", 3); assert.equal(f.skills.nihil_fengren.filter(req, a), false); a.attackRange = 3; assert.equal(f.skills.nihil_fengren.filter(req, a), true);
    a.quotaExhausted = true; assert.equal(f.skills.nihil_fengren.filter(req, a), false); a.quotaExhausted = false; b.prohibited = true; assert.equal(f.skills.nihil_fengren.filter(req, a), false);
    assert.equal(f.skills.nihil_fengren.enable, "chooseToUse"); assert.deepEqual(f.ui.cardPile.childNodes, cards); assert.deepEqual(a.storage, {});
});
test("F04 regression: caller-owned target override keeps Fengren available", () => {
    const f = fixture(), a = f.player("a"), marx = f.player("marx"); f.distances.set("a:marx", 9);
    const zhouli = f.request(a, "sha", [marx]);
    assert.equal(zhouli.filterTarget({ name: "sha" }, a, marx), true);
    assert.equal(f.skills.nihil_fengren.filter(zhouli, a), true);
});
test("AI: advisory scores prefer Fengren and profitable rotation without changing legality", async () => {
    const f = fixture(), p = ["m", "a", "b", "c"].map(f.player); f.ring(p);
    p[1].aiEffect = 2; p[3].aiEffect = -3;
    await f.skills.nihil_xuanzhan.content({}, { card: { name: "sha" }, targets: [p[2]] }, p[0]);
    const req = p[0].uses[0];
    assert.equal(req.filterTarget({ name: "sha" }, p[0], p[1]), true);
    assert.equal(req.filterTarget({ name: "sha" }, p[0], p[3]), true);
    assert.equal(req.ai2(p[1]), 2);
    assert.equal(req.ai2(p[3]), -3);
    assert.equal(req.ai1({ name: "sha", aiOrder: 4.5 }), 4.5);
    assert.ok(f.skills.nihil_fengren.ai.order(null, p[0]) > f.get.order({ name: "sha" }));
    assert.equal(f.skills.nihil_jidong.check(), true);
});
test("AI: Fengren fallback spends the least valuable legal hand sha only for AI", async () => {
    const f = fixture(), a = f.player("a"), b = f.player("b"); f.pile("tao");
    const cheap = { name: "sha", position: "h", aiValue: 2 };
    const costly = { name: "sha", position: "h", aiValue: 6 };
    a.hand.push(cheap, costly); a.selectedCards.push({ bool: true, cards: [cheap] });
    await f.slash(a, b);
    assert.equal(a.choices.length, 1);
    assert.equal(typeof a.choices[0].ai, "function");
    assert.ok(a.choices[0].ai(cheap) > a.choices[0].ai(costly));
    assert.equal(a.choices[0].filter(cheap), true);
    assert.equal(a.choices[0].filter(costly), true);
});
test("V2-F05: rotation virtual/hand/failure paths keep request-local range waiver", async () => {
    for (const mode of ["virtual", "hand", "failure"]) {
        const f = fixture(), p = ["m", "a", "b"].map(f.player); f.ring(p); f.distances.set("m:b", 9); p[0].quotaExhausted = true;
        await f.skills.nihil_xuanzhan.content({}, { card: { name: "sha" }, targets: [p[1]] }, p[0]); const req = { name: "chooseToUse", ...p[0].uses[0], getParent: () => null };
        f.pile(mode === "virtual" ? "sha" : "tao", "tao"); if (mode === "hand") { const c = { name: "sha", position: "h" }; p[0].hand.push(c); p[0].selectedCards.push({ bool: true, cards: [c] }); }
        assert.equal(f.skills.nihil_fengren.filter(req, p[0]), true); const r = await f.slash(p[0], p[2], req); assert.equal(!!r.cancel, mode === "failure"); if (mode !== "failure") assert.equal(r.card.name, "sha");
        assert.equal(f.skills.nihil_fengren.filter(f.request(p[0]), p[0]), false);
    }
});
test("V2-F06/C04: Fengren failure belongs to one owner and global turn", async () => {
    const f = fixture(), a = f.player("a"), b = f.player("b"); f.pile(); await f.slash(a, b);
    assert.equal(f.skills.nihil_fengren.filter(f.request(b), b), true); assert.equal(f.skills.nihil_fengren.filter(f.request(a), a), false);
    a.storage = JSON.parse(JSON.stringify(a.storage)); assert.equal(f.skills.nihil_fengren.filter(f.request(a), a), false); f.game.phaseNumber++; assert.equal(f.skills.nihil_fengren.filter(f.request(a), a), true);
});
test("V2-J01: source-free shan request produces exactly one virtual shan", async () => {
    for (const top of [["shan", "tao"], ["shan", "shan"]]) {
        const f = fixture(), a = f.player("a"), req = f.request(a, "shan"), cards = f.pile(...top);
        assert.equal(f.skills.nihil_jidong.filter(req, a), true); await f.skills.nihil_jidong.content({}, req, a);
        assert.equal(req.responded, true); assert.equal(req.result.card.name, "shan"); assert.equal(req.result.cards.length, 0); assert.equal(req.result.card.cards.length, 0); assert.deepEqual(f.ui.discard, cards); assert.deepEqual(f.order, ["ordering", "show", "discard"]);
    }
});
test("V2-J02/J03: failed same request cannot retry; next request can", async () => {
    for (const handShan of [false, true]) {
        const f = fixture(), a = f.player("a"), req = f.request(a, "shan"); f.pile("tao", "sha"); if (handShan) a.hand.push({ name: "shan", position: "h" });
        await f.skills.nihil_jidong.content({}, req, a); assert.equal(req.responded, undefined); assert.equal(req.result, undefined); assert.equal(f.skills.nihil_jidong.filter(req, a), false); assert.deepEqual(a.storage, {});
        const next = f.request(a, "shan"); assert.equal(f.skills.nihil_jidong.filter(next, a), true); f.pile("shan", "shan"); await f.skills.nihil_jidong.content({}, next, a); assert.equal(next.result.card.name, "shan");
    }
});
test("V2-J04: use/respond shan requests work; non-shan and disabled responses do not", async () => {
    const f = fixture(), a = f.player("a");
    const respond = f.request(a, "shan"); respond.name = "chooseToRespond"; f.pile("shan", "tao");
    assert.equal(f.skills.nihil_jidong.filter(respond, a), true);
    await f.skills.nihil_jidong.content({}, respond, a);
    assert.equal(respond.responded, true); assert.equal(respond.result.card.name, "shan"); assert.deepEqual(list(respond.result.cards), []);
    const blocked = f.request(a, "shan"); blocked.name = "chooseToRespond"; a.unrespondable = true;
    assert.equal(f.skills.nihil_jidong.filter(blocked, a), false);
    assert.equal(f.skills.nihil_jidong.filter(f.request(a, "sha"), a), false);
    assert.deepEqual(list(f.skills.nihil_jidong.trigger.player), ["chooseToUseBefore", "chooseToRespondBefore"]);
    assert.notEqual(f.skills.nihil_jidong.ai.skillTagFilter(a, "respondShan", "respond"), false);
});
test("V2-J04: failed respond request cannot retry, but the next respond request can", async () => {
    const f = fixture(), a = f.player("a"), failed = f.request(a, "shan"); failed.name = "chooseToRespond";
    f.pile("tao", "sha"); await f.skills.nihil_jidong.content({}, failed, a);
    assert.equal(failed.responded, undefined); assert.equal(f.skills.nihil_jidong.filter(failed, a), false);
    const next = f.request(a, "shan"); next.name = "chooseToRespond"; f.pile("shan", "tao");
    assert.equal(f.skills.nihil_jidong.filter(next, a), true); await f.skills.nihil_jidong.content({}, next, a);
    assert.equal(next.responded, true); assert.equal(next.result.card.name, "shan");
});
test("C01: zero/one deck never refills and revealed sha remains use material", async () => {
    for (const name of ["sha", "shan"]) for (const top of [null, name, "tao"]) for (const discarded of [false, true]) {
        const f = fixture(), a = f.player("a"), b = f.player("b"), cards = f.pile(...(top ? [top] : [])); if (discarded) f.ui.discard.push({ name, position: "d" });
        if (name === "sha") { const r = await f.slash(a, b); assert.equal(!!r.card, top === name); } else { const req = f.request(a, "shan"); await f.skills.nihil_jidong.content({}, req, a); assert.equal(!!req.responded, top === name); }
        assert.equal(f.ui.cardPile.childNodes.length, 0); assert.equal(f.ui.ordering.length, name === "sha" && top === "sha" ? 1 : 0); assert.equal(a.shown.length, top ? 1 : 0);
        assert.equal(f.ui.discard.length, (discarded ? 1 : 0) + cards.length - (name === "sha" && top === "sha" ? 1 : 0));
    }
});
test("V2-C02: repeated invocations consume separate batches once", async () => {
    const f = fixture(), a = f.player("a"), b = f.player("b"), cards = f.pile("sha", "shan", "shan", "sha");
    await f.slash(a, b); await f.skills.nihil_jidong.content({}, f.request(b, "shan"), b); await f.slash(a, b);
    assert.deepEqual(f.ui.discard, cards.slice(1, 3)); assert.deepEqual(f.ui.ordering, [cards[0], cards[3]]); assert.equal(f.ui.cardPile.childNodes.length, 0); assert.equal(a.hand.length + b.hand.length, 0); assert.equal(f.order.filter(x => x === "show").length, 3);
});
test("V2-C03: matched reveal then target/owner invalidation cleans without false ban", async () => {
    for (const kind of ["target", "owner", "cardEnabled"]) {
        const f = fixture(), a = f.player("a"), b = f.player("b"), cards = f.pile("sha", "tao");
        a.onShow = () => { if (kind === "target") b.prohibited = true; if (kind === "owner") a.inGame = false; if (kind === "cardEnabled") a.disabled = true; };
        const r = await f.slash(a, b); assert.equal(r.cancel, true); assert.equal(a.storage.nihil_fengren_failed_turn, undefined); assert.deepEqual(f.ui.discard, cards.slice(0, 1)); assert.deepEqual(f.ui.cardPile.childNodes, cards.slice(1)); assert.equal(f.ui.ordering.length, 0);
    }
});
test("V2-C03: show failure still clears ordering in finally", async () => {
    const f = fixture(), a = f.player("a"), b = f.player("b"), cards = f.pile("sha", "tao"); a.onShow = () => { throw Error("fixture show failure"); };
    await assert.rejects(f.slash(a, b), /fixture show failure/); assert.deepEqual(f.ui.discard, cards.slice(0, 1)); assert.deepEqual(f.ui.cardPile.childNodes, cards.slice(1)); assert.equal(f.ui.ordering.length, 0);
});
test("V2-C04/C05: request state is independent and started effects complete", async () => {
    const f = fixture(), a = f.player("a"), b = f.player("b"), req = f.request(a, "shan"); f.pile("tao", "tao"); await f.skills.nihil_jidong.content({}, req, a);
    assert.equal(f.skills.nihil_jidong.filter(f.request(b, "shan"), b), true); f.pile("sha", "tao"); a.onShow = () => { a.hasSkill = () => false; }; const r = await f.slash(a, b); assert.equal(r.card.name, "sha");
});
test("load: V2 metadata, exactly three skills, PNG, translations and async bodies", () => {
    const ctx = { window: {}, console, game: {}, lib: {}, ui: {}, get: {}, ai: {}, _status: {} }, imported = {};
    ctx.game.import = (type, factory) => { imported[type] = factory(ctx.lib, ctx.game, ctx.ui, ctx.get, ctx.ai, ctx._status); }; ctx.game.addGroup = key => ctx.lib.group.push(key);
    ctx.lib = { assetURL: "", group: [], groupnature: {}, translate: {}, config: {}, init: {} }; vm.createContext(ctx);
    ctx.lib.init.jsSync = (base, name) => vm.runInContext(fs.readFileSync(path.join(extensionRoot, base.endsWith("/module") ? "module" : "character", name + ".js"), "utf8"), ctx);
    vm.runInContext(fs.readFileSync(path.join(extensionRoot, "extension.js"), "utf8"), ctx); imported.extension.precontent(); const p = imported.character;
    assert.deepEqual(list(p.character.nihil_mikasa.skills), ["nihil_xuanzhan", "nihil_fengren", "nihil_jidong"]); assert.equal(p.character.nihil_mikasa.sex, "female"); assert.equal(p.character.nihil_mikasa.group, "man"); assert.equal(p.character.nihil_mikasa.hp, 4);
    for (const id of p.character.nihil_mikasa.skills) { assert.ok(p.skill[id] && p.translate[id + "_info"]); assert.equal((p.skill[id].content || p.skill[id].precontent).constructor.name, "AsyncFunction"); }
    assert.equal(p.skill.nihil_jidong.mod, undefined); assert.equal(p.skill.nihil_jidong_sha, undefined); assert.equal(p.skill.nihil_jidong_shan, undefined);
    assert.equal(p.translate.nihil_jidong_info.includes("本回合失效"), false); assert.equal(p.translate.nihil_xuanzhan_info.includes("不受距离和次数限制"), true);
    assert.equal(p.translate.nihil_jidong_info.includes("使用或打出【闪】"), true);
    assert.ok(fs.existsSync(path.join(extensionRoot, "image/character/nihil_mikasa.png"))); assert.deepEqual(list(p.pinyins.nihil_mikasa), ["san", "li"]);
});
(async () => {
    const selected = process.argv.includes("--load-only") ? tests.filter(item => item.name.startsWith("load:")) : tests;
    for (const item of selected) { await item.run(); console.log("PASS " + item.name); }
    console.log(JSON.stringify({ suite: "mikasa_v2_behavior", passed: selected.length, engine: "mock", realEngineAcceptance: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
