"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

class MockPlayer {
    constructor(id, options) {
        options = options || {};
        this.id = id;
        this.handCount = options.handCount || 0;
        this.equipCount = options.equipCount || 0;
        this.attitudes = options.attitudes || {};
        this.legalTargets = new Set(options.legalTargets || []);
        this.chooseTargetResult = options.chooseTargetResult || null;
        this.chooseBoolCalls = 0;
        this.chooseUseTargetCalls = 0;
        this.loggedSkills = [];
        this.lastBoolConfig = null;
        this.lastUseConfig = null;
    }

    countCards(zone) {
        let count = 0;
        if (zone.includes("h")) count += this.handCount;
        if (zone.includes("e")) count += this.equipCount;
        return count;
    }

    countDiscardableCards(player, zone) {
        this.lastDiscardableQuery = { player, zone };
        return this.countCards(zone);
    }

    canUse(card, target) {
        return card && card.name === "sha" && this.legalTargets.has(target.id);
    }

    hasUseTarget(card) {
        return game.players.some(target => target !== this && this.canUse(card, target));
    }

    hasSha() {
        return false;
    }

    isIn() {
        return true;
    }

    chooseTarget(...args) {
        const filter = args.find(value => typeof value === "function");
        const target = this.chooseTargetResult;
        const config = {};
        const choice = {
            set(key, value) {
                config[key] = value;
                return choice;
            },
            async forResult() {
                return target && (!filter || filter(null, this, target))
                    ? { bool: true, targets: [target] }
                    : { bool: false, targets: [] };
            },
        };
        choice.forResult = choice.forResult.bind(this);
        return choice;
    }

    async discardPlayerCard(target, zone, forced) {
        this.lastDiscard = { target, zone, forced };
    }

    line() {}

    hasValueTarget() {
        throw new Error("御策入口不应再调用 hasValueTarget");
    }

    chooseBool() {
        this.chooseBoolCalls++;
        const player = this;
        const config = {};
        this.lastBoolConfig = config;
        const choice = {
            set(key, value) {
                config[key] = value;
                return choice;
            },
            async forResult() {
                return { bool: typeof config.ai === "function" ? !!config.ai() : false };
            },
        };
        return choice;
    }

    chooseUseTarget() {
        this.chooseUseTargetCalls++;
        const config = {};
        this.lastUseConfig = config;
        const choice = {
            set(key, value) {
                config[key] = value;
                return choice;
            },
        };
        return choice;
    }

    logSkill(name) {
        this.loggedSkills.push(name);
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
    filterPlayer(callback) {
        return this.players.filter(callback);
    },
};

const get = {
    attitude(player, target) {
        if (player === target) return 5;
        return player.attitudes[target.id] == null ? 0 : player.attitudes[target.id];
    },
    // 故意让通用牌效很低，验证它只能参与排序，不能否决零成本御策。
    effect(target, card, player) {
        return get.attitude(player, target) < 0 ? -50 : 50;
    },
    prompt() {
        return "御策";
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
            targetEnabled() {
                return true;
            },
        },
    },
    ui: {},
    _status: { currentPhase: null },
    console,
    Number,
    Math,
    Set,
    Infinity,
};

vm.createContext(context);
const modulePath = path.join(__dirname, "..", "nihilphile武将包", "module", "ycc.js");
vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, { filename: modulePath });

const yuce = context.window.nihilModules.ycc.skill.ycc_yuce;

async function runMaxHandCase(player, others) {
    game.players = [player].concat(others);
    context._status.currentPhase = player;
    assert.strictEqual(yuce.filter({}, player), true, "最高手牌角色应进入御策触发节点");
    await yuce.content({}, {}, player);
}

async function main() {
    const huangming = context.window.nihilModules.ycc.skill.ycc_huangming;
    const qinzheng = context.window.nihilModules.ycc.skill.ycc_qinzheng;
    const qinzhengPlayer = {
        storage: {
            ycc_qinzheng_no_support: 3,
            ycc_qinzheng_watch_round: 2,
        },
        skills: new Set(["ycc_huangming"]),
        awakenSkill() {},
        async loseMaxHp() {},
        removeSkill(name) {
            this.skills.delete(name);
        },
        addSkill(name) {
            this.skills.add(name);
        },
    };
    await qinzheng.content({ name: "ycc_qinzheng" }, {}, qinzhengPlayer);
    assert.strictEqual(qinzhengPlayer.skills.has("ycc_huangming"), false);
    assert.strictEqual(qinzhengPlayer.skills.has("ycc_longji"), true);
    const qinzhengLog = game.semanticLogs
        .flat()
        .filter(part => typeof part === "string")
        .join("|");
    assert.ok(qinzhengLog.includes("失去【皇命】，获得【龙殛】，手牌上限+1"), "亲征技能替换应写入语义战报");

    // 皇命第二分支可弃置装备区的牌，并统一使用he范围。
    {
        const originalTarget = new MockPlayer("original");
        const equipmentOnly = new MockPlayer("equipment-only", { equipCount: 1 });
        const player = new MockPlayer("ycc", { chooseTargetResult: equipmentOnly });
        await huangming.content(
            { finish() {} },
            { card: { name: "sha" }, targets: [originalTarget] },
            player,
        );
        assert.deepStrictEqual(player.lastDiscard, {
            target: equipmentOnly,
            zone: "he",
            forced: true,
        });
        assert.strictEqual(equipmentOnly.lastDiscardableQuery.zone, "he");
        assert.ok(!context.window.nihilModules.ycc.translate.ycc_huangming_info.includes("弃置其一张手牌"));
    }

    // 有合法敌方：即使通用牌效为负，AI 仍发动，并保证敌方目标优先于队友。
    {
        const enemy = new MockPlayer("enemy", { handCount: 2 });
        const ally = new MockPlayer("ally", { handCount: 3 });
        const player = new MockPlayer("ycc", {
            handCount: 5,
            attitudes: { enemy: -5, ally: 5 },
            legalTargets: ["enemy", "ally"],
        });
        await runMaxHandCase(player, [enemy, ally]);
        assert.strictEqual(player.chooseBoolCalls, 1);
        assert.strictEqual(player.chooseUseTargetCalls, 1, "有合法敌方时 AI 应发动御策");
        assert.ok(player.lastUseConfig.ai(enemy) > player.lastUseConfig.ai(ally), "御策应优先选择敌方");
    }

    // 只有队友可杀：规则提示仍存在，但 AI 不发动。
    {
        const ally = new MockPlayer("ally", { handCount: 3 });
        const player = new MockPlayer("ycc", {
            handCount: 5,
            attitudes: { ally: 5 },
            legalTargets: ["ally"],
        });
        await runMaxHandCase(player, [ally]);
        assert.strictEqual(player.chooseBoolCalls, 1, "有合法目标时不得吞掉人类玩家提示");
        assert.strictEqual(player.chooseUseTargetCalls, 0, "只有队友时 AI 不应发动御策");
    }

    // 完全没有合法目标：不显示无效提示。
    {
        const enemy = new MockPlayer("enemy", { handCount: 3 });
        const player = new MockPlayer("ycc", {
            handCount: 5,
            attitudes: { enemy: -5 },
        });
        await runMaxHandCase(player, [enemy]);
        assert.strictEqual(player.chooseBoolCalls, 0);
        assert.strictEqual(player.chooseUseTargetCalls, 0);
    }

    console.log("ycc yuce AI smoke tests passed");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
