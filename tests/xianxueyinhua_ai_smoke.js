"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let currentPlayer = null;

class MockPlayer {
    constructor(id, options) {
        options = options || {};
        this.id = id;
        this.hp = options.hp == null ? 3 : options.hp;
        this.maxHp = options.maxHp == null ? 3 : options.maxHp;
        this.skills = new Set(options.skills || []);
        this.attitudes = options.attitudes || {};
        this.handCards = options.handCards || [];
        this.equippedCards = options.equippedCards || [];
        this.cardUsable = options.cardUsable == null ? Infinity : options.cardUsable;
        this.useTargetResult = options.useTargetResult !== false;
        this.phaseUsing = options.phaseUsing !== false;
        this.history = options.history || { useCard: [] };
        this.lastButtonTargetConfig = null;
        this.buttonTargetResult = null;
        this.recovered = 0;
        this.drawn = 0;
        this.loggedSkills = [];
    }

    isIn() {
        return true;
    }

    isPhaseUsing() {
        return this.phaseUsing;
    }

    hasSkill(name) {
        return this.skills.has(name);
    }

    addSkill(name) {
        this.skills.add(name);
    }

    removeSkill(name) {
        this.skills.delete(name);
    }

    hasSkillTag(tag) {
        return tag === "jueqing" && this.skills.has("nihil_yinshang");
    }

    getCards(zone, filter) {
        let cards = [];
        if (zone.includes("h")) cards = cards.concat(this.handCards);
        if (zone.includes("e")) cards = cards.concat(this.equippedCards);
        return typeof filter === "function" ? cards.filter(filter) : cards;
    }

    countCards(zone, filter) {
        return this.getCards(zone, filter).length;
    }

    hasCard(filter, zone) {
        return this.getCards(zone || "hs").some(filter);
    }

    hasUseTarget() {
        return this.useTargetResult;
    }

    getHandcardLimit() {
        return this.hp + (this.hasSkill("nihil_xuechan") ? 2 : 0);
    }

    getCardUsable(name) {
        return name === "sha" ? this.cardUsable : 0;
    }

    canUse(card, target) {
        return card && card.name === "sha" && target !== this && get.attitude(this, target) < 0;
    }

    getHistory(name) {
        return this.history[name] || [];
    }

    hasHistory(name, filter) {
        const events = this.getHistory(name);
        return typeof filter === "function" ? events.some(filter) : events.length > 0;
    }

    logSkill(name, target) {
        this.loggedSkills.push({ name, target });
    }

    async recover(num) {
        num = num == null ? 1 : num;
        this.recovered += num;
        this.hp = Math.min(this.maxHp, this.hp + num);
    }

    async draw(num) {
        this.drawn += num == null ? 1 : num;
    }

    chooseButtonTarget(config) {
        this.lastButtonTargetConfig = config;
        const choice = {
            set(key, value) {
                config[key] = value;
                return choice;
            },
            async forResult() {
                return this.buttonTargetResult || { bool: false };
            },
        };
        choice.forResult = choice.forResult.bind(this);
        return choice;
    }
}

const game = {
    players: [],
    semanticLogs: [],
    log(...parts) {
        this.semanticLogs.push(parts);
    },
    hasPlayer(callback) {
        return this.players.some(callback);
    },
    countPlayer(callback) {
        return this.players.filter(callback).length;
    },
    filterPlayer(callback) {
        return this.players.filter(callback);
    },
};

const get = {
    attitude(player, target) {
        if (player === target) return 5;
        return player.attitudes[target.id] == null ? 0 : player.attitudes[target.id];
    },
    player() {
        return currentPlayer;
    },
    prompt(name) {
        return name;
    },
    threaten() {
        return 1;
    },
    damageEffect() {
        return -1;
    },
    cnNumber(num) {
        return String(num);
    },
};

class MockVCard {
    constructor(data) {
        Object.assign(this, data);
    }
}

