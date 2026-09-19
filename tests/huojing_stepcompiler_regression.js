"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function compileLikeNonameV113(content) {
    if (content.constructor && content.constructor.name === "AsyncFunction") {
        // AsyncCompiler -> ArrayCompiler：保留原函数对象及其词法闭包。
        return function (topVars, event, trigger, player) {
            return content(event, trigger, player);
        };
    }

    // StepCompiler.packStep 的关键行为：抽取函数体后用 FunctionConstructor
    // 重新构造，只注入这六个 topVars，不保留扩展模块的 IIFE 闭包。
    const source = Function.prototype.toString.call(content);
    const body = source.slice(source.indexOf("{") + 1, source.lastIndexOf("}"));
    return new AsyncFunction(
        "topVars",
        "event",
        "trigger",
        "player",
        `
            var { step, source, target, targets, card, cards, skill, forced, num, _result: result } = event;
            var { _status, lib, game, ui, get, ai } = topVars;
            { ${body} }
        `,
    );
}

function makePlayer(id) {
    return {
        playerid: id,
        skills: new Set(["nihil_zhanshuai"]),
        marks: new Set(),
        isIn() {
            return true;
        },
        hasSkill(skill) {
            return this.skills.has(skill);
        },
        addSkill(skill) {
            this.skills.add(skill);
        },
        removeSkill(skill) {
            this.skills.delete(skill);
        },
        syncSkills() {},
        markSkill(skill) {
            this.marks.add(skill);
        },
    };
}

const huojing = makePlayer("huojing");
const game = {
    players: [huojing],
    dead: [],
    phaseNumber: 0,
};
const context = {
    window: {},
    game,
    get: {},
    lib: {},
    ui: {},
    ai: {},
    _status: {},
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

async function main() {
    const skills = context.window.nihilModules.huojing_rewrite.skill;
    Object.entries(skills).forEach(([name, skill]) => {
        if (typeof skill.content !== "function") return;
        assert.strictEqual(
            skill.content.constructor.name,
            "AsyncFunction",
            `${name}.content 引用了模块闭包时必须避开 StepCompiler`,
        );
    });

    const skill = skills.nihil_zhanshuai_init;
    const compiled = compileLikeNonameV113(skill.content);
    await compiled(
        {
            _status: context._status,
            lib: context.lib,
            game: context.game,
            ui: context.ui,
            get: context.get,
            ai: context.ai,
        },
        { step: 0 },
        {},
        huojing,
    );
    assert.strictEqual(
        huojing.hasSkill("nihil_shuai"),
        true,
        "经 v1.11.3 content 编译路径执行后，霍旌应成功成为帅",
    );
    console.log("huojing StepCompiler regression passed");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
