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

const game = {
    players: [], dead: [], phaseNumber: 1, roundNumber: 1,
    hasPlayer(filter) {
        return this.players.some(filter);
    },
};

function makePlayer(id, initialSkills, identity) {
    return {
        id,
        playerid: id,
        identity: identity || "zhong",
        inGame: true,
        skills: new Set(initialSkills || []),
        attitudes: {},
        marks: new Set(),
        logs: [],
        isIn() { return this.inGame; },
        hasSkill(skill) { return this.skills.has(skill); },
        addSkill(skill) { this.skills.add(skill); },
        removeSkill(skill) { this.skills.delete(skill); this.marks.delete(skill); },
        markSkill(skill) { this.marks.add(skill); },
        syncSkills() {},
        logSkill(skill, target) { this.logs.push({ skill, target }); },
        chooseTarget(prompt, prompt2, filter) {
            this.lastTargetChoice = immediateChoice(settings => {
                let best = null;
                let bestScore = 0;
                game.players.forEach(target => {
                    if (!filter(null, this, target)) return;
                    const score = Number(settings.ai(target)) || 0;
                    if (score > bestScore) {
                        bestScore = score;
                        best = target;
                    }
                });
                return { bool: !!best, targets: best ? [best] : [] };
            });
            return this.lastTargetChoice;
        },
    };
}

const context = {
    window: {},
    game,
    get: {
        attitude(from, to) {
            if (from === to) return 5;
            return Number(from.attitudes[to.id]) || 0;
        },
        value() { return 1; },
    },
    lib: { filter: { cardRespondable() { return true; } } },
    ui: {}, ai: {}, _status: { event: {} }, console,
    Math, Number, Object, Set, Array, isFinite,
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

const moduleDef = context.window.nihilModules.huojing_rewrite;
const skills = moduleDef.skill;
const hooks = moduleDef.testHooks;
const aiHelpers = moduleDef.aiHelpers;
const ZHANSHUAI = "nihil_zhanshuai";
const SHUAI = "nihil_shuai";

async function startRound(observer, round) {
    game.roundNumber = round;
    assert.strictEqual(skills.nihil_zhanshuai_ai_round.filter({}, observer), true);
    await skills.nihil_zhanshuai_ai_round.content({}, {}, observer);
}

async function recordSlash(observer, source, damageSpecs, useOptions) {
    const useEvent = Object.assign(
        { player: source, card: { name: "sha" }, targets: [] },
        useOptions || {},
    );
    assert.strictEqual(skills.nihil_zhanshuai_ai_slash_use.filter(useEvent, observer), true);
    await skills.nihil_zhanshuai_ai_slash_use.content({}, useEvent, observer);
    for (const spec of damageSpecs) {
        const data = typeof spec === "number" ? { num: spec } : spec;
        const parent = data.chain ? { name: "_lianhuan" } : { name: "sha" };
        const damageEvent = {
            source,
            player: data.target || {},
            card: { name: "sha" },
            num: data.num,
            notLink() { return !data.chain; },
            getParent(name) { return name === "useCard" ? useEvent : parent; },
        };
        assert.strictEqual(
            skills.nihil_zhanshuai_ai_slash_damage.filter(damageEvent, observer),
            true,
        );
        await skills.nihil_zhanshuai_ai_slash_damage.content({}, damageEvent, observer);
    }
    return useEvent;
}

async function testFrozenGlobalStatsAndCommanderChoice() {
    const huojing = makePlayer("huojing", [ZHANSHUAI]);
    const strong = makePlayer("strong");
    const weak = makePlayer("weak");
    const traitor = makePlayer("traitor", [], "nei");
    game.players = [huojing, strong, weak, traitor];
    game.dead = [];
    huojing.attitudes = { strong: 5, weak: 4, traitor: 5 };
    hooks.setCommander(huojing);

    await startRound(huojing, 1);
    await recordSlash(
        huojing,
        strong,
        [{ num: 3 }, { num: 3 }, { num: 8, chain: true }],
        { jiu_add: 1, _nihilXiegongDamageBonus: 1 },
    );
    await recordSlash(huojing, weak, [1]);
    await recordSlash(huojing, traitor, [20]);
    await recordSlash(huojing, huojing, [30]);

    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(aiHelpers.getSlashStats(strong))),
        { rounds: 0, uses: 0, hits: 0, damage: 0 },
        "本轮实时数据在轮末冻结前不得影响换帅",
    );
    await skills.nihil_zhanshuai_change.content({}, {}, huojing);
    assert.strictEqual(hooks.getCommander(), huojing, "第一轮内仍应使用空冻结快照");

    await startRound(huojing, 2);
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(aiHelpers.getSlashStats(strong))),
        { rounds: 1, uses: 1, hits: 1, damage: 2 },
        "同一杀的两次直击应累计2伤但只记1个H；酒、协攻和传导伤害均被剔除",
    );
    await skills.nihil_zhanshuai_change.content({}, {}, huojing);
    assert.strictEqual(hooks.getCommander(), strong, "应从冻结快照中选择最高分友方");
    assert.strictEqual(traitor.hasSkill(SHUAI), false, "即使分数和态度很高也不得把帅交给内奸");
    assert.strictEqual(huojing.hasSkill(SHUAI), false, "霍旌参与统计但不能参与换帅排名");

    await recordSlash(huojing, weak, [3]);
    await recordSlash(huojing, weak, [3]);
    await skills.nihil_zhanshuai_change.content({}, {}, huojing);
    assert.strictEqual(
        hooks.getCommander(),
        strong,
        "第二轮尚未冻结的高伤数据不能立即改变决策",
    );

    await startRound(huojing, 3);
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(aiHelpers.getSlashStats(weak))),
        { rounds: 2, uses: 3, hits: 3, damage: 7 },
        "冻结快照应是所有完整参与轮的累计统计，并包含零出杀轮",
    );
    await skills.nihil_zhanshuai_change.content({}, {}, huojing);
    assert.strictEqual(hooks.getCommander(), weak, "累计分数严格更高的友方应接任帅");
}

testFrozenGlobalStatsAndCommanderChoice()
    .then(() => console.log("huojing AI runtime tests passed"))
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
