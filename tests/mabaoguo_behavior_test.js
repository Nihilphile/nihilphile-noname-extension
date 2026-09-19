"use strict";
// Deterministic rule checks; the independent tester owns real game acceptance.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../nihilphile武将包");
const cases = [];
const test = (name, run) => cases.push({ name, run });
const compilerRoot = path.join(process.env.NONAME_ENGINE_ROOT ||
    "F:/AI_project/nameless_game/无名杀子琪懒人包v1.11.3-win32-x64/resources/app",
    "noname/library/element/GameEvent/compilers");
function loadNativeCompiler(ctx) {
    vm.runInContext(`
        const AsyncFunction = (async function(){}).constructor;
        const GeneratorFunction = (function*(){}).constructor;
        const AsyncGeneratorFunction = (async function*(){}).constructor;
        const security = { getIsolatedsFrom() { return [null, null, Function]; }, isSandboxRequired() { return false; } };
        const ErrorManager = { setCodeSnippet() {} };
        class CodeSnippet {}
    `, ctx);
    // Run the installed 1.11.3 compiler bodies unchanged. Only ESM bindings are
    // supplied by this isolated browser-free harness; parser/dispatch are real.
    for (const file of ["ContentCompilerBase", "ArrayCompiler", "AsyncCompiler", "StepCompiler", "ContentCompiler"]) {
        const source = fs.readFileSync(path.join(compilerRoot, file + ".js"), "utf8")
            .replace(/^import .+;\r?$/gm, "").replace(/export\s*\{[^}]*\};?/g, "");
        vm.runInContext(source, ctx, { filename: path.join(compilerRoot, file + ".js") });
    }
    return vm.runInContext("compiler", ctx);
}
async function executeCompiled(compiler, content, event, trigger, player) {
    let currentStep = 0, nextStep;
    Object.defineProperty(event, "step", { configurable: true,
        get() { return currentStep; }, set(value) { nextStep = value; } });
    Object.assign(event, { name: "skill", player, _trigger: trigger, finished: false,
        getDefaultHandlerType() { return "handler"; }, callHandler() {}, clearStepCache() {},
        updateStep() { if (nextStep !== undefined) { currentStep = nextStep; nextStep = undefined; } },
        finish() { this.finished = true; }, async waitNext() {} });
    await compiler.compile(content)(event);
}
function fixture() {
    const log = [], shadows = [];
    const lib = { skill: { attack: {}, locked: { locked: true }, helper: { charlotte: true }, equipment: { equipSkill: true } },
        translate: { attack_info: "attack", locked_info: "locked", helper_info: "helper", equipment_info: "equipment" } };
    const get = { name: c => c.name, number: c => c.number, suit: c => c.suit || "none", nature: c => c.nature,
        itemtype: c => c.physical ? "card" : "vcard", translation: x => x.id || x,
        attitude: () => -1, effect: () => 2, value: c => c.value || 3,
        autoViewAs: (c, cards) => ({ ...c, cards: cards.slice() }) };
    const game = { log() {}, checkMod: card => card.blocked ? false : "unchanged",
        createCard(name, suit, number, nature) {
            const c = { name, suit, number, nature, physical: true, zone: "special", remove() { this.zone = null; } };
            shadows.push(c); return c;
        } };
    const ctx = { window: {}, lib, game, get, _status: {}, ui: {}, ai: {}, console };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(root, "module/mabaoguo.js"), "utf8"), ctx);
    const mod = ctx.window.nihilModules.mabaoguo;
    Object.assign(lib.skill, mod.skill);
    const compiler = loadNativeCompiler(ctx);
    const contentTypes = [];
    function compileSkills(skills) {
        for (const skill of Object.values(skills)) {
            if (typeof skill.content === "function") {
                const original = skill.content;
                contentTypes.push(compiler.compile(original).type);
                skill.content = (event, trigger, player) => executeCompiled(compiler, original, event, trigger, player);
            }
            if (skill.subSkill) compileSkills(skill.subSkill);
        }
    }
    compileSkills(mod.skill);
    function request(player, kind, result) {
        return { player, set(key, value) { this[key] = value; return this; }, async forResult() {
            if (this.ai) {
                const cb = vm.runInNewContext("(" + this.ai.toString() + ")", { _status: { event: this }, get, game });
                cb(kind === "card" ? player.hand[0] : undefined);
            }
            if (player.beforeChoice) player.beforeChoice(kind);
            return typeof result === "function" ? result(this) : result;
        } };
    }
    function player(id) {
        return { id, playerid: id, inGame: true, hand: [], marks: 0, storage: {}, tempSkills: {}, disabledSkills: {},
            skillList: ["attack", "locked", "helper", "equipment"], compareNumber: 2, compareMods: 0,
            accept: true, chosenSkill: "attack", stat: { sha: 1 },
            isIn() { return this.inGame; }, isDead() { return !this.inGame; }, isOut() { return false; },
            getCards() { return this.hand; }, countMark() { return this.marks; },
            addMark(key, n) { this.marks += n; }, removeMark(key, n) { this.marks -= n; },
            logSkill(name) { log.push(name); },
            canCompare(target, goon) { return this !== target && (goon || this.hand.length > 0) && target.hand.length > 0 && !target.noCompare; },
            canUse(card, target, distance, quota) {
                assert.equal(distance, false); assert.equal(quota, false);
                return target !== this && !target.prohibited && !this.prohibited;
            },
            getSkills(arg1, equip, filter) { assert.equal(equip, false); assert.equal(filter, false); return this.skillList; },
            addTempSkill(skill, expiry) { this.tempSkills[skill] = expiry; },
            disableSkill(reason, skill) { (this.disabledSkills[skill] ||= []).push(reason); },
            enableSkill(reason) { for (const key in this.disabledSkills) {
                this.disabledSkills[key] = this.disabledSkills[key].filter(x => x !== reason);
                if (!this.disabledSkills[key].length) delete this.disabledSkills[key];
            } }, syncStorage() {}, markSkill() {},
            chooseBool() { return request(this, "bool", { bool: this.accept }); },
            chooseControl(options) { this.options = options; return request(this, "control", { control: this.chosenSkill }); },
            chooseToCompare(target) { return request(this, "compare", req => {
                const c = req.fixedResult[this.playerid]; this.compared = c;
                assert.ok(!this.hand.includes(c)); assert.equal(c.zone, null); assert.equal(c.destroyed, true);
                const opposing = target.hand.shift(); opposing.zone = "discard";
                return { bool: c.number + this.compareMods > opposing.number, num1: c.number + this.compareMods, num2: opposing.number };
            }); },
            chooseCard(position, prompt, filter) {
                assert.equal(position, "h");
                const req = request(this, "card", action => {
                    const cb = vm.runInNewContext("(" + filter.toString() + ")", { _status: { event: action }, get, game });
                    const c = this.hand.find(card => cb(card, this));
                    return this.accept && c ? { bool: true, cards: [c] } : { bool: false };
                }); return req;
            },
            async useCard(card, materials, target, addCount) {
                assert.equal(this.marks, 0, "cost paid before use"); assert.equal(addCount, false);
                assert.equal(card.name, "sha"); assert.equal(card.nature, undefined);
                assert.deepEqual(Array.from(card.cards), Array.from(materials));
                this.used = { card, materials, target, addCount }; this.hand = this.hand.filter(c => !materials.includes(c));
            },
        };
    }
    const owner = player("owner"), target = player("target");
    const physical = n => ({ physical: true, name: "sha", number: n, zone: "ordering" });
    target.hand = [physical(2)];
    return { mod, owner, target, physical, shadows, log, lib, compiler, ctx, contentTypes };
}
test("native compiler dispatch preserves all three skill contents; old closure form reproduces failure", async () => {
    const f = fixture(); assert.deepEqual(f.contentTypes, ["async", "async", "async"]);
    const broken = vm.runInContext("(function () { const HUNYUAN = 'nihil_touxi'; return function(event, trigger, player) { player.addMark(HUNYUAN, trigger.num); }; })()", f.ctx);
    assert.equal(f.compiler.compile(broken).type, "step");
    await assert.rejects(executeCompiled(f.compiler, broken, {}, { num: 1 }, f.owner), /HUNYUAN is not defined/);
    await f.mod.skill.nihil_touxi.subSkill.hurt.content({}, { num: 1 }, f.owner);
    assert.equal(f.owner.marks, 1);
});
test("registration and resource path", () => {
    const { mod } = fixture(); assert.equal(mod.character.nihil_mabaoguo.hp, 4);
    assert.equal(mod.character.nihil_mabaoguo.group, "shen");
    assert.ok(fs.existsSync(path.join(root, "image/character/nihil_mabaoguo.png")));
    assert.match(fs.readFileSync(path.join(root, "extension.js"), "utf8"), /"mabaoguo"/);
});
for (const [label, numbers, expected] of [["physical", [13], 13], ["one material", [9], 9], ["many materials", [4, 12, 6], 12], ["virtual zero", [], 0]]) {
    test("Wude " + label + ": native compare representation and conservation", async () => {
        const f = fixture(); const materials = numbers.map(f.physical);
        const card = label === "physical" ? materials[0] : { name: "sha", cards: materials, number: 99 };
        const trigger = { card, cards: materials, target: f.target };
        assert.equal(f.mod.skill.nihil_wude.filter(trigger, f.owner), true, "owner may have no hand");
        await f.mod.skill.nihil_wude.content({}, trigger, f.owner);
        assert.equal(f.owner.compared.number, expected); assert.equal(f.shadows[0].zone, null);
        assert.ok(materials.every(c => c.zone === "ordering")); assert.equal(f.target.hand.length, 0);
        assert.equal(!!f.target.disabledSkills.attack, expected > 2);
    });
}
test("Wude equality/loss never seal; native point modifiers remain effective", async () => {
    for (const [number, modifier, sealed] of [[2, 0, false], [1, 0, false], [0, 3, true]]) {
        const f = fixture(); f.owner.compareMods = modifier;
        const material = number ? [f.physical(number)] : [];
        await f.mod.skill.nihil_wude.content({}, { card: { name: "sha" }, cards: material, target: f.target }, f.owner);
        assert.equal(!!f.target.disabledSkills.attack, sealed);
    }
});
test("Wude decline/empty target/noCompare/win cancel/no skills", async () => {
    for (const branch of ["decline", "empty", "forbidden", "cancel", "noSkills"]) {
        const f = fixture(); const trigger = { card: f.physical(13), target: f.target };
        if (branch === "decline") f.owner.accept = false;
        if (branch === "empty") f.target.hand = [];
        if (branch === "forbidden") f.target.noCompare = true;
        if (branch === "cancel") f.owner.chosenSkill = "cancel2";
        if (branch === "noSkills") f.target.skillList = [];
        if (f.mod.skill.nihil_wude.filter(trigger, f.owner)) await f.mod.skill.nihil_wude.content({}, trigger, f.owner);
        assert.deepEqual(f.target.disabledSkills, {});
        assert.equal(f.shadows.length, ["cancel", "noSkills"].includes(branch) ? 1 : 0);
    }
});
test("multiple seals include locked skill; phaseAfter restores only own reason", async () => {
    const f = fixture(); f.target.disabledSkills.attack = ["other_source"];
    for (const skill of ["attack", "locked", "attack"]) {
        f.target.hand = [f.physical(1)]; f.owner.chosenSkill = skill;
        await f.mod.skill.nihil_wude.content({}, { card: f.physical(13), target: f.target }, f.owner);
    }
    assert.equal(f.owner.options.includes("helper"), false); assert.equal(f.owner.options.includes("equipment"), false);
    assert.equal(f.target.tempSkills.nihil_wude_disabled.global, "phaseAfter");
    assert.deepEqual(Array.from(f.target.storage.nihil_wude_disabled), ["attack", "locked"]);
    f.mod.skill.nihil_wude_disabled.onremove(f.target);
    assert.deepEqual(f.target.disabledSkills, { attack: ["other_source"] });
    assert.equal(f.target.storage.nihil_wude_disabled, undefined);
});
test("temporarily acquired ordinary character skills remain sealable", async () => {
    const f = fixture();
    f.lib.skill.borrowed = { temp: true };
    f.lib.translate.borrowed_info = "A temporarily acquired normal character skill";
    f.target.skillList.push("borrowed");
    f.target.tempSkills.borrowed = { player: "phaseAfter" };
    f.owner.chosenSkill = "borrowed";
    await f.mod.skill.nihil_wude.content({}, { card: f.physical(13), target: f.target }, f.owner);
    assert.ok(f.owner.options.includes("borrowed"));
    assert.deepEqual(f.target.disabledSkills.borrowed, ["nihil_wude_disabled"]);
    assert.equal(f.owner.options.includes("helper"), false, "charlotte helper stays hidden");
    f.mod.skill.nihil_wude_disabled.onremove(f.target);
    assert.equal(f.target.disabledSkills.borrowed, undefined);
    assert.ok(f.target.tempSkills.borrowed, "seal removal must not delete the borrowed skill");
});
test("damageEnd gain uses suffered damage including armor absorption; zero rejected", async () => {
    const f = fixture(); const skill = f.mod.skill.nihil_touxi.subSkill.hurt;
    assert.equal(skill.trigger.player, "damageEnd", "loseHp/changeHp cannot trigger the skill");
    for (const [num, hujia] of [[1, 0], [2, 0], [2, 2], [0, 0]]) {
        const trigger = { num, hujia };
        if (skill.filter(trigger)) await skill.content({}, trigger, f.owner);
    }
    assert.equal(f.owner.marks, 5);
});
test("Touxi range/quota exception uses one hand material, once per phase event", async () => {
    const f = fixture(); f.owner.marks = 1; f.owner.hand = [f.physical(8)];
    const trigger = { player: f.target }, skill = f.mod.skill.nihil_touxi;
    assert.equal(skill.filter(trigger, f.owner), true);
    await skill.content({}, trigger, f.owner); assert.equal(f.owner.hand.length, 0); assert.equal(f.owner.marks, 0);
    assert.equal(f.owner.stat.sha, 1); assert.equal(f.owner.used.target, f.target);
    f.owner.marks = 1; f.owner.hand = [f.physical(3)];
    assert.equal(skill.filter(trigger, f.owner), false);
    assert.equal(skill.filter({ player: f.target }, f.owner), true, "new/extra turn has another window");
});
test("Touxi self/no resource/prohibition/cancel cause no payment", async () => {
    for (const branch of ["self", "noMark", "noHand", "prohibited", "blockedMaterial", "cancel"]) {
        const f = fixture(); f.owner.marks = branch === "noMark" ? 0 : 1;
        f.owner.hand = branch === "noHand" ? [] : [f.physical(4)];
        if (branch === "blockedMaterial") f.owner.hand[0].blocked = true;
        if (branch === "prohibited") f.target.prohibited = true;
        if (branch === "cancel") f.owner.accept = false;
        const before = f.owner.marks, count = f.owner.hand.length;
        const trigger = { player: branch === "self" ? f.owner : f.target };
        if (f.mod.skill.nihil_touxi.filter(trigger, f.owner)) await f.mod.skill.nihil_touxi.content({}, trigger, f.owner);
        assert.equal(f.owner.marks, before); assert.equal(f.owner.hand.length, count); assert.equal(f.owner.used, undefined);
    }
});
(async () => {
    for (const item of cases) { await item.run(); console.log("PASS", item.name); }
    console.log("Passed " + cases.length + " Mabaoguo rule checks (isolated, not game acceptance)");
})().catch(error => { console.error(error); process.exitCode = 1; });
