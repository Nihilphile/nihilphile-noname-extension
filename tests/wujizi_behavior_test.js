"use strict";
// Isolated rule regression only. Real engine cases remain the independent tester's job.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const extensionRoot = path.resolve(__dirname, "../nihilphile武将包");
const tests = [];
const test = (name, run) => tests.push({ name, run });
const list = value => Array.from(value);
function nativeArray(items) {
    const result = Array.from(items);
    Object.defineProperty(result, "remove", { value(value) { const i = this.indexOf(value); if (i >= 0) this.splice(i, 1); return this; } });
    return result;
}
function fixture() {
    const events = [], distances = new Map();
    const game = { players: [], hasPlayer(filter) { return this.players.some(filter); }, log() {},
        checkMod(card, source, target, initial, kind) { return (kind === "playerEnabled" ? source.forbidTargets : target.prohibited) ? false : initial; } };
    const get = { name: c => c.name, translation: p => p.id, distance: (a, b) => distances.get(a.id + ":" + b.id) ?? 1, effect: target => target.effect || 0 };
    const lib = { filter: { targetEnabled: (card, source, target) => source !== target && !target.prohibited && !source.forbidTargets,
        cardEnabled: (card, source) => !source.cardForbidden } };
    const ctx = { window: {}, game, get, lib, console, _status: {} };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(extensionRoot, "module/wujizi.js"), "utf8"), ctx);
    const mod = ctx.window.nihilModules.wujizi;
    function player(id, marks = 0) {
        const p = {
            id, playerid: id, hp: 3, maxHp: 3, hujia: 0, storage: { nihil_huajin: marks }, inGame: true,
            stat: { card: { sha: 1 } }, drawn: 0, enabled: true, choice: null,
            isIn() { return this.inGame; }, hasSkill() { return this.enabled; }, getStat() { return this.stat; },
            addTempSkill(skill, expiry) { this.tempSkill = { skill, expiry }; },
            disableSkill(reason, skill) { this.enabled = false; this.disableReason = reason; assert.equal(skill, "nihil_huajin"); },
            enableSkill(reason) { assert.equal(reason, this.disableReason); this.enabled = true; },
            canUse(card, target, distance, quota) {
                return lib.filter.cardEnabled(card, this) && lib.filter.targetEnabled(card, this, target) &&
                    (distance === false || get.distance(this, target) <= 1) && (quota === false || this.stat.card.sha < 1);
            },
            async useCard(card, target, addCount) { this.used = { card, target, addCount }; if (addCount !== false) this.stat.card.sha++; },
            chooseToUse(request) {
                this.useRequest = request;
                return { forResult: async () => {
                    const remote = { _status: { event: request }, get, lib };
                    const filterCard = vm.runInNewContext("(" + request.filterCard.toString() + ")", remote);
                    const filterTarget = vm.runInNewContext("(" + request.filterTarget.toString() + ")", remote);
                    this.allowedCard = filterCard({ name: "sha" }, this);
                    this.allowedTargets = game.players.filter(target => filterTarget({ name: "sha" }, this, target));
                    if (this.onUseChoice) this.onUseChoice();
                    if (this.acceptUse && this.allowedCard && this.allowedTargets.length) {
                        await this.useCard({ name: "sha" }, request._nihilHuiwuTarget, request.addCount);
                        return { bool: true };
                    }
                    return { bool: false };
                } };
            },
            getDamagedHp() { return this.maxHp - this.hp; }, countMark(key) { return this.storage[key] || 0; },
            addMark(key, n) { this.storage[key] = (this.storage[key] || 0) + n; events.push(["add", id, n]); },
            removeMark(key, n) { assert.ok(this.countMark(key) >= n, "cost must be paid in full"); this.storage[key] -= n; events.push(["remove", id, n]); },
            async changeHujia(n) { this.hujia += n; events.push(["armor", id, n]); },
            async draw(n) { this.drawn += n; events.push(["draw", id, n, this.stat.card.sha]); if (this.onDraw) this.onDraw(); },
            logSkill(skill, target) { events.push(["log", id, skill, target?.id]); },
            chooseTarget(prompt, filter) {
                const action = { player: this, set(key, value) { this[key] = value; return this; }, forResult: async () => {
                    // Rebuild both function strings in a fresh VM with only remote public globals.
                    // Any capture of transferCost/trigger/host player would throw here.
                    const remote = { _status: { event: action }, get, lib };
                    const remoteFilter = vm.runInNewContext("(" + filter.toString() + ")", remote);
                    const remoteAI = vm.runInNewContext("(" + action.ai.toString() + ")", remote);
                    this.offered = game.players.filter(target => remoteFilter(null, this, target));
                    for (const target of game.players) assert.equal(typeof remoteAI(target), "number");
                    events.push(["remoteCallbacks", id]);
                    if (this.onChoice) this.onChoice();
                    return this.choice ? { bool: true, targets: [this.choice] } : { bool: false };
                } };
                return action;
            },
        };
        game.players.push(p);
        return p;
    }
    function use(source, targets, addCount) {
        return { name: "useCard", player: source, targets: nativeArray(targets), excluded: [],
            triggeredTargets2: nativeArray(targets), card: { name: "sha", nature: "fire", suit: "heart", number: 7 },
            cards: [{ id: "physical-sha" }], addCount, customArgs: { default: {} } };
    }
    function branch(parent, target, name = "sha") {
        return { name, player: parent.player, target, card: parent.card, cards: parent.cards,
            getParent: name => name === "useCard" ? parent : undefined };
    }
    async function targeted(event, owner) {
        const skill = mod.skill.nihil_huajin.subSkill.target;
        if (skill.filter(event, owner)) await skill.content({}, event, owner);
    }
    return { game, lib, get, mod, player, use, branch, targeted, events, distances };
}

