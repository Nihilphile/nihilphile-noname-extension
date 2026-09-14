"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = {
    window: {}, game: {}, get: {}, lib: {}, ui: {}, ai: {}, _status: {},
    console, Math, Number, Object, Array, isFinite,
};

vm.createContext(context);
const modulePath = path.join(
    __dirname,
    "..",
    "nihilphile武将包",
    "module",
    "huojing_rewrite.js",
);
vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, { filename: modulePath });
const helpers = context.window.nihilModules.huojing_rewrite.aiHelpers;

function close(actual, expected, message) {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
}

function testScoreFormula() {
    const baseline = helpers.slashMetrics({ rounds: 5, uses: 4, hits: 4, damage: 4 });
    close(baseline.averageUses, 0.8, "基准每轮出杀数");
    close(baseline.relativeUses, 1, "基准相对出杀数");
    close(baseline.damagePerHit, 1, "基准单次命中伤害");
    close(baseline.score, 5, "基准总分");

    const frequent = helpers.slashMetrics({ rounds: 5, uses: 8, hits: 4, damage: 4 });
    close(frequent.score, 7, "出杀翻倍时总分");

    const heavy = helpers.slashMetrics({ rounds: 5, uses: 4, hits: 4, damage: 8 });
    close(heavy.score, 8, "单次伤害翻倍时总分");

    assert.ok(
        helpers.slashMetrics({ rounds: 5, uses: 40, hits: 5, damage: 15 }).score > 20,
        "分数不得用 min 或上限截断高出杀/高伤角色",
    );
}

function testHitRateDoesNotEnterScore() {
    const lowRate = helpers.slashMetrics({ rounds: 5, uses: 10, hits: 2, damage: 4 });
    const highRate = helpers.slashMetrics({ rounds: 5, uses: 10, hits: 8, damage: 16 });
    close(lowRate.damagePerHit, 2, "低命中率样本的D/H");
    close(highRate.damagePerHit, 2, "高命中率样本的D/H");
    close(lowRate.score, highRate.score, "命中率本身不参与评分");

    close(
        helpers.slashMetrics({ rounds: 2, uses: 1, hits: 0, damage: 0 }).damagePerHit,
        1,
        "有出杀但尚无命中样本时采用普通杀1伤基准",
    );
    assert.strictEqual(
        helpers.slashMetrics({ rounds: 2, uses: 0, hits: 0, damage: 0 }).score,
        0,
        "完全没有出杀证据时不得成为候选",
    );
}

function state(target, overrides) {
    return Object.assign({
        target,
        inGame: true,
        isOwner: false,
        identity: "zhong",
        attitude: 5,
        stats: { rounds: 2, uses: 2, hits: 2, damage: 2 },
    }, overrides || {});
}

function testCandidateBoundaryAndTie() {
    const huojing = { id: "huojing" };
    const commander = { id: "commander" };
    const equal = { id: "equal" };
    const stronger = { id: "stronger" };
    const traitor = { id: "traitor" };

    assert.strictEqual(helpers.qualifiesCommander(state(huojing, { isOwner: true })), false);
    assert.strictEqual(helpers.qualifiesCommander(state(traitor, { identity: "nei" })), false);
    assert.strictEqual(helpers.qualifiesCommander(state(equal, { attitude: 0 })), false);
    assert.strictEqual(
        helpers.chooseCommanderCandidate([state(equal), state(commander)], commander),
        commander,
        "同分时必须保留现任帅",
    );
    assert.strictEqual(
        helpers.chooseCommanderCandidate(
            [
                state(commander),
                state(stronger, { stats: { rounds: 2, uses: 2, hits: 2, damage: 4 } }),
                state(traitor, { identity: "nei", stats: { rounds: 1, uses: 8, hits: 8, damage: 40 } }),
            ],
            commander,
        ),
        stronger,
        "只有严格更高分的合法友方才能替换现任帅",
    );
}

testScoreFormula();
testHitRateDoesNotEnterScore();
testCandidateBoundaryAndTie();
console.log("huojing AI decision tests passed");
