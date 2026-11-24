"use strict";

// Replay 皇命 results through the installed engine's unmodified dispatch and
// useResult/useCard methods. This checks the engine boundary, not just mocks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const extension = process.env.NIHIL_EXTENSION_ROOT || path.resolve(__dirname, "../nihilphile武将包");
const engine = process.env.NONAME_ENGINE_ROOT ||
    "F:/AI_project/nameless_game/无名杀子琪懒人包v1.11.3-win32-x64/resources/app";
const playerSource = fs.readFileSync(path.join(engine, "noname/library/element/player.js"), "utf8");
const contentSource = fs.readFileSync(path.join(engine, "noname/library/element/content.js"), "utf8");
const clickSource = fs.readFileSync(path.join(engine, "noname/ui/click/index.js"), "utf8");

function fixture(mode) {
    const uses = [], order = [], pile = [], discarded = [], controls = [];
    const zhaoyun = mode.startsWith("zhaoyun-");
    const yuceFollow = mode === "yuce-follow" || zhaoyun;
    const canTarget = !["blocked", "equip-only"].includes(mode);
    let current;
    const status = {};
    const ui = { cardPile: { childNodes: pile }, click: {}, create: {
        control(label, position, click) {
            const control = { label, position, click, closed: false, close() { this.closed = true; } };
            controls.push(control);
            return control;
        },
    } };
    const game = {
        hasPlayer(fn) { return this.players.some(fn); },
        players: [], phaseNumber: 7, online: false, log() {}, stopCountChoose() {},
        uncheck() {}, resume() {}, check() { current.custom.add.card(); },
        createEvent(name) {
            const parent = current;
            const event = { name, setContent(content) { this.content = content; },
                set(k, v) { this[k] = v; return this; },
                getParent(query) { return !query || parent?.name === query ? parent : parent?.getParent(query); },
                async forResult() {
                    const previous = current;
                    current = status.event = this;
                    try {
                        await this.content(this, {}, this.player);
                    } finally {
                        current = status.event = previous;
                    }
                },
                then(resolve) {
                if (name === "useCard") order.push("sha resolved");
                // Awaiting a game event resolves to its result, not to itself.
                resolve({ bool: true });
            } };
            if (name === "useCard") uses.push(event);
            return event;
        },
        async cardsGotoOrdering(cards) {
            for (const c of cards) { pile.splice(pile.indexOf(c), 1); c.position = "o"; }
        },
        async cardsDiscard(cards) {
            for (const c of cards) { c.position = "d"; discarded.push(c); }
        },
    };
    const lib = { skill: {}, card: { sha: {} }, filter: {
        cardEnabled: () => true, cardUsable: () => true,
        targetEnabled: (card, p, target) => canTarget && p !== target,
        targetEnabledx: (card, p, target) => canTarget && p !== target,
        filterCard: () => true,
    } };
    const get = {
        name(c, player) {
            return player?.lixing && lib.skill.ycc_lixing_sha.mod.cardname(c) || c.name;
        },
        translation: p => p.id || p,
        prompt: () => "皇命",
        attitude: (from, to) => yuceFollow && to === owner ? 5 : -5,
        effect(target) {
            assert.ok(target, "Sha effect requires an actual target");
            return yuceFollow || ["ai-discard", "lixing-discard"].includes(mode) ? -10 : 5;
        },
        order: card => card?.name === "sha" ? 9 : 3,
        value: () => 1, useful: () => 1,
        info: item => typeof item === "string" ? lib.skill[item] : item && lib.card[item.name],
        event: () => current,
        player: () => current.player,
        card: () => null,
        autoViewAs: c => ({ ...c }),
        position: c => c.position,
        is: { object: x => x && typeof x === "object" },
        itemtype(x) {
            if (Array.isArray(x)) return x.length && x[0].isPlayer ? "players" : "cards";
            if (x && x.isPlayer) return "player";
            if (x && x.position) return "card";
            return null;
        },
    };
    const context = vm.createContext({ window: {}, game, lib, get, ui, _status: status, console });
    for (const file of ["ycc", "mikasa"]) {
        vm.runInContext(fs.readFileSync(path.join(extension, "module", file + ".js"), "utf8"), context);
        Object.assign(lib.skill, context.window.nihilModules[file].skill);
    }
    const methods = vm.runInContext("(class {" + playerSource.slice(
        playerSource.indexOf("  useResult(result, event) {"),
        playerSource.indexOf("  useSkill(", playerSource.indexOf("  useCard(params) {")),
    ) + "}).prototype", context);
    const finishDiscard = vm.runInContext("({" + contentSource.slice(
        contentSource.indexOf("  discardPlayerCard: ["), contentSource.indexOf("  gainPlayerCard: ["),
    ) + "}).discardPlayerCard.at(-1)", context);
    const steps = vm.runInContext("({" + contentSource.slice(
        contentSource.indexOf("  chooseToUse: ["), contentSource.indexOf("  chooseToRespond: ["),
    ) + "}).chooseToUse", context);
    const dispatch = steps.find(step => step.toString().includes("player.useResult(event.result, event)"));
    assert.ok(dispatch, "installed chooseToUse dispatch must be available");
    const prepare = steps.find(step => step.toString().includes("next.setContent(info.precontent)"));
    ui.click.cancel = vm.runInContext("(class {" + clickSource.slice(
        clickSource.indexOf("  cancel(node) {"), clickSource.indexOf("  logv(e) {"),
    ) + "}).prototype.cancel", context);
    const target = { id: "target", isPlayer: true, isIn: () => mode !== "all-dead" };
    const otherTarget = { id: "second target", isPlayer: true, isIn: () => true };
    const originalTargets = mode === "multiple" ? [otherTarget, target] : [target];
    const handSha = { name: "sha", nature: "thunder", position: "h", hasGaintag: () => false };
    const markedCards = ["tao"].map(name => ({
        name, position: "h", tag: null,
        hasGaintag(tag) { return this.tag === tag; },
    }));
    if (zhaoyun) {
        const src = fs.readFileSync(path.join(engine, "character/standard/skill.js"), "utf8");
        lib.skill.longdan_sha = vm.runInContext("({" + src.slice(src.indexOf("\tlongdan: {"),
            src.indexOf("\n\t},", src.indexOf("\tlongdan: {")) + 4) + "}).longdan.subSkill.sha", context);
    }
    const usesLixing = mode === "yuce-follow" || ["lixing-sha", "lixing-discard"].includes(mode);
    const zhaoHand = ["nanman", "tao", mode === "zhaoyun-sha" ? "sha" : mode === "zhaoyun-longdan" ? "shan" : "tao"]
        .map(name => ({ name, position: "h", hasGaintag: () => false }));
    const hand = zhaoyun ? zhaoHand : yuceFollow ? [markedCards[0]] : usesLixing ? [handSha, ...markedCards] : mode === "fallback" ? [handSha] : [];
    const equipment = { name: "tengjia", position: "e" };
    const fallbackHandCard = { name: "shan", position: "h" };
    let skillLog;
    const chosen = {
        id: zhaoyun ? "zhaoyun" : "mikasa", isPlayer: true, storage: {}, ai: {}, inGame: true,
        isIn() { return this.inGame; },
        hasSha() { throw new Error("皇命不得用 hasSha 预判是否进入出杀界面"); },
        countCards: (zone, name) => zhaoyun ? hand.filter(c => !name || c.name === name).length :
            zone.includes("h") && !["no-discard", "equip-only"].includes(mode) ? 1 : 0,
        countDiscardableCards(by, zone) {
            assert.equal(by, owner);
            if (mode === "equip-only") return Number(zone.includes("e"));
            return zone.includes("h") ? this.countCards("h") : 0;
        },
        getCards: (zone, filter = () => true) => hand.filter(filter),
        addTempSkill(skill) { assert.equal(skill, "ycc_lixing_sha"); this.lixing = true; },
        addGaintag(cards, tag) { for (const card of cards) card.tag = tag; },
        getModableSkills: () => [], hasSkillTag: () => false,
        logAi() {}, logSkill() {}, syncStorage() {}, async showCards() {},
        chooseCard() { return choice({ bool: true, cards: [handSha] }); },
        async draw(num) {
            assert.equal(num, 1);
            order.push("responder draws");
        },
        discard(cards) {
            assert.equal(cards.length, 1);
            const [card] = cards;
            if (hand.includes(card)) hand.splice(hand.indexOf(card), 1);
            card.position = "d";
            discarded.push(card);
            return {};
        },
        useResult: methods.useResult, useCard: methods.useCard,
        useSkill() { throw new Error("failed Fengren must not execute useSkill"); },
        chooseToUse(config) {
            const req = { name: "chooseToUse", ...config,
                getParent(query, forced, includeSelf) {
                    if (includeSelf && query === this.name) return this;
                },
                player: chosen, isMine: () => mode.startsWith("button"), resume() {},
                restore() { delete this.skill; },
                set(k, v) { this[k] = v; return this; },
                goto() { this.retried = true; },
                async forResult() {
                    if (usesLixing) {
                        const lixing = lib.skill.ycc_lixing;
                        assert.deepEqual(Array.from(lixing.getIndex(skillLog, owner)), [chosen]);
                        await lixing.content({ cards: yuceFollow ? hand : markedCards, targets: [chosen] }, skillLog, owner);
                    }
                    current = req;
                    status.event = req;
                    assert.equal(req.filterTarget({ name: "sha" }, chosen, { id: "unrelated" }), false);
                    assert.equal(req.filterTarget({ name: "sha" }, chosen, target), canTarget);
                    if (mode === "multiple") {
                        assert.equal(req.filterTarget({ name: "sha" }, chosen, otherTarget), true);
                    }
                    let result;
                    if (mode === "choose-weapons") {
                        // Like 闇锋, the entry skill opens a button dialog before the
                        // backup skill supplies a card. Native AI calls ai2() here.
                        lib.skill.weaponChoice = { enable: "chooseToUse", chooseButton: { select: 2 } };
                        const gameEvent = fs.readFileSync(path.join(engine, "noname/library/element/gameEvent.js"), "utf8");
                        const backup = vm.runInContext("(class {" + gameEvent.slice(gameEvent.indexOf("  backup(skill)"), gameEvent.indexOf("  restore()")) + "}).prototype.backup", context);
                        const basic = fs.readFileSync(path.join(engine, "noname/ai/basic.js"), "utf8");
                        const chooseTarget = vm.runInContext("(class {" + basic.slice(basic.indexOf("  chooseTarget(check)"), basic.indexOf("\n}", basic.indexOf("  chooseTarget(check)"))) + "}).prototype.chooseTarget", context);
                        backup.call(req, "weaponChoice");
                        assert.equal(req.filterTarget, undefined);
                        assert.equal(chooseTarget(req.ai2), true, "AI may proceed to the weapon dialog");
                        Object.assign(req, req._backup);
                        delete req.skill;
                        assert.ok(req.ai2(target) > 0);
                        result = { bool: true, card: handSha, cards: [handSha], targets: [target] };
                    } else if (mode === "empty") {
                        // Failed view-as result: the native engine otherwise
                        // forwards undefined to useCard and reads info.noai.
                        result = { bool: true, cards: [], targets: [target] };
                    } else if (mode === "unknown") {
                        result = { bool: true, card: { name: "missing_card" }, cards: [], targets: [target] };
                    } else if (mode.startsWith("button")) {
                        req.custom.add.card();
                        req.custom.add.card();
                        assert.equal(controls.length, 1, "checking selection must not duplicate the discard button");
                        assert.equal(controls[0].label, "令其弃牌");
                        if (mode === "button-skill") req.skill = "nihil_fengren";
                        controls[0].click();
                        result = req.result;
                    } else if (["equip-only", "decline", "no-discard", "blocked", "ai-discard", "lixing-discard"].includes(mode)) {
                        result = { bool: false, cards: [] };
                    } else if (["hand", "multiple"].includes(mode)) {
                        result = { bool: true, card: handSha, cards: [handSha], targets: [target] };
                    } else if (zhaoyun) {
                        assert.equal(req.huangmingDiscardForYuce, false);
                        const slash = hand.find(c => req.filterCard(c, chosen, req) && req.ai1(c) > 0);
                        const skill = lib.skill.longdan_sha;
                        const dodge = hand.find(c => c.name === skill.filterCard.name);
                        if (slash && req.ai2(target) > 0) {
                            result = { bool: true, card: slash, cards: [slash], targets: [target] };
                        } else if (dodge && skill.viewAsFilter(chosen) !== false && req.ai1("longdan_sha") > 0 &&
                            skill.check(dodge) > 0 && req.filterCard(skill.viewAs, chosen, req) && req.ai2(target) > 0) {
                            result = { bool: true, card: skill.viewAs, cards: [dodge], targets: [target], skill: "longdan_sha" };
                        } else {
                            result = { bool: false };
                        }
                    } else if (yuceFollow) {
                        const card = hand[0];
                        assert.equal(req.filterCard(card, chosen, req), true);
                        result = req.ai1(card) > 0 && req.ai2(target) > 0
                            ? { bool: true, card: { name: get.name(card, chosen) }, cards: [card], targets: [target] }
                            : { bool: false };
                    } else if (mode === "lixing-sha") {
                        for (const card of markedCards) assert.equal(req.filterCard(card, chosen, req), true);
                        const [card] = hand.slice().sort((a, b) => req.ai1(b) - req.ai1(a));
                        assert.ok(markedCards.includes(card));
                        result = { bool: true, card: { name: get.name(card, chosen) }, cards: [card], targets: [target] };
                    } else {
                        result = { bool: true, card: { name: "sha" }, cards: [], targets: [target], skill: "nihil_fengren" };
                    }
                    req.result = result;
                    await prepare(req, null, chosen);
                    await dispatch(req, null, chosen);
                    if (req.retried) return { bool: false, cards: [] };
                    return req.result;
                },
            };
            chosen.request = req;
            return req;
        },
    };
    function choice(result) { return { set() { return this; }, async forResult() { return result; } }; }
    const owner = {
        id: "ycc", countCards: () => zhaoyun ? 5 : 0, isIn: () => true,
        discardPlayerCard(victim, zone, forced) {
            assert.equal(victim, chosen);
            assert.equal(zone, "he");
            assert.equal(forced, true);
            assert.ok(chosen.countDiscardableCards(this, zone));
            order.push("owner discards");
            const cards = [mode === "equip-only" ? equipment : hand[0] || fallbackHandCard];
            const event = { target: chosen, cards };
            return finishDiscard(event, null, owner).then(() => assert.equal(event.done.discarder, owner));
        },
        logSkill(skill, target) { skillLog = { skill, targets: [target] }; },
        async showCards() { assert.fail("历行转化手牌时不得公开展示"); },
        chooseTarget(...args) {
            const filter = args.find(arg => typeof arg === "function");
            return {
                set(key, value) { this[key] = value; return this; },
                async forResult() {
                    current = this;
                    assert.ok(filter(null, owner, chosen), "view-as Sha works without a known hand Sha");
                    assert.equal(filter(null, owner, owner), false);
                    for (const original of originalTargets) {
                        assert.equal(filter(null, owner, original), false);
                    }
                    return { bool: true, targets: [chosen] };
                },
            };
        },
    };
    game.players = [owner, chosen, ...originalTargets];
    if (zhaoyun) game.players.push({ id: "yinhua", countCards: () => 5 });
    if (mode === "top") pile.push({ name: "sha", nature: "fire", position: "c" });
    if (["fallback", "failed"].includes(mode)) pile.push({ name: "tao", position: "c" });
    return { uses, order, chosen, owner, discarded, controls, async run() {
        if (yuceFollow) {
            const steps = vm.runInContext("({" + contentSource.slice(
                contentSource.indexOf("  chooseUseTarget: ["), contentSource.indexOf("  async chooseToDuiben(")
            ) + "}).chooseUseTarget", context);
            const phaseEnd = { triggername: "phaseUseEnd" };
            current = status.event = { getParent: predicate => predicate(phaseEnd) ? phaseEnd : undefined };
            status.currentPhase = owner;
            owner.isPhaseUsing = () => true;
            owner.hasSkill = () => true;
            owner.chooseBool = () => choice({ bool: true });
            owner.useCard = (card, targets) => {
                const use = { card, targets, player: owner,
                    then(resolve, reject) {
                        assert.equal(use.skill, "ycc_yuce");
                        lib.skill.ycc_huangming.content({}, use, owner).then(resolve, reject);
                    },
                };
                return use;
            };
            owner.chooseUseTarget = (card, forced, addCount) => ({
                card, forced, addCount, targets2: originalTargets,
                set(key, value) { this[key] = value; return this; },
                then(resolve, reject) { steps.at(-1)(this, null, owner, { bool: true }).then(resolve, reject); },
            });
            await lib.skill.ycc_yuce.content(phaseEnd, {}, owner);
        } else {
            const trigger = { card: { name: "sha" }, targets: originalTargets };
            if (mode === "equip-only") {
                assert.ok(lib.skill.ycc_huangming.filter(trigger, owner), "equipment-only responder remains eligible with no legal attack");
            }
            await lib.skill.ycc_huangming.content({ finish() {} }, trigger, owner);
        }
    } };
}

