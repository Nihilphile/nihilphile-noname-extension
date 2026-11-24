"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gameRoot = path.resolve(__dirname, "..", "..");
const runtimeName = fs.readdirSync(gameRoot).find(name => name.includes("v1.11.3-win32-x64"));
assert.ok(runtimeName, "missing 1.11.3 runtime source");
const enginePath = path.join(gameRoot, runtimeName, "resources", "app", "noname", "library", "index.js");
const engine = fs.readFileSync(enginePath, "utf8");
const start = engine.indexOf("characterDisabled: function(");
const end = engine.indexOf("characterDisabled2: function(", start);
assert.ok(start >= 0 && end > start, "native characterDisabled method must exist");
const extensionSource = fs.readFileSync(path.join(__dirname, "..", "nihilphile武将包", "extension.js"), "utf8");
const luofei = "nihil_jie_luofei";
const legacy = ["nihil_xianxueyinhua", "nihil_jianhua", "nihil_shencangfeng", "nihil_wuyou"];

function load(forbidai, mode) {
    const lib = {
        assetURL: "", group: ["yao"], groupnature: {}, translate: {},
        config: { forbidai, forbidai_user: [luofei], banned: [], forbiddouble: [], mode },
        character: { [luofei]: {}, nihil_yinhua: {}, other_ban: {} },
        characterFilter: {}, init: { jsSync() {} },
    };
    const status = { mode: mode === "versus" ? "two" : "normal" };
    const get = { mode: () => lib.config.mode, config: key => lib.config[key] };
    let extension;
    const game = { import(type, factory) { extension = factory(lib, game, {}, get, {}, status); } };
    const context = vm.createContext({ lib, game, get, _status: status, window: {} });
    vm.runInContext(extensionSource, context);
    const disabled = vm.runInContext("({" + engine.slice(start, end) + "}).characterDisabled", context);
    return { lib, extension, disabled };
}

let cases = 0;
for (const mode of ["identity", "versus"]) {
    for (const stale of [undefined, [], [luofei, "other_ban", luofei, "nihil_yinhua", ...legacy]]) {
        const { lib, extension, disabled } = load(stale, mode);
        for (let reload = 0; reload < 3; reload++) {
            extension.precontent();
            assert.equal(lib.config.forbidai.includes(luofei), false, `${mode}: stale god Luofei ban must be removed`);
            assert.equal(Boolean(disabled(luofei)), false, `${mode}: god Luofei must be eligible in the native selection filter`);
            assert.equal(Boolean(disabled("nihil_yinhua")), true, "Yinhua automatic ban must remain");
            assert.equal(lib.config.forbidai.filter(id => id === "nihil_yinhua").length, 1, "reload must not duplicate Yinhua ban");
            for (const id of legacy) assert.equal(lib.config.forbidai.includes(id), false, "existing legacy cleanup must remain");
            assert.deepEqual(lib.config.forbidai_user, [luofei], "explicit user AI bans must not be modified");
            if (stale && stale.includes("other_ban")) {
                assert.equal(Boolean(disabled("other_ban")), true, "unrelated automatic bans must remain");
            }
        }
        lib.config.banned.push(luofei);
        extension.precontent();
        assert.deepEqual(lib.config.banned, [luofei], "explicit mode ban must not be modified");
        assert.equal(Boolean(disabled(luofei)), true, "explicit mode ban must still exclude god Luofei");
        cases++;
    }
}
console.log(`jie_luofei_selection_test: PASS (${cases} scenarios, 3 repeated loads each; native characterDisabled)`);
