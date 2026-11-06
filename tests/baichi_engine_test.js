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

function fixture() {
    const lib = { element: { VCard: class { constructor(card) { Object.assign(this, card); } } }, card: {}, skill: {}, config: {}, translate: {}, phaseName: [], natureAudio: { hujia_damage: {}, damage: {} },
        natureSeparator: "|", linked: ["fire", "thunder"], announce: { publish() {} } };
    const history = { everything: [], changeHp: [] }, trace = [];
    const game = { players: [], dead: [], globalEventHandlers: { addHandlerToEvent() {} },
        getGlobalHistory(key) { return key ? history[key] : history; },
        hasPlayer(filter) { return this.players.some(p => p.isIn() && filter(p)); },
        log() {}, callHook() {}, broadcast() {}, broadcastAll() {}, async delayx() {},
        hasNature(card, nature) { return nature ? card.nature === nature : !!card.nature; },
        import(type, factory) { Object.assign(lib.card, factory().card); },
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
        event: () => _status.event,
        translation: obj => Array.isArray(obj) ? obj.map(p => p.playerid).join("、") : obj.playerid || String(obj), cnNumber: String,
        autoViewAs: card => card, copy: value => Array.isArray(value) ? value.slice() : value,
        select: value => typeof value === "number" ? [value, value] : value,
        natureList: value => value ? value.split("|") : [],
        nature: card => card.nature,
        distance: (player, target) => target.distance || 1,
        itemtype: value => value?.playerid ? "player" : value?.physical ? "card" : value?.name && value?.start ? "event" : undefined,
        is: { object: value => value && typeof value === "object", sameNature: () => false },
        attitude: (player, target) => player === target ? 5 : -5,
        effect: (target, card, player) => target === player ? -1 : 1,
        damageEffect: () => -1,
        evtprompt(event, prompt) { event.prompt = prompt; },
    };
    const ctx = vm.createContext({ lib, game, get, _status, window: {}, ui: { selected: { targets: [] } }, ai: {}, console,
        HTMLDivElement: class {}, CacheContext: { inject() {} } });
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
    vm.runInContext(fs.readFileSync(path.join(root, "nihilphile武将包/module/baichi.js"), "utf8"), ctx);
    const mod = ctx.window.nihilModules.baichi;
    Object.assign(lib.skill, mod.skill);
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
                if (!match.player.isIn() || (match.skill.filter && !match.skill.filter(trigger, match.player))) continue;
                const next = game.createEvent(match.id, false);
                next.player = match.player;
                next._trigger = trigger;
                next.setContent(match.skill.content);
                assert.equal(next.content.type, "async", "character contents preserve closures in the native compiler");
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
                fn(kind === "target" ? game.players.at(-1) : undefined);
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
            mayHaveShan() { return this.shanResponses?.filter(Boolean).length || 0; },
            update() { if (this.hp > this.maxHp) this.hp = this.maxHp; },
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
            chooseToDiscard() {
                const next = game.createEvent("testDiscardChoice", false); next.player = this;
                next.setContent(vm.runInContext("(async function(event) { event.result = { bool: !!event.player.discardForStab }; })", ctx));
                return next;
            },
            chooseTarget(range, forced, prompt, filter) {
                return request(this, "target", action => {
                    const fn = vm.runInNewContext("(" + filter.toString() + ")", { get, _status: { event: action } });
                    this.offered = game.players.filter(target => fn(null, this, target));
                    this.offeredRange = range;
                    const targets = (this.targetChoice || this.offered).filter(t => this.offered.includes(t)).slice(0, range[1]);
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
        next.setContent(lib.skill[id].content);
        await next;
    }
    async function fire(name, target, extra = {}) {
        const next = game.createEvent("testSignal", false);
        Object.assign(next, { player: target }, extra);
        next.setContent(vm.runInContext("(async function(event) { await event.trigger(event.signal); })", ctx));
        next.signal = name;
        await next;
    }
    async function slash(source, target, options = {}) {
        const next = game.createEvent("sha", false);
        Object.assign(next, { player: source, target, card: { name: "sha", isCard: true }, cards: [], type: "card" }, options);
        next.setContent(lib.card.sha.content);
        await next;
    }
    async function recoveryCard(source, target, name, excluded = false) {
        const stage = Content.useCard.find(content => content.toString().includes("info.ignoreTarget"));
        assert.ok(stage, "native per-target card stage must contain the ignoreTarget gate");
        const next = game.createEvent("testRecoveryCard", false);
        Object.assign(next, { player: source, targets: [target], card: { name, isCard: true }, cards: [], num: 0,
            excluded: excluded ? [target] : [], directHit: [], customArgs: { default: {} } });
        next.setContent(stage);
        await next;
    }
    function give(p, n) { p.addSkill(MARK); p.storage[MARK] = n; }
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
    return { game, get, lib, ctx, mod, player, start, fire, runSkill, slash, recoveryCard, give, endTurn, trace, compiler };
}

test("native Peach Garden reaches full-health targets and adds Longyou", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("full"), wounded = f.player("wounded"); await f.start(); wounded.hp = 2;
    await f.recoveryCard(p, p, "taoyuan");
    await f.recoveryCard(p, q, "taoyuan");
    await f.recoveryCard(p, wounded, "taoyuan");
    assert.equal(p.countMark(MARK), 4, "Peach Garden must not skip a healthy Shengyu owner");
    assert.equal(q.hp, 4); assert.equal(q.countMark(MARK), 1); assert.equal(q.getHandcardLimit(), 5);
    assert.equal(wounded.hp, 3); assert.equal(wounded.countMark(MARK), 0); assert.equal(p.drawn, 0);
});
test("Peach Garden respects exclusions, no-HP characters and absence of Shengyu", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("full"); await f.start();
    await f.recoveryCard(p, q, "taoyuan", true); assert.equal(q.countMark(MARK), 0);
    q.storage.nohp = true; await f.recoveryCard(p, q, "taoyuan"); assert.equal(q.countMark(MARK), 0);
    delete q.storage.nohp; p.skills = [];
    await f.recoveryCard(q, q, "taoyuan"); assert.equal(q.countMark(MARK), 0);
    q.hp = 3; await f.recoveryCard(q, q, "taoyuan"); assert.equal(q.hp, 4); assert.equal(q.countMark(MARK), 0);
});
test("Shengyu keeps wounded skill eligibility and real health-state queries", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("full"); await f.start();
    const source = read("character/standard/skill.js");
    const start = source.indexOf("\n\tqingnang: {"), end = source.indexOf("\n\tjijiu:", start);
    assert.ok(start >= 0 && end > start);
    const qingnang = vm.runInContext("({" + source.slice(start, end) + "}).qingnang", f.ctx);
    assert.equal(q.isHealthy(), true); assert.equal(q.isDamaged(), false);
    assert.equal(qingnang.filterTarget(null, p, q), false);
    q.hp = 3; assert.equal(qingnang.filterTarget(null, p, q), true);
});
test("native hand limit includes Longyou and follows absorption, recovery and clearing", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("other"); await f.start();
    assert.equal(p.getHandcardLimit(), 4, "1 HP plus 3 Longyou must allow four hand cards");
    await p.loseHp(1); assert.equal(p.getHandcardLimit(), 3);
    await q.recover(2); assert.equal(q.getHandcardLimit(), 6);
    await p.recover(2);
    assert.equal(q.getHandcardLimit(), 6); assert.equal(p.getHandcardLimit(), 5);
    await f.runSkill("nihil_caisheng", p, p);
    assert.equal(p.getHandcardLimit(), 1);
});
test("Caisheng shows a source-specific reminder until the same turn ends", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("donor"), other = f.player("other"); await f.start();
    f.give(q, 2); await f.runSkill("nihil_caisheng", p, q);
    assert.equal(q.visualMarks.has(AFFECTED), true, "affected target must have a visible mark");
    const skill = f.lib.skill[AFFECTED];
    assert.equal(skill.marktext, "裁");
    assert.ok(skill.intro.content(q.storage[AFFECTED], q).includes("owner"));
    assert.equal(f.lib.filter.targetEnabled({ name: "sha" }, other, q), true);
    await q.recover(1); assert.equal(q.visualMarks.has(AFFECTED), true);
    assert.equal(f.lib.filter.targetEnabled({ name: "sha" }, p, q), false);
    f.endTurn();
    assert.equal(q.visualMarks.has(AFFECTED), false); assert.equal(q.storage[AFFECTED], undefined);
    assert.equal(f.lib.filter.targetEnabled({ name: "sha" }, p, q), true);
});
test("Caisheng reminder supports self, repeated targeting and multiple casters", async () => {
    const f = fixture(), p = f.player("first", true), second = f.player("second", true), q = f.player("donor"); await f.start();
    f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
    f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
    const firstText = f.lib.skill[AFFECTED].intro.content(undefined, q);
    assert.equal(firstText.split("first").length - 1, 1);
    f.give(q, 1); await f.runSkill("nihil_caisheng", second, q);
    const text = f.lib.skill[AFFECTED].intro.content(q.storage[AFFECTED], q);
    assert.ok(text.includes("first") && text.includes("second"));
    await f.runSkill("nihil_caisheng", second, second);
    assert.equal(second.visualMarks.has(AFFECTED), true);
    f.endTurn();
    assert.equal(q.visualMarks.has(AFFECTED), false); assert.equal(second.visualMarks.has(AFFECTED), false);
});
test("initial 1 HP / 3 Longyou; enterGame does not grant twice", async () => {
    const f = fixture(), p = f.player("owner", true);
    await f.start(); assert.equal(p.hp, 1); assert.equal(p.countMark(MARK), 3);
    await f.fire("enterGame", p); assert.equal(p.countMark(MARK), 3);
});
test("native full-HP recover and legal Peach become Longyou", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("other"); await f.start();
    const tao = { name: "tao" };
    assert.equal(f.lib.filter.cardEnabled(tao, q), true);
    assert.equal(f.lib.filter.targetEnabled(tao, q, q), true);
    assert.equal(f.lib.filter.targetEnabled(tao, q, p), false);
    await q.recover(2); assert.equal(q.hp, 4); assert.equal(q.countMark(MARK), 2); assert.equal(p.drawn, 0);
    q.cardBanned = true; assert.equal(f.lib.filter.cardEnabled(tao, q), false);
    q.cardBanned = false; q.targetBanned = true; assert.equal(f.lib.filter.targetEnabled(tao, q, q), false);
});
test("partial healing only converts the excess; zero recovery grants nothing", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("other"); await f.start(); q.hp = 2;
    await q.recover(3); assert.equal(q.hp, 4); assert.equal(q.countMark(MARK), 1);
    await q.recover(0); assert.equal(q.countMark(MARK), 1); assert.equal(p.drawn, 0);
});
test("native damage keeps damage history and triggers, while Longyou absorbs HP loss", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("source"); await f.start();
    await p.damage({ num: 2, source: q });
    assert.equal(p.hp, 1); assert.equal(p.countMark(MARK), 1); assert.equal(p.drawn, 2); assert.equal(p.dyingCalled, undefined);
    assert.equal(p.getHistory("damage")[0].num, 2);
    assert.ok(f.trace.some(e => e[1] === "damageSource"));
});
test("partial absorption and lethal excess use native dying", async () => {
    const f = fixture(), p = f.player("owner", true); await f.start();
    await p.damage(4); assert.equal(p.hp, 0); assert.equal(p.countMark(MARK), 0);
    assert.equal(p.drawn, 3); assert.equal(p.dyingCalled, true);
});
test("armor absorbs first; armor bypass still consumes Longyou", async () => {
    for (const bypass of [false, true]) {
        const f = fixture(), p = f.player("owner", true); await f.start(); p.hujia = 2;
        await p.damage({ num: 3, nohujia: bypass });
        assert.equal(p.hp, 1); assert.equal(p.hujia, bypass ? 2 : 0);
        assert.equal(p.countMark(MARK), bypass ? 0 : 2); assert.equal(p.drawn, bypass ? 3 : 1);
    }
});
test("loseHp uses Longyou but does not consume armor", async () => {
    const f = fixture(), p = f.player("owner", true); await f.start(); p.hujia = 2;
    await p.loseHp(2); assert.equal(p.hp, 1); assert.equal(p.hujia, 2); assert.equal(p.countMark(MARK), 1); assert.equal(p.drawn, 2);
});
test("other players' Longyou draws for the owner; direct removal also draws", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("other"); await f.start();
    f.give(q, 3); await q.loseHp(2); assert.equal(p.drawn, 2); assert.equal(q.drawn, 0); assert.equal(q.hp, 4);
    await f.fire("removeTest", q);
    // Place the real removeMark call inside a native queued event.
    const action = f.game.createEvent("testRemove", false); action.player = q;
    action.setContent(vm.runInContext('(async function(event, trigger, player) { player.removeMark("nihil_longyou", 1); })', f.ctx));
    await action; assert.equal(p.drawn, 3);
});
test("two Shengyu owners convert recovery once, and each draws on removal", async () => {
    const f = fixture(), p = f.player("a", true), q = f.player("b", true), t = f.player("other"); await f.start();
    await t.recover(2); assert.equal(t.countMark(MARK), 2);
    await t.loseHp(1); assert.equal(p.drawn, 1); assert.equal(q.drawn, 1);
});
test("Mingsi only acts on dodge or damage, not when becoming a slash target", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    await f.fire("useCardToTarget", p, { target: q, card: { name: "sha" } });
    assert.equal(q.maxHp, 4); assert.equal(q.hp, 4); assert.equal(q.countMark(MARK), 0); assert.equal(p.drawn, 0);
    assert.equal(f.mod.skill.nihil_mingsi.forced, true); assert.equal(f.mod.skill.nihil_mingsi.locked, true);
});
test("native slash dodged by Shan forces healing, including full-health Longyou", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    q.shanResponses = [true];
    await f.slash(p, q); assert.equal(p.hp, 1); assert.equal(p.countMark(MARK), 4);
    p.maxHp = 2; q.shanResponses = [true];
    await f.slash(p, q); assert.equal(p.hp, 2); assert.equal(p.countMark(MARK), 4);
    assert.equal(q.maxHp, 4); assert.equal(q.getHistory("damage").length, 0);
});
test("requiring two Shan heals once only if the full slash is dodged", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    q.shanResponses = [true, true]; await f.slash(p, q, { shanRequired: 2 });
    assert.equal(p.countMark(MARK), 4); assert.equal(q.maxHp, 4);
    q.shanResponses = [true, false]; await f.slash(p, q, { shanRequired: 2 });
    assert.equal(p.countMark(MARK), 4); assert.equal(q.maxHp, 3); assert.equal(q.countMark(MARK), 2);
});
test("skipShan without using Shan does not heal", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    await f.slash(p, q, { skipShan: true });
    assert.equal(p.countMark(MARK), 3); assert.equal(q.maxHp, 4);
});
test("stab slash only heals when Shan and the discard actually neutralize it", async () => {
    for (const discarded of [false, true]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
        q.shanResponses = [true]; q.handCards = 1; q.discardForStab = discarded;
        await f.slash(p, q, { card: { name: "sha", nature: "stab", isCard: true } });
        assert.equal(p.countMark(MARK), discarded ? 4 : 3);
        assert.equal(q.maxHp, discarded ? 4 : 3);
    }
});
test("native slash damage becomes max-HP loss and double recovery before armor or existing Longyou", async () => {
    for (const num of [1, 2, 3]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
        q.hp = 1; q.hujia = 2; f.give(q, 2);
        await q.damage({ num, source: p, card: { name: "sha" } });
        const maxHp = 4 - num, healing = Math.min(num * 2, maxHp - 1);
        assert.equal(q.maxHp, maxHp); assert.equal(q.hp, 1 + healing); assert.equal(q.hujia, 2);
        assert.equal(q.countMark(MARK), 2 + num * 2 - healing); assert.equal(p.drawn, 0);
        assert.equal(q.getHistory("damage").length, 0); assert.equal(p.getHistory("sourceDamage").length, 0);
        assert.ok(f.trace.some(e => e[1] === "damageCancelled"));
        assert.ok(!f.trace.some(e => e[1] === "damageSource" || e[1] === "damageEnd"));
    }
});
test("Mingsi snapshots final modified damage and clamps HP without spending Longyou", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start(); f.give(q, 1);
    f.game.callHook = (name, [event]) => { if (name === "checkDamage4") event.num = 2; };
    await q.damage({ num: 1, source: p, card: { name: "sha" } });
    assert.equal(q.maxHp, 2); assert.equal(q.hp, 2); assert.equal(q.countMark(MARK), 5); assert.equal(p.drawn, 0);
});
test("wounded targets heal real HP first; only excess recovery becomes Longyou", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start(); q.hp = 1;
    await q.damage({ num: 1, source: p, card: { name: "sha" } });
    assert.equal(q.maxHp, 3); assert.equal(q.hp, 3); assert.equal(q.countMark(MARK), 0);
    q.hp = 2;
    await q.damage({ num: 1, source: p, card: { name: "sha" } });
    assert.equal(q.maxHp, 2); assert.equal(q.hp, 2); assert.equal(q.countMark(MARK), 2);
});
test("native slash hit without Shan invokes the locked replacement", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    await f.slash(p, q);
    assert.equal(q.maxHp, 3); assert.equal(q.hp, 3); assert.equal(q.countMark(MARK), 2);
    assert.equal(p.countMark(MARK), 3); assert.equal(q.getHistory("damage").length, 0);
});
test("zero damage, other cards and another source do not invoke Mingsi", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"), other = f.player("other"); await f.start();
    await q.damage({ num: 0, source: p, card: { name: "sha" } }); assert.equal(q.maxHp, 4);
    await q.damage({ num: 1, source: p, card: { name: "juedou" } }); assert.equal(q.hp, 3); assert.equal(q.maxHp, 4);
    await q.damage({ num: 1, source: other, card: { name: "sha" } }); assert.equal(q.hp, 2); assert.equal(q.maxHp, 4);
    assert.equal(q.countMark(MARK), 0);
});
test("damage prevented earlier does not reduce max HP or grant Longyou", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    f.lib.skill.test_prevent = { trigger: { player: "damageBegin4" },
        content: vm.runInContext("(async function(event, trigger) { trigger.cancel(); })", f.ctx) };
    q.addSkill("test_prevent");
    await q.damage({ num: 2, source: p, card: { name: "sha" } });
    assert.equal(q.maxHp, 4); assert.equal(q.hp, 4); assert.equal(q.countMark(MARK), 0);
});
test("max HP reduced to zero uses native death without granting marks to a corpse", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start(); q.maxHp = q.hp = 1;
    await q.damage({ num: 1, source: p, card: { name: "sha" } });
    assert.equal(q.maxHp, 0); assert.equal(q.dyingCalled, true); assert.equal(q.countMark(MARK), 0);
});
test("Caisheng accepts self with marks and rejects empty targets", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("empty"); await f.start();
    assert.equal(f.mod.skill.nihil_caisheng.filterTarget(null, p, p), true);
    assert.equal(f.mod.skill.nihil_caisheng.filterTarget(null, p, q), false);
    await f.runSkill("nihil_caisheng", p, p);
    assert.equal(p.hp, 1); assert.equal(p.drawn, 3); assert.equal(p.countMark(MARK), 0);
    assert.equal(f.lib.filter.targetEnabled({ name: "tao" }, p, p), false);
    assert.equal(p.used.length, 1); assert.equal(p.used[0].targets.includes(p), false);
});
test("Caisheng costs 0,1,2 within one turn; a second phase does not reset the cost", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); await f.start();
    for (let cost = 0; cost < 3; cost++) {
        f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
        assert.equal(p.storage[TURN].count, cost + 1);
        assert.equal(p.countMark(MARK), 3 - cost * (cost + 1) / 2);
        assert.equal(p.hp, 1);
        // Native phaseUse stat resets do not own this skill's turn counter.
        p.getStat().skill = {};
    }
    assert.equal(p.drawn, 6);
    assert.equal(p.expiry.global, "phaseAfter");
    f.endTurn(p); f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
    assert.equal(p.hp, 1); assert.equal(p.storage[TURN].count, 1);
});
test("Caisheng bans the donor before slash choice; enforces layer limit, range and bans", async () => {
    const f = fixture(), p = f.player("owner", true), donor = f.player("donor"), a = f.player("a"), b = f.player("b"), far = f.player("far");
    await f.start(); f.give(donor, 2); far.distance = 3; b.targetBanned = true;
    p.onDraw = () => assert.equal(f.lib.filter.targetEnabled({ name: "sha" }, p, donor), false, "donor is protected during removal rewards");
    await f.runSkill("nihil_caisheng", p, donor);
    assert.deepEqual(p.offered.map(t => t.playerid), ["a"]);
    assert.deepEqual(Array.from(p.offeredRange), [1, 2]);
    assert.equal(p.drawn, 2);
    assert.equal(f.lib.filter.targetEnabled({ name: "tao" }, p, donor), false);
    assert.equal(f.lib.filter.targetEnabled({ name: "sha" }, a, donor), true);
    f.endTurn(p); assert.equal(f.lib.filter.targetEnabled({ name: "sha" }, p, donor), true);
});
test("Caisheng slash triggers Mingsi and may select multiple targets", async () => {
    const f = fixture(), p = f.player("owner", true), donor = f.player("donor"), a = f.player("a"), b = f.player("b");
    await f.start(); f.give(donor, 2); p.resolveSha = target => f.slash(p, target);
    await f.runSkill("nihil_caisheng", p, donor);
    assert.equal(p.used[0].targets.length, 2); assert.equal(a.maxHp, 3); assert.equal(b.maxHp, 3);
    assert.equal(a.countMark(MARK), 2); assert.equal(b.countMark(MARK), 2);
});
test("one Caisheng slash can heal on one dodging target and replace damage to another", async () => {
    const f = fixture(), p = f.player("owner", true), donor = f.player("donor"), a = f.player("dodge"), b = f.player("hit");
    await f.start(); f.give(donor, 2); a.shanResponses = [true]; p.resolveSha = target => f.slash(p, target);
    await f.runSkill("nihil_caisheng", p, donor);
    assert.equal(p.countMark(MARK), 4); assert.equal(p.drawn, 2);
    assert.equal(a.maxHp, 4); assert.equal(a.countMark(MARK), 0);
    assert.equal(b.maxHp, 3); assert.equal(b.countMark(MARK), 2);
});
test("self-target Caisheng pays its cost before clearing remaining Longyou", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("target"); f.player("other"); await f.start();
    f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
    const before = p.drawn;
    f.give(p, 2); await f.runSkill("nihil_caisheng", p, p);
    assert.equal(p.drawn - before, 2); assert.equal(p.countMark(MARK), 0); assert.equal(p.hp, 1);
    // One layer was used as cost, so only one remaining layer funds slash targets.
    assert.deepEqual(Array.from(p.offeredRange), [1, 1]);
});
test("no legal slash target still clears marks and draws; no use is invented", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("donor"); await f.start(); f.give(q, 2);
    await f.runSkill("nihil_caisheng", p, q);
    assert.equal(p.drawn, 2); assert.equal(p.used.length, 0);
});
test("Caisheng death during the escalating cost stops before removing the donor's marks", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("donor"); await f.start();
    f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
    f.give(p, 0); f.give(q, 2);
    await f.runSkill("nihil_caisheng", p, q);
    assert.equal(p.dyingCalled, true); assert.equal(q.countMark(MARK), 2); assert.equal(p.drawn, 1);
});
test("Caisheng slash ignores quota and repeated uses preserve the ordinary slash count", async () => {
    for (const before of [undefined, 0, 1, 3]) {
        const f = fixture(), p = f.player("owner", true), q = f.player("donor"), other = f.player("other"); await f.start();
        if (before !== undefined) p.getStat().card.sha = before;
        for (let index = 0; index < 2; index++) {
            f.give(q, 1); await f.runSkill("nihil_caisheng", p, q);
            assert.equal(p.used[index].targets[0], other);
            assert.equal(p.getStat().card.sha, before, "generated slash must not spend an ordinary slash use");
            assert.equal(p.used[index].addCount, false);
        }
        assert.equal(p.used.length, 2); assert.equal(p.storage[TURN].count, 2, "Caisheng's own cost still escalates");
    }
});
test("field compatibility installs idempotently and restores native eligibility when absent", async () => {
    const f = fixture(), p = f.player("owner", true), q = f.player("other"); await f.start();
    const proto = f.lib.element.Player.prototype, recover = proto.recover, enable = f.lib.card.tao.enable, ignore = f.lib.card.taoyuan.ignoreTarget;
    f.mod.init(); f.lib.skill.nihil_shengyu.init(p);
    assert.equal(proto.recover, recover); assert.equal(f.lib.card.tao.enable, enable);
    assert.equal(f.lib.card.taoyuan.ignoreTarget, ignore);
    assert.equal(q.isHealthy(), true); assert.equal(q.isDamaged(), false);
    p.skills = []; assert.equal(f.lib.filter.cardEnabled({ name: "tao" }, q), false);
    await q.recover(1); assert.equal(q.countMark(MARK), 0);
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
    assert.equal(pack.translate.nihil_baichi, "白螭"); assert.equal(pack.characterTitle.nihil_baichi, "太素司生");
    assert.deepEqual(Array.from(pack.pinyins.nihil_baichi), ["bai", "chi"]);
    for (const id of p.skills) assert.ok(pack.skill[id] && pack.translate[id + "_info"]);
    assert.equal(p.img, "extension/Nihilphile/image/character/nihil_baichi.png");
    const image = fs.readFileSync(path.join(root, "nihilphile武将包/image/character/nihil_baichi.png"));
    assert.equal(image.subarray(1, 4).toString(), "PNG");
});

(async () => {
    for (const { name, run } of cases) { await run(); console.log("PASS " + name); }
    console.log(JSON.stringify({ suite: "baichi_engine", passed: cases.length, engine,
        native: ["GameEvent", "GameEventManager", "ContentCompiler", "Player HP methods", "HP contents", "card filters"],
        adapters: ["trigger selection", "UI", "network", "card use"], browserAcceptance: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
