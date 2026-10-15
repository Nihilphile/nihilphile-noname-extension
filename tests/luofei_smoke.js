"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function immediateResult(value, config) {
    const choice = {
        set(key, data) {
            config[key] = data;
            return choice;
        },
        async forResult() {
            return typeof value === "function" ? value(config) : value;
        },
    };
    return choice;
}

function makePlayer(id, marks) {
    return {
        id,
        hp: 3,
        maxHp: 3,
        marks: Object.assign({}, marks),
        inGame: true,
        damaged: true,
        handCards: [],
        gained: [],
        discarded: [],
        recovered: 0,
        lostHp: 0,
        usedCards: [],
        loggedSkills: [],
        shownSkillMarks: new Set(),
        countMark(name) {
            return this.marks[name] || 0;
        },
        countCards(position) {
            return position && position.includes("h") ? this.handCards.length : 0;
        },
        getCards(position) {
            return position && position.includes("h") ? this.handCards.slice() : [];
        },
        addMark(name, num) {
            this.marks[name] = this.countMark(name) + num;
        },
        removeMark(name, num) {
            this.marks[name] = Math.max(0, this.countMark(name) - num);
        },
        isIn() {
            return this.inGame;
        },
        isDamaged() {
            return this.damaged;
        },
        logSkill(name) {
            this.loggedSkills.push(name);
        },
        markSkill(name) {
            this.shownSkillMarks.add(name);
        },
        unmarkSkill(name) {
            this.shownSkillMarks.delete(name);
        },
        async gain(cards) {
            const list = Array.isArray(cards) ? cards : [cards];
            this.gained.push(...list);
            list.forEach(card => {
                card.position = "h";
            });
        },
        async recover() {
            this.recovered++;
        },
        async loseHp(num) {
            this.lostHp += num == null ? 1 : num;
        },
    };
}

const game = {
    phaseNumber: 0,
    players: [],
    topCards: [],
    discarded: [],
    semanticLogs: [],
    log(...parts) {
        this.semanticLogs.push(parts);
    },
    async cardsGotoOrdering(cards) {
        cards.forEach(card => {
            card.position = "o";
        });
        return { cards };
    },
    async cardsDiscard(cards) {
        const list = Array.isArray(cards) ? cards : [cards];
        this.discarded.push(...list);
        list.forEach(card => {
            card.position = "d";
        });
    },
    filterPlayer(filter) {
        return this.players.filter(filter);
    },
};

const get = {
    cnNumber(num) {
        return String(num);
    },
    translation(value) {
        return value && value.id ? value.id : String(value && value.name || value);
    },
    color(card) {
        return card.color;
    },
    position(card) {
        return card.position;
    },
    cards(num) {
        return game.topCards.splice(0, num);
    },
    autoViewAs(card, cards) {
        return { name: card.name, cards };
    },
    player() {
        return context._status.eventPlayer;
    },
    attitude(player, target) {
        return player.attitudes && player.attitudes[target.id] || 0;
    },
    name(card) {
        return card && card.name;
    },
    subtype(card) {
        return card && card.subtype || "";
    },
    effect_use(target, card, player) {
        return this.attitude(player, target) < 0 ? 2 : -2;
    },
    damageEffect() {
        return -1;
    },
};

