"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const engine = path.resolve(process.env.NONAME_ENGINE_ROOT || path.join(root, "../子琪源码/电脑版"));
const cases = [];
const test = (name, run) => cases.push({ name, run });
const MARK = "nihil_longyou", TURN = "nihil_caisheng_turn", AFFECTED = "nihil_caisheng_affected";
const read = relative => fs.readFileSync(path.join(engine, relative), "utf8");
const unbind = source => source.replace(/^import .+;\r?$/gm, "").replace(/export\s*\{[^}]*\};?/g, "");

// A DOM adapter exercises the real Player.update/$update paths without a browser.
function element() {
    const node = { children: [], style: {}, dataset: {}, className: "", title: "",
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; },
        remove() { if (this.parentNode) this.parentNode.removeChild(this); },
        removeAttribute(name) { delete this[name]; },
        querySelectorAll(selector) { const names = selector.split(",").map(s => s.trim().slice(1)); return this.children.filter(c => names.some(n => c.classList.contains(n))); },
    };
    node.classList = {
        contains(name) { return node.className.split(" ").includes(name); },
        add(name) { if (!this.contains(name)) node.className = (node.className + " " + name).trim(); },
        remove(name) { node.className = node.className.split(" ").filter(n => n !== name).join(" "); },
        toggle(name, value) { if (value === undefined) value = !this.contains(name); this[value ? "add" : "remove"](name); },
    };
    Object.defineProperties(node, {
        childNodes: { get() { return this.children; } }, lastChild: { get() { return this.children.at(-1); } },
        innerHTML: { get() { return this.html || ""; }, set(value) { this.children = []; this.html = String(value); if (this.html.includes("<div>")) this.appendChild(element()); } },
    });
    node.ownerDocument = { createElement: element };
    return node;
}

