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
        this.attitudes = options.attitudes || {};
        this.legalTargets = new Set(options.legalTargets || []);
        this.chooseBoolCalls = 0;
        this.chooseUseTargetCalls = 0;
        this.loggedSkills = [];
        this.lastBoolConfig = null;
        this.lastUseConfig = null;
    }

    countCards(zone) {
        return zone === "h" ? this.handCount : 0;
    }

    isIn() {
        return !this.dead;
    }

    async draw(num) {
        this.handCount += num;
    }

    canUse(card, target) {
        return card && card.name === "sha" && this.legalTargets.has(target.id);
    }

    hasUseTarget(card) {
        return game.players.some(target => target !== this && this.canUse(card, target));
    }

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

    chooseUseTarget(card, ...options) {
        this.chooseUseTargetCalls++;
        assert.ok(!options.includes(true), "御策选目标时可以取消");
        assert.ok(options.includes(false), "御策不计出杀次数");
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
    discardPile(name) {
        return context.ui.discardPile.childNodes.find(card => card.name === name);
    },
    translation(player) {
        return player.id;
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
    ui: { discardPile: { childNodes: [] } },
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

async function runPlayEnd(player, others) {
    game.players = [player, ...others];
    context._status.currentPhase = player;
    await runYucePhase(player, "phaseUseEnd");
}

async function runYucePhase(player, triggername) {
    if (yuce.filter({}, player, triggername)) await yuce.content({ triggername }, {}, player);
}

async function main() {
    const ycc = context.window.nihilModules.ycc;
    assert.strictEqual(ycc.character.ycc_yuchengchen.group, "yao");
    assert.strictEqual(ycc.character.ycc_yuchengchen.hp, 4);
    const qinzheng = ycc.skill.ycc_qinzheng;
    const qinzhengPlayer = {
        storage: {
            ycc_qinzheng_no_support: 3,
            ycc_qinzheng_watch_round: 2,
        },
        skills: new Set(["ycc_huangming"]),
        awakenedSkills: [],
        maxHp: 4,
        awakenSkill(skill) {
            this.awakenedSkills.push(skill);
        },
        async loseMaxHp() {
            this.maxHp--;
        },
        isIn: () => true,
        removeSkill(name) {
            this.skills.delete(name);
        },
        addSkill(name) {
            this.skills.add(name);
        },
        changeSkin(source, skin) {
            assert.strictEqual(source.characterName, "ycc_yuchengchen");
            assert.ok(this.awakenedSkills.includes("ycc_qinzheng"));
            assert.ok(this.skills.has("ycc_longji"));
            assert.strictEqual(this.maxHp, 3);
            this.portrait = skin;
        },
    };
    assert.strictEqual(qinzheng.trigger.player, "phaseZhunbeiBegin");
    assert.strictEqual(qinzheng.filter({}, qinzhengPlayer), true);
    await qinzheng.content({}, {}, qinzhengPlayer);
    assert.strictEqual(qinzheng.filter({}, qinzhengPlayer), false);
    assert.strictEqual(qinzhengPlayer.maxHp, 3);
    assert.strictEqual(context.window.nihilModules.ycc.skill.ycc_handlimit.mod.maxHandcard(qinzhengPlayer, 3), 4);
    assert.strictEqual(qinzhengPlayer.skills.has("ycc_huangming"), false);
    assert.strictEqual(qinzhengPlayer.skills.has("ycc_longji"), true);
    assert.strictEqual(qinzhengPlayer.portrait, "ycc_yuchengchen_qinzheng");
    const qinzhengLog = game.semanticLogs
        .flat()
        .filter(part => typeof part === "string")
        .join("|");
    assert.ok(qinzhengLog.includes("失去【皇命】，获得【龙殛】，手牌上限+1"), "亲征技能替换应写入语义战报");

    // 有合法敌方：即使通用牌效为负，AI 仍发动，并保证敌方目标优先于队友。
    {
        const enemy = new MockPlayer("enemy", { handCount: 2 });
        const ally = new MockPlayer("ally", { handCount: 3 });
        const player = new MockPlayer("ycc", {
            handCount: 5,
            attitudes: { enemy: -5, ally: 5 },
            legalTargets: ["enemy", "ally"],
        });
        await runPlayEnd(player, [enemy, ally]);
        assert.strictEqual(player.chooseBoolCalls, 1);
        assert.strictEqual(player.chooseUseTargetCalls, 1, "有合法敌方时 AI 应发动御策");
        assert.deepStrictEqual(player.loggedSkills, [], "确认目标前不应记录发动");
        assert.strictEqual(player.lastUseConfig.logSkill, "ycc_yuce");
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
        await runPlayEnd(player, [ally]);
        await runYucePhase(player, "phaseDiscardEnd");
        assert.strictEqual(player.chooseBoolCalls, 1, "有合法目标时不得吞掉人类玩家提示");
        assert.strictEqual(player.chooseUseTargetCalls, 0, "只有队友时 AI 不应发动御策");
        assert.strictEqual(player.handCount, 5, "最高且放弃出杀时没有摸牌选项");
    }

    // 完全没有合法目标：不显示无效提示。
    {
        const enemy = new MockPlayer("enemy", { handCount: 3 });
        const player = new MockPlayer("ycc", {
            handCount: 5,
            attitudes: { enemy: -5 },
        });
        await runPlayEnd(player, [enemy]);
        await runYucePhase(player, "phaseDiscardEnd");
        assert.strictEqual(player.chooseBoolCalls, 0);
        assert.strictEqual(player.chooseUseTargetCalls, 0);
        assert.strictEqual(player.handCount, 5, "最高但不能出杀时没有摸牌选项");
    }

    // 同一回合的三个时点分别按当时的手牌数判定。
    {
        const enemy = new MockPlayer("enemy", { handCount: 4 });
        const ally = new MockPlayer("ally", { handCount: 3 });
        const player = new MockPlayer("ycc", {
            handCount: 4,
            attitudes: { enemy: -5, ally: 5 },
            legalTargets: ["enemy"],
        });

        const hand = ["shan", "tao", "sha", "jiu"];
        let picked = [];
        let blocked;
        const recasts = [];
        player.canRecast = card => card !== blocked;
        player.countCards = (zone, filter) => filter ? hand.filter(filter).length : player.handCount;
        player.chooseCard = (zone, count, filter) => {
            assert.strictEqual(zone, "h");
            assert.deepStrictEqual(Array.from(count), [1, Infinity]);
            assert.strictEqual(filter("shan", player), "shan" !== blocked);
            return choice({ bool: picked.length > 0, cards: picked });
        };
        player.recast = async cards => recasts.push([...cards]);

        assert.deepStrictEqual(Array.from(yuce.trigger.player), ["phaseUseEnd", "phaseDiscardEnd", "phaseJieshuEnd"]);
        await runPlayEnd(player, [enemy, ally]);
        assert.strictEqual(player.chooseUseTargetCalls, 1, "并列最高可出杀");
        assert.strictEqual(player.handCount, 4);
        assert.strictEqual(yuce.filter({}, player, "phaseJieshuEnd"), false, "并列最高不算居中");

        player.handCount = 3;
        assert.strictEqual(yuce.filter({}, player, "phaseJieshuEnd"), false, "并列最低不算居中");
        await runYucePhase(player, "phaseDiscardEnd");
        assert.strictEqual(player.handCount, 5, "弃牌阶段结束时并列最低可摸两张");
        player.handCount = 4;
        assert.strictEqual(yuce.filter({}, player, "phaseDiscardEnd"), false, "手牌居中不能摸两张");

        enemy.handCount = 5;
        await runYucePhase(player, "phaseJieshuEnd");
        assert.deepStrictEqual(recasts, []);
        blocked = "shan";
        picked = hand.slice(1);
        await runYucePhase(player, "phaseJieshuEnd");
        assert.deepStrictEqual(recasts, [hand.slice(1)]);
        assert.strictEqual(player.handCount, 4, "重铸全部可选牌但留有手牌时没有奖励");
        blocked = null;
        picked = [...hand];
        await runYucePhase(player, "phaseJieshuEnd");
        assert.deepStrictEqual(recasts[1], hand);
        assert.strictEqual(player.handCount, 5, "重铸全部四张手牌额外摸一张");

    }

    await checkRecastAI();
    await checkLongji();
    await checkLixing();
    console.log("ycc skill behavior and AI smoke tests passed");
}

function choice(result, check) {
    const config = {};
    return {
        set(key, value) { config[key] = value; return this; },
        async forResult() {
            if (check) check(config);
            return result;
        },
    };
}

async function checkRecastAI() {
    const owner = new MockPlayer("rui", { attitudes: { near: -5, second: -5, ally: 5 } });
    let hand, selected;
    owner.getCards = () => hand;
    owner.countCards = (zone, filter) => filter ? hand.filter(filter).length : hand.length;
    owner.isZhu2 = () => true;
    owner.awakenedSkills = [];
    owner.canRecast = card => !card.blocked;
    owner.getVEquip = () => owner.armor;
    owner.hasSkillTag = () => owner.armorDisabled;
    get.player = () => owner;
    get.name = card => card.name;
    get.value = card => card.name === "tao" ? 9 : 4;
    owner.chooseCard = () => ({
        set(k, v) { this[k] = v; return this; },
        async forResult() {
            selected = hand.filter(card => owner.canRecast(card) && this.ai(card) > 0).map(c => c.name);
            return { bool: false };
        },
    });
    const near = new MockPlayer("near", { handCount: 8 });
    const second = new MockPlayer("second", { handCount: 0 });
    const ally = new MockPlayer("ally", { handCount: 0 });
    near.inRange = ally.inRange = target => target === owner;
    let twoThreats = true;
    second.inRange = target => twoThreats && target === owner;
    game.countPlayer = fn => game.players.filter(fn).length;
    game.players = [owner, near, second, ally];
    async function expect(hp, names, expected) {
        owner.hp = hp;
        hand = names.map(name => ({ name }));
        await runYucePhase(owner, "phaseJieshuEnd");
        assert.deepStrictEqual(selected, expected);
        selected = undefined;
    }
    const cards = ["shan", "shan", "tao", "sha"];
    const partial = ["shan", "sha"];
    await expect(4, cards, partial);
    await expect(5, cards, cards);
    owner.armor = true;
    await expect(3, cards, partial);
    await expect(4, cards, cards);
    twoThreats = false;
    await expect(2, cards, partial);
    await expect(3, cards, cards);
    owner.armorDisabled = true;
    await expect(3, cards, partial);
    await expect(4, cards, cards);
    await expect(1, ["sha", "guohe"], ["sha", "guohe"]);
    await expect(1, ["jiu", "shan", "sha"], ["sha"]);
    await expect(1, ["jiu", "shan", "tao"], ["jiu"]);
    await expect(1, ["shan", "tao"], []);
    owner.awakenedSkills = ["ycc_qinzheng"];
    game.players = [owner, near];
    assert.strictEqual(yuce.filter({}, owner, "phaseJieshuEnd"), false);
}

async function checkLongji() {
    const { ycc_longji: longji } = context.window.nihilModules.ycc.skill;
    const target = new MockPlayer("target", { handCount: 2 });
    const owner = new MockPlayer("owner");
    const hand = [{ name: "shan" }, { name: "tao" }];
    const gained = [];
    const actions = [];
    let canGain = true;
    target.showHandcards = async () => actions.push("show all");
    target.countGainableCards = (source, zone) => {
        assert.strictEqual(source, owner);
        assert.strictEqual(zone, "h");
        return canGain ? hand.length : 0;
    };
    owner.gainPlayerCard = (victim, zone, required, visible) => {
        assert.strictEqual(victim, target);
        assert.strictEqual(zone, "h");
        assert.strictEqual(required, true);
        assert.strictEqual(visible, "visible");
        return {
            set() { return this; },
            then(resolve) {
                actions.push("gain one");
                gained.push(hand.shift());
                target.handCount--;
                resolve();
            },
        };
    };
    const sha = { card: { name: "sha" }, target };
    assert.strictEqual(longji.filter(sha, owner), true);
    assert.strictEqual(longji.filter(sha, target), false);
    await longji.content({}, sha, owner);
    assert.deepStrictEqual(actions, ["show all", "gain one"]);
    assert.deepStrictEqual(gained, [{ name: "shan" }]);
    assert.deepStrictEqual(hand, [{ name: "tao" }]);

    canGain = false;
    await longji.content({}, sha, owner);
    assert.deepStrictEqual(actions, ["show all", "gain one", "show all"]);
    assert.deepStrictEqual(hand, [{ name: "tao" }]);
}

async function checkLixing() {
    const skills = context.window.nihilModules.ycc.skill;
    const skill = skills.ycc_lixing;
    const sha = skills.ycc_lixing_sha;
    const tag = "ycc_lixing_sha";
    get.info = id => skills[id] || (id === "acquired_skill" ? {} : undefined);
    get.itemtype = card => card.tags ? "card" : null;
    const makeCard = name => ({
        name,
        tags: new Set(),
        hasGaintag(name) { return this.tags.has(name); },
    });
    const cards = ["tao", "shan", "wuzhong", "jiu", "sha", "guohe"].map(makeCard);
    const [used, , , , untouched, another] = cards;
    const hand = [...cards];
    const discarded = [];
    let active = false;
    const target = {
        id: "target",
        isIn: () => true,
        isDead: () => false,
        getCards(zone, filter = () => true) {
            assert.strictEqual(zone, "h");
            return hand.filter(filter);
        },
        countCards(zone, filter) { return this.getCards(zone, filter).length; },
        addTempSkill(name) {
            assert.strictEqual(name, tag);
            active = true;
        },
        removeSkill(name) {
            assert.strictEqual(name, tag);
            active = false;
            sha.onremove(this);
        },
        addGaintag(cards, name) {
            for (const card of cards) card.tags.add(name);
        },
        removeGaintag(name) {
            for (const card of hand) card.tags.delete(name);
        },
        async discard(cards) {
            for (const card of cards) {
                hand.splice(hand.indexOf(card), 1);
                discarded.push(card);
            }
        },
    };
    let selection;
    const owner = {
        isZhu2: () => true,
        async showCards() { assert.fail("历行转化手牌时不得公开展示"); },
        choosePlayerCard(victim, zone, count, prompt) {
            assert.strictEqual(victim, target);
            assert.strictEqual(zone, "h");
            assert.strictEqual(count, 1);
            assert.ok(prompt.includes("一张手牌"));
            return choice(selection ? { bool: true, cards: selection } : { bool: false }, config => {
                for (const card of selection || [another]) {
                    assert.strictEqual(config.filterButton({ link: card }), true);
                }
            });
        },
    };
    const huangming = { skill: "ycc_huangming", targets: [owner, target] };
    const longji = { skill: "ycc_longji", targets: [target, target] };
    const activeSkill = { skill: "acquired_skill", targets: [target] };
    const log = { ...activeSkill, log_event: { getParent: () => activeSkill } };
    assert.strictEqual(skill.zhuSkill, true);
    assert.strictEqual(skill.round, undefined);
    assert.strictEqual(skill.usable, 1);
    assert.strictEqual(skill.trigger.player.join(","), "useSkill,logSkillBegin");
    assert.deepStrictEqual(Array.from(skill.getIndex(huangming, owner)), [target]);
    assert.deepStrictEqual(Array.from(skill.getIndex(longji, owner)), [target]);
    assert.deepStrictEqual(Array.from(skill.getIndex(activeSkill, owner)), [target]);
    assert.deepStrictEqual(Array.from(skill.getIndex(log, owner)), []);
    assert.deepStrictEqual(Array.from(skill.getIndex({ skill: "ycc_lixing", targets: [target] }, owner)), []);
    assert.strictEqual(skill.filter(huangming, { isZhu2: () => false }, "logSkillBegin", target), false);
    assert.strictEqual(skill.filter(huangming, owner, "logSkillBegin", target), true);

    const declined = { indexedData: target };
    await skill.cost(declined, huangming, owner);
    assert.strictEqual(declined.result, undefined);

    selection = [untouched];
    const event = { indexedData: target };
    await skill.cost(event, huangming, owner);
    await skill.content(event.result, huangming, owner);
    assert.strictEqual(active, true);
    assert.strictEqual(sha.mod.cardname(untouched), "sha");
    assert.strictEqual(sha.mod.cardnature(untouched), false);
    assert.strictEqual(sha.mod.cardname(used), undefined);
    target.removeSkill(tag); // 引擎在回合结束时移除临时技能
    assert.strictEqual(active, false);
    assert.strictEqual(sha.mod.cardname(untouched), undefined);
    assert.deepStrictEqual(hand, cards);
    assert.deepStrictEqual(discarded, []);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
