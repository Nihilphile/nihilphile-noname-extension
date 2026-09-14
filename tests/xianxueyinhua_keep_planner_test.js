"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadAiHelpers() {
    const forbiddenCalls = Object.create(null);
    const forbidden = name => function () {
        forbiddenCalls[name] = (forbiddenCalls[name] || 0) + 1;
        throw new Error("留牌规划器不应调用 get." + name);
    };
    const context = {
        window: {},
        game: {},
        get: {
            effect: forbidden("effect"),
            effect_use: forbidden("effect_use"),
            useful: forbidden("useful"),
            value: forbidden("value"),
        },
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
    assert.strictEqual(typeof module.aiHelpers.chooseCardsToKeep, "function");
    return { helpers: module.aiHelpers, forbiddenCalls };
}

function card(id, name, options) {
    return Object.assign({
        id,
        name,
        type: name === "sha" || name === "shan" || name === "tao" || name === "jiu" ? "basic" : "trick",
    }, options || {});
}

function snapshot(overrides) {
    return Object.assign({
        hp: 3,
        hasBlood: true,
        handLimit: 5,
        handCards: [],
        hasTwoHpEnemyInRange: false,
        remainingUsableSlashCount: 0,
    }, overrides || {});
}

function entryMap(plan) {
    assert.ok(plan && Array.isArray(plan.entries), "留牌计划必须返回 entries 数组");
    const result = new Map();
    plan.entries.forEach(entry => {
        assert.ok(entry && entry.card && entry.card.id, "每个 entry 必须保留原卡牌对象");
        result.set(entry.card.id, entry);
    });
    return result;
}

function ids(cards) {
    assert.ok(Array.isArray(cards), "keptCards/discardedCards 必须是数组");
    return Array.from(cards, current => current.id);
}

function tierOf(plan, id) {
    const entry = entryMap(plan).get(id);
    assert.ok(entry, "计划中缺少卡牌 " + id);
    return entry.tier;
}

function summarize(plan) {
    return {
        entries: Array.from(plan.entries, entry => ({
            id: entry.card.id,
            tier: entry.tier,
            reason: entry.reason || null,
            keepScore: entry.keepScore == null ? null : entry.keepScore,
        })),
        kept: ids(plan.keptCards),
        discarded: ids(plan.discardedCards),
        naturalOverflow: plan.naturalOverflow,
        canKeepAllRemainingSlash: plan.canKeepAllRemainingSlash,
    };
}

