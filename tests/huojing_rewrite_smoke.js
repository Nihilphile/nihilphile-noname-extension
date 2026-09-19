"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function immediateChoice(value) {
    const settings = {};
    return {
        settings,
        set(key, data) {
            settings[key] = data;
            return this;
        },
        async forResult() {
            return typeof value === "function" ? value(settings) : value;
        },
    };
}

function makePlayer(id, initialSkills) {
    return {
        id,
        playerid: id,
        inGame: true,
        skills: new Set(initialSkills || []),
        handCards: [],
        equipCards: [],
        drawn: 0,
        gainedSkills: [],
        given: [],
        logs: [],
        attitudes: {},
        marks: new Set(),
        syncCount: 0,
        canRespondSha: false,
        physicalRespondableSha: false,
        crashOnForcedEmptyResponse: false,
        responseResult: { bool: false },
        targetChoice: null,
        isIn() {
            return this.inGame;
        },
        hasSkill(skill) {
            return this.skills.has(skill);
        },
        addSkill(skill) {
            this.skills.add(skill);
        },
        removeSkill(skill) {
            this.skills.delete(skill);
            this.marks.delete(skill);
        },
        markSkill(skill) {
            this.marks.add(skill);
        },
        syncSkills() {
            this.syncCount++;
        },
        countCards(position) {
            if (position === "h") return this.handCards.length;
            if (position === "e") return this.equipCards.length;
            return 0;
        },
        hasUsableCard(name, type) {
            assert.strictEqual(name, "sha");
            assert.strictEqual(type, "respond");
            return this.canRespondSha;
        },
        hasCard(filter, position) {
            assert.strictEqual(typeof filter, "function");
            assert.strictEqual(position, "hs");
            return this.physicalRespondableSha;
        },
        chooseToRespond() {
            this.respondChoice = immediateChoice(settings => {
                if (this.crashOnForcedEmptyResponse && settings.forced) {
                    throw new TypeError("Cannot read properties of undefined (reading 'name')");
                }
                return this.responseResult;
            });
            return this.respondChoice;
        },
        chooseCard(position, forced) {
            assert.strictEqual(position, "h");
            assert.strictEqual(forced, true);
            this.cardChoice = immediateChoice(() => ({
                bool: this.handCards.length > 0,
                cards: this.handCards.length ? [this.handCards[0]] : [],
            }));
            return this.cardChoice;
        },
        chooseTarget() {
            this.targetChoiceEvent = immediateChoice(() => ({
                bool: !!this.targetChoice,
                targets: this.targetChoice ? [this.targetChoice] : [],
            }));
            return this.targetChoiceEvent;
        },
        async give(cards, target) {
            const list = Array.isArray(cards) ? cards : [cards];
            list.forEach(card => {
                const handIndex = this.handCards.indexOf(card);
                if (handIndex >= 0) this.handCards.splice(handIndex, 1);
                const equipIndex = this.equipCards.indexOf(card);
                if (equipIndex >= 0) this.equipCards.splice(equipIndex, 1);
                target.handCards.push(card);
            });
            this.given.push({ cards: list, target });
        },
        async draw(num) {
            this.drawn += num == null ? 1 : num;
        },
        logSkill(skill, target) {
            this.logs.push({ skill, target });
        },
        async addSkills(skill) {
            this.skills.add(skill);
            this.gainedSkills.push(skill);
        },
    };
}

const game = {
    players: [],
    dead: [],
    phaseNumber: 0,
    semanticLogs: [],
    log(...parts) {
        this.semanticLogs.push(parts);
    },
    hasPlayer(filter) {
        return this.players.some(filter);
    },
};

const context = {
    window: {},
    game,
    get: {
        name(card) {
            return card && card.name;
        },
        value() {
            return 1;
        },
        attitude(player, target) {
            if (player && Object.prototype.hasOwnProperty.call(player.attitudes, target.id)) {
                return player.attitudes[target.id];
            }
            return player === target ? 5 : 1;
        },
    },
    lib: {
        filter: {
            cardRespondable() {
                return true;
            },
        },
    },
    ui: {},
    ai: {},
    _status: { event: {} },
    console,
    Math,
    Set,
    Array,
};

vm.createContext(context);
const modulePath = path.join(
    __dirname,
    "..",
    "nihilphile武将包",
    "module",
    "huojing_rewrite.js",
);
vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, {
    filename: modulePath,
});

