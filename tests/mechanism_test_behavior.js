"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "test-extensions", "MechanismTest", "character.js"), "utf8");

function makeEvent(calls, kind, result, args) {
    const event = {
        values: {},
        set(key, value) { this.values[key] = value; return this; },
        async forResult() { calls.push({ kind, args, values: { ...this.values } }); return result; },
    };
    return event;
}

function loadFixture() {
    let factory;
    let cardSequence = 0;
    const calls = [];
    const lib = {
        card: {
            sha: { type: "basic" },
            shan: { type: "basic" },
            tao: { type: "basic" },
            juedou: { type: "trick" },
            lebu: { type: "delay" },
            zhuge: { type: "equip" },
            ext_test: { type: "trick" },
        },
        inpile_nature: ["fire", "thunder"],
    };
    const game = {
        import(kind, callback) {
            assert.equal(kind, "character");
            factory = callback;
        },
        createCard2(name, suit, number, nature) {
            const card = { id: `generated-${++cardSequence}`, name, suit, number, nature };
            calls.push({ kind: "createCard2", name, suit, number, nature, card });
            return card;
        },
        async cardsGotoPile(cards, mode) {
            calls.push({ kind: "cardsGotoPile", cards, mode });
        },
        log(...args) {
            calls.push({ kind: "log", args });
        },
    };
    const names = { ext_test: "扩展测试牌", diamond: "方片", fire: "火", thunder: "雷" };
    const get = {
        translation(value) {
            if (value && typeof value === "object") return value.label || value.name || value.id || String(value);
            return names[value] || String(value);
        },
        type(name) {
            return lib.card[name] && lib.card[name].type;
        },
    };
    const context = { window: { MECHANISM_TEST_EXTENSION_NAME: "MechanismTest" }, console, game };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: "character.js" });
    const pack = factory(lib, game, {}, get, {}, {});

    function makeTarget(id) {
        return {
            id,
            name: id,
            label: id,
            hp: 3,
            maxHp: 4,
            hujia: 2,
            cards: [{ id: `${id}-card`, name: "shan" }],
            isIn() { return true; },
            countCards() { return this.cards.length; },
            async gain(card, animation) { calls.push({ kind: "gain", target: this, card, animation }); this.cards.push(card); },
            async damage(params) { calls.push({ kind: "damage", target: this, params }); },
            async recover(num) { calls.push({ kind: "recover", target: this, num }); },
            async loseHp(num) { calls.push({ kind: "loseHp", target: this, num }); },
            async changeHujia(num) { calls.push({ kind: "changeHujia", target: this, num }); this.hujia += num; },
        };
    }

    const actor = makeTarget("actor");
    actor.storage = {};
    actor.controls = [];
    actor.targets = [];
    actor.cards = [{ id: "actor-card", name: "sha" }];
    actor.chooseUseResult = { bool: true, targets: [] };
    actor.chooseCardResult = { bool: true, cards: [actor.cards[0]] };
    actor.gainPlayerResult = { bool: true };
    actor.discardPlayerResult = { bool: true };
    actor.moveCardResult = { bool: false };
    actor.chooseControl = function (controls) {
        const control = this.controls.shift();
        calls.push({ kind: "chooseControlPrompt", controls: Array.from(controls), control });
        return makeEvent(calls, "chooseControl", { control }, [controls]);
    };
    actor.chooseTarget = function () {
        const target = this.targets.shift();
        return makeEvent(calls, "chooseTarget", target ? { bool: true, targets: [target] } : { bool: false }, []);
    };
    actor.chooseUseTarget = function (...args) {
        return makeEvent(calls, "chooseUseTarget", this.chooseUseResult, args);
    };
    actor.chooseCard = function (...args) {
        return makeEvent(calls, "chooseCard", this.chooseCardResult, args);
    };
    actor.gainPlayerCard = function (...args) {
        return makeEvent(calls, "gainPlayerCard", this.gainPlayerResult, args);
    };
    actor.discardPlayerCard = function (...args) {
        return makeEvent(calls, "discardPlayerCard", this.discardPlayerResult, args);
    };
    actor.moveCard = function (...args) {
        return makeEvent(calls, "moveCard", this.moveCardResult, args);
    };
    actor.give = async function (cards, target, animation) {
        calls.push({ kind: "give", cards, target, animation });
    };
    actor.syncStorage = function (key) { calls.push({ kind: "syncStorage", key }); };
    actor.markSkill = function (skill) { calls.push({ kind: "markSkill", skill }); };

    return { calls, lib, pack, skill: pack.skill.mechanism_test_console, actor, makeTarget };
}

async function runSkill(fixture, controls, targets) {
    fixture.actor.controls.push(...controls);
    fixture.actor.targets.push(...(targets || []));
    await fixture.skill.content({}, {}, fixture.actor);
}