const context = {
    window: {},
    game,
    get,
    lib: {
        card: {},
        element: { VCard: MockVCard },
        filter: { cardEnabled: () => true },
    },
    ui: { selected: { buttons: [] } },
    _status: { event: null },
    console,
    Math,
    Number,
    Set,
    Map,
    Infinity,
    isNaN,
    isFinite,
};

vm.createContext(context);
const modulePath = path.join(__dirname, "..", "nihilphile武将包", "module", "xianxueyinhua.js");
vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, { filename: modulePath });

const skills = context.window.nihilModules.xianxueyinhua.skill;

async function main() {
    const yinhua = new MockPlayer("yinhua", {
        hp: 2,
        skills: ["nihil_chixian", "nihil_yinshang", "nihil_xuechan"],
    });
    const ally = new MockPlayer("ally", { hp: 2, attitudes: { yinhua: 5 } });
    const enemy = new MockPlayer("enemy", { hp: 2, attitudes: { yinhua: -5 } });
    game.players = [yinhua, ally, enemy];

    // 血缠的防伤与移除属于自定义状态变化，必须形成可供 CLI 读取的语义战报。
    let bloodBindCancelled = false;
    const bloodBindTarget = new MockPlayer("blood-bind", { skills: ["nihil_xuechan"] });
    await skills.nihil_xuechan.content({}, {
        num: 2,
        cancel() {
            bloodBindCancelled = true;
        },
    }, bloodBindTarget);
    assert.strictEqual(bloodBindCancelled, true);
    assert.strictEqual(bloodBindTarget.hasSkill("nihil_xuechan"), false);
    const bloodBindLog = game.semanticLogs
        .flat()
        .filter(part => typeof part === "string")
        .join("|");
    assert.ok(bloodBindLog.includes("点伤害并移去状态"), "血缠防伤应写入语义战报");

    // 其他角色仍会按敌我关系判断是否对殷华发动赤献。
    const chixian = skills.nihil_chixian_global.ai;
    currentPlayer = ally;
    assert.ok(chixian.order(null, ally) > 0, "友方角色仍应愿意发动赤献");
    assert.ok(chixian.result.player(ally, yinhua) > 0);
    currentPlayer = enemy;
    assert.strictEqual(chixian.order(null, enemy), 0, "敌方角色不应发动赤献");
    assert.ok(chixian.result.player(enemy, yinhua) < 0);

    // 殷华无缠且不会濒死时默认自赤献；有桃时仍保留较低的正优先级。
    currentPlayer = yinhua;
    yinhua.skills.delete("nihil_xuechan");
    yinhua.handCards = [];
    assert.strictEqual(chixian.order(null, yinhua), 8.2);
    assert.ok(chixian.result.player(yinhua, yinhua) > 0);
    assert.ok(chixian.result.target(yinhua, yinhua) > 0);
    const peach = { id: "tao", name: "tao", type: "basic" };
    yinhua.handCards = [peach];
    assert.strictEqual(chixian.order(null, yinhua), 1.5, "受伤且有桃时应先给桃让路");
    yinhua.skills.add("nihil_xuechan");
    yinhua.handCards = [];

    // 殷殇薄接线：杀的收尾路线、弃牌期留牌值和目标倍率均已注册。
    const yinshang = skills.nihil_yinshang;
    assert.strictEqual(typeof yinshang.mod.aiOrder, "function");
    assert.strictEqual(yinshang.mod.aiValue, undefined,
        "正常弃牌不读取aiValue，不得用它全局覆盖普通牌价值");
    assert.strictEqual(typeof yinshang.mod.aiUseful, "function");
    assert.strictEqual(typeof yinshang.ai.effect.player_use, "function");
    assert.strictEqual(yinshang.ai.jueqing, true, "绝情规则标签必须保留");

    const sha1 = { id: "sha-1", name: "sha", type: "basic" };
    const sha2 = { id: "sha-2", name: "sha", type: "basic" };
    const sha3 = { id: "sha-3", name: "sha", type: "basic" };
    const sha4 = { id: "sha-4", name: "sha", type: "basic" };
    const bloodEnemy = new MockPlayer("blood-enemy", {
        hp: 3,
        skills: ["nihil_xuechan"],
        handCards: [{ name: "a" }, { name: "b" }, { name: "c" }],
    });
    const plainEnemy = new MockPlayer("plain-enemy", {
        hp: 3,
        handCards: [{ name: "a" }, { name: "b" }, { name: "c" }],
    });
    yinhua.attitudes["blood-enemy"] = -5;
    yinhua.attitudes["plain-enemy"] = -5;
    yinhua.handCards = [sha1, sha2, sha3];
    yinhua.cardUsable = 3;
    yinhua.history.useCard = [];
    context._status.event = { name: "phaseUse" };
    game.players = [yinhua, ally, bloodEnemy, plainEnemy];
    const lateSlashOrder = yinshang.mod.aiOrder(yinhua, sha1, 3.2);
    assert.ok(lateSlashOrder > 0 && lateSlashOrder < 0.001,
        "三杀路线必须允许首杀，但应排在其他常规正收益操作之后");
    assert.strictEqual(yinshang.mod.aiOrder(yinhua, { name: "wuzhong" }, 7.2), undefined,
        "收尾路线不得改写非杀的原生出牌顺序");

    yinhua.handCards = [sha1];
    yinhua.cardUsable = 1;
    assert.strictEqual(yinshang.mod.aiOrder(yinhua, sha1, 3.2), 0, "非处决单杀应保留丹恩");

    yinhua.hp = 2;
    yinhua.handCards = [peach, sha1, sha2, sha3, sha4];
    yinhua.cardUsable = 4;
    yinhua.useTargetResult = false;
    context._status.event = { name: "chooseToUse", player: yinhua };
    assert.ok(yinshang.mod.aiOrder(yinhua, sha1, 3.2) > 0,
        "手里虽有桃，但桃没有合法使用目标时不得阻塞四杀路线");
    yinhua.useTargetResult = true;

    const junk = { id: "junk", name: "junk", type: "basic" };
    yinhua.handCards = [peach, junk];
    context._status.event = { name: "chooseToUse", player: yinhua };
    assert.strictEqual(yinshang.mod.aiUseful(yinhua, peach, 0), undefined,
        "出牌阶段不得用弃牌规划覆盖普通牌的原生useful");
    const phaseDiscard = { name: "phaseDiscard", player: yinhua };
    context._status.event = {
        name: "chooseToDiscard",
        player: yinhua,
        getParent() {
            return phaseDiscard;
        },
    };
    const peachValue = yinshang.mod.aiUseful(yinhua, peach, 0);
    const junkValue = yinshang.mod.aiUseful(yinhua, junk, 0);
    assert.ok(peachValue > junkValue, "Tier 1防御牌的保留值应高于普通废牌");
    assert.strictEqual(yinshang.mod.aiUseful(yinhua, { name: "foreign" }, 0), undefined,
        "不属于殷华手牌的牌不得进入整手留牌规划");
    context._status.event = {
        name: "chooseToDiscard",
        player: yinhua,
        getParent() {
            return { name: "skillCost", player: yinhua };
        },
    };
    assert.strictEqual(yinshang.mod.aiUseful(yinhua, peach, 0), undefined,
        "技能额外创建的弃牌选择不得误用正常弃牌规划");

    yinhua.handCards = [sha1, sha2];
    yinhua.cardUsable = 2;
    yinhua.history.useCard = [];
    const bloodEffect = yinshang.ai.effect.player_use(sha1, yinhua, bloodEnemy);
    const plainEffect = yinshang.ai.effect.player_use(sha1, yinhua, plainEnemy);
    assert.ok(Array.isArray(bloodEffect) && Array.isArray(plainEffect));
    assert.ok(bloodEffect[2] > plainEffect[2] && plainEffect[2] > 0,
        "有缠敌方只能获得更高的正倍率，不能翻转敌我收益符号");
    assert.strictEqual(yinshang.ai.effect.player_use(sha1, yinhua, ally), undefined);

    // 普通角色仍轻微避开血缠敌人；殷华的目标偏好由player_use接线处理。
    const bloodThreat = skills.nihil_xuechan.ai.threaten;
    const bloodTarget = new MockPlayer("blood", { skills: ["nihil_xuechan"] });
    const normal = new MockPlayer("normal", { attitudes: { blood: -5 } });
    yinhua.attitudes.blood = -5;
    assert.ok(Math.abs(Math.sqrt(bloodThreat(normal, bloodTarget)) - 0.82) < 1e-12);
    assert.strictEqual(bloodThreat(yinhua, bloodTarget), 1);

    // 丹恩在弃牌阶段开始时触发，并把纯目标计划接到ai1/ai2。
    const danen = skills.nihil_danen;
    assert.strictEqual(danen.trigger.player, "phaseDiscardBegin");
    assert.strictEqual(danen.check, undefined);

    const criticalAlly = new MockPlayer("critical-ally", { hp: 1, maxHp: 3 });
    yinhua.hp = 2;
    yinhua.maxHp = 3;
    yinhua.handCards = [];
    yinhua.history.useCard = [];
    yinhua.attitudes["critical-ally"] = 5;
    yinhua.attitudes.enemy = -5;
    enemy.skills.add("nihil_xuechan");
    currentPlayer = yinhua;
    game.players = [yinhua, criticalAlly, enemy];
    await danen.content({}, {}, yinhua);
    const danenConfig = yinhua.lastButtonTargetConfig;
    assert.ok(danenConfig && typeof danenConfig.ai1 === "function" && typeof danenConfig.ai2 === "function");
    assert.deepStrictEqual(Array.from(danenConfig.recover), [yinhua, enemy],
        "丹恩回复分支应列出可被移去血缠的角色");
    assert.ok(danenConfig.ai1({ link: "gain" }) > danenConfig.ai1({ link: "recover" }));
    assert.ok(danenConfig.ai2(criticalAlly) > danenConfig.ai2(yinhua));

    yinhua.buttonTargetResult = { bool: true, targets: [enemy], links: ["recover"] };
    await danen.content({}, {}, yinhua);
    assert.strictEqual(enemy.hasSkill("nihil_xuechan"), false, "丹恩自疗前应移去所选角色的血缠");
    assert.strictEqual(yinhua.hp, 3, "丹恩第二项应只回复鲜血殷华");
    assert.strictEqual(yinhua.recovered, 1);
    assert.strictEqual(yinhua.drawn, 1, "摸牌数应按移去血缠后的场上数量计算");
    yinhua.buttonTargetResult = null;

    // 两个记录子技能必须挂入殷殇，并能把首杀路线及实际体力流失写回useCard事件。
    assert.ok(yinshang.group.includes("nihil_yinshang_ai_use"));
    assert.ok(yinshang.group.includes("nihil_yinshang_ai_hp_loss"));
    const useRecorder = skills.nihil_yinshang_ai_use;
    const hpLossRecorder = skills.nihil_yinshang_ai_hp_loss;
    assert.strictEqual(typeof yinshang.onChooseToUse, "function");
    assert.strictEqual(useRecorder.trigger.player, "useCard");
    assert.strictEqual(hpLossRecorder.trigger.global, "changeHpAfter");

    yinhua.hp = 3;
    yinhua.handCards = [sha1, sha2, sha3, sha4];
    yinhua.cardUsable = 4;
    yinhua.attitudes["blood-enemy"] = -5;
    bloodEnemy.hp = 5;
    bloodEnemy.maxHp = 5;
    game.players = [yinhua, bloodEnemy];
    const phaseUse = { name: "phaseUse" };
    const chooseToUse = {
        name: "chooseToUse",
        player: yinhua,
        getParent(name) {
            return name === "phaseUse" ? phaseUse : null;
        },
    };
    context._status.event = chooseToUse;
    yinshang.onChooseToUse(chooseToUse);
    assert.strictEqual(chooseToUse._nihilYinhuaAttackDecision.reason, "FOUR_SLASH_BURST");

    // useCard发生时第一张杀已经离开手牌；此时若重算只剩三杀，原因会变成THREE_SLASH_BURST。
    yinhua.handCards = [sha2, sha3, sha4];
    yinhua.cardUsable = 3;
    const useEvent = {
        card: sha1,
        targets: [bloodEnemy],
        isPhaseUsing() {
            return true;
        },
        getParent(name) {
            if (name === "phaseUse") return phaseUse;
            if (name === "chooseToUse") return chooseToUse;
            return null;
        },
        set(key, value) {
            this[key] = value;
        },
    };
    yinhua.history.useCard = [useEvent];
    context._status.event = phaseUse;
    assert.strictEqual(useRecorder.filter(useEvent, yinhua), true);
    assert.strictEqual(useRecorder.filter({ card: { name: "tao" } }, yinhua), false);
    await useRecorder.content({}, useEvent, yinhua);
    assert.strictEqual(useEvent._nihilYinhuaPhaseUse, phaseUse);
    assert.strictEqual(useEvent._nihilYinhuaLockedTargetId, "blood-enemy");
    assert.strictEqual(useEvent._nihilYinhuaResult, "pending");
    assert.strictEqual(useEvent._nihilYinhuaAttackReason, "FOUR_SLASH_BURST",
        "useCard记录必须消费选牌前缓存，不得按已消耗一杀后的状态重算");

    const loseHpEvent = {
        _nihilYinhuaSourceId: "yinhua",
        _nihilYinhuaUseEvent: useEvent,
        _nihilYinhuaTargetId: "blood-enemy",
    };
    const changeHpEvent = {
        num: -1,
        getParent(name) {
            return name === "loseHp" ? loseHpEvent : null;
        },
    };
    assert.strictEqual(hpLossRecorder.filter(changeHpEvent, yinhua), true);
    await hpLossRecorder.content({}, changeHpEvent, yinhua);
    assert.strictEqual(useEvent._nihilYinhuaResult, "hpLoss");

    const multiTargetUse = {
        _nihilYinhuaLockedTargetId: "first-target",
        _nihilYinhuaResult: "pending",
    };
    const otherTargetLoseHp = {
        _nihilYinhuaSourceId: "yinhua",
        _nihilYinhuaUseEvent: multiTargetUse,
        _nihilYinhuaTargetId: "second-target",
    };
    await hpLossRecorder.content({}, {
        num: -1,
        getParent(name) {
            return name === "loseHp" ? otherTargetLoseHp : null;
        },
    }, yinhua);
    assert.strictEqual(multiTargetUse._nihilYinhuaResult, "pending",
        "多目标杀中非锁定目标掉血，不得误报锁定目标命中");
    assert.strictEqual(multiTargetUse._nihilYinhuaHitTargetIds["second-target"], true);

    const vulnerableRecorder = skills.nihil_yinshang_ai_vulnerable;
    const vulnerableClear = skills.nihil_yinshang_ai_vulnerable_clear;
    game.players = [yinhua, plainEnemy];
    plainEnemy.handCards = [{ id: "old-1" }, { id: "old-2" }];
    const shaHitEvent = { target: plainEnemy, directHit: false, directHit2: false };
    assert.strictEqual(vulnerableRecorder.filter(shaHitEvent, yinhua), true);
    await vulnerableRecorder.content({}, shaHitEvent, yinhua);
    assert.strictEqual(plainEnemy._nihilYinhuaNoShanVulnerable, true);
    assert.strictEqual(vulnerableRecorder.filter(Object.assign({}, shaHitEvent, { directHit: true }), yinhua), false,
        "直击不得被误记为有机会出闪却未出");
    const gainedCard = { id: "new-card" };
    plainEnemy.handCards.push(gainedCard);
    const gainEvent = {
        getg(target) {
            return target === plainEnemy ? [gainedCard] : [];
        },
    };
    assert.strictEqual(vulnerableClear.filter(gainEvent, yinhua), true);
    await vulnerableClear.content({}, gainEvent, yinhua);
    assert.strictEqual(plainEnemy._nihilYinhuaNoShanVulnerable, undefined,
        "目标获得新手牌后必须清除未出闪脆弱标记");

    // 用真正的ai1/ai2选项接线验证保缠规则，再执行被AI选中的丹恩分支。
    for (const scenario of [
        { name: "无外部来源保留自身血缠", hp: 2, expected: null },
        { name: "残血向健康队友借缠", hp: 1, allyHp: 3, expected: "donor-ally" },
        { name: "敌方来源优先于健康队友", hp: 1, allyHp: 3, enemyBlood: true, expected: "donor-enemy" },
        { name: "两血不拆健康队友的缠", hp: 2, allyHp: 3, expected: null },
        { name: "残血也不拆低血量队友的缠", hp: 1, allyHp: 2, expected: null },
    ]) {
        const chooser = new MockPlayer("donor-self", {
            hp: scenario.hp,
            skills: ["nihil_chixian", "nihil_yinshang", "nihil_xuechan"],
            attitudes: { "donor-enemy": -5, "donor-ally": 5 },
        });
        const opponent = new MockPlayer("donor-enemy", {
            skills: scenario.enemyBlood ? ["nihil_xuechan"] : [],
        });
        const friend = new MockPlayer("donor-ally", {
            hp: scenario.allyHp,
            skills: ["nihil_xuechan"],
        });
        game.players = [chooser, opponent];
        if (scenario.allyHp != null) game.players.push(friend);
        currentPlayer = chooser;
        context._status.event = { name: "phaseDiscard", player: chooser };
        await danen.content({}, {}, chooser);
        const config = chooser.lastButtonTargetConfig;
        assert.strictEqual(config.ai1({ link: "gain" }), 0);
        if (scenario.expected) {
            assert.ok(config.ai1({ link: "recover" }) > 0, scenario.name);
            const donor = config.recover.find(target => config.ai2(target) > 0);
            assert.strictEqual(donor.id, scenario.expected, scenario.name);
            chooser.buttonTargetResult = { bool: true, targets: [donor], links: ["recover"] };
            await danen.content({}, {}, chooser);
            assert.strictEqual(donor.hasSkill("nihil_xuechan"), false);
            assert.strictEqual(chooser.hp, scenario.hp + 1);
            assert.strictEqual(chooser.drawn, game.countPlayer(target => target.hasSkill("nihil_xuechan")));
        } else {
            assert.strictEqual(config.ai1({ link: "recover" }), 0, scenario.name);
            assert.strictEqual(chooser.hp, scenario.hp);
            assert.strictEqual(chooser.drawn, 0);
        }
        assert.strictEqual(chooser.hasSkill("nihil_xuechan"), true, scenario.name);
        assert.strictEqual(chixian.order(null, chooser), 0, "保留自身血缠后不再进入赤献拆补循环");
    }

    // 路线缓存必须消费当前丹恩实际计划，不能凭低血量虚构回血收益。
    for (const hp of [1, 2]) {
        const chooser = new MockPlayer("route-self", {
            hp, skills: ["nihil_yinshang", "nihil_xuechan"],
            handCards: [sha1, sha2, sha3], cardUsable: 3,
            attitudes: { "route-enemy": -5 },
        });
        const opponent = new MockPlayer("route-enemy", {
            hp: 4, maxHp: 4, handCards: [{ name: "a" }, { name: "b" }, { name: "c" }],
        });
        game.players = [chooser, opponent];
        context._status.event = { name: "chooseToUse", player: chooser };
        yinshang.onChooseToUse(context._status.event);
        assert.strictEqual(context._status.event._nihilYinhuaAttackDecision.action, "ATTACK");
        assert.ok(yinshang.mod.aiOrder(chooser, sha1, 3.2) > 0);
    }

    console.log("xianxueyinhua AI smoke: all assertions passed");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