(async () => {
    for (const mode of ["choose-weapons", "empty", "unknown", "equip-only", "decline", "failed", "top", "fallback", "hand", "multiple", "no-discard", "blocked", "all-dead", "button", "button-skill", "ai-discard", "lixing-sha", "lixing-discard", "yuce-follow", "zhaoyun-sha", "zhaoyun-longdan", "zhaoyun-no-sha"]) {
        const f = fixture(mode);
        await f.run();
        const success = ["choose-weapons", "zhaoyun-sha", "zhaoyun-longdan", "yuce-follow", "top", "fallback", "hand", "multiple", "lixing-sha"].includes(mode);
        assert.equal(f.uses.length, success ? 1 : 0, mode + ": only an actual Sha may reach useCard");
        assert.deepEqual(f.order, success ? ["sha resolved", "responder draws"] :
            mode === "no-discard" ? [] : ["owner discards"]);
        if (mode === "all-dead") {
            assert.equal(f.chosen.request, undefined, "dead targets leave only the discard option");
        } else {
            assert.equal(f.chosen.request.nodistance, true);
            assert.equal(f.chosen.request.ai2(f.chosen.request.huangmingTargets.at(-1)) > 0, !["ai-discard", "lixing-discard"].includes(mode));
        }
        if (success) {
            assert.equal(f.uses[0].card.name, "sha");
            assert.equal(f.uses[0].card.nature, ["zhaoyun-sha", "zhaoyun-longdan", "lixing-sha", "yuce-follow"].includes(mode) ? undefined : mode === "top" ? "fire" : "thunder");
            assert.notEqual(f.uses[0].addCount, false);
            assert.equal(f.uses[0].targets[0].id, "target");
        }
        if (mode === "zhaoyun-longdan") assert.equal(f.uses[0].cards[0].name, "shan");
        if (mode === "failed") {
            assert.equal(f.chosen.storage.nihil_fengren_failed_turn, 7);
            assert.equal(f.chosen.request.retried, undefined, "failed Fengren must reach discard without reopening chooseToUse");
        }
        if (mode === "lixing-sha") assert.equal(f.uses[0].cards.length, 1);
        if (mode === "equip-only" || mode === "lixing-discard") {
            assert.equal(f.discarded.length, 1);
            assert.equal(f.discarded[0].position, "d");
            if (mode === "equip-only") assert.equal(f.discarded[0].name, "tengjia");
        }
        if (mode.startsWith("button")) {
            assert.equal(f.controls[0].closed, true, "native completion must remove the discard control");
            assert.equal(f.chosen.storage.nihil_fengren_failed_turn, undefined, "declining does not activate Fengren");
        }
        console.log("PASS 皇命 / " + mode);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