const moduleDef = context.window.nihilModules.huojing_rewrite;
const skills = moduleDef.skill;
const hooks = moduleDef.testHooks;
const SHUAI = "nihil_shuai";
const XIEGONG = "nihil_xiegong";
const ZHANSHUAI = "nihil_zhanshuai";

function resetPlayers(players, dead) {
    game.players = players;
    game.dead = dead || [];
    players.concat(dead || []).forEach(player => {
        player.inGame = players.includes(player);
        player.skills.delete(SHUAI);
        player.marks.delete(SHUAI);
    });
}

async function testStructureAndMetadata() {
    assert.ok(moduleDef, "全新霍旌模块必须加载");
    const character = moduleDef.character.nihil_huojing;
    assert.strictEqual(character.sex, "male");
    assert.strictEqual(character.group, "qun");
    assert.strictEqual(character.hp, 4);
    assert.deepStrictEqual(
        Array.from(character.skills),
        [ZHANSHUAI, XIEGONG, "nihil_junshang", "nihil_yizhong"],
    );
    assert.strictEqual(moduleDef.translate.nihil_huojing, "霍旌");
    assert.ok(moduleDef.translate.nihil_xiegong_info.includes("锁定技"));

    const extensionPath = path.join(__dirname, "..", "nihilphile武将包", "extension.js");
    const extensionSource = fs.readFileSync(extensionPath, "utf8");
    assert.ok(extensionSource.includes('"huojing_rewrite"'));
    assert.ok(!/^\s*"huojing",\s*$/m.test(extensionSource), "旧霍旌模块不得继续加载");
    const imagePath = path.join(
        __dirname,
        "..",
        "nihilphile武将包",
        "image",
        "character",
        "nihil_huojing.png",
    );
    assert.ok(fs.existsSync(imagePath), "霍旌立绘必须存在");
}

async function testCommanderLifecycle() {
    const huojing = makePlayer("huojing", [ZHANSHUAI, XIEGONG]);
    const ally = makePlayer("ally");
    const enemy = makePlayer("enemy");
    resetPlayers([huojing, ally, enemy]);
    game.phaseNumber = 0;

    assert.strictEqual(
        skills.nihil_zhanshuai_init.filter({ name: "phase" }, huojing),
        true,
    );
    await skills.nihil_zhanshuai_init.content({}, {}, huojing);
    assert.strictEqual(hooks.getCommander(), huojing);
    assert.strictEqual(huojing.marks.has(SHUAI), true);
    assert.strictEqual(
        skills.nihil_zhanshuai_change.trigger.player,
        "phaseJieshuBegin",
        "帅的主动移交时点应为霍旌的结束阶段",
    );

    enemy.addSkill(SHUAI);
    hooks.setCommander(ally);
    assert.strictEqual(hooks.getCommander(), ally);
    assert.strictEqual(huojing.hasSkill(SHUAI), false);
    assert.strictEqual(enemy.hasSkill(SHUAI), false);
    assert.strictEqual(ally.hasSkill(SHUAI), true);

    huojing.targetChoice = enemy;
    huojing.attitudes.enemy = -5;
    context._status.event.player = huojing;
    await skills.nihil_zhanshuai_change.content({}, {}, huojing);
    assert.strictEqual(hooks.getCommander(), enemy);
    assert.strictEqual(
        huojing.targetChoiceEvent.settings.ai(enemy),
        0,
        "AI不会把敌方选为帅，但真人手动选择仍应按规则正常生效",
    );
    assert.strictEqual(game.players.filter(player => player.hasSkill(SHUAI)).length, 1);

    game.phaseNumber = 1;
    enemy.removeSkill(SHUAI);
    assert.strictEqual(
        skills.nihil_zhanshuai_init.filter({ name: "phase" }, huojing),
        false,
        "非开局的 phaseBefore 不能重新初始化",
    );

    const huojing2 = makePlayer("huojing2", [ZHANSHUAI, XIEGONG]);
    resetPlayers([huojing, huojing2, ally]);
    game.phaseNumber = 0;
    assert.strictEqual(skills.nihil_zhanshuai_init.filter({ name: "phase" }, huojing), true);
    assert.strictEqual(skills.nihil_zhanshuai_init.filter({ name: "phase" }, huojing2), false);

    hooks.setCommander(ally);
    ally.inGame = false;
    game.players = [huojing, huojing2];
    game.dead = [ally];
    await skills.nihil_shuai_die.content({}, { player: ally }, ally);
    assert.strictEqual(hooks.getCommander(), huojing, "旧帅死亡后首名存活霍旌继任");

    hooks.setCommander(huojing);
    huojing.inGame = false;
    game.players = [ally];
    ally.inGame = true;
    game.dead = [huojing];
    await skills.nihil_shuai_die.content({}, { player: huojing }, huojing);
    assert.strictEqual(hooks.getCommander(), null, "帅霍旌死亡且无其他霍旌时不得自继任");
}