const context = {
    window: {},
    game,
    get,
    lib: {
        filter: {
            cardEnabled() {
                return true;
            },
        },
        element: {
            VCard: function VCard(data) {
                Object.assign(this, data);
            },
        },
    },
    ui: {},
    ai: {},
    _status: {},
    console,
    Math,
    Number,
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

const moduleDef = context.window.nihilModules.luofei;
const skills = moduleDef.skill;
const BLOOD = "nihil_lianxi";
const STATE_SHENG = "nihil_liusheng_state_sheng";
const STATE_XI = "nihil_liusheng_state_xi";

async function testMetadata() {
    const luofei = moduleDef.character.nihil_luofei;
    assert.strictEqual(luofei.sex, "female");
    assert.strictEqual(luofei.group, "fu");
    assert.strictEqual(luofei.hp, 3);
    assert.deepStrictEqual(
        Array.from(luofei.skills),
        ["nihil_lianxi", "nihil_dianchao", "nihil_liusheng"],
    );
    assert.strictEqual(moduleDef.translate.nihil_luofei, "落绯");
    assert.strictEqual(moduleDef.translate.nihil_dianchao, "殷潮");
}

async function testNoStartingBlood() {
    const player = makePlayer("luofei", { [BLOOD]: 0 });
    assert.strictEqual(skills.nihil_lianxi_start, undefined, "敛息不应再注册开局获得2血的子技能");
    assert.strictEqual(skills.nihil_lianxi.group.includes("nihil_lianxi_start"), false);
    assert.strictEqual(player.countMark(BLOOD), 0, "落绯开局应从0血开始");
    assert.strictEqual(moduleDef.translate.nihil_lianxi_info.includes("游戏开始时"), false);
}

async function testDamageConversion() {
    const player = makePlayer("luofei", { [BLOOD]: 0 });
    const target = makePlayer("target");
    let cancelled = false;
    const trigger = {
        player: target,
        num: 2,
        cancel() {
            cancelled = true;
        },
    };
    await skills.nihil_lianxi_convert.content({}, trigger, player);
    assert.strictEqual(cancelled, true, "伤害事件必须被取消");
    assert.strictEqual(target.lostHp, 2, "目标应改为流失等量体力");
    assert.strictEqual(player.countMark(BLOOD), 0, "伤害转换本身不应直接获得血");

    const convertedLoseHpChange = {
        num: -2,
        getParent(level) {
            return level === 1 ? { name: "loseHp" } : {};
        },
    };
    await skills.nihil_lianxi_losehp.content({}, convertedLoseHpChange, player);
    assert.strictEqual(player.countMark(BLOOD), 2, "对其他角色造2点伤害最终应获得2血");

    const selfTarget = makePlayer("luofei-self-target", { [BLOOD]: 0 });
    await skills.nihil_lianxi_convert.content(
        {},
        { player: selfTarget, num: 2, cancel() {} },
        selfTarget,
    );
    await skills.nihil_lianxi_losehp.content({}, convertedLoseHpChange, selfTarget);
    await skills.nihil_lianxi_selfloss.content({}, convertedLoseHpChange, selfTarget);
    assert.strictEqual(selfTarget.lostHp, 2, "自伤也应转换为流失等量体力");
    assert.strictEqual(selfTarget.countMark(BLOOD), 4, "若伤害目标是自己，2点伤害最终应获得4血");
}

async function testBloodCounting() {
    const player = makePlayer("luofei", { [BLOOD]: 0 });
    const loseHpChange = {
        num: -1,
        getParent(level) {
            return level === 1 ? { name: "loseHp" } : {};
        },
    };
    assert.strictEqual(skills.nihil_lianxi_losehp.filter(loseHpChange), true);
    await skills.nihil_lianxi_losehp.content({}, loseHpChange, player);
    assert.strictEqual(player.countMark(BLOOD), 1, "其他角色流失1点体力应获得1血");
    assert.strictEqual(player.shownSkillMarks.has(STATE_SHENG), true);

    const damageChange = {
        num: -1,
        getParent(level, forced) {
            assert.strictEqual(level, 1, "只应检查 changeHp 的直接父事件");
            // 对齐真实引擎：默认找不到返回空对象；forced=true 才返回 undefined。
            return forced ? undefined : {};
        },
    };
    assert.strictEqual(skills.nihil_lianxi_losehp.filter(damageChange), false);
    assert.strictEqual(player.countMark(BLOOD), 1, "其他角色受到1点伤害不应获得血");

    await skills.nihil_lianxi_selfloss.content({}, damageChange, player);
    assert.strictEqual(player.countMark(BLOOD), 2, "落绯受到1点伤害应获得1血");
    assert.strictEqual(player.shownSkillMarks.has(STATE_XI), true);

    await skills.nihil_lianxi_losehp.content({}, loseHpChange, player);
    await skills.nihil_lianxi_selfloss.content({}, loseHpChange, player);
    assert.strictEqual(player.countMark(BLOOD), 4, "落绯流失1点体力应获得2血");
    assert.strictEqual(player.shownSkillMarks.has(STATE_XI), true);
}

async function testYinchaoEndPhaseCardRoutes() {
    assert.strictEqual(skills.nihil_dianchao.trigger.player, "phaseJieshuBegin");
    assert.strictEqual(skills.nihil_dianchao.direct, true);

    const cancelPlayer = makePlayer("cancel", { [BLOOD]: 2 });
    cancelPlayer.chooseNumbers = function () {
        assert.strictEqual(arguments.length, 2, "结束阶段的殷潮必须允许取消");
        return immediateResult({ bool: false }, {});
    };
    cancelPlayer.showCards = async function () {
        throw new Error("取消殷潮后不应翻牌");
    };
    await skills.nihil_dianchao.content({}, {}, cancelPlayer);
    assert.strictEqual(cancelPlayer.countMark(BLOOD), 2, "取消殷潮不应消耗血");

    const black = { id: "black", color: "black", position: "p" };
    const redNoTarget = { id: "red-no-target", color: "red", position: "p" };
    game.topCards = [black, redNoTarget];
    game.discarded = [];

    const player = makePlayer("luofei", { [BLOOD]: 2 });
    player.chooseNumbers = function () {
        assert.strictEqual(arguments.length, 2, "殷潮数值选择必须允许取消");
        return immediateResult({ bool: true, numbers: [2] }, {});
    };
    player.showCards = async function () {};
    player.hasUseTarget = function (card, distance, includecard) {
        assert.strictEqual(distance, true, "殷潮的红色牌须按正常距离检查目标");
        assert.strictEqual(includecard, false, "殷潮的红色牌不计入本回合杀的次数限制");
        return false;
    };
    player.chooseUseTarget = function () {
        throw new Error("无合法目标时不应进入选择目标");
    };
    context._status.eventPlayer = player;

    await skills.nihil_dianchao.content({}, {}, player);
    assert.strictEqual(player.countMark(BLOOD), 0);
    assert.deepStrictEqual(player.gained, [black], "黑牌应由落绯获得");
    assert.deepStrictEqual(game.discarded, [redNoTarget], "无合法目标的红牌应弃置");

    const redUsable = { id: "red-usable", color: "red", position: "p" };
    const redDeclined = { id: "red-declined", color: "red", position: "p" };
    game.topCards = [redUsable, redDeclined];
    game.discarded = [];
    player.marks[BLOOD] = 2;
    player.chooseNumbers = function () {
        return immediateResult({ bool: true, numbers: [2] }, {});
    };
    player.hasUseTarget = function (card, distance, includecard) {
        assert.strictEqual(distance, true, "殷潮的红色牌须按正常距离检查目标");
        assert.strictEqual(includecard, false, "殷潮的红色牌不计入本回合杀的次数限制");
        return card.name === "sha" && [redUsable, redDeclined].includes(card.cards[0]);
    };
    player.chooseUseTarget = function (card, cards, addCount) {
        assert.strictEqual(arguments.length, 3, "殷潮出杀不应传入 forced=true");
        this.usedCards.push({ card, cards, addCount });
        const physicalCard = cards[0];
        if (physicalCard === redUsable) {
            redUsable.position = "d";
            return immediateResult({ bool: true }, {});
        }
        return immediateResult({ bool: false }, {});
    };

    await skills.nihil_dianchao.content({}, {}, player);
    assert.strictEqual(player.usedCards.length, 2, "每张有合法目标的红牌均应询问是否使用");
    assert.strictEqual(player.usedCards[0].card.name, "sha");
    assert.strictEqual(player.usedCards[0].cards[0], redUsable);
    assert.strictEqual(player.usedCards[0].addCount, false, "殷潮杀必须不计次数");
    assert.deepStrictEqual(game.discarded, [redDeclined], "主动放弃使用的红牌应弃置");
}

async function testYinchaoAiSpendIntegration() {
    const enemy = makePlayer("enemy");
    enemy.hp = 3;
    enemy.handCards = [{ name: "unknown" }, { name: "unknown" }];
    const player = makePlayer("luofei-ai", { [BLOOD]: 3 });
    player.attitudes = { enemy: -5 };
    player.canUse = function (card, target, distance, includeCard) {
        assert.strictEqual(card.name, "sha");
        assert.strictEqual(target, enemy);
        assert.strictEqual(distance, null, "AI规划殷潮时必须遵守正常距离");
        assert.strictEqual(includeCard, false, "AI规划殷潮时必须忽略杀次数限制");
        return true;
    };
    player.chooseNumbers = function () {
        const config = {};
        return immediateResult(function () {
            const numbers = config.processAI();
            return Array.isArray(numbers)
                ? { bool: true, numbers }
                : { bool: false };
        }, config);
    };
    player.showCards = async function () {};
    player.hasUseTarget = function () {
        return false;
    };
    context._status.eventPlayer = player;
    game.players = [player, enemy];
    game.topCards = [
        { id: "ai-black-1", color: "black", position: "p" },
        { id: "ai-black-2", color: "black", position: "p" },
    ];

    await skills.nihil_dianchao.content({}, {}, player);
    assert.strictEqual(player.countMark(BLOOD), 1, "AI应使用2血并保留最后1血");
    assert.strictEqual(player.gained.length, 2);

    const holdPlayer = makePlayer("luofei-hold", { [BLOOD]: 3 });
    holdPlayer.attitudes = {};
    holdPlayer.chooseNumbers = player.chooseNumbers;
    holdPlayer.showCards = async function () {
        throw new Error("没有正收益目标时AI不应翻牌");
    };
    context._status.eventPlayer = holdPlayer;
    game.players = [holdPlayer];
    await skills.nihil_dianchao.content({}, {}, holdPlayer);
    assert.strictEqual(holdPlayer.countMark(BLOOD), 3);
}

async function testAiIsolationAndVulnerabilityMemory() {
    const player = makePlayer("luofei-ai", { [BLOOD]: 2 });
    const sha = { name: "sha" };
    const shan = { name: "shan" };
    player.handCards = [sha, shan];

    context._status.event = {
        name: "chooseToDiscard",
        player,
        getParent() {
            return { name: "skillCost", player };
        },
    };
    assert.strictEqual(
        skills.nihil_lianxi.mod.aiUseful(player, shan, 5),
        undefined,
        "技能代价弃牌不得受到落绯留牌AI影响",
    );

    context._status.event = {
        name: "chooseToUse",
        player,
        getParent() {
            return { name: "phaseUse", player };
        },
    };
    assert.strictEqual(
        skills.nihil_lianxi.mod.aiUseful(player, shan, 5),
        undefined,
        "出牌和响应阶段不得受到弃牌留牌AI影响",
    );

    const phaseDiscard = { name: "phaseDiscard", player };
    context._status.event = {
        name: "chooseToDiscard",
        player,
        getParent() {
            return phaseDiscard;
        },
    };
    assert.ok(
        skills.nihil_lianxi.mod.aiUseful(player, shan, 5) > 9,
        "正常弃牌阶段应大幅提高闪的保留优先级",
    );
    assert.strictEqual(
        skills.nihil_lianxi.mod.aiUseful(player, sha, 5),
        undefined,
        "普通进攻牌应沿用引擎原始评分",
    );

    const target = makePlayer("vulnerable-target");
    target.handCards = [{ name: "unknown" }, { name: "unknown" }];
    const hit = { target };
    assert.strictEqual(
        skills.nihil_lianxi_ai_vulnerable.filter(hit, player),
        true,
    );
    assert.strictEqual(
        skills.nihil_lianxi_ai_vulnerable.filter(
            { target, directHit: true },
            player,
        ),
        false,
        "直击造成的未出闪不能记为防御薄弱",
    );
    await skills.nihil_lianxi_ai_vulnerable.content({}, hit, player);
    assert.strictEqual(target._nihilLuofeiNoShanVulnerable, true);

    const newCard = { name: "new-card" };
    target.handCards.push(newCard);
    game.players = [player, target];
    const gainEvent = {
        getg(current) {
            return current === target ? [newCard] : [];
        },
    };
    assert.strictEqual(
        skills.nihil_lianxi_ai_vulnerable_clear.filter(gainEvent),
        true,
    );
    await skills.nihil_lianxi_ai_vulnerable_clear.content({}, gainEvent);
    assert.strictEqual(
        target._nihilLuofeiNoShanVulnerable,
        undefined,
        "获得新手牌后必须清除无闪脆弱记录",
    );
}

async function runLiusheng(color, marks, target) {
    const judgeCard = { id: "judge-" + color, color, position: "o" };
    const player = makePlayer("luofei", { [BLOOD]: 0 });
    if (marks > 0) {
        await skills.nihil_lianxi_losehp.content(
            {},
            {
                num: -marks,
                getParent(level) {
                    return level === 1 ? { name: "loseHp" } : {};
                },
            },
            player,
        );
    }
    const stateBefore = new Set(player.shownSkillMarks);
    player.judge = function () {
        return immediateResult({ color, card: judgeCard }, {});
    };
    await skills.nihil_liusheng.content({}, { player: target }, player);
    return { player, judgeCard, stateBefore };
}

async function testLiusheng() {
    const alive = makePlayer("alive");
    const dead = makePlayer("dead");
    dead.inGame = false;
    const owner = makePlayer("luofei", { [BLOOD]: 1 });
    assert.strictEqual(
        skills.nihil_liusheng.filter({ player: alive, num: 1 }, owner),
        true,
    );
    assert.strictEqual(
        skills.nihil_liusheng.filter({ player: dead, num: 1 }, owner),
        false,
    );
    assert.strictEqual(
        skills.nihil_liusheng.filter(
            { player: alive, num: 1, _cancelled: true },
            owner,
        ),
        false,
        "被取消或转化的伤害不应触发流生",
    );

    owner.attitudes = { alive: 5 };
    owner.marks[BLOOD] = 3;
    assert.strictEqual(
        skills.nihil_liusheng.check({ player: alive }, owner),
        true,
        "生状态AI应帮助受伤友方",
    );
    owner.attitudes.alive = -5;
    assert.strictEqual(
        skills.nihil_liusheng.check({ player: alive }, owner),
        false,
        "生状态AI不应帮助敌方",
    );
    owner.marks[BLOOD] = 2;
    assert.strictEqual(
        skills.nihil_liusheng.check({ player: alive }, owner),
        true,
        "息状态AI应压制敌方",
    );

    owner.attitudes.luofei = -10;
    assert.strictEqual(
        skills.nihil_liusheng.check({ player: owner }, owner),
        false,
        "即使引擎将自身态度算成负数，息状态也不得对自己发动流生",
    );
    owner.marks[BLOOD] = 3;
    assert.strictEqual(
        skills.nihil_liusheng.check({ player: owner }, owner),
        true,
        "生状态仍可对自己发动流生回血",
    );

    const black = await runLiusheng("black", 1, alive);
    assert.strictEqual(black.stateBefore.has(STATE_SHENG), true);
    assert.deepStrictEqual(black.player.gained, [black.judgeCard]);
    assert.strictEqual(black.player.shownSkillMarks.size, 0, "0血时应隐藏生息标记");

    const evenTarget = makePlayer("even-target");
    const sheng = await runLiusheng("red", 3, evenTarget);
    assert.strictEqual(sheng.stateBefore.has(STATE_SHENG), true);
    assert.strictEqual(evenTarget.recovered, 1, "移去后剩2血时应回复目标");

    const oddTarget = makePlayer("odd-target");
    const xi = await runLiusheng("red", 2, oddTarget);
    assert.strictEqual(xi.stateBefore.has(STATE_XI), true);
    assert.strictEqual(oddTarget.lostHp, 1, "移去后剩1血时应令目标流失体力");

    const zeroTarget = makePlayer("zero-target");
    await runLiusheng("red", 1, zeroTarget);
    assert.strictEqual(zeroTarget.recovered, 1, "0血按偶数处理");
}

async function main() {
    await testMetadata();
    await testNoStartingBlood();
    await testDamageConversion();
    await testBloodCounting();
    await testYinchaoEndPhaseCardRoutes();
    await testYinchaoAiSpendIntegration();
    await testAiIsolationAndVulnerabilityMemory();
    await testLiusheng();
    const semanticText = game.semanticLogs
        .flat()
        .filter(part => typeof part === "string")
        .join("|");
    assert.ok(semanticText.includes("点伤害改为等量体力流失"), "敛息转换应写入语义战报");
    assert.ok(semanticText.includes("移去了"), "血标记消耗应写入语义战报");
    console.log("luofei smoke tests passed");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