(async () => {
    {
        const f = loadFixture(), target = f.makeTarget("recipient");
        await runSkill(f, ["生成实体牌", "快捷预设", "火杀·♥7"], [target]);
        const created = f.calls.find(call => call.kind === "createCard2");
        assert.deepEqual({ name: created.name, suit: created.suit, number: created.number, nature: created.nature }, { name: "sha", suit: "heart", number: 7, nature: "fire" });
        assert.equal(f.calls.filter(call => call.kind === "gain").length, 1);
    }

    {
        const f = loadFixture(), target = f.makeTarget("recipient");
        await runSkill(f, ["生成实体牌", "按牌类与精确ID", "普通锦囊", "扩展测试牌 [ext_test]", "♦ [diamond]", "11"], [target]);
        const created = f.calls.find(call => call.kind === "createCard2");
        assert.deepEqual({ name: created.name, suit: created.suit, number: created.number }, { name: "ext_test", suit: "diamond", number: 11 });
        assert.equal(f.calls.filter(call => call.kind === "gain").length, 1);
    }

    {
        const f = loadFixture(), target = f.makeTarget("recipient");
        await runSkill(f, ["生成实体牌", "按牌类与精确ID", "基本牌", "不存在 [missing]"], [target]);
        assert.equal(f.calls.some(call => call.kind === "createCard2" || call.kind === "gain"), false);
        assert.match(f.actor.storage.mechanism_test_history.join("\n"), /未知或未注册牌/);
    }

    {
        const f = loadFixture();
        await runSkill(f, ["使用无材料杀", "雷杀"]);
        const use = f.calls.find(call => call.kind === "chooseUseTarget");
        assert.equal(use.args[0].card.name, "sha");
        assert.equal(use.args[0].card.isCard, true);
        assert.equal(use.args[0].card.nature, "thunder");
        assert.deepEqual(Array.from(use.args[0].cards), []);
        assert.equal(use.args[0].nodistance, true);
        assert.equal(use.args[0].addCount, false);
    }

    {
        const f = loadFixture(), sourcePlayer = f.makeTarget("source"), target = f.makeTarget("target");
        await runSkill(f, ["指定来源伤害", "火焰伤害", "自定义正整数", "7", "完成输入"], [sourcePlayer, target]);
        const damage = f.calls.find(call => call.kind === "damage");
        assert.equal(damage.params.source, sourcePlayer);
        assert.equal(damage.params.num, 7);
        assert.equal(damage.params.nature, "fire");
        assert.equal(damage.params.nocard, true);
    }

    for (const [operation, expectedKind, amount, expectedNum] of [
        ["回复体力", "recover", 8, 8],
        ["失去体力", "loseHp", 9, 9],
        ["增加护盾", "changeHujia", 12, 12],
        ["减少护盾", "changeHujia", 7, -2],
    ]) {
        const f = loadFixture(), target = f.makeTarget("target");
        await runSkill(f, ["体力与护盾", operation, "自定义正整数", ...String(amount).split(""), "完成输入"], [target]);
        const call = f.calls.find(item => item.kind === expectedKind);
        assert.equal(call.num, expectedNum, operation);
    }

    {
        const f = loadFixture(), target = f.makeTarget("target");
        await runSkill(f, ["体力与护盾", "增加护盾", "自定义正整数", "0", "完成输入", "cancel2"], [target]);
        assert.equal(f.calls.some(call => ["recover", "loseHp", "changeHujia"].includes(call.kind)), false);
        assert.match(f.actor.storage.mechanism_test_history.join("\n"), /必须是大于0的安全整数/);
    }

    {
        const f = loadFixture(), from = f.makeTarget("from"), to = f.makeTarget("to");
        const card = { id: "equip-card", name: "zhuge" };
        f.actor.moveCardResult = { bool: true, card, targets: [from, to], position: "e" };
        await runSkill(f, ["移动场上牌"]);
        const move = f.calls.find(call => call.kind === "moveCard");
        assert.equal(move.args[0].forced, false);
        assert.equal(move.args[0].canReplace, false);
        assert.equal(f.calls.some(call => call.kind === "chooseUseTarget"), false);
        assert.match(f.actor.storage.mechanism_test_history.at(-1), /移动场上牌/);
    }

    {
        const f = loadFixture();
        await runSkill(f, ["控牌堆顶", "2点", "快捷预设", "桃·♥6", "按牌类与精确ID", "普通锦囊", "扩展测试牌 [ext_test]", "♣ [club]", "12"]);
        const created = f.calls.filter(call => call.kind === "createCard2");
        assert.equal(created.length, 2);
        const pile = f.calls.find(call => call.kind === "cardsGotoPile");
        assert.equal(pile.mode, "insert");
        assert.deepEqual(Array.from(pile.cards, card => card.name), ["ext_test", "tao"], "insert API must receive reverse order so first selection becomes top");
        assert.match(f.actor.storage.mechanism_test_history.at(-1), /桃·♥6.*扩展测试牌/);
    }

    {
        const f = loadFixture();
        await runSkill(f, ["控牌堆顶", "2点", "快捷预设", "桃·♥6", "cancel2"]);
        assert.equal(f.calls.some(call => call.kind === "createCard2" || call.kind === "cardsGotoPile"), false);
        assert.match(f.actor.storage.mechanism_test_history.at(-1), /尚未创建或移动任何牌/);
    }

    {
        const f = loadFixture(), target = f.makeTarget("target");
        await runSkill(f, ["获得现有牌"], [target]);
        const params = f.calls.find(call => call.kind === "gainPlayerCard").args[0];
        assert.equal(params.target, target);
        assert.equal(params.position, "he");
        assert.equal(params.forced, false);
    }

    {
        const f = loadFixture(), target = f.makeTarget("target");
        f.actor.chooseCardResult = { bool: false };
        await runSkill(f, ["交给手牌"], [target]);
        assert.equal(f.calls.some(call => call.kind === "give"), false);
        assert.match(f.actor.storage.mechanism_test_history.at(-1), /^取消：交给/);
    }

    {
        const f = loadFixture();
        await runSkill(f, ["cancel2"]);
        assert.equal(f.calls.some(call => ["createCard2", "cardsGotoPile", "moveCard", "damage", "recover", "loseHp", "changeHujia", "give", "chooseUseTarget"].includes(call.kind)), false);
        assert.equal(f.actor.storage.mechanism_test_history[0], "取消：机制台主菜单");
    }

    console.log("mechanism_test_behavior: PASS");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
