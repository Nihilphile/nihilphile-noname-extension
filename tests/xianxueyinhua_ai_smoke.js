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
        this.skills = new Set(options.skills || []);
        this.attitudes = options.attitudes || {};
    }

    isIn() {
        return true;
    }

    isPhaseUsing() {
        return true;
    }

    hasSkill(name) {
        return this.skills.has(name);
    }

    hasSkillTag(tag) {
        return tag === "jueqing" && this.skills.has("nihil_yinshang");
    }
}

const game = {
    players: [],
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
};

const context = {
    window: {},
    game,
    get,
    lib: {},
    ui: {},
    _status: {},
    console,
    Math,
    Set,
    Infinity,
    isNaN,
};

vm.createContext(context);
const modulePath = path.join(__dirname, "..", "nihilphile武将包", "module", "xianxueyinhua.js");
vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, { filename: modulePath });

const skills = context.window.nihilModules.xianxueyinhua.skill;

function main() {
    const yinhua = new MockPlayer("yinhua", {
        hp: 2,
        skills: ["nihil_chixian", "nihil_yinshang", "nihil_xuechan"],
    });
    const ally = new MockPlayer("ally", { hp: 2, attitudes: { yinhua: 5 } });
    const enemy = new MockPlayer("enemy", { hp: 2, attitudes: { yinhua: -5 } });
    game.players = [yinhua, ally, enemy];

    // 其他角色仍会按敌我关系判断是否对殷华发动赤献。
    const chixian = skills.nihil_chixian_global.ai;
    currentPlayer = ally;
    assert.ok(chixian.order(null, ally) > 0, "友方角色仍应愿意发动赤献");
    assert.ok(chixian.result.player(ally, yinhua) > 0);
    currentPlayer = enemy;
    assert.strictEqual(chixian.order(null, enemy), 0, "敌方角色不应发动赤献");
    assert.ok(chixian.result.player(enemy, yinhua) < 0);

    // 殷华自己的赤献定制评分已暂停。
    currentPlayer = yinhua;
    assert.strictEqual(chixian.order(null, yinhua), 0);
    assert.strictEqual(chixian.result.player(yinhua, yinhua), 0);

    // 殷华自身不再注册出杀规划、留牌规划与牌效规划。
    const yinshang = skills.nihil_yinshang;
    assert.strictEqual(yinshang.mod.aiOrder, undefined);
    assert.strictEqual(yinshang.mod.aiValue, undefined);
    assert.strictEqual(yinshang.mod.aiUseful, undefined);
    assert.strictEqual(yinshang.ai.effect, undefined);
    assert.strictEqual(yinshang.ai.jueqing, true, "绝情规则标签必须保留");

    // 普通角色仍会轻微避开血缠敌人；殷华不再获得专属目标加成。
    const bloodThreat = skills.nihil_xuechan.ai.threaten;
    const bloodTarget = new MockPlayer("blood", { skills: ["nihil_xuechan"] });
    const normal = new MockPlayer("normal", { attitudes: { blood: -5 } });
    yinhua.attitudes.blood = -5;
    assert.ok(Math.abs(Math.sqrt(bloodThreat(normal, bloodTarget)) - 0.82) < 1e-12);
    assert.strictEqual(bloodThreat(yinhua, bloodTarget), 1);

    // 丹恩在弃牌阶段开始时触发；摸牌后仍由弃牌阶段正文重新计算弃牌数。
    const danen = skills.nihil_danen;
    assert.strictEqual(danen.trigger.player, "phaseDiscardBegin");
    assert.strictEqual(danen.check, undefined);

    console.log("xianxueyinhua external AI smoke: all assertions passed");
}

main();
