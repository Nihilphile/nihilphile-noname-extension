"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = {
    window: {},
    game: {},
    get: {},
    lib: {},
    ui: {},
    ai: {},
    _status: {},
    console,
    Math,
    Number,
    Object,
    isFinite,
};

vm.createContext(context);
const modulePath = path.join(
    __dirname,
    "..",
    "nihilphile武将包",
    "module",
    "luofei.js",
);
vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, {
    filename: modulePath,
});

const helpers = context.window.nihilModules.luofei.aiHelpers;

function testVulnerableAndOverKill() {
    assert.strictEqual(helpers.isVulnerable(0, false), true);
    assert.strictEqual(helpers.isVulnerable(1, false), true);
    assert.strictEqual(helpers.isVulnerable(2, false), false);
    assert.strictEqual(
        helpers.isVulnerable(4, true),
        true,
        "有无闪记录时，即使后来仍有旧手牌也应暂记为脆弱",
    );

    assert.strictEqual(helpers.isOverKill(2, 3, false), true);
    assert.strictEqual(helpers.isOverKill(2, 2, true), true);
    assert.strictEqual(helpers.isOverKill(2, 2, false), false);
    assert.strictEqual(helpers.isOverKill(2, 1, true), false);
}

function testYinchaoSpend() {
    assert.strictEqual(
        helpers.decideYinchaoSpend({
            blood: 4,
            hasProfitableTarget: false,
            hasExecutionTarget: false,
        }).spend,
        0,
        "没有正收益攻击目标时不应为赌黑牌发动殷潮",
    );
    assert.strictEqual(
        helpers.decideYinchaoSpend({
            blood: 1,
            hasProfitableTarget: true,
            hasExecutionTarget: false,
        }).spend,
        0,
        "通常应保留最后1血给流生",
    );
    assert.strictEqual(
        helpers.decideYinchaoSpend({
            blood: 1,
            hasProfitableTarget: true,
            hasExecutionTarget: true,
        }).spend,
        1,
        "只剩1血时，允许对1血脆弱敌人下注斩杀",
    );
    const plan = helpers.decideYinchaoSpend({
        blood: 5,
        hasProfitableTarget: true,
        hasExecutionTarget: false,
    });
    assert.strictEqual(plan.action, "SPEND");
    assert.strictEqual(plan.spend, 4, "常规殷潮应留下1血并使用其余资源");
}

function testLiushengDecision() {
    assert.strictEqual(
        helpers.decideLiusheng({
            blood: 2,
            attitude: -10,
            targetDamaged: true,
            targetInGame: true,
            selfTarget: true,
        }).action,
        "HOLD",
        "息状态对自己不得因异常负态度发动流生",
    );
    assert.strictEqual(
        helpers.decideLiusheng({
            blood: 3,
            attitude: -10,
            targetDamaged: true,
            targetInGame: true,
            selfTarget: true,
        }).action,
        "USE",
        "生状态对自己仍可发动流生回血",
    );
    assert.strictEqual(
        helpers.decideLiusheng({
            blood: 3,
            attitude: 5,
            targetDamaged: true,
            targetInGame: true,
        }).action,
        "USE",
        "生状态应帮助受伤友方",
    );
    assert.strictEqual(
        helpers.decideLiusheng({
            blood: 3,
            attitude: -5,
            targetDamaged: true,
            targetInGame: true,
        }).action,
        "HOLD",
        "生状态不应为了赌黑牌而帮助敌方",
    );
    assert.strictEqual(
        helpers.decideLiusheng({
            blood: 2,
            attitude: -5,
            targetDamaged: true,
            targetInGame: true,
        }).action,
        "USE",
        "息状态应压制敌方",
    );
    assert.strictEqual(
        helpers.decideLiusheng({
            blood: 2,
            attitude: 5,
            targetDamaged: true,
            targetInGame: true,
        }).action,
        "HOLD",
        "息状态不应为了赌黑牌而伤害友方",
    );
}

function testTargetPriorityDoesNotFlipSign() {
    const normal = helpers.scoreYinchaoTarget({
        baseEffect: 2,
        hp: 3,
        vulnerable: false,
        overKill: false,
    });
    const vulnerable = helpers.scoreYinchaoTarget({
        baseEffect: 2,
        hp: 2,
        vulnerable: true,
        overKill: false,
    });
    const finisher = helpers.scoreYinchaoTarget({
        baseEffect: 2,
        hp: 1,
        vulnerable: true,
        overKill: false,
    });
    const overKill = helpers.scoreYinchaoTarget({
        baseEffect: 2,
        hp: 3,
        vulnerable: false,
        overKill: true,
    });
    assert.ok(vulnerable > normal);
    assert.ok(finisher > vulnerable);
    assert.ok(overKill > finisher);
    assert.strictEqual(
        helpers.scoreYinchaoTarget({
            baseEffect: -2,
            hp: 1,
            vulnerable: true,
            overKill: true,
        }),
        -2,
        "脆弱和斩杀权重不能把负收益目标翻成正收益",
    );
}

function testDefensiveKeepBias() {
    const attack = 5;
    const shan = helpers.defensiveKeepScore({
        name: "shan",
        hp: 3,
        sameNameIndex: 0,
        baseUseful: 5,
    });
    const secondShan = helpers.defensiveKeepScore({
        name: "shan",
        hp: 3,
        sameNameIndex: 1,
        baseUseful: 5,
    });
    const dyingWine = helpers.defensiveKeepScore({
        name: "jiu",
        hp: 1,
        sameNameIndex: 0,
        baseUseful: 5,
    });
    const armor = helpers.defensiveKeepScore({
        name: "bagua",
        subtype: "equip2",
        hp: 3,
        sameNameIndex: 0,
        baseUseful: 4,
    });
    assert.ok(shan > attack);
    assert.ok(secondShan > attack, "重复闪仍应显著高于普通进攻牌");
    assert.ok(dyingWine > shan, "1体力时酒的自救优先级应提高");
    assert.ok(armor > attack);
    assert.strictEqual(
        helpers.defensiveKeepScore({
            name: "sha",
            hp: 3,
            sameNameIndex: 0,
            baseUseful: attack,
        }),
        null,
        "非防御牌沿用引擎原评分，不由落绯规划器全局覆盖",
    );
}

testVulnerableAndOverKill();
testYinchaoSpend();
testLiushengDecision();
testTargetPriorityDoesNotFlipSign();
testDefensiveKeepBias();
console.log("luofei AI decision tests passed");