test("H01: own/other preparation uses lost HP plus one", async () => {
    for (const [hp, before, after] of [[3, 0, 1], [3, 1, 2], [3, 2, 2], [2, 2, 3], [2, 3, 3], [1, 2, 3], [1, 3, 4], [1, 4, 4]]) {
        for (const own of [false, true]) {
            const f = fixture(), p = f.player("w"), q = f.player("q"), skill = f.mod.skill.nihil_huajin;
            p.hp = hp; p.hujia = before; const phase = { player: own ? p : q };
            assert.equal(skill.trigger.global, "phaseZhunbeiBegin");
            if (skill.filter(phase, p)) await skill.content({}, phase, p);
            assert.equal(p.hujia, after);
        }
    }
});
test("H03: target reward precedes dodge, health, armor and prevention resolution", async () => {
    for (const outcome of ["hurt", "armor", "prevent", "dodge"]) {
        const f = fixture(), s = f.player("s"), p = f.player("w"), use = f.use(s, [p]), branch = f.branch(use, p);
        p.hujia = outcome === "armor" ? 1 : 0;
        s.onDraw = () => { assert.equal(p.hp, 3); assert.equal(p.countMark("nihil_huajin"), 1); assert.equal(use.addCount, false); };
        await f.targeted(branch, p);
        // These lines model the later effect; no claim that mock simulates actual damage.
        if (outcome === "hurt") p.hp--; if (outcome === "armor") p.hujia--;
        assert.equal(p.countMark("nihil_huajin"), 1); assert.equal(s.drawn, 1); assert.equal(s.stat.card.sha, 0);
        await f.targeted(branch, p); assert.equal(s.drawn, 1, "same target event is not rewarded twice");
    }
});
test("H04: target reward resolves before Jieshi, independent of shan", async () => {
    const f = fixture(), skill = f.mod.skill.nihil_huajin.subSkill.target;
    assert.deepEqual(Object.keys(skill.trigger), ["target"]); assert.equal(skill.trigger.target, "useCardToTarget");
    assert.ok(skill.priority > (f.mod.skill.nihil_jieshi.priority || 0));
    assert.equal(f.mod.skill.nihil_huajin.trigger.player, undefined);
});
test("H05: per-target rewards with one refund, unrelated used-card history stays intact", async () => {
    const f = fixture(), s = f.player("s"), a = f.player("a"), b = f.player("b"), use = f.use(s, [a, b]);
    s.history = [use]; await f.targeted(f.branch(use, a), a); await f.targeted(f.branch(use, b), b);
    assert.equal(a.countMark("nihil_huajin"), 1); assert.equal(b.countMark("nihil_huajin"), 1); assert.equal(s.drawn, 2);
    assert.equal(s.stat.card.sha, 0); assert.deepEqual(s.history, [use]);
    s.stat.card.sha++; assert.equal(s.stat.card.sha < 1, false, "another counted sha consumes its own quota");
});
test("H05: initially uncounted and zero counters never gain extra quota", async () => {
    for (const [addCount, count, after] of [[false, 2, 2], [false, 0, 0], [undefined, 0, 0], [true, 1, 0]]) {
        const f = fixture(), s = f.player("s"), p = f.player("w"), use = f.use(s, [p], addCount);
        s.stat.card.sha = count; await f.targeted(f.branch(use, p), p);
        assert.equal(s.stat.card.sha, after); assert.equal(s.drawn, 1); assert.equal(p.countMark("nihil_huajin"), 1);
    }
});
test("J01: reward first then exact 1+D payment; preserve source/card/materials/other targets", async () => {
    for (const d of [1, 2, 3]) {
        const f = fixture(), s = f.player("s"), p = f.player("w", d), n = f.player("n"), other = f.player("o");
        const use = f.use(s, [p, other]), evt = f.branch(use, p, "useCardToTarget"), card = use.card, cards = use.cards;
        f.distances.set("w:n", d); f.distances.set("s:n", 9); p.choice = n;
        s.onDraw = () => { assert.equal(p.countMark("nihil_huajin"), d + 1); assert.deepEqual(use.targets, nativeArray([p, other])); };
        await f.targeted(evt, p);
        assert.equal(f.mod.skill.nihil_jieshi.filter(evt, p), true);
        await f.mod.skill.nihil_jieshi.content({}, evt, p);
        assert.deepEqual(use.targets, nativeArray([other, n])); assert.ok(!use.triggeredTargets2.includes(p));
        assert.equal(use.card, card); assert.equal(use.cards, cards); assert.equal(use.player, s); assert.equal(use.card.nature, "fire");
        assert.equal(p.countMark("nihil_huajin"), 0); assert.equal(s.drawn, 1); assert.equal(s.stat.card.sha, 0);
        const relevant = f.events.filter(e => ["remove", "add", "draw"].includes(e[0]));
        assert.ok(f.events.some(e => e[0] === "remoteCallbacks"));
        assert.deepEqual(relevant.map(e => e[0]), ["add", "draw", "remove"]); assert.equal(relevant[2][2], 1 + d);
        await f.targeted(f.branch(use, p), p); assert.equal(s.drawn, 1, "removed original target cannot earn another reward");
    }
});
test("J02: refuse, one below cost, and no targets do not spend/reward", async () => {
    for (const mode of ["refuse", "short", "noTarget"]) {
        const f = fixture(), s = f.player("s"), p = f.player("w", mode === "short" ? 2 : 4), n = f.player("n");
        const use = f.use(s, [p]), evt = f.branch(use, p, "useCardToTarget"), before = p.countMark("nihil_huajin");
        f.distances.set("w:n", 2); s.prohibited = true; if (mode === "noTarget") n.prohibited = true;
        const skill = f.mod.skill.nihil_jieshi; assert.equal(skill.filter(evt, p), mode === "refuse");
        if (skill.filter(evt, p)) await skill.content({}, evt, p);
        assert.equal(p.countMark("nihil_huajin"), before); assert.equal(s.drawn, 0); assert.deepEqual(use.targets, nativeArray([p]));
    }
});
test("J03: directed distance, equipment-adjusted budget and prohibited/duplicate exclusions", async () => {
    const f = fixture(), s = f.player("s"), p = f.player("w", 2), n = f.player("n"), other = f.player("o"), banned = f.player("b");
    const use = f.use(s, [p, other]), evt = f.branch(use, p, "useCardToTarget"), skill = f.mod.skill.nihil_jieshi;
    banned.prohibited = true; f.distances.set("n:w", 5); f.distances.set("w:n", 2);
    assert.equal(skill.filter(evt, p), false); f.distances.set("w:n", 1); assert.equal(skill.filter(evt, p), true);
    await skill.content({}, evt, p); assert.deepEqual(p.offered, [n]); assert.equal(p.countMark("nihil_huajin"), 2);
});
test("J03: submission rechecks budget, distance, life, prohibition and current targets", async () => {
    for (const mutation of ["budget", "distance", "life", "ban", "duplicate", "owner", "excluded"]) {
        const f = fixture(), s = f.player("s"), p = f.player("w", 2), n = f.player("n"), use = f.use(s, [p]);
        p.choice = n; p.onChoice = () => {
            if (mutation === "budget") p.storage.nihil_huajin = 1;
            if (mutation === "distance") f.distances.set("w:n", 2);
            if (mutation === "life") n.inGame = false;
            if (mutation === "ban") n.prohibited = true;
            if (mutation === "duplicate") use.targets.push(n);
            if (mutation === "owner") p.inGame = false;
            if (mutation === "excluded") use.excluded.push(p);
        };
        await f.mod.skill.nihil_jieshi.content({}, f.branch(use, p, "useCardToTarget"), p);
        assert.equal(p.countMark("nihil_huajin"), mutation === "budget" ? 1 : 2); assert.equal(s.drawn, 0); assert.ok(use.targets.includes(p));
        assert.ok(!f.events.some(e => e[0] === "remove"));
    }
});
test("invalid branches and unavailable source: no phantom reward/draw", async () => {
    for (const kind of ["otherCard", "excluded", "allExcluded", "ownerGone", "noSkill"]) {
        const f = fixture(), s = f.player("s"), p = f.player("w"), use = f.use(s, [p]), evt = f.branch(use, p);
        if (kind === "otherCard") evt.card = { name: "juedou" };
        if (kind === "excluded") use.excluded.push(p);
        if (kind === "allExcluded") use.all_excluded = true;
        if (kind === "ownerGone") p.inGame = false;
        if (kind === "noSkill") p.enabled = false;
        await f.targeted(evt, p); assert.equal(p.countMark("nihil_huajin"), 0); assert.equal(s.drawn, 0);
    }
    const f = fixture(), s = f.player("s"), p = f.player("w"), use = f.use(s, [p]); s.inGame = false;
    await f.targeted(f.branch(use, p), p); assert.equal(p.countMark("nihil_huajin"), 1); assert.equal(s.drawn, 0); assert.equal(s.stat.card.sha, 0);
});
test("separate owners persist marks; no per-turn reset or initial grant", async () => {
    const f = fixture(), s = f.player("s"), a = f.player("a"), b = f.player("b");
    await f.targeted(f.branch(f.use(s, [a]), a), a); assert.equal(a.countMark("nihil_huajin"), 1); assert.equal(b.countMark("nihil_huajin"), 0);
    const h = f.mod.skill.nihil_huajin; assert.equal(h.init, undefined); assert.equal(h.onremove, undefined); assert.equal(h.intro.content, "mark");
    assert.equal(h.content.constructor.name, "AsyncFunction"); assert.equal(h.subSkill.target.content.constructor.name, "AsyncFunction");
});
test("J04: duel reflection costs D+2, preserves source and respects prohibitions", async () => {
    for (const mode of ["reflect", "short", "sourceBan", "targetBan"]) {
        const f = fixture(), s = f.player("s"), p = f.player("w", mode === "short" ? 1 : 2);
        const use = f.use(s, [p]), evt = f.branch(use, p); p.choice = s;
        await f.targeted(evt, p);
        if (mode === "sourceBan") s.forbidTargets = true;
        if (mode === "targetBan") s.prohibited = true;
        const skill = f.mod.skill.nihil_jieshi;
        assert.equal(skill.filter(evt, p), mode === "reflect");
        if (skill.filter(evt, p)) await skill.content({}, evt, p);
        assert.deepEqual(use.targets, nativeArray(mode === "reflect" ? [s] : [p]));
        assert.equal(use.player, s); assert.equal(s.drawn, 1);
        assert.equal(p.countMark("nihil_huajin"), mode === "reflect" ? 0 : mode === "short" ? 2 : 3);
    }
});
test("H06: only actual HP lost to sha disables Huajin through this turn", async () => {
    for (const [num, parentName, cardName, fails] of [[0, "damage", "sha", false], [-1, "damage", "sha", true],
        [-1, "damage", "juedou", false], [-1, "loseHp", "sha", false], [1, "recover", "sha", false]]) {
        const f = fixture(), s = f.player("s"), p = f.player("w", 4);
        const skill = f.mod.skill.nihil_huajin.subSkill.hurt;
        const evt = { num, getParent: () => ({ name: parentName, card: { name: cardName } }) };
        assert.equal(skill.filter(evt, p), fails);
        if (!fails) continue;
        skill.content({}, evt, p);
        assert.equal(p.enabled, false); assert.equal(p.tempSkill.expiry.global, "phaseAfter");
        await f.targeted(f.branch(f.use(s, [p]), p), p);
        assert.equal(s.drawn, 0); assert.equal(p.countMark("nihil_huajin"), 4);
        // Jieshi is separate and can still reflect using stored marks, with no extra reward.
        const use = f.use(s, [p]); p.choice = s;
        await f.mod.skill.nihil_jieshi.content({}, f.branch(use, p), p);
        assert.deepEqual(use.targets, nativeArray([s])); assert.equal(p.countMark("nihil_huajin"), 1);
        f.mod.skill.nihil_huajin_disabled.onremove(p);
        await f.targeted(f.branch(f.use(s, [p]), p), p);
        assert.equal(p.enabled, true); assert.equal(s.drawn, 1); assert.equal(p.countMark("nihil_huajin"), 2);
    }
});
test("W01: Huiwu acceptance bypasses range/quota, keeps one required target and counts no sha", async () => {
    const f = fixture(), p = f.player("w"), t = f.player("t"), other = f.player("other");
    f.distances.set("t:w", 9); t.stat.card.sha = 2; t.acceptUse = true;
    assert.equal(t.canUse({ name: "sha" }, p), false);
    const skill = f.mod.skill.nihil_huiwu;
    assert.equal(skill.enable, "phaseUse"); assert.equal(skill.usable, 1);
    assert.equal(skill.filterTarget(null, p, p), false); assert.equal(skill.filterTarget(null, p, t), true);
    await skill.content({ target: t }, null, p);
    assert.deepEqual(t.allowedTargets, [p]); assert.ok(!t.allowedTargets.includes(other));
    assert.equal(t.allowedCard, true); assert.equal(t.used.target, p); assert.equal(t.used.addCount, false);
    assert.equal(t.stat.card.sha, 2); assert.equal(p.used, undefined);
    assert.equal(t.useRequest.nodistance, true); assert.equal(t.useRequest.targetRequired, true);
});
test("W02: Huiwu refusal uses virtual sha outside range with exhausted quota", async () => {
    const f = fixture(), p = f.player("w"), t = f.player("t");
    f.distances.set("w:t", 9); p.stat.card.sha = 2;
    await f.mod.skill.nihil_huiwu.content({ target: t }, null, p);
    assert.equal(p.used.target, t); assert.equal(p.used.card.name, "sha"); assert.equal(p.used.card.isCard, true);
    assert.equal(p.used.addCount, false); assert.equal(p.stat.card.sha, 2); assert.equal(t.used, undefined);
});
test("W03: Huiwu never overrides card/target bans or acts on departed players", async () => {
    for (const mode of ["targetCannotSha", "ownerImmune", "ownerCannotSha", "targetImmune", "targetLeaves", "ownerLeaves"]) {
        const f = fixture(), p = f.player("w"), t = f.player("t");
        if (mode === "targetCannotSha") { t.cardForbidden = true; t.acceptUse = true; }
        if (mode === "ownerImmune") { p.prohibited = true; t.acceptUse = true; }
        if (mode === "ownerCannotSha") p.cardForbidden = true;
        if (mode === "targetImmune") t.prohibited = true;
        if (mode === "targetLeaves") t.onUseChoice = () => { t.inGame = false; };
        if (mode === "ownerLeaves") t.onUseChoice = () => { p.inGame = false; };
        await f.mod.skill.nihil_huiwu.content({ target: t }, null, p);
        assert.equal(t.used, undefined);
        assert.equal(!!p.used, mode === "targetCannotSha" || mode === "ownerImmune");
    }
});
test("load: complete extension, IDs, group, PNG, pinyin and metadata", () => {
    const imported = {}, ctx = { window: {}, console, lib: {}, game: {}, ui: {}, get: {}, ai: {}, _status: {} };
    ctx.lib = { assetURL: "", group: [], groupnature: {}, translate: {}, config: {}, init: {} };
    ctx.game.import = (type, factory) => { imported[type] = factory(ctx.lib, ctx.game, ctx.ui, ctx.get, ctx.ai, ctx._status); };
    ctx.game.addGroup = id => ctx.lib.group.push(id); vm.createContext(ctx);
    ctx.lib.init.jsSync = (base, name) => vm.runInContext(fs.readFileSync(path.join(extensionRoot, base.endsWith("/module") ? "module" : "character", name + ".js"), "utf8"), ctx);
    vm.runInContext(fs.readFileSync(path.join(extensionRoot, "extension.js"), "utf8"), ctx); imported.extension.precontent();
    const pack = imported.character, p = pack.character.nihil_wujizi;
    assert.equal(imported.extension.name, "Nihilphile"); assert.equal(pack.name, "nihilphile");
    assert.equal(p.sex, "male"); assert.equal(p.hp, 3); assert.equal(p.maxHp, 3); assert.equal(p.group, "qian");
    assert.deepEqual(list(p.skills), ["nihil_huajin", "nihil_jieshi", "nihil_huiwu"]); assert.deepEqual(list(pack.pinyins.nihil_wujizi), ["wu", "ji", "zi"]);
    assert.ok(ctx.lib.group.includes("qian")); assert.equal(ctx.lib.translate.qian, "千"); assert.equal(pack.characterTitle.nihil_wujizi, "武术的胜利");
    assert.equal(p.img, "extension/Nihilphile/image/character/nihil_wujizi.png");
    const image = fs.readFileSync(path.join(extensionRoot, "image/character/nihil_wujizi.png")); assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.ok(pack.characterIntro.nihil_wujizi.includes("Nihilpile")); for (const id of p.skills) assert.ok(pack.skill[id] && pack.translate[id + "_info"]);
    assert.equal(Object.keys(pack.character).some(id => id.startsWith("mechanism_test")), false);
});
(async () => {
    for (const item of tests) { await item.run(); console.log("PASS " + item.name); }
    console.log(JSON.stringify({ suite: "wujizi_image_behavior", passed: tests.length, engine: "mock", realEngineAcceptance: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