async function testXiegongSuccessAndStacking() {
    const huojing = makePlayer("huojing", [ZHANSHUAI, XIEGONG]);
    const commander = makePlayer("commander");
    const target = makePlayer("target");
    const inheritor = makePlayer("inheritor", [XIEGONG]);
    resetPlayers([commander, huojing, target, inheritor]);
    hooks.setCommander(commander);

    huojing.canRespondSha = true;
    huojing.physicalRespondableSha = true;
    huojing.responseResult = {
        bool: true,
        cards: [{ id: "support-sha-1" }],
        card: { name: "sha" },
    };
    const useCard = {
        player: commander,
        card: { name: "sha" },
        baseDamage: 1,
        customArgs: { default: {} },
    };
    const skillEvent = {};
    assert.strictEqual(skills.nihil_xiegong.filter(useCard, huojing), true);
    assert.strictEqual(
        skills.nihil_xiegong.filter(
            { player: commander, card: { name: "sha", isCard: false } },
            huojing,
        ),
        true,
        "帅使用虚拟【杀】也应正常触发协攻，且不影响霍旌的响应分支",
    );
    await skills.nihil_xiegong.content(skillEvent, useCard, huojing);
    assert.strictEqual(skillEvent.result.ok, true);
    assert.strictEqual(huojing.respondChoice.settings.forced, true, "有杀时必须禁止取消");
    assert.ok(
        huojing.respondChoice.settings.ai({ name: "sha" }) > 0,
        "AI面对协攻时应始终愿意选择合法的杀",
    );
    assert.strictEqual(useCard.baseDamage, 2);
    assert.strictEqual(
        useCard._nihilXiegongDamageBonus,
        1,
        "协攻加伤必须在杀事件上留下仅供AI归一化的隐藏来源值",
    );
    game.players.forEach(player => {
        assert.strictEqual(useCard.customArgs[player.playerid].shanRequired, 2);
    });

    inheritor.canRespondSha = true;
    inheritor.physicalRespondableSha = false;
    inheritor.responseResult = {
        bool: true,
        cards: [{ id: "support-sha-2" }],
        card: { name: "sha" },
    };
    await skills.nihil_xiegong.content({}, useCard, inheritor);
    assert.strictEqual(inheritor.respondChoice.settings.forced, false);
    assert.ok(inheritor.respondChoice.settings.ai({ name: "sha" }) > 0);
    assert.strictEqual(useCard.baseDamage, 3);
    assert.strictEqual(useCard._nihilXiegongDamageBonus, 2);
    game.players.forEach(player => {
        assert.strictEqual(useCard.customArgs[player.playerid].shanRequired, 3);
    });
}

