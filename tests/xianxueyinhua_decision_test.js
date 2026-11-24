"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadAiHelpers() {
    const context = {
        window: {},
        game: {},
        get: {},
        lib: {},
        ui: {},
        _status: {},
        console,
        Math,
        Number,
        Set,
        Map,
        Infinity,
        isNaN,
    };
    vm.createContext(context);
    const modulePath = path.join(__dirname, "..", "nihilphile武将包", "module", "xianxueyinhua.js");
    vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, { filename: modulePath });

    const module = context.window.nihilModules && context.window.nihilModules.xianxueyinhua;
    assert.ok(module, "鲜血仪葬·殷华模块必须成功加载");
    assert.ok(module.aiHelpers, "模块必须额外导出 aiHelpers 供纯函数测试使用");
    [
        "decideInitialRoute",
        "chooseSlashTarget",
        "chooseDanenAction",
        "shouldContinueLockedTarget",
        "decideRetarget",
    ].forEach(name => assert.strictEqual(typeof module.aiHelpers[name], "function", "缺少 aiHelpers." + name));
    return module.aiHelpers;
}

function actionOf(result) {
    return typeof result === "string" ? result : result && result.action;
}

function targetOf(result) {
    if (!result) return null;
    return result.target || result;
}

function choiceOf(result) {
    return result && result.choice;
}

function shouldContinue(result) {
    if (typeof result === "boolean") return result;
    if (result && typeof result.continue === "boolean") return result.continue;
    return actionOf(result) === "ATTACK";
}

function routeState(overrides) {
    return Object.assign({
        hasLegalEnemy: true,
        effectiveSlash: 0,
        hp: 3,
        hasBlood: true,
        hasOverKillTarget: false,
        hasBloodEnemy: false,
        hasVulnerableEnemy: false,
        teamHealthy: false,
        naturalOverflow: 0,
        danenBasePositive: true,
        canKeepAllRemainingSlash: true,
    }, overrides || {});
}

function target(id, options) {
    return Object.assign({
        id,
        overKill: false,
        hasBlood: false,
        vulnerable: false,
        baseEffect: 0,
        hp: 3,
        threat: 0,
        seat: 0,
    }, options || {});
}

function player(id, options) {
    return Object.assign({
        id,
        hp: 3,
        maxHp: 3,
        hasBlood: false,
        isFriend: true,
        isSelf: false,
        seat: 0,
    }, options || {});
}

function assertRoute(helper, state, expectedAction, expectedReason) {
    const result = helper(state);
    assert.strictEqual(actionOf(result), expectedAction);
    if (expectedReason) {
        assert.strictEqual(result && result.reason, expectedReason);
    }
}

