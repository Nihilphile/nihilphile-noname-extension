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
        players: [], phaseNumber: 7, online: false, log() {}, stopCountChoose() {},
        uncheck() {}, resume() {}, check() { current.custom.add.card(); },
        createEvent(name) {
            const event = { name, setContent(content) { this.content = content; },
                set(k, v) { this[k] = v; return this; }, getParent: () => current,
                async forResult() { await this.content(this, {}, this.player); },
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
        cardEnabled: () => true,
        targetEnabled: (card, p, target) => mode !== "blocked" && p !== target,
        targetEnabledx: (card, p, target) => mode !== "blocked" && p !== target,
        filterCard: () => true,
    } };
    const get = {
        name: c => c.name,
        translation: p => p.id || p,
        prompt: () => "皇命",
        attitude: () => -5,
        effect: () => mode === "ai-discard" ? -10 : 5,
        order: () => 3,
        value: () => 1, useful: () => 1,
        info: item => typeof item === "string" ? lib.skill[item] : item && lib.card[item.name],
        event: () => current,
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
    const steps = vm.runInContext("({" + contentSource.slice(
        contentSource.indexOf("  chooseToUse: ["), contentSource.indexOf("  chooseToRespond: ["),
    ) + "}).chooseToUse", context);
    const dispatch = steps.find(step => step.toString().includes("player.useResult(event.result, event)"));
    assert.ok(dispatch, "installed chooseToUse dispatch must be available");
    const prepare = steps.find(step => step.toString().includes("next.setContent(info.precontent)"));
    ui.click.cancel = vm.runInContext("(class {" + clickSource.slice(
        clickSource.indexOf("  cancel(node) {"), clickSource.indexOf("  logv(e) {"),
    ) + "}).prototype.cancel", context);
    const target = { id: "target", isPlayer: true, isIn: () => true };
    const handSha = { name: "sha", nature: "thunder", position: "h" };
    const chosen = {
        id: "mikasa", isPlayer: true, storage: {}, ai: {}, inGame: true,
        isIn() { return this.inGame; },
        hasSha() { throw new Error("皇命不得用 hasSha 预判是否进入出杀界面"); },
        countCards: () => 1, countDiscardableCards: () => mode === "no-discard" ? 0 : 1,
        getCards: () => mode === "fallback" ? [handSha] : [],
        getModableSkills: () => [], hasSkillTag: () => false,
        logAi() {}, logSkill() {}, syncStorage() {}, async showCards() {},
        chooseCard() { return choice({ bool: true, cards: [handSha] }); },
        useResult: methods.useResult, useCard: methods.useCard,
        useSkill() { throw new Error("failed Fengren must not execute useSkill"); },
        chooseToUse(config) {
            const req = { name: "chooseToUse", ...config, getParent: () => null,
                player: chosen, isMine: () => mode.startsWith("button"), resume() {},
                restore() { delete this.skill; },
                set(k, v) { this[k] = v; return this; },
                goto() { this.retried = true; },
                async forResult() {
                    current = req;
                    status.event = req;
                    let result;
                    if (mode === "empty") {
                        // Failed view-as result: the native engine otherwise
                        // forwards undefined to useCard and reads info.noai.
                        result = { bool: true, cards: [], targets: [target] };
                    } else if (mode === "unknown") {
                        result = { bool: true, card: { name: "missing_card" }, cards: [], targets: [target] };
                    } else if (mode.startsWith("button")) {
                        req.custom.add.card();
                        req.custom.add.card();
                        assert.equal(controls.length, 1, "checking selection must not duplicate the discard button");
                        assert.equal(controls[0].label, "被弃牌");
                        if (mode === "button-skill") req.skill = "nihil_fengren";
                        controls[0].click();
                        result = req.result;
                    } else if (["decline", "no-discard", "blocked", "ai-discard"].includes(mode)) {
                        result = { bool: false, cards: [] };
                    } else if (mode === "hand") {
                        result = { bool: true, card: handSha, cards: [handSha], targets: [target] };
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
        id: "ycc", countCards: () => 1, logSkill() {}, line() {},
        chooseTarget(...args) {
            const filter = args.find(arg => typeof arg === "function");
            assert.ok(filter(null, owner, chosen), "even without hand sha the chosen player must be selectable");
            assert.equal(filter(null, owner, owner), false);
            assert.equal(filter(null, owner, target), false);
            return choice({ bool: true, targets: [chosen] });
        },
        chooseCard() { order.push("gift chosen"); return choice({ bool: true, cards: [{ name: "tao" }] }); },
        async give() { order.push("gift given"); },
        async discardPlayerCard(p, zone, forced) {
            assert.equal(p, chosen); assert.equal(zone, "he"); assert.equal(forced, true);
            order.push("discard chosen card");
        },
    };
    game.players = [owner, chosen, target];
    if (mode === "top") pile.push({ name: "sha", nature: "fire", position: "c" });
    if (["fallback", "failed"].includes(mode)) pile.push({ name: "tao", position: "c" });
    return { uses, order, chosen, discarded, controls, async run() {
        await lib.skill.ycc_huangming.content({ finish() {} }, { card: { name: "sha" }, targets: [target] }, owner);
    } };
}

(async () => {
    for (const mode of ["empty", "unknown", "decline", "failed", "top", "fallback", "hand", "no-discard", "blocked", "button", "button-skill", "ai-discard"]) {
        const f = fixture(mode);
        await f.run();
        const success = ["top", "fallback", "hand"].includes(mode);
        assert.equal(f.uses.length, success ? 1 : 0, mode + ": only an actual sha may reach useCard");
        assert.deepEqual(f.order, success ? ["sha resolved", "gift chosen", "gift given"] :
            mode === "no-discard" ? [] : ["discard chosen card"], mode + ": no sha means discard instead of gift");
        assert.equal(f.chosen.request.forced, false);
        assert.equal(f.chosen.request.filterTarget({ name: "sha" }, f.chosen, { id: "other" }), false);
        if (success) {
            assert.equal(f.uses[0].card.name, "sha");
            assert.equal(f.uses[0].card.nature, mode === "top" ? "fire" : "thunder");
            assert.equal(f.uses[0].addCount, false);
            assert.equal(f.uses[0].targets[0].id, "target");
        }
        if (mode === "failed") {
            assert.equal(f.chosen.storage.nihil_fengren_failed_turn, 7);
            assert.equal(f.chosen.request.retried, undefined, "failed Fengren must reach discard without reopening chooseToUse");
        }
        if (mode.startsWith("button")) {
            assert.equal(f.controls[0].closed, true, "native completion must remove the discard control");
            assert.equal(f.chosen.storage.nihil_fengren_failed_turn, undefined, "declining does not activate Fengren");
        }
        assert.equal(f.chosen.request.ai1({ name: "sha" }) > 0, mode !== "ai-discard");
        assert.equal(f.chosen.request.ai2() > 0, mode !== "ai-discard");
        console.log("PASS 皇命 / " + mode);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