async function testXiegongFailureBranches() {
    const huojing = makePlayer("huojing", [ZHANSHUAI, XIEGONG]);
    const commander = makePlayer("commander");
    const target = makePlayer("target");
    resetPlayers([commander, huojing, target]);
    hooks.setCommander(commander);

    const payment = { id: "payment" };
    huojing.handCards = [payment];
    huojing.canRespondSha = false;
    const useCard = {
        player: commander,
        card: { name: "sha" },
        baseDamage: 1,
        customArgs: { default: {} },
    };
    const skillEvent = {};
    await skills.nihil_xiegong.content(skillEvent, useCard, huojing);
    assert.strictEqual(skillEvent.result.reason, "unavailable");
    assert.strictEqual(huojing.respondChoice, undefined, "无合法杀时不应创建强制空选择");
    assert.strictEqual(huojing.given.length, 1);
    assert.strictEqual(huojing.given[0].target, commander);
    assert.ok(
        huojing.cardChoice.settings.ai(payment) > 0,
        "AI在协攻失败时必须选择一张手牌交给帅",
    );
    assert.deepStrictEqual(commander.handCards, [payment]);
    assert.strictEqual(useCard.baseDamage, 1);

    const falsePositivePayment = { id: "false-positive-payment" };
    huojing.handCards = [falsePositivePayment];
    huojing.given = [];
    huojing.canRespondSha = true;
    huojing.physicalRespondableSha = false;
    huojing.responseResult = { bool: false };
    huojing.crashOnForcedEmptyResponse = true;
    await skills.nihil_xiegong.content({}, useCard, huojing);
    assert.strictEqual(
        huojing.respondChoice.settings.forced,
        false,
        "仅有不可靠的虚拟杀预检时不得进入会产生空 respond.card 的强制响应",
    );
    assert.strictEqual(huojing.given.length, 1);
    assert.deepStrictEqual(commander.handCards.slice(-1), [falsePositivePayment]);
    huojing.crashOnForcedEmptyResponse = false;

    huojing.handCards = [];
    huojing.given = [];
    await skills.nihil_xiegong.content({}, useCard, huojing);
    assert.strictEqual(huojing.given.length, 0, "无杀且无手牌时不得产生非法交牌");

    hooks.setCommander(huojing);
    huojing.skills.add("nihil_junshang");
    huojing.drawn = 0;
    huojing.canRespondSha = false;
    const selfSha = {
        player: huojing,
        card: { name: "sha" },
        baseDamage: 1,
        customArgs: { default: {} },
    };
    await skills.nihil_xiegong.content({}, selfSha, huojing);
    assert.strictEqual(huojing.drawn, 1, "自帅无额外杀时应净摸一张");
    assert.strictEqual(selfSha.baseDamage, 1);

    huojing.canRespondSha = true;
    huojing.physicalRespondableSha = true;
    huojing.responseResult = {
        bool: true,
        cards: [{ id: "self-extra-sha" }],
        card: { name: "sha" },
    };
    const selfShaWithExtra = {
        player: huojing,
        card: { name: "sha" },
        baseDamage: 1,
        customArgs: { default: {} },
    };
    await skills.nihil_xiegong.content({}, selfShaWithExtra, huojing);
    assert.strictEqual(huojing.respondChoice.settings.forced, true);
    assert.strictEqual(selfShaWithExtra.baseDamage, 2, "自帅有额外杀时必须打出并获得加成");
    assert.strictEqual(huojing.drawn, 1, "成功协攻不能再获得失败分支的摸牌");

    const inheritor = makePlayer("inheritor", [XIEGONG]);
    resetPlayers([inheritor, target]);
    hooks.setCommander(inheritor);
    inheritor.canRespondSha = false;
    const inheritedSelfSha = {
        player: inheritor,
        card: { name: "sha" },
        baseDamage: 1,
        customArgs: { default: {} },
    };
    await skills.nihil_xiegong.content({}, inheritedSelfSha, inheritor);
    assert.strictEqual(
        inheritor.drawn,
        0,
        "仅由遗忠获得协攻的自帅角色没有军赏，失败时不能摸牌",
    );
}

