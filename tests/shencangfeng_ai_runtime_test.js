const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const engine = process.env.NONAME_ENGINE_ROOT || "F:/AI_project/nameless_game/无名杀子琪懒人包v1.11.3-win32-x64/resources/app/src/noname";
const basicSource = fs.readFileSync(path.join(engine, "ai/basic.js"), "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/export\s*\{\s*Basic\s*\};?/, "")
    .replace(/(?:export\s+)?class Basic/, "globalThis.Basic = class Basic");
function collection() { const a = []; a.add = function (x) { if (!this.includes(x)) this.push(x); }; return a; }
function card(id, name = "sha", nature = "") {
    return { cardid: id, name, nature, color: "red", classList: { add() {} } };
}
function fixture() {
    const status = { currentPhase: null, event: null };
    const ui = { selected: { cards: collection(), targets: collection() } };
    const discard = [];
    const game = { players: [], roundNumber: 1, filterPlayer(fn) { return this.players.filter(fn); },
        expandSkills() {}, check() {} };
    const lib = { skill: {}, filter: { targetEnabled2(c, p, t) { return c.name === "tiesuo" || p !== t; },
        cardEnabled() { return true; }, cardSavable() { return true; }, cardRespondable() { return true; } },
        element: { VCard: class VCard { constructor(data) { Object.assign(this, data); } } } };
    const get = { name: c => c.name, nature: c => c.nature, color: c => c.color,
        info: () => ({ ai: { basic: { useful: [5, 3] } } }), subtype: c => c.subtype,
        mode: () => "versus", attitude: (p, t) => p.team === t.team ? 5 : -5,
        distance: (p, t) => t.distance || 1, discardPile: name => discard.find(c => c.name === name),
        effect: (t, c, p) => p.team === t.team ? -2 : 2,
        card: () => ui.selected.cards[0], select: range => range,
        skills: () => [],
        selectableCards() { return status.event.player.hand.filter(c =>
            !ui.selected.cards.includes(c) && !(status.event._aiexclude || []).includes(c) &&
            status.event.filterCard(c, status.event.player)); },
        selectableTargets() { return game.players.filter(t => !ui.selected.targets.includes(t) &&
            status.event.filterTarget(get.card(), status.event.player, t)); } };
    class CacheContext { static setCacheContext() {} static setInCacheEnvironment() {} static removeCacheContext() {} }
    const context = { window: {}, game, get, lib, ui, _status: status, CacheContext };
    vm.createContext(context);
    vm.runInContext(basicSource, context);
    const basic = new context.Basic();
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../nihilphile武将包/module/shencangfeng.js"), "utf8"), context);
    const mod = context.window.nihilModules.shencangfeng;
    Object.assign(lib.skill, mod.skill);
    function resetSelection() { ui.selected.cards.length = 0; ui.selected.targets.length = 0; }
    function player(id, team = 2) {
        const p = { playerid: id, team, hp: 4, hujia: 0, hand: [], storage: {}, shi: 0,
            linked: false, armor: null, equipment: {}, skills: [], damaged: false, used: false,
            classList: { add() {} }, drawn: 0, lostHp: 0, recasts: [], uses: [],
            isIn: () => true, isLinked() { return this.linked; }, isTurnedOver: () => false,
            isPhaseUsing: () => status.currentPhase === p,
            hasJudge: () => false, hasSkillTag: () => false, getSkills() { return this.skills.slice(); },
            getShownCards() { return this.shown || []; }, isFriendOf(t) { return this.team === t.team; },
            isMine: () => false, isOnline: () => false, isUnderControl: () => false,
            countCards(zone) { return zone === "ej" ? Number(!!this.armor) + Object.keys(this.equipment).length + (this.judges || []).length : this.hand.length; },
            countDiscardableCards: () => p.hand.length, countGainableCards: () => p.hand.length,
            countMark: () => p.shi,
            getCards() { assert.equal(p, game.players[0], "AI must not enumerate enemy dark hands"); return p.hand.slice(); },
            getEquip(type) { return type === 2 ? this.armor : this.equipment[type]; },
            getAttackRange() { return 1 + this.shi; }, getHandcardLimit() { return this.hp; },
            getHistory() { return this.damaged ? [{ num: 1, card: { name: "sha" } }] : []; },
            canUse(c, t, distance, includeCount) { return (!includeCount || !p.used) && t !== p && (t.distance || 1) <= p.getAttackRange(); },
            hasUseTarget(c) { return c.name === "tao" ? p.hp < 4 : c.name === "wuzhong"; },
            removeMark(mark, n) { this.shi -= n; }, async draw(n) { this.drawn += n; },
            async loseHp() { this.hp--; this.lostHp++; }, logSkill() {},
            async recast(cards) { p.recasts.push(cards.slice()); discard.push(...cards); p.hand = p.hand.filter(c => !cards.includes(c)); },
            async useCard(c, targets) { p.uses.push({ card: c, targets }); },
            chooseControl() { return { player: p, set(k, v) { this[k] = v; return this; },
                async forResult() { status.event = this; return { index: this.ai() }; } }; },
            chooseCard(zone, range, prompt, filter) { return { player: p, name: "chooseCard",
                selectCard: range, filterCard: filter, set(k, v) { this[k] = v; return this; },
                async forResult() { status.event = this; resetSelection(); const bool = basic.chooseCard(this.ai);
                    return { bool, cards: Array.from(ui.selected.cards) }; } }; },
            chooseTarget(range, prompt, filter) { return { player: p, name: "chooseTarget",
                selectTarget: range, filterTarget: filter, set(k, v) { this[k] = v; return this; },
                async forResult() { status.event = this; resetSelection(); const bool = basic.chooseTarget(this.ai);
                    return { bool, targets: Array.from(ui.selected.targets) }; } }; },
        };
        game.players.push(p);
        return p;
    }
    const p = player("self", 1); status.currentPhase = p;
    function request() {
        resetSelection();
        const e = { name: "chooseToUse", type: "phase", player: p, _aiexclude: [],
            filterCard: () => true, filterTarget: (c, owner, t) => owner !== t,
            selectCard: [1, 1], selectTarget: [1, 1], ai1: c => c.name === "wuzhong" ? 8 : 5,
            ai2: t => t.team === p.team ? -3 : 3, getParent: () => ({ name: "phaseUse" }) };
        status.event = e; mod.skill.nihil_badao.onChooseToUse(e); return e;
    }
    return { context, game, lib, get, ui, status, discard, p, player, request, basic, mod, resetSelection };
}
function loadGuanyu(f) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../nihilphile武将包/module/guanyu.js"), "utf8"), f.context);
    const guanyu = f.context.window.nihilModules.guanyu;
    Object.assign(f.lib.skill, guanyu.skill);
    return guanyu;
}
function forbidOtherSkills(f) {
    for (const other of f.game.players.slice(1)) {
        other.getSkills = () => { throw new Error("other player's skills must remain whiteboard"); };
        other.hasSkillTag = () => { throw new Error("private skill callback must not run"); };
    }
    const effect = f.get.effect;
    f.get.effect = (t, c, p) => {
        assert.notEqual(c.name, "sha", "Sha scoring must not invoke native skill effects");
        return effect(t, c, p);
    };
}
const cases = [];
function test(name, run) { cases.push({ name, run }); }
test("real Basic chooses both Sha and actual Guanyu target with whiteboard scoring", () => {
    for (const shi of [2, 3, 5]) {
        const f = fixture(); const guanyu = loadGuanyu(f);
        const enemy = f.player("guanyu"); enemy.hp = 2; enemy.hand = [card("hidden")];
        enemy.skills = Array.from(guanyu.character.nihil_guanyu.skills);
        assert.ok(enemy.skills.includes("nihil_wusheng"));
        f.p.shi = shi; f.p.hand = [card("attack")];
        forbidOtherSkills(f);
        const e = f.request();
        assert.equal(f.basic.chooseCard(e.ai1), true);
        assert.equal(f.ui.selected.cards[0].cardid, "attack");
        assert.equal(f.basic.chooseTarget(e.ai2), true);
        assert.equal(f.ui.selected.targets[0], enemy);
        assert.equal(e._nihilShenAttackPlan.action, "ATTACK_KILL");
    }
});
test("missed Sha pays for next turn against actual Guanyu only with usable own Shan", async () => {
    for (const shi of [3, 5]) for (const hasShan of [true, false]) {
        const f = fixture(); const guanyu = loadGuanyu(f);
        const enemy = f.player("guanyu"); enemy.hp = 2; enemy.hand = [card("hidden")];
        enemy.skills = Array.from(guanyu.character.nihil_guanyu.skills);
        f.p.shi = shi; f.p.used = true; f.p.hand = hasShan ? [card("defense", "shan")] : [];
        f.discard.push(card("playedSha"));
        forbidOtherSkills(f);
        const use = { name: "useCard", card: card("missed"), _nihilBadaoOwnerId: "self",
            _nihilBadaoKilled: false, getParent: () => null };
        await f.mod.skill.nihil_badao.subSkill.settle.content({}, use, f.p);
        assert.equal(f.p.lostHp, hasShan ? 1 : 0);
        assert.equal(f.p.shi, hasShan ? shi : 0);
        assert.equal(f.p.storage.nihil_shencangfeng_ai_trace.at(-1).reason,
            hasShan ? "KEEP_FOR_NEXT_TURN" : "CLEAR_FOR_SAFETY");
    }
});
test("fixed Peach ignores empty hands, hidden Peach, shown Peaches and team rescue cards", () => {
    for (const visibility of ["empty", "hidden", "shown"]) for (const shi of [0, 1]) {
        const f = fixture(); const enemy = f.player("enemy"); enemy.hp = 1;
        if (visibility !== "empty") enemy.hand = [card("tao", "tao")];
        if (visibility === "shown") enemy.shown = enemy.hand;
        const saver = f.player("saver"); saver.hand = [card("save1", "tao"), card("save2", "tao")]; saver.shown = saver.hand;
        f.p.shi = shi; f.p.hand = [card("attack")];
        forbidOtherSkills(f);
        const event = f.request();
        assert.equal(event.ai1(f.p.hand[0]), shi ? 0.0001 : -1);
        const snapshot = f.mod.skill.nihil_badao.aiRuntime.snapshot(f.p, "PLAY");
        const c = f.mod.aiHelpers.analyzeSlash(snapshot, snapshot.cards[0], snapshot.targets.find(t => t.id === "enemy"));
        assert.equal(c.killSignal, !!shi);
        assert.equal(event._nihilShenAttackPlan.action, shi ? "ATTACK_KILL" : "HOLD_BANK");
    }
});
test("whiteboard strategy preserves actual Sha card, target, range and use-count legality", () => {
    for (const blocked of ["uses", "range", "card", "target", "future"]) {
        const f = fixture(); f.p.shi = 5; f.p.hand = [card("attack")];
        const enemy = f.player("enemy"); enemy.hp = 1; forbidOtherSkills(f);
        if (blocked === "uses") f.p.used = true;
        if (blocked === "range") enemy.distance = 20;
        if (blocked === "future") f.lib.filter.targetEnabled2 = () => false;
        const event = f.request();
        if (blocked === "card") event.filterCard = () => false;
        if (blocked === "target") event.filterTarget = () => false;
        if (blocked === "future") {
            const snapshot = f.mod.skill.nihil_badao.aiRuntime.snapshot(f.p, "PAY");
            assert.equal(snapshot.cards[0].futureTargets.length, 0); assert.equal(snapshot.refillTargets.length, 0);
        } else {
            assert.equal(event.ai1(f.p.hand[0]), -1);
            assert.equal(f.basic.chooseCard(event.ai1), false);
        }
    }
});
test("real Basic chooses paired elemental card and allied chain start", () => {
    const f = fixture(); f.p.shi = 1;
    f.p.hand = [card("ordinary"), card("element", "sha", "thunder")];
    const ally = f.player("ally", 1); ally.linked = true;
    for (let i = 0; i < 3; i++) { const enemy = f.player("enemy" + i); enemy.hp = 3; enemy.linked = true;
        enemy.hand = [card("dark" + i), card("dark2" + i)]; }
    const event = f.request();
    assert.equal(f.basic.chooseCard(event.ai1), true);
    assert.equal(f.ui.selected.cards[0].cardid, "element");
    assert.equal(f.basic.chooseTarget(event.ai2), true);
    assert.equal(f.ui.selected.targets[0], ally);
    assert.equal(f.p.storage.nihil_shencangfeng_ai_trace, undefined, "scoring has no diagnostic writes");
});
test("banking refuses Sha but forwards non-Sha card and target callbacks", () => {
    const f = fixture(); f.player("enemy"); f.p.hand = [card("slash"), card("draw", "wuzhong")];
    const event = f.request();
    assert.equal(event.ai1(f.p.hand[0]), -1);
    assert.equal(f.basic.chooseCard(event.ai1), true);
    assert.equal(f.ui.selected.cards[0].name, "wuzhong");
    assert.equal(event.ai2(f.game.players[1]), 3);
    assert.equal(event.filterCard(f.p.hand[0], f.p), true, "human legal filters stay unchanged");
    assert.equal(event.filterTarget(f.p.hand[0], f.p, f.game.players[1]), true);
});
test("AI exclude retries rebuild plan without recursion or stale material", () => {
    const f = fixture(); const enemy = f.player("enemy"); enemy.hp = 1; f.p.shi = 1;
    f.p.hand = [card("first"), card("second")];
    const event = f.request(); assert.equal(event.ai1(f.p.hand[0]), 0.0001);
    event._aiexclude.push(f.p.hand[0]);
    assert.equal(event.ai1(f.p.hand[0]), -1);
    assert.equal(event.ai1(f.p.hand[1]), 0.0001);
    assert.equal(event._nihilShenAttackPlan.candidate.cardId, "second");
    f.mod.skill.nihil_badao.onChooseToUse(event);
    for (let i = 0; i < 100; i++) assert.equal(event.ai1(f.p.hand[1]), 0.0001);
});
test("native respond and nonphase Shan prompts retain original AI", () => {
    const f = fixture();
    const callback = () => 7;
    const event = { player: f.p, name: "chooseToUse", ai1: callback, getParent: () => ({ name: "sha" }) };
    f.mod.skill.nihil_badao.onChooseToUse(event);
    assert.equal(event.ai1, callback);
});
test("real Basic recasts all at two Shi and seeds even a single enemy", async () => {
    const f = fixture(); const enemy = f.player("enemy"); f.p.shi = 2;
    f.p.hand = [card("one"), card("two", "sha", "thunder")];
    await f.mod.skill.nihil_suoxin.content({}, {}, f.p);
    assert.deepEqual(f.p.recasts.map(cs => cs.map(c => c.cardid)), [["one", "two"]]);
    assert.equal(f.p.hand.length, 0); assert.equal(f.p.uses.length, 1);
    assert.deepEqual(Array.from(f.p.uses[0].targets), [enemy]);
});
test("real Basic links an identity rebel's lord and loyalist despite three hidden hands", async () => {
    const f = fixture(); f.get.mode = () => "identity"; f.p.identity = "fan"; f.p.shi = 2;
    const lord = f.player("lord"), loyalist = f.player("loyalist"), neutral = f.player("neutral", 0);
    f.game.zhu = lord; lord.identity = "zhu"; loyalist.identity = "zhong";
    f.get.attitude = (p, t) => t === neutral ? 0 : p.team === t.team ? 5 : -5;
    for (const enemy of [lord, loyalist]) enemy.hand = [card("a"), card("b"), card("c")];
    f.p.hand = [card("one"), card("two")];
    await f.mod.skill.nihil_suoxin.content({}, {}, f.p);
    assert.equal(f.p.uses.length, 1);
    assert.deepEqual(Array.from(f.p.uses[0].targets), [lord, loyalist]);
});
test("real Basic enemy layout works at low Shi without fire and under visible enemy fire threat", async () => {
    const f = fixture(); const e1 = f.player("e1"), e2 = f.player("e2"); f.p.shi = 0;
    e1.hand = [card("fire", "huogong"), card("b"), card("c")]; e1.shown = [e1.hand[0]];
    e2.hand = [card("a"), card("b"), card("c")];
    f.p.hand = [card("one"), card("two")];
    await f.mod.skill.nihil_suoxin.content({}, {}, f.p);
    assert.deepEqual(Array.from(f.p.uses[0].targets), [e1, e2]);
    assert.equal(f.p.storage.nihil_shencangfeng_ai_trace.at(-1).reason, "LINK_ENEMIES");
});
test("real Basic completes a three-target sacrificial native ally chain and protects critical seats", async () => {
    for (const protection of ["ordinary", "lord", "self", "threat", "human", "noMaterial"]) {
        const f = fixture(); f.p.shi = 3; f.p.identity = "zhong";
        const ally = f.player("ally", 1); ally.hp = 1;
        ally.hand = [card("a"), card("b"), card("c")];
        const e1 = f.player("e1"), e2 = f.player("e2");
        for (const enemy of [e1, e2]) enemy.hand = [card("a"), card("b"), card("c")];
        if (protection === "lord") f.game.zhu = ally;
        if (protection === "self") { f.p.hp = 1; f.p.linked = true; }
        if (protection === "human") ally.isMine = () => true;
        if (protection === "threat") { e1.hand[0] = card("fire", "huogong"); e1.shown = [e1.hand[0]]; }
        if (protection === "noMaterial") f.p.damaged = true;
        f.p.hand = [card("one"), card("two"), card("three")];
        await f.mod.skill.nihil_suoxin.content({}, {}, f.p);
        assert.equal(f.p.uses.length, 1, protection);
        const chosen = Array.from(f.p.uses[0].targets);
        if (protection === "ordinary") assert.deepEqual(new Set(chosen), new Set([ally, e1, e2]));
        else if (protection === "self") assert.deepEqual(chosen, [f.p]);
        else assert.deepEqual(chosen, [e1, e2], protection);
    }
});
test("real Basic extends a safe allied chain despite other player damage skills", async () => {
    const f = fixture(); f.p.shi = 2;
    const ally = f.player("ally", 1); ally.hp = 5; ally.linked = true;
    ally.hand = [card("a"), card("b"), card("c")];
    for (const id of ["e1", "e2"]) { const enemy = f.player(id); enemy.linked = true;
        enemy.hand = [card("a"), card("b"), card("c")]; }
    const unknown = f.player("unknown"); unknown.skills = ["unmodeled"];
    f.lib.skill.unmodeled = { trigger: { player: "damageBegin1" }, forced: true };
    f.p.hand = [card("recast")];
    forbidOtherSkills(f);
    await f.mod.skill.nihil_suoxin.content({}, {}, f.p);
    assert.equal(f.p.uses.length, 1);
    assert.deepEqual(Array.from(f.p.uses[0].targets), [unknown]);
    assert.equal(f.p.storage.nihil_shencangfeng_ai_trace.at(-1).reason, "LINK_ENEMIES");
});
test("real Basic replaces the first tank enemy slot with a profitable allied start", async () => {
    const f = fixture(); f.p.shi = 3;
    const ally = f.player("ally", 1); ally.hp = 1;
    ally.hand = [card("a"), card("b"), card("c")];
    const tank = f.player("tank"); tank.hp = 20;
    const e1 = f.player("e1"), e2 = f.player("e2");
    for (const enemy of [tank, e1, e2]) enemy.hand = [card("a"), card("b"), card("c")];
    f.p.hand = [card("one"), card("two"), card("three")];
    await f.mod.skill.nihil_suoxin.content({}, {}, f.p);
    assert.deepEqual(new Set(Array.from(f.p.uses[0].targets)), new Set([ally, e1, e2]));
});
test("real Basic cancels single native elemental recast while banking", async () => {
    const f = fixture(); f.player("enemy"); f.p.shi = 1;
    f.p.hand = [card("thunder", "sha", "thunder")];
    await f.mod.skill.nihil_suoxin.content({}, {}, f.p);
    assert.equal(f.p.recasts.length, 0); assert.equal(f.p.hand.length, 1);
});
test("real Basic links two enemies after recast draw and keeps safe allied links", async () => {
    const f = fixture(); const e1 = f.player("e1"), e2 = f.player("e2"); f.p.shi = 2;
    f.p.hand = [card("one"), card("two")];
    await f.mod.skill.nihil_suoxin.content({}, {}, f.p);
    assert.equal(f.p.uses.length, 1);
    assert.deepEqual(Array.from(f.p.uses[0].targets), [e1, e2]);
});
test("payment callback retains Shi for next round when this round has no uses", async () => {
    const f = fixture(); const enemy = f.player("enemy"); enemy.hp = 2; enemy.hand = [card("hidden")];
    f.p.shi = 3; f.p.used = true; f.p.damaged = true;
    f.p.hand = [card("next"), card("defense", "shan")];
    const use = { name: "useCard", card: card("used"), _nihilBadaoOwnerId: "self",
        _nihilBadaoKilled: false, getParent: () => null };
    await f.mod.skill.nihil_badao.subSkill.settle.content({}, use, f.p);
    assert.equal(f.p.lostHp, 1); assert.equal(f.p.shi, 3);
    assert.equal(f.p.storage.nihil_shencangfeng_ai_trace.at(-1).reason, "KEEP_FOR_NEXT_TURN");
});
test("AI useful only changes direct normal discard; defense precedes remaining Sha", () => {
    const f = fixture(); f.player("enemy"); f.p.damaged = true;
    f.p.hand = [card("sha"), card("shan", "shan")];
    f.status.event = { name: "chooseToDiscard", player: f.p, getParent: () => ({ name: "guanshi" }) };
    const mod = f.mod.skill.nihil_badao.mod;
    assert.equal(mod.aiUseful(f.p, f.p.hand[0]), undefined);
    f.status.event.getParent = () => ({ name: "phaseDiscard" });
    assert.ok(mod.aiUseful(f.p, f.p.hand[1]) > mod.aiUseful(f.p, f.p.hand[0]));
});
test("other player substitute Shan skills never invokes hidden-hand skillTagFilter", () => {
    const f = fixture(); const enemy = f.player("enemy"); enemy.hp = 1;
    enemy.skills = ["qingguo"]; enemy.hand = [card("hidden")];
    enemy.hasSkillTag = () => { throw new Error("private hand probe"); };
    f.lib.skill.qingguo = { ai: { respondShan: true, skillTagFilter() { throw new Error("private hand probe"); } } };
    f.p.shi = 1; f.p.hand = [card("attack")];
    forbidOtherSkills(f);
    assert.equal(f.request().ai1(f.p.hand[0]), 0.0001);
});
test("exhausted uses with blocked next turn clear Shi, with own Peach accepted by real filter name", async () => {
    const f = fixture(); const enemy = f.player("enemy"); enemy.hp = 1;
    f.p.shi = 3; f.p.used = true; f.p.damaged = true; f.p.hp = 3;
    f.p.hasJudge = () => true;
    f.p.hand = [card("attack"), card("defense", "shan"), card("rescue", "tao")];
    const use = { name: "useCard", card: card("used"), _nihilBadaoOwnerId: "self", getParent: () => null };
    await f.mod.skill.nihil_badao.subSkill.settle.content({}, use, f.p);
    assert.equal(f.p.shi, 0); assert.equal(f.p.lostHp, 0); assert.equal(f.p.drawn, 3);
});
test("a disabled Shan cannot justify paying HP to retain Shi", async () => {
    const f = fixture(); const enemy = f.player("enemy"); enemy.hp = 2; enemy.hand = [card("hidden")];
    f.p.shi = 3; f.p.used = true; f.p.damaged = true;
    f.p.hand = [card("attack"), card("disabled", "shan")];
    f.lib.filter.cardEnabled = (card, owner, mode) => {
        assert.equal(mode, "forceEnable"); return card.cardid !== "disabled";
    };
    const use = { name: "useCard", card: card("used"), _nihilBadaoOwnerId: "self", getParent: () => null };
    await f.mod.skill.nihil_badao.subSkill.settle.content({}, use, f.p);
    assert.equal(f.p.shi, 0); assert.equal(f.p.lostHp, 0);
});
function cooperationFixture() {
    const f = fixture(); f.p.shi = 3; f.p.hand = [card("attack")];
    const ally = f.player("ally", 1); ally.hp = 5; ally.linked = true;
    ally.hand = [card("shownShan", "shan"), card("hidden")]; ally.shown = [ally.hand[0]];
    ally.armor = card("bagua", "bagua"); ally.skills = ["bagua_skill"];
    for (let i = 0; i < 2; i++) { const e = f.player("e" + i); e.linked = true;
        e.hand = [card("hidden1"), card("hidden2")]; }
    return { f, ally };
}
test("confirmed native AI holds Shan and Bagua yet accepts the safe allied start", () => {
    const { f, ally } = cooperationFixture();
    ally.hasSkillTag = () => { throw new Error("do not probe dark hand through tags"); };
    const event = f.request();
    assert.equal(f.basic.chooseCard(event.ai1), true);
    assert.equal(f.basic.chooseTarget(event.ai2), true);
    assert.equal(f.ui.selected.targets[0], ally);
    assert.equal(event._nihilShenAttackPlan.candidate.hitTier, "HIGH");
});
test("public two-versus-two predicted victory allows ordinary allied death, guards lord and never reports actual death", () => {
    const { f, ally } = cooperationFixture(); ally.hp = 1;
    f.game.players.filter(p => p.team !== f.p.team).forEach(p => { p.hp = 1; });
    let event = f.request();
    assert.equal(event.ai1(f.p.hand[0]), 0.0001);
    assert.equal(event._nihilShenAttackPlan.candidate.victorySignal, true);
    assert.equal(event._nihilBadaoKilled, undefined);
    f.game.zhu = ally; f.p.identity = "zhong";
    assert.equal(f.request().ai1(f.p.hand[0]), -1);
    f.game.zhu = undefined; f.p.identity = undefined;
    f.get.mode = () => "identity";
    assert.equal(f.request().ai1(f.p.hand[0]), -1, "attitude cannot fabricate a public-team victory");
    f.get.mode = () => "versus"; f.p.linked = true; f.p.hp = 1;
    assert.equal(f.request().ai1(f.p.hand[0]), -1);
});
test("manual seats, online clients and controlled allies without auto never promise cooperation", () => {
    const changes = [
        (f, a) => { a.isMine = () => true; },
        (f, a) => { a.isOnline = () => true; },
        (f, a) => { a.isUnderControl = () => true; },
        f => { f.game.online = true; },
        (f, a) => { f.game.me = a; },
    ];
    for (const change of changes) {
        const { f, ally } = cooperationFixture(); change(f, ally);
        assert.equal(f.request().ai1(f.p.hand[0]), -1);
    }
    for (const change of [
        (f, a) => { f.game.me = a; f.status.auto = true; a.isUnderControl = () => true; },
        (f, a) => { a.isAuto = true; a.isUnderControl = () => true; },
    ]) {
        const { f, ally } = cooperationFixture(); change(f, ally);
        assert.equal(f.request().ai1(f.p.hand[0]), 0.0001);
    }
});
test("other player response overrides have no effect on safe native cooperation", () => {
    const { f, ally } = cooperationFixture();
    ally.skills.push("override");
    f.lib.skill.override = { ai: { useShan: true } };
    assert.equal(f.request().ai1(f.p.hand[0]), 0.0001);
    f.lib.skill.override.ai.noShan = true;
    assert.equal(f.request().ai1(f.p.hand[0]), 0.0001);
    f.lib.skill.override.ai.skillTagFilter = () => { throw new Error("hidden-hand filter must never run"); };
    assert.equal(f.request().ai1(f.p.hand[0]), 0.0001);
    f.lib.skill.override = { trigger: { player: "chooseToRespondBegin" } };
    assert.equal(f.request().ai1(f.p.hand[0]), 0.0001);
});
test("real Basic strips a bound two-hand target before Sha, then recalculates actual outcome", () => {
    for (const name of ["guohe", "shunshou"]) {
        const f = fixture(); f.p.shi = 3;
        const enemy = f.player("enemy"); enemy.hp = 6; enemy.hand = [card("dark1"), card("dark2")];
        f.p.hand = [card("attack"), card("strip", name)];
        const event = f.request();
        assert.equal(event.ai1(f.p.hand[0]), -1);
        assert.equal(f.basic.chooseCard(event.ai1), true);
        assert.equal(f.ui.selected.cards[0].cardid, "strip");
        assert.equal(f.basic.chooseTarget(event.ai2), true);
        assert.equal(f.ui.selected.targets[0], enemy);
        assert.equal(event._nihilShenAttackPlan.reason, "STRIP_TWO_TO_ONE");
        f.p.hand.pop(); f.resetSelection();
        assert.equal(event.ai1(f.p.hand[0]), -1, "nullified removal cannot reuse predicted pressure");
        enemy.hand.pop();
        assert.equal(event.ai1(f.p.hand[0]), 0.0001, "actual hand reduction rebuilds even the same request");
        assert.equal(event._nihilShenAttackPlan.action, "ATTACK_PRESS");
    }
});
test("three-hand enemies reserve one removal while banking and permit removal at high Shi", () => {
    const f = fixture(); const enemy = f.player("enemy"); enemy.hand = [card("a"), card("b"), card("c")];
    f.p.hand = [card("attack"), card("strip", "guohe")];
    for (let shi = 0; shi <= 2; shi++) { f.p.shi = shi;
        const event = f.request(); assert.equal(event.ai1(f.p.hand[1]), -1);
        assert.equal(event.ai1(f.p.hand[0]), -1); }
    f.p.shi = 3;
    assert.equal(f.request().ai1(f.p.hand[1]), 5, "reservation expires above banking Shi range");
    f.p.shi = 1; f.p.hand.push(card("secondStrip", "shunshou"));
    assert.equal(f.request().ai1(f.p.hand[2]), 5, "only one copy is reserved");
});
test("emergency dangerous armor or allied Lebu retain original positive removal callbacks", () => {
    const f = fixture(); const enemy = f.player("enemy"), ally = f.player("ally", 1);
    enemy.hand = [card("a"), card("b")]; enemy.armor = card("vine", "tengjia");
    ally.judges = [card("skip", "lebu")];
    f.p.hand = [card("strip", "guohe")];
    const effect = f.get.effect;
    f.get.effect = (t, c, p) => c.name === "guohe" && t === ally ? 2 : effect(t, c, p);
    const event = f.request(); event._nihilShenOriginalAi2 = () => 7;
    assert.equal(event.ai1(f.p.hand[0]), 5);
    f.ui.selected.cards.push(f.p.hand[0]);
    assert.equal(event.ai2(enemy), 7); assert.equal(event.ai2(ally), 7);
});
test("unremovable hands and targets with ej cannot invent the two-step hand preparation", () => {
    for (const mutate of [e => { e.countDiscardableCards = () => 0; }, e => { e.armor = card("armor", "bagua"); }]) {
        const f = fixture(); f.p.shi = 3; const e = f.player("enemy");
        e.hand = [card("one"), card("two")]; mutate(e);
        f.p.hand = [card("attack"), card("strip", "guohe")];
        const event = f.request(); event.ai1(f.p.hand[1]);
        assert.notEqual(event._nihilShenAttackPlan.action, "PREPARE_STRIP");
    }
});
test("adapter uses skill-blind current and future fire scoring while modeling Vine armor", () => {
    const f = fixture(); f.p.shi = 2; const enemy = f.player("enemy"); enemy.hp = 2;
    enemy.armor = card("vine", "tengjia"); enemy.hand = [card("hidden")];
    const ally = f.player("ally", 1), neutral = f.player("neutral", 0);
    f.get.mode = () => "identity";
    f.get.attitude = (p, t) => t === neutral ? 0 : p.team === t.team ? 5 : -5;
    f.p.hand = [card("attack"), card("defense", "shan")]; f.discard.push(card("refill"));
    forbidOtherSkills(f);
    const snapshot = f.mod.skill.nihil_badao.aiRuntime.snapshot(f.p, "PAY");
    for (const scores of [snapshot.cards[0].effects, snapshot.cards[0].futureEffects.fire,
        snapshot.refillEffects, snapshot.refillFutureEffects.fire]) {
        assert.equal(scores.enemy, 2); assert.equal(scores.ally, -2); assert.equal(scores.neutral, 0);
    }
    assert.equal(f.mod.aiHelpers.analyzeSlash(snapshot, snapshot.cards[0], snapshot.targets[1]).hitTier, "BLOCKED");
    assert.equal(f.mod.aiHelpers.chooseBadaoCost(snapshot, {}).reason, "KEEP_FOR_NEXT_TURN");
});
test("actual Jijiu and unmodeled response skills cannot veto whiteboard chain victory", () => {
    const f = fixture(); f.p.shi = 3; f.p.hand = [card("attack")];
    f.game.import = (type, build) => Object.assign(f.lib.skill, build().skill);
    vm.runInContext(fs.readFileSync(path.join(engine, "../character/standard.js"), "utf8")
        .replace(/^import .*;\r?\n/gm, ""), f.context);
    assert.ok(f.lib.skill.jijiu.viewAs);
    const ally = f.player("ally", 1); ally.hp = 1; ally.linked = true;
    ally.hand = [card("allyHidden1"), card("allyHidden2")];
    const huatuo = f.player("huatuo"); huatuo.hp = 1; huatuo.linked = true; huatuo.skills = ["jijiu", "unmodeled"];
    huatuo.hand = Array.from({ length: 4 }, (_, i) => card("red" + i, "guohe")); huatuo.shown = huatuo.hand;
    f.lib.skill.unmodeled = { trigger: { player: "chooseToRespondBegin" },
        filter() { throw new Error("private response filter must not run"); } };
    for (const name of ["viewAsFilter", "filterCard", "hiddenCard"]) f.lib.skill.jijiu[name] = () => { throw new Error("private rescue callback must not run"); };
    const enemy = f.player("enemy"); enemy.hp = 1; enemy.linked = true;
    forbidOtherSkills(f);
    const event = f.request();
    assert.equal(f.basic.chooseCard(event.ai1), true); assert.equal(f.basic.chooseTarget(event.ai2), true);
    assert.equal(f.ui.selected.targets[0], ally);
    assert.equal(event._nihilShenAttackPlan.candidate.victorySignal, true);
    huatuo.linked = false;
    const snapshot = f.mod.skill.nihil_badao.aiRuntime.snapshot(f.p, "PLAY");
    for (const t of snapshot.targets) for (const obsolete of ["unknown", "unknownSave", "knownSave", "saveMargin",
        "responseUnknown", "responsePolicy", "autoShan"]) assert.equal(Object.hasOwn(t, obsolete), false);
});
test("unsupported source Guding damage never promises a safe allied or lord chain", () => {
    const f = fixture(); f.get.mode = () => "identity"; f.p.shi = 3; f.p.identity = "zhong";
    f.p.hand = [card("attack")]; f.p.skills = ["guding_skill"];
    f.lib.skill.guding_skill = { trigger: { source: "damageBegin1" }, forced: true };
    const lord = f.player("lord", 1); lord.hp = 5; lord.linked = true; f.game.zhu = lord;
    for (let i = 0; i < 2; i++) { const enemy = f.player("e" + i); enemy.linked = true;
        enemy.hand = [card("dark1"), card("dark2")]; }
    assert.equal(f.request().ai1(f.p.hand[0]), -1);
    const snapshot = f.mod.skill.nihil_badao.aiRuntime.snapshot(f.p, "PLAY");
    assert.equal(snapshot.sourceUnknown, true);
});
test("real Basic holds against many hands at two HP and effective Bagua", () => {
    for (const bagua of [false, true]) {
        const f = fixture(); f.p.shi = 17; f.p.hand = [card("attack"), card("defense", "shan")];
        const enemy = f.player("enemy"); enemy.hp = 2;
        enemy.hand = [card("hidden1"), card("hidden2"), card("hidden3")];
        if (bagua) { enemy.armor = card("armor", "bagua"); enemy.skills = ["bagua_skill"]; }
        const event = f.request();
        event.filterCard = c => c.name !== "shan";
        assert.equal(f.basic.chooseCard(event.ai1), false);
        assert.equal(event._nihilShenAttackPlan.action, "HOLD");
    }
});
test("legal preparation opens a reliable hit and new many-hand uncertainty defaults to clearing Shi", async () => {
    const f = fixture(); f.p.shi = 17; f.p.hand = [card("attack"), card("strip", "guohe"), card("defense", "shan")];
    const enemy = f.player("enemy"); enemy.hand = [card("hidden1"), card("hidden2")];
    const event = f.request();
    assert.equal(event.ai1(f.p.hand[0]), -1);
    assert.equal(f.basic.chooseCard(event.ai1), true);
    assert.equal(f.ui.selected.cards[0].cardid, "strip");
    assert.equal(event._nihilShenAttackPlan.action, "PREPARE_STRIP");
    enemy.hand.push(card("newHidden")); f.p.hand = [card("defense", "shan")]; f.p.used = true;
    const use = { name: "useCard", card: card("used"), _nihilBadaoOwnerId: "self", _nihilBadaoKilled: false,
        getParent: () => null };
    await f.mod.skill.nihil_badao.subSkill.settle.content({}, use, f.p);
    assert.equal(f.p.shi, 0); assert.equal(f.p.lostHp, 0); assert.equal(f.p.drawn, 17);
});
async function observe(f, name, event) {
    const skill = f.mod.skill.nihil_badao.subSkill.ai_vulnerable;
    if (!skill.filter(event, f.p, name)) return false;
    await skill.content({ triggername: name }, event, f.p);
    return true;
}
function response(target, source, resolution, bool, name = "chooseToRespond") {
    return { name, type: name === "chooseToUse" ? "respondShan" : "respond",
        player: target, respondTo: [source, resolution.card],
        result: { bool, result: bool ? "shaned" : undefined }, getParent: () => resolution };
}
test("global Sha and Wanjian observations drive Basic hold, attack, gain invalidation and hold", async () => {
    for (const name of ["sha", "wanjian"]) for (const gainName of ["gainAfter", "loseAsyncAfter"]) {
        const f = fixture(); f.p.shi = 3; f.p.hand = [card("attack")];
        const enemy = f.player("enemy"); enemy.hp = 2;
        enemy.hand = [card("dark1"), card("dark2"), card("dark3")];
        const other = f.player("other", 1);
        forbidOtherSkills(f);
        f.get.damageEffect = () => { throw new Error("observer must not run damage-effect skill scoring"); };
        const event = f.request(); event.filterCard = c => c.name === "sha";
        assert.equal(f.basic.chooseCard(event.ai1), false);
        const hit = { name, card: card("thirdParty", name), player: other, target: enemy };
        const observed = name === "sha" ? await observe(f, "shaHit", hit) :
            await observe(f, "chooseToRespondAfter", response(enemy, other, hit, false));
        assert.equal(observed, true);
        assert.equal(enemy._nihilShenNoShanVulnerable, true);
        f.resetSelection(); f.status.event = event;
        assert.equal(f.basic.chooseCard(event.ai1), true);
        assert.equal(f.basic.chooseTarget(event.ai2), true);
        assert.equal(f.ui.selected.targets[0], enemy);
        assert.equal(event._nihilShenAttackPlan.action, "ATTACK_KILL");
        const gained = card("new"); enemy.hand.push(gained);
        const gain = { name: gainName.slice(0, -5), getg: t => t === enemy ? [gained] : [] };
        const clear = f.mod.skill.nihil_badao.subSkill.ai_vulnerable_clear;
        assert.equal(clear.trigger.global.includes(gainName), true);
        assert.equal(clear.filter(gain, f.p), true);
        await clear.content({ triggername: gainName }, gain, f.p);
        assert.equal(enemy._nihilShenNoShanVulnerable, undefined);
        f.resetSelection(); f.status.event = event;
        assert.equal(f.basic.chooseCard(event.ai1), false);
        assert.equal(event._nihilShenAttackPlan.action, "HOLD");
    }
});
test("direct hits and forbidden Shan responses never establish vulnerability", async () => {
    for (const name of ["sha", "wanjian"]) for (const forbid of ["directHit", "directHit2", "enabled", "respondable"]) {
        if (name === "sha" && forbid === "respondable") continue;
        if (name === "wanjian" && forbid === "enabled") continue;
        const f = fixture(), enemy = f.player("enemy"); enemy.hand = [card("dark1"), card("dark2")];
        const source = f.player("other", 1), hit = { name, card: card("use", name), player: source, target: enemy };
        if (forbid === "enabled") f.lib.filter.cardEnabled = () => false;
        else if (forbid === "respondable") f.lib.filter.cardRespondable = (c, t, request) => {
            assert.equal(request.name, "chooseToRespond"); assert.equal(request.player, enemy); return false;
        };
        else hit[forbid] = true;
        assert.equal(name === "sha" ? await observe(f, "shaHit", hit) :
            await observe(f, "chooseToRespondAfter", response(enemy, source, hit, false)), false);
        assert.equal(enemy._nihilShenNoShanVulnerable, undefined);
    }
});
test("Wanjian uses response legality even when Shan cannot be played", async () => {
    const f = fixture(), enemy = f.player("enemy"), source = f.player("other", 1);
    enemy.hand = [card("dark1"), card("dark2")];
    const hit = { name: "wanjian", card: card("use", "wanjian"), player: source, target: enemy };
    const request = response(enemy, source, hit, false);
    f.lib.filter.cardEnabled = () => false;
    f.lib.filter.cardRespondable = (c, t, actual) => {
        assert.equal(actual, request); assert.equal(t, enemy); assert.equal(c.name, "shan"); return true;
    };
    assert.equal(await observe(f, "chooseToRespondAfter", request), true);
    assert.equal(enemy._nihilShenNoShanVulnerable, true);
});
test("intentional native refusal, friendly elemental cooperation and zero damage never imply missing Shan", async () => {
    for (const name of ["sha", "wanjian"]) {
        const f = fixture(), enemy = f.player("enemy"), source = f.player("other", 1);
        enemy.hand = [card("dark1"), card("dark2")];
        const hit = { name, card: card("use", name), player: source, target: enemy };
        const request = response(enemy, source, hit, false, name === "sha" ? "chooseToUse" : "chooseToRespond");
        request[name === "sha" ? "toUse" : "toRespond"] = false;
        assert.equal(await observe(f, name === "sha" ? "chooseToUseAfter" : "chooseToRespondAfter", request), true);
        if (name === "sha") assert.equal(await observe(f, "shaHit", hit), false);
        assert.equal(enemy._nihilShenNoShanVulnerable, undefined);
        const zero = { ...hit, baseDamage: 0 };
        assert.equal(name === "sha" ? await observe(f, "shaHit", zero) :
            await observe(f, "chooseToRespondAfter", response(enemy, source, zero, false)), false);
    }
    const f = fixture(), ally = f.player("ally", 1); ally.linked = true;
    ally.hand = [card("dark1"), card("dark2")];
    assert.equal(await observe(f, "shaHit", { name: "sha", card: card("use", "sha", "fire"),
        target: ally, player: f.p }), false);
    assert.equal(ally._nihilShenNoShanVulnerable, undefined);
});
test("successful and partial multiple-Shan responses invalidate memory and suppress forced hits", async () => {
    for (const name of ["sha", "wanjian"]) {
        const f = fixture(), enemy = f.player("enemy"); enemy.hand = [card("dark1"), card("dark2")];
        const source = f.player("other", 1), hit = { name, card: card("use", name), player: source, target: enemy };
        enemy._nihilShenNoShanVulnerable = true;
        const trigger = name === "sha" ? "chooseToUseAfter" : "chooseToRespondAfter";
        const requestName = name === "sha" ? "chooseToUse" : "chooseToRespond";
        assert.equal(await observe(f, trigger, response(enemy, source, hit, true, requestName)), true);
        assert.equal(enemy._nihilShenNoShanVulnerable, undefined);
        assert.equal(name === "sha" ? await observe(f, "shaHit", hit) :
            await observe(f, trigger, response(enemy, source, hit, false)), false);
        assert.equal(enemy._nihilShenNoShanVulnerable, undefined);
        const next = { ...hit, card: card("independent", name) };
        assert.equal(name === "sha" ? await observe(f, "shaHit", next) :
            await observe(f, trigger, response(enemy, source, next, false)), true);
    }
});
test("empty gains preserve no-Shan memory and a newly public Shan closes a cached attack", async () => {
    const f = fixture(); f.p.shi = 3; f.p.hand = [card("attack")];
    const enemy = f.player("enemy"); enemy.hp = 2;
    enemy.hand = [card("dark1"), card("dark2")]; enemy._nihilShenNoShanVulnerable = true;
    const event = f.request(); assert.ok(event.ai1(f.p.hand[0]) > 0);
    assert.equal(f.mod.skill.nihil_badao.subSkill.ai_vulnerable_clear.filter({ getg: () => [] }), false);
    enemy.shown = [card("public", "shan")];
    assert.equal(event.ai1(f.p.hand[0]), -1);
    assert.equal(event._nihilShenAttackPlan.action, "HOLD");
});
test("many-hand enemies cannot bypass Basic vulnerability gate through normal or cash attacks", () => {
    for (const blocked of [false, true]) for (const shi of [0, 2, 3, 17]) {
        const f = fixture(); f.p.shi = shi; f.p.hp = 1; f.p.damaged = true; f.p.hand = [card("attack")];
        const enemy = f.player("enemy"); enemy.hp = 2; enemy.hand = [card("dark1"), card("dark2"), card("dark3")];
        if (blocked) { enemy.armor = card("armor", "renwang"); f.p.hand[0].color = "black"; }
        const event = f.request(); assert.equal(f.basic.chooseCard(event.ai1), false);
        assert.equal(event._nihilShenAttackPlan.action, "HOLD");
    }
});
(async () => { for (const c of cases) { await c.run(); console.log("PASS", c.name); }
    console.log(`${cases.length} runtime tests passed using ${path.join(engine, "ai/basic.js")}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