function main() {
    const { helpers, forbiddenCalls } = loadAiHelpers();
    const chooseCardsToKeep = helpers.chooseCardsToKeep;

    // 1. 未形成两杀组的普通【杀】没有“爆发种子”加成。
    {
        const sha = card("sha-1", "sha");
        const plan = chooseCardsToKeep(snapshot({
            handCards: [sha],
            remainingUsableSlashCount: 1,
        }));
        assert.strictEqual(tierOf(plan, sha.id), 5);
    }

    // 2-3. 范围内有2血敌方时仅前两张杀进入Tier 3，第三张仍为Tier 5。
    {
        const shas = [card("sha-a", "sha"), card("sha-b", "sha"), card("sha-c", "sha")];
        const plan = chooseCardsToKeep(snapshot({
            handCards: shas,
            hasTwoHpEnemyInRange: true,
            remainingUsableSlashCount: 3,
        }));
        assert.strictEqual(tierOf(plan, "sha-a"), 3);
        assert.strictEqual(tierOf(plan, "sha-b"), 3);
        assert.strictEqual(tierOf(plan, "sha-c"), 5);
    }

    // 4. 任意状态至多两张闪/桃/酒进入Tier 1，且2血以上为桃>闪>酒。
    {
        const cards = [
            card("jiu-1", "jiu"),
            card("shan-1", "shan"),
            card("tao-1", "tao"),
            card("shan-2", "shan"),
        ];
        const plan = chooseCardsToKeep(snapshot({ hp: 3, handCards: cards }));
        const tierOne = Array.from(plan.entries)
            .filter(entry => entry.tier === 1)
            .map(entry => entry.card.id);
        assert.deepStrictEqual(tierOne.slice().sort(), ["shan-1", "tao-1"]);
        assert.strictEqual(tierOne.length, 2);
        assert.strictEqual(tierOf(plan, "tao-1"), 1);
        assert.strictEqual(tierOf(plan, "shan-1"), 1);
        assert.notStrictEqual(tierOf(plan, "jiu-1"), 1);
        assert.notStrictEqual(tierOf(plan, "shan-2"), 1);
    }

    // 5. 只有一张防御牌时不会虚构第二个Tier 1槽位。
    {
        const onlyDefense = card("shan-only", "shan");
        const plan = chooseCardsToKeep(snapshot({
            handCards: [onlyDefense, card("junk-1", "junk")],
        }));
        assert.strictEqual(plan.entries.filter(entry => entry.tier === 1).length, 1);
        assert.strictEqual(tierOf(plan, onlyDefense.id), 1);
    }

    // 6. 1血无缠、上限1时，唯一位置留给桃>酒>闪中的最高者。
    {
        const cards = [
            card("jiu-lowhp", "jiu"),
            card("shan-lowhp", "shan"),
            card("tao-lowhp", "tao"),
            card("sha-lowhp", "sha"),
        ];
        const plan = chooseCardsToKeep(snapshot({
            hp: 1,
            hasBlood: false,
            handLimit: 1,
            handCards: cards,
            remainingUsableSlashCount: 1,
        }));
        assert.deepStrictEqual(ids(plan.keptCards), ["tao-lowhp"]);
    }

    // 7-8. 1血有缠时，仅有效防具和有效+1马由Tier 2晋升Tier 1.5。
    {
        const armor = card("armor", "armor", {
            type: "equip",
            subtype: "equip2",
            structureTier2: true,
        });
        const plusHorse = card("plus-horse", "plus_horse", {
            type: "equip",
            subtype: "equip3",
            structureTier2: true,
        });
        const weapon = card("weapon", "weapon", {
            type: "equip",
            subtype: "equip1",
            structureTier2: true,
        });
        const minusHorse = card("minus-horse", "minus_horse", {
            type: "equip",
            subtype: "equip4",
            structureTier2: true,
        });
        const plan = chooseCardsToKeep(snapshot({
            hp: 1,
            hasBlood: true,
            handLimit: 6,
            handCards: [armor, plusHorse, weapon, minusHorse],
        }));
        assert.strictEqual(tierOf(plan, armor.id), 1.5);
        assert.strictEqual(tierOf(plan, plusHorse.id), 1.5);
        assert.strictEqual(tierOf(plan, weapon.id), 2);
        assert.strictEqual(tierOf(plan, minusHorse.id), 2);
    }

    // 9. 过拆/顺手的留牌分层不得调用目标收益或通用价值链。
    {
        const plan = chooseCardsToKeep(snapshot({
            handCards: [
                card("guohe", "guohe"),
                card("shunshou", "shunshou"),
            ],
        }));
        assert.strictEqual(tierOf(plan, "guohe"), 4);
        assert.strictEqual(tierOf(plan, "shunshou"), 4);
        assert.deepStrictEqual(Object.keys(forbiddenCalls), []);
    }

    // 10. 同一局面重复计算必须得到完全一致的结果。
    {
        const state = snapshot({
            handLimit: 3,
            handCards: [
                card("same-sha-1", "sha"),
                card("same-sha-2", "sha"),
                card("same-shan-1", "shan"),
                card("same-shan-2", "shan"),
            ],
            hasTwoHpEnemyInRange: true,
            remainingUsableSlashCount: 2,
        });
        const first = summarize(chooseCardsToKeep(state));
        const second = summarize(chooseCardsToKeep(state));
        assert.deepStrictEqual(second, first);
    }

    // 11. 有一张废牌会弃，不代表两张剩余杀无法全部保留。
    {
        const state = snapshot({
            handLimit: 2,
            handCards: [
                card("kept-sha-1", "sha"),
                card("kept-sha-2", "sha"),
                card("discard-junk", "junk"),
            ],
            hasTwoHpEnemyInRange: true,
            remainingUsableSlashCount: 2,
        });
        const plan = chooseCardsToKeep(state);
        assert.strictEqual(plan.naturalOverflow, 1);
        assert.deepStrictEqual(ids(plan.keptCards).sort(), ["kept-sha-1", "kept-sha-2"]);
        assert.deepStrictEqual(ids(plan.discardedCards), ["discard-junk"]);
        assert.strictEqual(plan.canKeepAllRemainingSlash, true);
    }

    // 12. 丹恩摸牌改变同一快照后，必须按最新真实手牌重新生成计划。
    {
        const state = snapshot({
            handLimit: 3,
            handCards: [
                card("draw-sha-1", "sha"),
                card("draw-sha-2", "sha"),
                card("draw-junk", "junk"),
            ],
            hasTwoHpEnemyInRange: true,
            remainingUsableSlashCount: 2,
        });
        const before = chooseCardsToKeep(state);
        assert.deepStrictEqual(ids(before.discardedCards), []);

        state.handCards.push(card("danen-tao", "tao"));
        const after = chooseCardsToKeep(state);
        assert.strictEqual(after.entries.length, 4);
        assert.deepStrictEqual(ids(after.keptCards).sort(), ["danen-tao", "draw-sha-1", "draw-sha-2"]);
        assert.deepStrictEqual(ids(after.discardedCards), ["draw-junk"]);
    }

    console.log("xianxueyinhua keep planner tests passed");
}

main();