function fixture(zusOrder) {
    const lib = { element: { VCard: class { constructor(card) { Object.assign(this, card); } } }, card: {}, skill: {}, config: {}, translate: {}, phaseName: [], natureAudio: { hujia_damage: {}, damage: {} },
        natureSeparator: "|", linked: ["fire", "thunder"], announce: { publish() {} } };
    const history = { everything: [], changeHp: [] }, trace = [];
    const game = { players: [], dead: [], globalEventHandlers: { addHandlerToEvent() {} },
        getGlobalHistory(key) { return key ? history[key] : history; },
        hasPlayer(filter) { return this.players.some(p => p.isIn() && filter(p)); },
        log() {}, callHook() {}, addVideo() {}, broadcast() {}, broadcastAll() {}, async delayx() {},
        hasNature(card, nature) { return nature ? card.nature === nature : !!card.nature; },
        import(type, factory) { const pack = factory(); Object.assign(lib.card, pack.card); Object.assign(lib.skill, pack.skill); },
        checkMod(...args) {
            const key = args.at(-2), owner = args.at(-1);
            if ((key === "cardEnabled" && owner.cardBanned) || (key === "targetEnabled" && owner.targetBanned)) return false;
            let result = args.at(-3);
            for (const id of owner.skills || []) {
                const mod = lib.skill[id]?.mod?.[key];
                if (mod) {
                    const value = mod(...args.slice(0, -3), result);
                    if (value !== undefined) result = value;
                }
            }
            return result;
        },
    };
    const _status = { dying: [], dieClose: [], pauseManager: { async waitPause() {} } };
    const get = { name: card => card.name, info: card => typeof card === "string" ? lib.skill[card] || lib.card[card] : lib.card[card.name],
        event: () => _status.event, prompt: id => id,
        translation: obj => Array.isArray(obj) ? obj.map(p => p.playerid).join("、") : obj.playerid || String(obj), cnNumber: String,
        autoViewAs: card => card, copy: value => Array.isArray(value) ? value.slice() : value,
        select: value => typeof value === "number" ? [value, value] : value,
        natureList: value => value ? value.split("|") : [],
        nature: card => card.nature,
        tag: (card, name) => lib.card[card.name]?.ai?.tag?.[name],
        distance: (player, target) => target.distance || 1,
        itemtype: value => value?.playerid ? "player" : value?.physical ? "card" : value?.name && value?.start ? "event" : undefined,
        is: { newLayout: () => false, object: value => value && typeof value === "object", sameNature: () => false },
        attitude: (player, target) => player === target ? 5 : -5,
        effect: (target, card, player) => target === player ? -1 : 1,
        damageEffect: () => -1,
        evtprompt(event, prompt) { event.prompt = prompt; },
    };
    const ctx = vm.createContext({ lib, game, get, _status, window: {}, ui: { selected: { targets: [] } }, ai: {}, console,
        setTimeout: callback => callback(), HTMLDivElement: class {}, CacheContext: { inject() {} } });
    vm.runInContext(`
        const AsyncFunction = (async function(){}).constructor;
        const GeneratorFunction = (function*(){}).constructor;
        const AsyncGeneratorFunction = (async function*(){}).constructor;
        const security = { getIsolatedsFrom() { return [null, null, Function]; }, isSandboxRequired() { return false; } };
        const ErrorManager = { setCodeSnippet() {} };
        class CodeSnippet {}
        Array.prototype.remove = function(value) { const i = this.indexOf(value); if (i >= 0) this.splice(i, 1); return this; };
    `, ctx);
    for (const name of ["ContentCompilerBase", "ArrayCompiler", "AsyncCompiler", "StepCompiler", "ContentCompiler"]) {
        vm.runInContext(unbind(read(`noname/library/element/GameEvent/compilers/${name}.js`)), ctx, { filename: name + ".js" });
    }
    for (const name of ["gameEvent", "GameEvent/GameEventManager", "player", "content"]) {
        vm.runInContext(unbind(read(`noname/library/element/${name}.js`)), ctx, { filename: name + ".js" });
    }
    const { GameEvent, Player, Content, manager, compiler } = vm.runInContext(`
        lib.element.GameEvent = GameEvent;
        lib.element.Player = Player;
        lib.element.content = Content;
        const manager = new GameEventManager();
        ({ GameEvent, Player, Content, manager, compiler });
    `, ctx);
    _status.eventManager = manager;
    Object.defineProperty(_status, "event", { get: () => manager.getStatusEvent(), set: value => manager.setStatusEvent(value) });
    const initial = new GameEvent("testRoot", false, manager);
    initial.finish();
    manager.setStatusEvent(initial);
    game.createEvent = function (name, trigger, parent) {
        const event = new GameEvent(name, trigger, manager);
        const current = parent || manager.getStartedEvent();
        if (current) current.next.push(event);
        else manager.setStatusEvent(event);
        return event;
    };
    vm.runInContext(unbind(read("card/standard.js")), ctx);
    const library = read("noname/library/index.js");
    const filterStart = library.indexOf("  filter = {") + "  filter = ".length;
    const filterEnd = library.indexOf("\n  };", filterStart) + 4;
    lib.filter = vm.runInContext("(" + library.slice(filterStart, filterEnd) + ")", ctx);
    ctx.ui.create = { div: parent => parent.appendChild(element()) };
    function installZus() {
        const reference = path.join(root, ".audit/zus-reference/module/haoyang.js");
        assert.ok(fs.existsSync(reference), "Zus reference module is required for this compatibility check");
        vm.runInContext(fs.readFileSync(reference, "utf8"), ctx);
        ctx.window.zusfylriModules.haoyang.init(lib, game, ctx.ui, get, ctx.ai, _status);
    }
    if (zusOrder === "before") installZus();
    vm.runInContext(fs.readFileSync(path.join(root, "nihilphile武将包/module/longyou_hp.js"), "utf8"), ctx);
    vm.runInContext(fs.readFileSync(path.join(root, "nihilphile武将包/module/baichi.js"), "utf8"), ctx);
    const mod = ctx.window.nihilModules.baichi;
    Object.assign(lib.skill, mod.skill);
    mod.init();
    if (zusOrder === "after") installZus();
    for (const [id, skill] of Object.entries(mod.skill)) {
        for (const [name, sub] of Object.entries(skill.subSkill || {})) lib.skill[id + "_" + name] = sub;
    }
    function expanded(player) {
        return player.skills.flatMap(id => [id, ...(Array.isArray(lib.skill[id]?.group) ? lib.skill[id].group : [])]);
    }
    // UI, network transport and trigger selection are adapters. The event queue,
    // compilers, player HP methods, HP contents and card legality filters are native.
    GameEvent.prototype.trigger = function (name) {
        trace.push(["trigger", name, this.player?.playerid, this.num]);
        const matches = [];
        for (const player of game.players) {
            if (!player.isIn()) continue;
            for (const id of expanded(player)) {
                const skill = lib.skill[id], trigger = skill?.trigger;
                if (!trigger) continue;
                const accepts = value => Array.isArray(value) ? value.includes(name) : value === name;
                if (accepts(trigger.global) || (this.player === player && accepts(trigger.player)) ||
                    (this.source === player && accepts(trigger.source))) matches.push({ player, skill, id });
            }
        }
        if (!matches.length || (this.filterStop && this.filterStop())) return;
        matches.sort((a, b) => (b.skill.firstDo ? 1 : b.skill.lastDo ? -1 : 0) - (a.skill.firstDo ? 1 : a.skill.lastDo ? -1 : 0) ||
            (b.skill.priority || 0) - (a.skill.priority || 0));
        const trigger = this;
        const dispatch = game.createEvent("testDispatch", false, this);
        dispatch.setContent(vm.runInContext("(async function(event) { await event.dispatch(); })", ctx));
        dispatch.dispatch = async () => {
            for (const match of matches) {
                if (trigger._cancelled) break;
                if (!match.player.isIn() || (match.skill.filter && !match.skill.filter(trigger, match.player, name))) continue;
                const next = game.createEvent(match.id, false);
                next.player = match.player;
                next._trigger = trigger;
                next.triggername = name;
                next.setContent(match.skill.content);
                assert.equal(next.content.type, match.id === "guanshi_skill" ? "step" : "async", "use the native compiler for each content type");
                await next;
            }
        };
        return dispatch;
    };
    function request(player, kind, result) {
        const action = { player, set(key, value) { this[key] = value; return this; }, async forResult() {
            if (this.ai) {
                const remote = { get, _status: { event: action } };
                const fn = vm.runInNewContext("(" + this.ai.toString() + ")", remote);
                fn(game.players.at(-1));
            }
            if (player.beforeChoice) player.beforeChoice(kind, this);
            return typeof result === "function" ? result(this) : result;
        } };
        return action;
    }
    function player(id, field = false) {
        const p = Object.create(Player.prototype);
        Object.assign(p, { playerid: id, hp: field ? 1 : 4, maxHp: field ? 1 : 4, hujia: 0, storage: {},
            skills: field ? ["nihil_shengyu", "nihil_mingsi", "nihil_caisheng"] : [], tempSkills: {}, visualMarks: new Set(),
            inGame: true, skipList: [], stat: [{ card: {}, skill: {} }], drawn: 0,
            actionHistory: [{ damage: [], sourceDamage: [] }], used: [],
            isIn() { return this.inGame; }, isDead() { return !this.inGame; }, isAlive() { return this.inGame; }, isOut() { return false; },
            hasSkill(id) { return expanded(this).includes(id); }, hasSkillTag() { return false; },
            inRange(target) { return (target.distance || 1) <= 1; },
            isLinked() { return false; }, countCards() { return this.handCards || 0; },
            mayHaveShan() { return this.shanResponses?.filter(Boolean).length || this.aoeResponses?.filter(Boolean).length || 0; },
            mayHaveSha() { return this.aoeResponses?.filter(Boolean).length || 0; },
            node: { hp: element(), count: element() }, classList: element().classList, updateMarks() {},
            $damage() {}, $damagepop() {}, syncStorage() {}, addTempClass() {},
            markSkill(id) { this.visualMarks.add(id); }, unmarkSkill(id) { this.visualMarks.delete(id); },
            addSkill(id) { if (!this.skills.includes(id)) this.skills.push(id); if (lib.skill[id]?.mark) this.markSkill(id); },
            addTempSkill(id, expiry) { this.addSkill(id); this.expiry = expiry; this.tempSkills[id] = expiry; },
            logSkill() {},
            draw(num = 1) {
                const next = game.createEvent("testDraw", false); next.player = this; next.num = num;
                next.setContent(vm.runInContext("(async function(event, trigger, player) { if (player.onDraw) player.onDraw(event.num); player.drawn += event.num; })", ctx));
                return next;
            },
            dying() { const next = game.createEvent("testDying", false); next.player = this;
                next.setContent(vm.runInContext("(async function(event, trigger, player) { player.dyingCalled = true; player.inGame = false; })", ctx)); return next; },
            die() { return this.dying(); },
            chooseToUse() {
                const next = game.createEvent("testShanChoice", false); next.player = this;
                next.response = this.shanResponses?.shift() || false;
                next.setContent(vm.runInContext(`(async function(event) {
                    event.result = event.response ? { bool: true, card: { name: "shan", isCard: true }, cards: [], result: "shaned" } : { bool: false };
                })`, ctx));
                return next;
            },
            chooseToRespond() {
                const next = game.createEvent("chooseToRespond"); next.player = this;
                next.response = this.aoeResponses?.shift() || false;
                next.responseName = _status.event.name === "wanjian" ? "shan" : "sha";
                next.setContent(vm.runInContext(`(async function(event) {
                    event.result = event.response ? { bool: true, card: { name: event.responseName || "sha", isCard: true }, cards: [] } : { bool: false };
                })`, ctx));
                return next;
            },
            chooseToDiscard() {
                const next = game.createEvent("testDiscardChoice", false); next.player = this;
                next.guanshi = _status.event.name === "guanshi_skill";
                next.accepted = next.guanshi ? !!this.guanshiResponse : !!this.discardForStab;
                next.setContent(vm.runInContext(`(async function(event, trigger, player) {
                    if (event.guanshi) { player.drawnAtAxeChoice = player.drawn; player.hpAtAxeChoice = player.hp; }
                    event.result = { bool: event.accepted };
                })`, ctx));
                return next;
            },
            chooseTarget(range, forced, prompt, filter) {
                const kind = forced ? "donor" : "target";
                return request(this, kind, action => {
                    const fn = vm.runInNewContext("(" + filter.toString() + ")", { get, _status: { event: action } });
                    const offered = game.players.filter(target => fn(null, this, target));
                    this[kind === "donor" ? "donorsOffered" : "offered"] = offered;
                    if (kind === "target") this.offeredRange = range;
                    const chosen = kind === "donor" ? (this.donorChoice ? [this.donorChoice] : offered.slice(0, 1)) : this.targetChoice || offered;
                    const targets = chosen.filter(t => offered.includes(t)).slice(0, range[1]);
                    return { bool: targets.length > 0, targets };
                });
            },
            useCard(card, targets, addCount) {
                this.used.push({ card, targets, addCount });
                if (addCount !== false) this.getStat().card.sha = (this.getStat().card.sha || 0) + 1;
                const next = game.createEvent("testUseCard", false); next.player = this; next.targets = targets; next.card = card;
                next.setContent(vm.runInContext(`(async function(event, trigger, player) {
                    for (const target of event.targets) {
                        const next = game.createEvent("useCardToTarget", false);
                        next.player = player; next.target = target; next.card = event.card;
                        next.setContent(async function(event) { await event.trigger("useCardToTarget"); });
                        await next;
                        if (player.resolveSha) await player.resolveSha(target, event.card);
                    }
                })`, ctx));
                return next;
            },
        });
        game.players.push(p);
        return p;
    }
    async function runSkill(id, owner, target) {
        const next = game.createEvent(id, false);
        next.player = owner;
        next.target = target;
        owner.donorChoice = target;
        next.setContent(lib.skill[id].content);
        await next;
    }
    async function fire(name, target, extra = {}) {
        const next = game.createEvent("testSignal", false);
        Object.assign(next, { player: target, _neutralized: name === "eventNeutralized" }, extra);
        next.setContent(vm.runInContext("(async function(event) { await event.trigger(event.signal); })", ctx));
        next.signal = name;
        await next;
    }
    async function slash(source, target, options = {}) {
        const next = game.createEvent("sha");
        Object.assign(next, { player: source, target, card: { name: "sha", isCard: true }, cards: [], type: "card" }, options);
        next.setContent(lib.card.sha.content);
        await next;
    }
    async function aoe(source, targets, name, options = {}) {
        const card = { name, isCard: true };
        for (const target of targets) {
            const next = game.createEvent(name);
            Object.assign(next, { player: source, target, targets, card, cards: [], type: "card" }, options);
            next.setContent(lib.card[name].content);
            await next;
        }
    }
    async function cardTarget(source, target, name, excluded = false) {
        const stage = Content.useCard.find(content => content.toString().includes("info.ignoreTarget"));
        assert.ok(stage, "native per-target card stage must contain the ignoreTarget gate");
        const next = game.createEvent("testRecoveryCard", false);
        Object.assign(next, { player: source, targets: [target], card: { name, isCard: true }, cards: [], num: 0,
            excluded: excluded ? [target] : [], directHit: [], customArgs: { default: {} } });
        next.setContent(stage);
        await next;
    }
    function give(p, n) {
        p.addSkill(MARK);
        const delta = n - p.countMark(MARK);
        if (delta > 0) p.addMark(MARK, delta);
        else if (delta < 0) p.removeMark(MARK, -delta);
    }
    function endTurn() {
        for (const p of game.players) {
            for (const [id, expiry] of Object.entries(p.tempSkills)) {
                if (expiry.global !== "phaseAfter") continue;
                p.skills = p.skills.filter(skill => skill !== id);
                delete p.tempSkills[id];
                p.unmarkSkill(id);
                if (lib.skill[id].onremove === true) delete p.storage[id];
            }
        }
    }
    async function start() {
        for (const p of game.players) if (p.hasSkill("nihil_shengyu")) lib.skill.nihil_shengyu.init(p);
        await fire("gameStart", game.players[0]);
    }
    return { game, get, lib, ctx, mod, player, start, fire, runSkill, slash, aoe, cardTarget, give, endTurn, trace, compiler };
}