async function testJunshang() {
    const huojing = makePlayer("huojing", [ZHANSHUAI, XIEGONG]);
    const commander = makePlayer("commander");
    resetPlayers([commander, huojing]);
    hooks.setCommander(commander);

    assert.strictEqual(
        skills.nihil_junshang_damage.filter({
            source: commander,
            card: { name: "sha" },
            num: 3,
        }),
        true,
    );
    huojing.drawn = 0;
    await skills.nihil_junshang_damage.content(
        {},
        { source: commander, card: { name: "sha" }, num: 3 },
        huojing,
    );
    assert.strictEqual(huojing.drawn, 3);
    assert.strictEqual(
        skills.nihil_junshang_damage.filter({
            source: commander,
            card: { name: "sha" },
            num: 0,
        }),
        false,
    );
    assert.strictEqual(
        skills.nihil_junshang_damage.filter({
            source: commander,
            card: { name: "sha" },
            num: 2,
            _cancelled: true,
        }),
        false,
    );
    assert.strictEqual(
        skills.nihil_junshang_damage.filter({
            source: commander,
            card: { name: "juedou" },
            num: 2,
        }),
        false,
        "帅通过非杀卡牌造成伤害时军赏不得摸牌",
    );
    assert.strictEqual(
        skills.nihil_junshang_damage.filter({ source: commander, num: 2 }),
        false,
        "无卡牌来源的技能伤害不得触发军赏",
    );

    const hand = { id: "hand" };
    const equip = { id: "equip" };
    const judge = { id: "judge" };
    const other = { id: "other" };
    const moveEvent = {
        getl(player) {
            return player === huojing ? { cards2: [hand, equip] } : { cards2: [] };
        },
        getg(player) {
            return player === commander ? [hand, equip, judge, other] : [];
        },
    };
    assert.deepStrictEqual(
        Array.from(hooks.matchingTransferredCards(moveEvent, huojing, commander)),
        [hand, equip],
    );
    assert.deepStrictEqual(
        Array.from(skills.nihil_junshang_transfer.getIndex(moveEvent, huojing)),
        [commander],
    );
    assert.strictEqual(
        skills.nihil_junshang_transfer.filter(moveEvent, huojing, "gainAfter", commander),
        true,
    );
    huojing.drawn = 0;
    await skills.nihil_junshang_transfer.content(
        { targets: [commander] },
        moveEvent,
        huojing,
    );
    assert.strictEqual(huojing.drawn, 2, "手牌和装备牌实际进入帅手牌时应按张数摸牌");

    hooks.setCommander(huojing);
    assert.deepStrictEqual(
        Array.from(skills.nihil_junshang_transfer.getIndex(moveEvent, huojing)),
        [],
        "自帅普通移动不能被通用交牌追踪重复计数",
    );
}

async function testYizhong() {
    const huojing = makePlayer("huojing", [ZHANSHUAI, XIEGONG]);
    const commander = makePlayer("commander");
    const ally = makePlayer("ally");
    const inheritor = makePlayer("inheritor", [XIEGONG]);
    const traitor = makePlayer("traitor");
    traitor.identity = "nei";
    resetPlayers([commander, ally, inheritor, traitor], [huojing]);
    hooks.setCommander(commander);
    huojing.attitudes.commander = -5;
    huojing.attitudes.ally = 5;
    huojing.attitudes.traitor = 5;
    huojing.targetChoice = ally;
    context._status.event.player = huojing;

    assert.strictEqual(skills.nihil_yizhong.filter({}, huojing), true);
    await skills.nihil_yizhong.content({}, {}, huojing);
    assert.strictEqual(ally.hasSkill(XIEGONG), true);
    assert.deepStrictEqual(ally.gainedSkills, [XIEGONG]);
    assert.strictEqual(huojing.targetChoiceEvent.settings.forceDie, true);
    assert.ok(
        huojing.targetChoiceEvent.settings.ai(commander)
            > huojing.targetChoiceEvent.settings.ai(ally),
        "遗忠AI应优先把协攻传给当前帅，即使普通态度分更低",
    );
    assert.strictEqual(
        huojing.targetChoiceEvent.settings.ai(traitor),
        0,
        "遗忠AI不得把协攻传给内奸",
    );
    assert.strictEqual(
        commander.hasSkill(XIEGONG),
        false,
        "真人手动选择友方时不应被AI优先级强制改成当前帅",
    );
    assert.strictEqual(
        skills.nihil_yizhong.filter({}, huojing),
        true,
        "其他未获得协攻的合法目标仍在场时，技能目标检查应继续成立",
    );
}

async function main() {
    await testStructureAndMetadata();
    await testCommanderLifecycle();
    await testXiegongSuccessAndStacking();
    await testXiegongFailureBranches();
    await testJunshang();
    await testYizhong();
    const semanticText = game.semanticLogs
        .flat()
        .filter(part => typeof part === "string")
        .join("|");
    assert.ok(semanticText.includes("成为唯一的“帅”"), "帅位变更应写入语义战报");
    assert.ok(semanticText.includes("响应成功；“帅”的此【杀】伤害+1"), "协攻成功增幅应写入语义战报");
    assert.ok(semanticText.includes("未响应"), "协攻失败分支应写入语义战报");
    assert.ok(semanticText.includes("获得【协攻】"), "遗忠授技应写入语义战报");
    console.log("huojing rewrite smoke tests passed");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