function main() {
    const helpers = loadAiHelpers();

    // 第一张杀之前：离散路线树。
    {
        const cases = [
            {
                name: "无合法敌方时四杀也不进入杀路线，有正收益丹恩则丹恩",
                state: routeState({ hasLegalEnemy: false, effectiveSlash: 4, danenBasePositive: true }),
                action: "DANEN",
            },
            {
                name: "无合法敌方且丹恩无正收益则留手",
                state: routeState({ hasLegalEnemy: false, effectiveSlash: 4, danenBasePositive: false }),
                action: "HOLD",
            },
            {
                name: "自己无缠三杀无处决时保丹恩",
                state: routeState({ hasBlood: false, effectiveSlash: 3 }),
                action: "DANEN",
            },
            {
                name: "自己无缠四杀进入强制爆发",
                state: routeState({ hasBlood: false, effectiveSlash: 4 }),
                action: "ATTACK",
                reason: "FOUR_SLASH_BURST",
            },
            {
                name: "1血有缠三杀无处决时自疗",
                state: routeState({ hp: 1, hasBlood: true, effectiveSlash: 3 }),
                action: "DANEN",
            },
            {
                name: "可靠处决覆盖丹恩",
                state: routeState({ hp: 1, effectiveSlash: 2, hasOverKillTarget: true }),
                action: "ATTACK",
                reason: "OVERKILL",
            },
            {
                name: "2血有缠三杀且有缠敌方时攻击",
                state: routeState({ hp: 2, effectiveSlash: 3, hasBloodEnemy: true }),
                action: "ATTACK",
            },
            {
                name: "2血有缠三杀且只有脆弱敌方时攻击",
                state: routeState({ hp: 2, effectiveSlash: 3, hasVulnerableEnemy: true }),
                action: "ATTACK",
            },
            {
                name: "2血有缠三杀但只有普通无缠敌方时自疗",
                state: routeState({ hp: 2, effectiveSlash: 3 }),
                action: "DANEN",
            },
            {
                name: "3血有缠二杀健康溢出且有缠目标时攻击",
                state: routeState({
                    hp: 3,
                    effectiveSlash: 2,
                    hasBloodEnemy: true,
                    teamHealthy: true,
                    naturalOverflow: 1,
                }),
                action: "ATTACK",
            },
            {
                name: "上述二杀场景没有自然溢出时保丹恩",
                state: routeState({
                    hp: 3,
                    effectiveSlash: 2,
                    hasBloodEnemy: true,
                    teamHealthy: true,
                    naturalOverflow: 0,
                }),
                action: "DANEN",
            },
            {
                name: "3血有缠三杀直接进入爆发",
                state: routeState({ hp: 3, effectiveSlash: 3 }),
                action: "ATTACK",
            },
            {
                name: "1血无可获益丹恩时不得为虚构自疗压住三杀",
                state: routeState({ hp: 1, effectiveSlash: 3, danenBasePositive: false }),
                action: "ATTACK",
            },
            {
                name: "2血无可获益丹恩时不得为虚构自疗压住三杀",
                state: routeState({ hp: 2, effectiveSlash: 3, danenBasePositive: false }),
                action: "ATTACK",
            },
            {
                name: "残血无可获益丹恩且无进攻窗口时保留资源",
                state: routeState({ hp: 1, effectiveSlash: 1, danenBasePositive: false }),
                action: "HOLD",
            },
            {
                name: "丹恩无正收益且唯一杀留不住时可攻击有缠目标",
                state: routeState({
                    hp: 3,
                    effectiveSlash: 1,
                    hasBloodEnemy: true,
                    danenBasePositive: false,
                    canKeepAllRemainingSlash: false,
                }),
                action: "ATTACK",
            },
            {
                name: "唯一杀留不住但只有无缠目标时仍不主动送缠",
                state: routeState({
                    hp: 3,
                    effectiveSlash: 1,
                    hasBloodEnemy: false,
                    danenBasePositive: false,
                    canKeepAllRemainingSlash: false,
                }),
                action: "HOLD",
            },
        ];
        cases.forEach(testCase => {
            try {
                assertRoute(helpers.decideInitialRoute, testCase.state, testCase.action, testCase.reason);
            } catch (error) {
                error.message = testCase.name + ": " + error.message;
                throw error;
            }
        });
    }

    // 第一刀目标：处决 > 有缠脆弱 > 有缠 > 脆弱 > 普通。
    {
        const ordinary = target("ordinary", { baseEffect: 100 });
        const vulnerable = target("vulnerable", { vulnerable: true });
        const blood = target("blood", { hasBlood: true });
        const bloodVulnerable = target("blood-vulnerable", { hasBlood: true, vulnerable: true });
        const execute = target("execute", { overKill: true });

        assert.strictEqual(targetOf(helpers.chooseSlashTarget([
            ordinary,
            vulnerable,
            blood,
            bloodVulnerable,
            execute,
        ])).id, "execute");
        assert.strictEqual(targetOf(helpers.chooseSlashTarget([
            ordinary,
            vulnerable,
            blood,
            bloodVulnerable,
        ])).id, "blood-vulnerable");
        assert.strictEqual(targetOf(helpers.chooseSlashTarget([ordinary, vulnerable, blood])).id, "blood");
        assert.strictEqual(targetOf(helpers.chooseSlashTarget([ordinary, vulnerable])).id, "vulnerable");
        assert.strictEqual(targetOf(helpers.chooseSlashTarget([ordinary])).id, "ordinary");
    }

    // 同档依次按基础收益、低体力、高威胁、稳定座次决胜。
    {
        assert.strictEqual(targetOf(helpers.chooseSlashTarget([
            target("effect-low", { hasBlood: true, baseEffect: 3, hp: 1 }),
            target("effect-high", { hasBlood: true, baseEffect: 4, hp: 3 }),
        ])).id, "effect-high");
        assert.strictEqual(targetOf(helpers.chooseSlashTarget([
            target("hp-high", { hasBlood: true, baseEffect: 4, hp: 3 }),
            target("hp-low", { hasBlood: true, baseEffect: 4, hp: 2 }),
        ])).id, "hp-low");
        assert.strictEqual(targetOf(helpers.chooseSlashTarget([
            target("threat-low", { hasBlood: true, baseEffect: 4, hp: 2, threat: 2 }),
            target("threat-high", { hasBlood: true, baseEffect: 4, hp: 2, threat: 5 }),
        ])).id, "threat-high");
        assert.strictEqual(targetOf(helpers.chooseSlashTarget([
            target("seat-late", { hasBlood: true, baseEffect: 4, hp: 2, threat: 5, seat: 4 }),
            target("seat-early", { hasBlood: true, baseEffect: 4, hp: 2, threat: 5, seat: 1 }),
        ])).id, "seat-early");
    }

    // 丹恩目标选择。
    {
        const selfNoBlood = player("self", { hp: 1, hasBlood: false, isSelf: true });
        let result = helpers.chooseDanenAction({ self: selfNoBlood, candidates: [] });
        assert.strictEqual(actionOf(result), "DANEN");
        assert.strictEqual(choiceOf(result), "gain");
        assert.strictEqual(targetOf(result).id, "self");

        const selfOneBlood = player("self", { hp: 1, hasBlood: true, isSelf: true });
        result = helpers.chooseDanenAction({ self: selfOneBlood, candidates: [] });
        assert.strictEqual(actionOf(result), "HOLD", "即使1血也不能拆自己的血缠回血");

        const selfTwoBlood = player("self", { hp: 2, hasBlood: true, isSelf: true });
        const criticalAlly = player("critical-ally", { hp: 1, hasBlood: false });
        result = helpers.chooseDanenAction({ self: selfTwoBlood, candidates: [criticalAlly] });
        assert.strictEqual(choiceOf(result), "gain");
        assert.strictEqual(targetOf(result).id, "critical-ally");

        const lowHpUnprotectedAlly = player("low-hp-unprotected", { hp: 2, hasBlood: false });
        const oneHpProtectedAlly = player("one-hp-protected", { hp: 1, hasBlood: true });
        result = helpers.chooseDanenAction({
            self: selfTwoBlood,
            candidates: [oneHpProtectedAlly, lowHpUnprotectedAlly],
        });
        assert.strictEqual(choiceOf(result), "gain",
            "2血无缠友方应比1血有缠友方更需要保护，且上缠收益高于回血");
        assert.strictEqual(targetOf(result).id, "low-hp-unprotected");

        result = helpers.chooseDanenAction({ self: selfTwoBlood, candidates: [oneHpProtectedAlly] });
        assert.strictEqual(actionOf(result), "HOLD", "保留自己和残血队友的血缠");

        const bloodEnemy = player("blood-enemy", { hp: 2, hasBlood: true, isFriend: false });
        result = helpers.chooseDanenAction({ self: selfTwoBlood, candidates: [oneHpProtectedAlly, bloodEnemy] });
        assert.strictEqual(choiceOf(result), "recover");
        assert.strictEqual(targetOf(result).id, "blood-enemy", "自疗时应优先移去敌方的血缠");

        const healthyAlly = player("healthy-ally", { hp: 3, hasBlood: false });
        result = helpers.chooseDanenAction({ self: selfTwoBlood, candidates: [healthyAlly] });
        assert.strictEqual(choiceOf(result), "gain");
        assert.strictEqual(targetOf(result).id, "healthy-ally");

        const healthyBloodAlly = player("healthy-blood-ally", { hp: 3, hasBlood: true });
        result = helpers.chooseDanenAction({ self: selfOneBlood, candidates: [healthyBloodAlly] });
        assert.strictEqual(choiceOf(result), "recover");
        assert.strictEqual(targetOf(result).id, "healthy-blood-ally", "自己残血时可借健康队友的缠回血");
        result = helpers.chooseDanenAction({ self: selfOneBlood, candidates: [healthyBloodAlly, bloodEnemy] });
        assert.strictEqual(targetOf(result).id, "blood-enemy", "敌方来源始终优先于健康队友");
        result = helpers.chooseDanenAction({ self: selfTwoBlood, candidates: [healthyBloodAlly] });
        assert.strictEqual(actionOf(result), "HOLD", "自己2血时不牺牲健康队友的血缠");
        for (const allyHp of [1, 2]) {
            result = helpers.chooseDanenAction({ self: selfOneBlood, candidates: [
                player("protected-ally", { hp: allyHp, hasBlood: true }),
            ] });
            assert.strictEqual(actionOf(result), "HOLD", "不得向低血量队友借缠");
        }
        result = helpers.chooseDanenAction({ self: selfNoBlood, candidates: [bloodEnemy] });
        assert.strictEqual(choiceOf(result), "gain", "自己无缠时优先补缠，而非拆敌方缠回血");
        assert.strictEqual(targetOf(result).id, "self");

        const selfFull = player("self", { hp: 3, hasBlood: true, isSelf: true });
        const oneBloodWounded = player("one-blood-wounded", { hp: 1, hasBlood: true });
        result = helpers.chooseDanenAction({
            self: selfFull,
            candidates: [oneBloodWounded, criticalAlly],
        });
        assert.strictEqual(choiceOf(result), "gain");
        assert.strictEqual(targetOf(result).id, "critical-ally");

        result = helpers.chooseDanenAction({ self: selfFull, candidates: [oneBloodWounded] });
        assert.strictEqual(actionOf(result), "HOLD", "殷华满体力时不得用丹恩回复队友");
        assert.strictEqual(result.target, undefined);

        const otherNoBlood = player("other-no-blood", { hp: 2, hasBlood: false });
        const otherWoundedBlood = player("other-wounded-blood", { hp: 2, hasBlood: true });
        result = helpers.chooseDanenAction({
            self: selfFull,
            candidates: [otherWoundedBlood, otherNoBlood],
        });
        assert.strictEqual(choiceOf(result), "gain");
        assert.strictEqual(targetOf(result).id, "other-no-blood");

        result = helpers.chooseDanenAction({ self: selfFull, candidates: [otherWoundedBlood] });
        assert.strictEqual(actionOf(result), "HOLD", "AI不得把受伤的血缠队友作为回复目标");
        assert.strictEqual(result.target, undefined);

        const enemy = player("enemy", { hp: 1, hasBlood: false, isFriend: false });
        result = helpers.chooseDanenAction({ self: selfFull, candidates: [enemy] });
        assert.strictEqual(actionOf(result), "HOLD");
        assert.strictEqual(targetOf(result), result);
        assert.strictEqual(result.target, undefined);
    }

    // 锁定目标的连续攻击：普通路线命中才续；处决/四杀可穿过一次闪。
    {
        const base = {
            attackReason: "NORMAL",
            lastSlashLostHp: true,
            lockedTargetLegal: true,
            hasUsableSlash: true,
            hasRemainingSlashUse: true,
        };
        assert.strictEqual(shouldContinue(helpers.shouldContinueLockedTarget(base)), true);
        assert.strictEqual(shouldContinue(helpers.shouldContinueLockedTarget(Object.assign({}, base, {
            lastSlashLostHp: false,
        }))), false);
        assert.strictEqual(shouldContinue(helpers.shouldContinueLockedTarget(Object.assign({}, base, {
            attackReason: "OVERKILL",
            lastSlashLostHp: false,
        }))), true);
        assert.strictEqual(shouldContinue(helpers.shouldContinueLockedTarget(Object.assign({}, base, {
            attackReason: "FOUR_SLASH_BURST",
            lastSlashLostHp: false,
        }))), true);
        assert.strictEqual(shouldContinue(helpers.shouldContinueLockedTarget(Object.assign({}, base, {
            attackReason: "RETARGET_OVERKILL",
            lastSlashLostHp: false,
        }))), true);
        assert.strictEqual(shouldContinue(helpers.shouldContinueLockedTarget(Object.assign({}, base, {
            attackReason: "RETARGET_BURST",
            lastSlashLostHp: false,
        }))), true);
        assert.strictEqual(shouldContinue(helpers.shouldContinueLockedTarget(Object.assign({}, base, {
            lockedTargetLegal: false,
        }))), false);
        assert.strictEqual(shouldContinue(helpers.shouldContinueLockedTarget(Object.assign({}, base, {
            hasUsableSlash: false,
        }))), false);
        assert.strictEqual(shouldContinue(helpers.shouldContinueLockedTarget(Object.assign({}, base, {
            hasRemainingSlashUse: false,
        }))), false);
    }

    // 原目标失效后的3/2/1杀换人规则。
    {
        const best = target("best");
        const overKill = target("overkill", { overKill: true });
        const blood = target("blood", { hasBlood: true });
        const base = {
            hasLegalEnemy: true,
            remainingEffectiveSlash: 0,
            hasOverKillTarget: false,
            hasBloodEnemy: false,
            canKeepAllRemainingSlash: true,
            bestTarget: best,
            bestOverKillTarget: overKill,
            bestBloodTarget: blood,
        };

        let result = helpers.decideRetarget(Object.assign({}, base, { remainingEffectiveSlash: 3 }));
        assert.strictEqual(actionOf(result), "ATTACK");
        assert.strictEqual(targetOf(result).id, "best");

        result = helpers.decideRetarget(Object.assign({}, base, {
            remainingEffectiveSlash: 2,
            hasOverKillTarget: true,
        }));
        assert.strictEqual(actionOf(result), "ATTACK");
        assert.strictEqual(targetOf(result).id, "overkill");

        result = helpers.decideRetarget(Object.assign({}, base, {
            remainingEffectiveSlash: 2,
            hasBloodEnemy: true,
        }));
        assert.strictEqual(actionOf(result), "ATTACK");
        assert.strictEqual(targetOf(result).id, "blood");

        result = helpers.decideRetarget(Object.assign({}, base, {
            remainingEffectiveSlash: 2,
            canKeepAllRemainingSlash: false,
        }));
        assert.strictEqual(actionOf(result), "ATTACK");
        assert.strictEqual(targetOf(result).id, "best");

        result = helpers.decideRetarget(Object.assign({}, base, { remainingEffectiveSlash: 2 }));
        assert.strictEqual(actionOf(result), "HOLD");

        result = helpers.decideRetarget(Object.assign({}, base, {
            remainingEffectiveSlash: 1,
            hasOverKillTarget: true,
        }));
        assert.strictEqual(actionOf(result), "ATTACK");
        assert.strictEqual(targetOf(result).id, "overkill");

        result = helpers.decideRetarget(Object.assign({}, base, {
            remainingEffectiveSlash: 1,
            hasBloodEnemy: true,
            canKeepAllRemainingSlash: true,
        }));
        assert.strictEqual(actionOf(result), "HOLD");

        result = helpers.decideRetarget(Object.assign({}, base, {
            remainingEffectiveSlash: 1,
            hasBloodEnemy: true,
            canKeepAllRemainingSlash: false,
        }));
        assert.strictEqual(actionOf(result), "ATTACK");
        assert.strictEqual(targetOf(result).id, "blood");

        result = helpers.decideRetarget(Object.assign({}, base, {
            remainingEffectiveSlash: 1,
            canKeepAllRemainingSlash: false,
        }));
        assert.strictEqual(actionOf(result), "HOLD");

        result = helpers.decideRetarget(Object.assign({}, base, {
            hasLegalEnemy: false,
            remainingEffectiveSlash: 3,
        }));
        assert.strictEqual(actionOf(result), "HOLD");
    }

    console.log("xianxueyinhua decision tests passed");
}

main();