test("Longyou is real current HP for direct reads, native queries and hand limit", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("ordinary"); await f.start();
    assert.equal(p.hp, 4); assert.equal(p.maxHp, 1); assert.equal(p.countMark(MARK), 3);
    assert.equal(p.getHp(), 4); assert.equal(p.getHp(true), 4); assert.equal(p.getDamagedHp(), -3);
    assert.equal(p.getHandcardLimit(), 4); assert.equal(q.hp, 4); assert.equal(q.maxHp, 4);
    p.update(); p.$update(); assert.equal(p.hp, 4);
    await f.fire("enterGame", p); assert.equal(p.hp, 4); assert.equal(p.countMark(MARK), 3);
});
test("native update renders highlighted pips, missing base HP and exact large counts", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("other"); await f.start();
    const hp = p.node.hp;
    assert.equal(hp.querySelectorAll(".nihil-longyou-jade").length, 3);
    assert.equal(hp.dataset.nihilLongyou, "3"); assert.ok(hp.title.includes("当前体力 4"));
    q.hp = 2; f.give(q, 2); q.$update();
    assert.equal(q.node.hp.children.slice(0, 4).filter(n => n.classList.contains("lost")).length, 2);
    f.get.is.newLayout = () => true; q.$update();
    assert.equal(q.node.hp.children[0].classList.contains("lost"), true);
    assert.equal(q.node.hp.children[3].classList.contains("lost"), false);
    f.give(q, 12); assert.equal(q.node.hp.querySelectorAll(".nihil-longyou-jade").length, 8);
    assert.equal(q.node.hp.querySelectorAll(".nihil-longyou-total")[0].textContent, "佑×12");
    q.maxHp = 6; q.$update(); assert.equal(q.node.hp.querySelectorAll(".nihil-longyou-total")[0].textContent, "+12佑");
    f.give(q, 0); assert.equal(q.node.hp.dataset.nihilLongyou, undefined);
    assert.equal(q.node.hp.querySelectorAll(".nihil-longyou-jade").length, 0);
});
test("hidden/no-HP actors do not reveal Longyou pips", async () => {
    const f = fixture(), p = f.player("owner", true); await f.start();
    p.classList.add("unseen_show"); p.$update(); assert.equal(p.node.hp.querySelectorAll(".nihil-longyou-jade").length, 0);
    p.classList.remove("unseen_show"); p.storage.nohp = true; p.$update();
    assert.equal(p.node.hp.querySelectorAll(".nihil-longyou-jade").length, 0);
});
test("direct mark addition/removal changes HP exactly once and never draws", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("other"); await f.start();
    f.give(q, 3); assert.equal(q.hp, 7); assert.equal(q.getHandcardLimit(), 7);
    const action = f.game.createEvent("testRemove", false); action.player = q;
    action.setContent(vm.runInContext('(async function(event, trigger, player) { player.removeMark("nihil_longyou", 2); })', f.ctx));
    await action; assert.equal(q.hp, 5); assert.equal(q.countMark(MARK), 1);
    assert.equal(q.getHandcardLimit(), 5); assert.equal(p.drawn, 0); assert.equal(q.drawn, 0);
});
test("native damage preserves damage events and consumes Longyou before base HP", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("source"); await f.start();
    await p.damage({ num: 2, source: q });
    assert.equal(p.hp, 2); assert.equal(p.countMark(MARK), 1); assert.equal(p.drawn, 0);
    assert.equal(p.getHistory("damage")[0].num, 2); assert.ok(f.trace.some(e => e[1] === "damageSource"));
    await p.damage({ num: 2, source: q }); assert.equal(p.hp, 0); assert.equal(p.countMark(MARK), 0); assert.equal(p.dyingCalled, true);
});
test("armor precedes Longyou; armor bypass and loseHp retain native behavior", async () => {
    for (const bypass of [false, true]) {
        const f = fixture(), p = f.player("owner", true); await f.start(); p.hujia = 2;
        await p.damage({ num: 3, nohujia: bypass, nosource: true });
        assert.equal(p.hp, bypass ? 1 : 3); assert.equal(p.hujia, bypass ? 2 : 0);
        assert.equal(p.countMark(MARK), bypass ? 0 : 2); assert.equal(p.drawn, 0);
    }
    const f = fixture(), p = f.player("owner", true); await f.start(); p.hujia = 2;
    await p.loseHp(2); assert.equal(p.hp, 2); assert.equal(p.hujia, 2); assert.equal(p.countMark(MARK), 1);
});
test("native healing fills actual current HP then credits overflow, including recoverAfter", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("wounded"); await f.start(); q.hp = 2;
    f.lib.skill.test_recover = { trigger: { player: "recoverAfter" }, content: vm.runInContext(
        "(async function(event, trigger, player) { player.recovered = (player.recovered || 0) + trigger.num; })", f.ctx) };
    q.addSkill("test_recover"); await q.recover(3);
    assert.equal(q.hp, 5); assert.equal(q.countMark(MARK), 1); assert.equal(q.recovered, 3);
    await q.recover(2); assert.equal(q.hp, 7); assert.equal(q.countMark(MARK), 3); assert.equal(q.recovered, 5);
    await q.recover(0); assert.equal(q.hp, 7); assert.equal(q.countMark(MARK), 3); assert.equal(p.drawn, 0);
});
test("zero/negative and cancelled recovery never bypass their native stops", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("other"); await f.start();
    f.lib.skill.test_recovery_stop = { trigger: { player: "recoverBefore" }, content: vm.runInContext(
        "(async function(event, trigger, player) { player.recoveryStarted = true; trigger.cancel(); })", f.ctx) };
    q.addSkill("test_recovery_stop"); await q.recover(0); await q.recover(-1);
    assert.equal(q.recoveryStarted, undefined); assert.equal(q.hp, 4);
    await q.recover(2); assert.equal(q.recoveryStarted, true); assert.equal(q.hp, 4); assert.equal(q.countMark(MARK), 0);
});
test("native full-health Peach is legal while card/target bans still apply", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("other"); await f.start();
    const tao = { name: "tao" };
    assert.equal(f.lib.filter.cardEnabled(tao, q), true); assert.equal(f.lib.filter.targetEnabled(tao, q, q), true);
    assert.equal(f.lib.filter.targetEnabled(tao, q, p), false);
    await f.cardTarget(q, q, "tao"); assert.equal(q.hp, 5); assert.equal(q.countMark(MARK), 1);
    q.cardBanned = true; assert.equal(f.lib.filter.cardEnabled(tao, q), false);
    q.cardBanned = false; q.targetBanned = true; assert.equal(f.lib.filter.targetEnabled(tao, q, q), false);
});
test("native Peach Garden reaches full-health targets and respects exclusions", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("full"), wounded = f.player("wounded"); await f.start(); wounded.hp = 2;
    await f.cardTarget(p, p, "taoyuan"); await f.cardTarget(p, q, "taoyuan"); await f.cardTarget(p, wounded, "taoyuan");
    assert.equal(p.hp, 5); assert.equal(p.countMark(MARK), 4); assert.equal(q.hp, 5); assert.equal(q.countMark(MARK), 1);
    assert.equal(wounded.hp, 3); assert.equal(wounded.countMark(MARK), 0);
    await f.cardTarget(p, q, "taoyuan", true); assert.equal(q.hp, 5);
    q.storage.nohp = true; await f.cardTarget(p, q, "taoyuan"); assert.equal(q.hp, 5);
});
test("explicit wounded skill conditions and native healthy queries are preserved", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("full"); await f.start();
    const source = read("character/standard/skill.js"), start = source.indexOf("\n\tqingnang: {"), end = source.indexOf("\n\tjijiu:", start);
    const qingnang = vm.runInContext("({" + source.slice(start, end) + "}).qingnang", f.ctx);
    assert.equal(q.isHealthy(), true); assert.equal(q.isDamaged(), false); assert.equal(qingnang.filterTarget(null, p, q), false);
    q.hp = 3; assert.equal(qingnang.filterTarget(null, p, q), true);
    f.give(q, 2); assert.equal(q.hp, 5); assert.equal(qingnang.filterTarget(null, p, q), false);
});
test("two Shengyu owners do not duplicate overflow and no removal draws remain", async () => {
    const f = fixture(), p = f.player("first", true), q = f.player("second", true), t = f.player("other"); await f.start();
    await t.recover(2); assert.equal(t.hp, 6); assert.equal(t.countMark(MARK), 2);
    await t.loseHp(1); assert.equal(t.hp, 5); assert.equal(p.drawn, 0); assert.equal(q.drawn, 0);
});
test("max-HP loss clips only excess base HP and never consumes Longyou", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("other"); await f.start(); f.give(q, 2);
    const loss = q.loseMaxHp(2); await loss;
    assert.equal(q.maxHp, 2); assert.equal(q.hp, 4); assert.equal(q.countMark(MARK), 2); assert.equal(loss.loseHp, 2);
    q.hp = 3; const next = q.loseMaxHp(1); await next;
    assert.equal(q.maxHp, 1); assert.equal(q.hp, 3); assert.equal(next.loseHp, 0);
    await q.loseMaxHp(1); assert.equal(q.maxHp, 0); assert.equal(q.dyingCalled, true);
});
test("Qianlin temporary HP and Longyou share current HP without changing maxHP", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("shaodi"); await f.start();
    q.storage.zus_qianlin_bonus = 2; q.hp += 2; f.give(q, 3); q.update();
    assert.equal(q.hp, 9); assert.equal(q.maxHp, 4); assert.equal(q.getHandcardLimit(), 9);
    await q.loseHp(1); assert.equal(q.hp, 8); assert.equal(q.countMark(MARK), 2);
});
if (fs.existsSync(path.join(root, ".audit/zus-reference/module/haoyang.js"))) {
    for (const order of ["before", "after"]) test("actual Zus reference loads " + order + " Nihil without clipping HP", async () => {
        const f = fixture(order), p = f.player("owner", true), q = f.player("shaodi"); await f.start();
        q.storage.zus_qianlin_bonus = 2; q.hp += 2; f.give(q, 3); q.update(); q.$update();
        assert.equal(q.hp, 9); assert.equal(q.maxHp, 4); assert.equal(q.getHandcardLimit(), 9);
        await q.loseHp(1); assert.equal(q.hp, 8); assert.equal(q.countMark(MARK), 2);
        await q.recover(1); assert.equal(q.hp, 9); assert.equal(q.countMark(MARK), 3);
    });
} else console.log("SKIP optional Zus load-order checks: local source reference unavailable");
test("Mingsi replaces slash, trick, elemental and cardless skill damage", async () => {
    for (const card of [{ name: "sha" }, { name: "juedou" }, { name: "huogong", nature: "fire" }, undefined]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start(); q.hujia = 2;
        await q.damage({ num: 1, source: p, card });
        assert.equal(q.maxHp, 3); assert.equal(q.hp, 5); assert.equal(q.countMark(MARK), 2); assert.equal(q.hujia, 2);
        assert.equal(q.getHistory("damage").length, 0); assert.equal(p.getHistory("sourceDamage").length, 0);
        assert.ok(f.trace.some(e => e[1] === "damageCancelled")); assert.ok(!f.trace.some(e => e[1] === "damageSource"));
    }
});
test("Mingsi snapshots final damage and recovery uses actual HP including Longyou", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start(); f.give(q, 1);
    f.game.callHook = (name, [event]) => { if (name === "checkDamage4") event.num = 2; };
    await q.damage({ num: 1, source: p });
    assert.equal(q.maxHp, 2); assert.equal(q.hp, 7); assert.equal(q.countMark(MARK), 5);
    assert.equal(p.drawn, 0);
});
test("Mingsi wounded target heals before overflow; zero maxHP dies before healing", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start(); q.hp = 1;
    await q.damage({ num: 1, source: p }); assert.equal(q.maxHp, 3); assert.equal(q.hp, 3); assert.equal(q.countMark(MARK), 0);
    q.maxHp = q.hp = 1; await q.damage({ num: 1, source: p });
    assert.equal(q.maxHp, 0); assert.equal(q.dyingCalled, true); assert.equal(q.countMark(MARK), 0);
});
test("zero, unreal, other-source or previously prevented damage does not invoke Mingsi", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"), other = f.player("other"); await f.start();
    await q.damage({ num: 0, source: p }); assert.equal(q.maxHp, 4);
    await q.damage({ num: 1, source: p, unreal: true }); assert.equal(q.maxHp, 4);
    await q.damage({ num: 1, source: other }); assert.equal(q.maxHp, 4);
    f.lib.skill.test_prevent = { trigger: { player: "damageBegin4" }, content: vm.runInContext("(async function(event, trigger) { trigger.cancel(); })", f.ctx) };
    q.addSkill("test_prevent"); await q.damage({ num: 2, source: p }); assert.equal(q.maxHp, 4);
});
test("native Shan cancellation compares effective HP and gives only heal OR draw", async () => {
    for (const targetHp of [3, 4, 5]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
        if (targetHp > 4) f.give(q, targetHp - 4); else q.hp = targetHp;
        q.shanResponses = [true]; await f.slash(p, q);
        assert.equal(p.hp, targetHp > 4 ? 5 : 4); assert.equal(p.drawn, targetHp > 4 ? 0 : 1);
        assert.equal(q.maxHp, 4); assert.equal(q.getHistory("damage").length, 0);
    }
});
test("two required Shan reward once on full cancellation and zero on partial cancellation", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    q.shanResponses = [true, true]; await f.slash(p, q, { shanRequired: 2 }); assert.equal(p.drawn, 1);
    q.shanResponses = [true, false]; await f.slash(p, q, { shanRequired: 2 });
    assert.equal(p.drawn, 1); assert.equal(q.maxHp, 3); assert.equal(q.hp, 5);
});
test("stab cancellation rewards only when Shan and its additional discard succeed", async () => {
    for (const discarded of [false, true]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
        q.shanResponses = [true]; q.handCards = 1; q.discardForStab = discarded;
        await f.slash(p, q, { card: { name: "sha", nature: "stab", isCard: true } });
        assert.equal(p.drawn, discarded ? 1 : 0); assert.equal(q.maxHp, discarded ? 4 : 3);
    }
});
test("native Nanman responses no longer reward Mingsi", async () => {
    const f = fixture(), p = f.player("owner", true), equal = f.player("equal"), high = f.player("high"), lower = f.player("lower");
    await f.start(); f.give(high, 3);
    equal.aoeResponses = [true]; high.aoeResponses = [true]; lower.aoeResponses = [true];
    await f.aoe(p, [equal, high, lower], "nanman");
    assert.equal(p.drawn, 0); assert.equal(p.hp, 4);
    assert.equal(equal.maxHp, 4); assert.equal(high.maxHp, 4); assert.equal(lower.maxHp, 4);
});
test("native Wanjian responses no longer reward Mingsi", async () => {
    const f = fixture(), p = f.player("owner", true), equal = f.player("equal"), high = f.player("high"); await f.start(); f.give(high, 3);
    equal.aoeResponses = [true]; high.aoeResponses = [true];
    await f.aoe(p, [equal, high], "wanjian");
    assert.equal(p.drawn, 0); assert.equal(p.hp, 4); assert.equal(equal.maxHp, 4); assert.equal(high.maxHp, 4);
});
test("multiple successful AOE responses give no Sha outcome reward", async () => {
    for (const name of ["nanman", "wanjian"]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
        const required = name === "nanman" ? { shaRequired: 2 } : { shanRequired: 2 };
        q.aoeResponses = [true, true]; await f.aoe(p, [q], name, required);
        assert.equal(p.drawn, 0); assert.equal(p.hp, 4); assert.equal(q.maxHp, 4);
    }
});
test("partial AOE resistance does not reward when a later required response fails", async () => {
    for (const name of ["nanman", "wanjian"]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
        q.aoeResponses = [true, false];
        await f.aoe(p, [q], name, name === "nanman" ? { shaRequired: 2 } : { shanRequired: 2 });
        assert.equal(p.drawn, 0); assert.equal(p.hp, 4); assert.equal(q.maxHp, 3); assert.equal(q.hp, 5);
    }
});
test("unanswered and direct-hit AOE effects give no neutralization reward", async () => {
    for (const name of ["nanman", "wanjian"]) for (const directHit of [false, true]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
        q.aoeResponses = directHit ? [true] : [false];
        await f.aoe(p, [q], name, { directHit });
        assert.equal(p.drawn, 0); assert.equal(p.hp, 4); assert.equal(q.maxHp, 3); assert.equal(q.hp, 5);
        if (directHit) assert.equal(q.aoeResponses.length, 1);
    }
});
test("repeated AOE effects never give a Sha outcome reward", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    const card = { name: "nanman", isCard: true }; q.aoeResponses = [true, true];
    await f.aoe(p, [q], "nanman", { card }); await f.aoe(p, [q], "nanman", { card });
    assert.equal(p.drawn, 0); assert.equal(p.hp, 4);
});
test("native multi-target Sha and its extra effects each reward successful Shan separately", async () => {
    const f = fixture(), p = f.player("owner", true), equal = f.player("equal"), high = f.player("high"); await f.start(); f.give(high, 4);
    const card = { name: "sha", isCard: true };
    equal.shanResponses = [true, true]; high.shanResponses = [true, true];
    for (let repeat = 0; repeat < 2; repeat++) for (const target of [equal, high]) await f.slash(p, target, { card });
    assert.equal(p.drawn, 2); assert.equal(p.hp, 6); assert.equal(equal.maxHp, 4); assert.equal(high.maxHp, 4);
});
test("a successful Sha reduction does not suppress a later failed effect of the same card", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    const card = { name: "sha", isCard: true };
    await f.slash(p, q, { card }); assert.equal(q.maxHp, 3); assert.equal(p.hp, 4); assert.equal(p.drawn, 0);
    q.shanResponses = [true]; await f.slash(p, q, { card });
    assert.equal(q.maxHp, 3); assert.equal(p.hp, 5); assert.equal(p.drawn, 0);
});
test("damage trick neutralization never gives a Sha outcome reward", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"), high = f.player("high"); await f.start(); f.give(high, 4);
    const card = { name: "nanman" };
    for (const target of [q, high, high, high, q]) await f.fire("eventNeutralized", p, { type: "card", target, card });
    const effect = f.game.createEvent("nanman"); Object.assign(effect, { player: p, target: q, card, type: "card" });
    effect.setContent(vm.runInContext('(async function(event) { await event.neutralize(); })', f.ctx));
    await effect; assert.equal(p.drawn, 0); assert.equal(p.hp, 4);
});
test("duplicate notifications on one effect do not reward twice, later effects still reward", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    const effect = f.game.createEvent("sha"); Object.assign(effect, { player: p, target: q, card: { name: "sha" }, type: "card" });
    effect.setContent(vm.runInContext('(async function(event) { await event.trigger("shaMiss"); await event.trigger("eventNeutralized"); })', f.ctx));
    await effect; assert.equal(p.drawn, 1);
    q.shanResponses = [true]; await f.slash(p, q); assert.equal(p.drawn, 2);
});
test("non-Sha cards and Wuxie negotiation events do not reward", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    await f.fire("eventNeutralized", p, { type: "card", target: q, card: { name: "tao" } });
    await f.fire("eventNeutralized", p, { type: "wuxie", target: q, card: { name: "juedou" } });
    assert.equal(p.drawn, 0); assert.equal(p.hp, 4);
});
test("a neutralization undone by an earlier skill gives no reward", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    f.lib.skill.test_restore = { trigger: { player: "eventNeutralized" }, content: vm.runInContext(
        "(async function(event, trigger) { trigger.unneutralize(); })", f.ctx) };
    p.addSkill("test_restore");
    const effect = f.game.createEvent("juedou", false); Object.assign(effect, { player: p, target: q, card: { name: "juedou" }, type: "card" });
    effect.setContent(vm.runInContext('(async function(event) { await event.neutralize(); })', f.ctx));
    await effect; assert.equal(p.drawn, 0); assert.equal(p.hp, 4); assert.equal(effect._neutralized, false);
});
test("native Guanshi Axe decision finishes before any Mingsi failure reward", async () => {
    for (const accepted of [false, true]) for (const higher of [false, true]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
        if (higher) f.give(q, 3);
        p.addSkill("guanshi_skill"); p.handCards = 2; p.guanshiResponse = accepted;
        q.shanResponses = [true]; await f.slash(p, q);
        assert.equal(p.drawnAtAxeChoice, 0); assert.equal(p.hpAtAxeChoice, 4);
        assert.equal(q.maxHp, accepted ? 3 : 4);
        assert.equal(p.drawn, !accepted && !higher ? 1 : 0);
        assert.equal(p.hp, !accepted && higher ? 5 : 4);
    }
});
test("a native Sha hit reduces the limit and gives no failure reward", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    await f.cardTarget(p, q, "sha");
    assert.equal(q.maxHp, 3); assert.equal(q.hp, 5); assert.equal(p.drawn, 0); assert.equal(p.hp, 4);
});
test("prevented Sha damage rewards without requiring a Shan response", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    f.lib.skill.test_prevent = { trigger: { player: "damageBegin4" }, content: vm.runInContext(
        "(async function(event, trigger) { trigger.cancel(); })", f.ctx) };
    q.addSkill("test_prevent"); await f.slash(p, q);
    assert.equal(q.maxHp, 4); assert.equal(p.drawn, 1); assert.equal(p.hp, 4);
});
test("Sha with zeroed damage and Sha marked unhurt each reward once", async () => {
    for (const unhurt of [false, true]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
        if (!unhurt) {
            f.lib.skill.test_zero = { trigger: { player: "damageBegin1" }, content: vm.runInContext(
                "(async function(event, trigger) { trigger.num = 0; })", f.ctx) };
            q.addSkill("test_zero");
        }
        await f.slash(p, q, { unhurt });
        assert.equal(q.maxHp, 4); assert.equal(p.drawn, 1); assert.equal(p.hp, 4);
    }
});
test("cancelled or zeroed max-HP loss qualifies despite Mingsi having activated", async () => {
    for (const cancel of [false, true]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
        f.lib.skill.test_limit = { trigger: { player: "loseMaxHpBefore" }, content: vm.runInContext(cancel ?
            "(async function(event, trigger) { trigger.cancel(); })" :
            "(async function(event, trigger) { trigger.num = 0; })", f.ctx) };
        q.addSkill("test_limit"); await f.slash(p, q);
        assert.equal(q.maxHp, 4); assert.equal(q.hp, 6);
        assert.equal(p.drawn, 0); assert.equal(p.hp, 5, "current HP comparison occurs after the effect's recovery");
    }
});
test("only the current Sha target's actual limit reduction suppresses its failure reward", async () => {
    for (const reduceTarget of [false, true]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"), other = f.player("other"); await f.start();
        p.limitVictim = reduceTarget ? q : other;
        f.lib.skill.test_sha_limit = { trigger: { player: "shaHit" }, content: vm.runInContext(
            "(async function(event, trigger, player) { trigger.unhurt = true; await player.limitVictim.loseMaxHp(1); })", f.ctx) };
        p.addSkill("test_sha_limit"); await f.slash(p, q);
        assert.equal(q.maxHp, reduceTarget ? 3 : 4); assert.equal(other.maxHp, reduceTarget ? 4 : 3);
        assert.equal(p.drawn, reduceTarget ? 0 : 1); assert.equal(p.hp, 4);
    }
});
test("a real reduction later restored still suppresses the failure reward", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    f.lib.skill.test_restore_limit = { trigger: { player: "loseMaxHpAfter" }, content: vm.runInContext(
        "(async function(event, trigger, player) { await player.gainMaxHp(trigger.num); })", f.ctx) };
    q.addSkill("test_restore_limit"); await f.slash(p, q);
    assert.equal(q.maxHp, 4); assert.equal(q.hp, 5); assert.equal(p.drawn, 0); assert.equal(p.hp, 4);
});
test("a Sha neutralized by an effect rewards only after that effect finishes", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    f.lib.skill.test_neutralize = { trigger: { player: "useCardToBegin" }, content: vm.runInContext(
        "(async function(event, trigger, player) { await trigger.neutralize(); player.drawnDuringNeutralize = player.drawn; })", f.ctx) };
    p.addSkill("test_neutralize"); await f.slash(p, q);
    assert.equal(p.drawnDuringNeutralize, 0); assert.equal(p.drawn, 1); assert.equal(q.maxHp, 4);
});
test("a Sha cancelled before its content still gives one failure reward", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    f.lib.skill.test_cancel_sha = { trigger: { player: "shaBefore" }, content: vm.runInContext(
        "(async function(event, trigger) { trigger.cancel(); })", f.ctx) };
    p.addSkill("test_cancel_sha"); await f.slash(p, q);
    assert.equal(p.drawn, 1); assert.equal(q.maxHp, 4);
});
test("native target exclusion and target ignoring each count as one failed Sha effect", async () => {
    for (const excluded of [false, true]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
        if (!excluded) f.lib.card.sha.ignoreTarget = () => true;
        await f.cardTarget(p, q, "sha", excluded);
        assert.equal(p.drawn, 1); assert.equal(q.maxHp, 4);
    }
});
test("another player's Sha never grants the owner an outcome reward", async () => {
    const f = fixture(), p = f.player("owner", true), other = f.player("other"); await f.start();
    await f.slash(other, p); assert.equal(p.drawn, 0); assert.equal(p.hp, 3);
});
test("Caisheng costs 0,1,2 per turn and never rewards removed Longyou", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("donor"); await f.start();
    for (let cost = 0; cost < 3; cost++) {
        f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
        assert.equal(p.storage[TURN].count, cost + 1); assert.equal(p.hp, 4 - cost * (cost + 1) / 2);
        assert.equal(p.countMark(MARK), 3 - cost * (cost + 1) / 2); p.getStat().skill = {};
    }
    assert.equal(p.drawn, 0); f.endTurn(); f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
    assert.equal(p.storage[TURN].count, 1); assert.equal(p.hp, 1);
});
test("Caisheng pays before donor selection and self uses only remaining layers", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("donor"); f.player("other"); await f.start();
    f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
    p.beforeChoice = kind => { if (kind === "donor") assert.equal(p.hp, 3, "cost must already be paid"); };
    await f.runSkill("nihil_caisheng", p, p);
    assert.equal(p.hp, 1); assert.equal(p.countMark(MARK), 0); assert.equal(p.drawn, 0);
    assert.deepEqual(Array.from(p.offeredRange), [1, 2]);
    assert.equal(f.lib.filter.targetEnabled({ name: "tao" }, p, p), true);
});
test("Caisheng self-only activation requires marks left after cost", async () => {
    const f = fixture(), p = f.player("owner", true); await f.start();
    p.storage[TURN] = { count: 3, targets: [] }; assert.equal(f.mod.skill.nihil_caisheng.filter(null, p), false);
    p.storage[TURN].count = 2; assert.equal(f.mod.skill.nihil_caisheng.filter(null, p), true);
});
test("Caisheng uses fixed distance/layer bound instead of weapon range and respects bans", async () => {
    const f = fixture(), p = f.player("owner", true), donor = f.player("donor"), near = f.player("near"), mid = f.player("mid"), far = f.player("far"), banned = f.player("banned");
    await f.start(); f.give(donor, 2); mid.distance = 2; far.distance = 3; banned.targetBanned = true;
    assert.equal(p.inRange(mid), false);
    await f.runSkill("nihil_caisheng", p, donor);
    assert.deepEqual(p.offered.map(t => t.playerid), ["near", "mid"]); assert.deepEqual(Array.from(p.offeredRange), [1, 2]);
    assert.equal(p.used[0].targets.length, 2);
    p.inRange = () => true; f.give(donor, 2); await f.runSkill("nihil_caisheng", p, donor);
    assert.equal(p.offered.includes(far), false); assert.equal(p.offered.includes(banned), false);
    for (const name of ["sha", "juedou", "nanman", "wanjian"]) {
        assert.equal(f.lib.filter.targetEnabled({ name }, p, donor), false, name + " must remain banned");
    }
    assert.equal(f.lib.filter.targetEnabled({ name: "taoyuan" }, p, donor), true);
    assert.equal(f.lib.filter.targetEnabled({ name: "sha" }, near, donor), true);
});
test("Caisheng can decline the generated slash without undoing removal or the ban", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("donor"); f.player("other"); await f.start(); f.give(q, 2); p.targetChoice = [];
    await f.runSkill("nihil_caisheng", p, q); assert.equal(q.countMark(MARK), 0); assert.equal(p.used.length, 0);
    assert.equal(f.lib.filter.targetEnabled({ name: "sha" }, p, q), false); assert.equal(q.visualMarks.has(AFFECTED), true);
});
test("Caisheng revalidates slash choices and stops when no target remains", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("donor"), other = f.player("other"); await f.start(); f.give(q, 2);
    p.beforeChoice = kind => { if (kind === "target") other.targetBanned = true; };
    await f.runSkill("nihil_caisheng", p, q); assert.equal(p.used.length, 0); assert.equal(q.countMark(MARK), 0);
});
test("Caisheng slash ignores exhausted quotas and never increments normal slash uses", async () => {
    for (const before of [undefined, 0, 1, 3]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("donor"), other = f.player("other"); await f.start();
        if (before !== undefined) p.getStat().card.sha = before;
        for (let i = 0; i < 2; i++) {
            f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
            assert.equal(p.used[i].targets[0], other); assert.equal(p.used[i].addCount, false); assert.equal(p.getStat().card.sha, before);
        }
    }
});
test("Caisheng generated multi-target slash rewards dodging and replaces hit damage", async () => {
    const f = fixture(), p = f.player("owner", true), donor = f.player("donor"), dodge = f.player("dodge"), hit = f.player("hit");
    await f.start(); f.give(donor, 2); dodge.shanResponses = [true]; p.resolveSha = target => f.slash(p, target);
    await f.runSkill("nihil_caisheng", p, donor);
    assert.equal(p.used[0].targets.length, 2); assert.equal(p.drawn, 1); assert.equal(dodge.maxHp, 4);
    assert.equal(hit.maxHp, 3); assert.equal(hit.hp, 5); assert.equal(hit.countMark(MARK), 2);
});
test("Caisheng cost death stops before donor choice or removal", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("donor"); await f.start();
    f.give(p, 0); f.give(q, 2); p.storage[TURN] = { count: 1, targets: [] };
    await f.runSkill("nihil_caisheng", p, q); assert.equal(p.dyingCalled, true); assert.equal(q.countMark(MARK), 2);
    assert.equal(p.donorsOffered, undefined);
});
test("Caisheng reminders support repeated donors, self and several sources until turn end", async () => {
    const f = fixture(), p = f.player("first", true), second = f.player("second", true), q = f.player("donor"); await f.start();
    f.give(q, 1); await f.runSkill("nihil_caisheng", p, q); f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
    f.give(q, 1); await f.runSkill("nihil_caisheng", second, q);
    const text = f.lib.skill[AFFECTED].intro.content(undefined, q);
    assert.equal(text.split("first").length - 1, 1); assert.ok(text.includes("second")); assert.ok(text.includes("伤害牌")); assert.equal(q.visualMarks.has(AFFECTED), true);
    await f.runSkill("nihil_caisheng", second, second); assert.equal(second.visualMarks.has(AFFECTED), true);
    f.endTurn(); assert.equal(q.visualMarks.has(AFFECTED), false); assert.equal(second.visualMarks.has(AFFECTED), false);
    assert.equal(f.lib.filter.targetEnabled({ name: "sha" }, p, q), true);
});
test("HP/recovery adapters install once and ordinary full-health checks resume without Shengyu", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("other"); await f.start();
    const proto = f.lib.element.Player.prototype, recover = proto.recover, update = proto.update, content = f.lib.element.content.changeHp;
    f.mod.init(); f.lib.skill.nihil_shengyu.init(p); assert.equal(proto.recover, recover); assert.equal(proto.update, update);
    assert.equal(f.lib.element.content.changeHp, content);
    p.skills = []; assert.equal(f.lib.filter.cardEnabled({ name: "tao" }, q), false);
    await q.recover(1); assert.equal(q.hp, 4); assert.equal(q.countMark(MARK), 0);
    q.hp = 3; await q.recover(2); assert.equal(q.hp, 4); assert.equal(q.countMark(MARK), 0);
});

test("complete extension registration, portrait, skill names and pinyin", async () => {
    const f = fixture();
    const imported = {};
    Object.assign(f.lib, { assetURL: "", group: [], groupnature: {}, init: {} });
    f.game.addGroup = id => f.lib.group.push(id);
    f.game.import = (type, factory) => { imported[type] = factory(f.lib, f.game, {}, f.get, {}, {}); };
    f.lib.init.jsSync = (base, name) => vm.runInContext(fs.readFileSync(path.join(root, "nihilphile武将包", base.endsWith("/module") ? "module" : "character", name + ".js"), "utf8"), f.ctx);
    vm.runInContext(fs.readFileSync(path.join(root, "nihilphile武将包/extension.js"), "utf8"), f.ctx);
    imported.extension.precontent();
    const pack = imported.character, p = pack.character.nihil_baichi;
    assert.equal(p.hp, 1); assert.equal(p.maxHp, 1); assert.equal(p.group, "shen");
    assert.equal(pack.translate.nihil_baichi, "螭白"); assert.equal(pack.characterTitle.nihil_baichi, "太素司生");
    assert.deepEqual(Array.from(pack.pinyins.nihil_baichi), ["chi", "bai"]);
    for (const id of p.skills) assert.ok(pack.skill[id] && pack.translate[id + "_info"]);
    assert.equal(p.img, "extension/Nihilphile/image/character/nihil_baichi.png");
    const image = fs.readFileSync(path.join(root, "nihilphile武将包/image/character/nihil_baichi.png"));
    assert.equal(image.subarray(1, 4).toString(), "PNG");
});

(async () => {
    for (const { name, run } of cases) { await run(); console.log("PASS " + name); }
    console.log(JSON.stringify({ suite: "baichi_engine", passed: cases.length, engine,
        native: ["GameEvent", "GameEventManager", "ContentCompiler", "Player HP methods", "HP contents", "standard cards and Guanshi Axe", "card filters"],
        adapters: ["trigger selection", "UI", "network", "card use"], browserAcceptance: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
