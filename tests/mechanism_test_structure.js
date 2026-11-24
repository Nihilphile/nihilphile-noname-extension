"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const extensionRoot = path.join(root, "test-extensions", "MechanismTest");

function runImport(file, type) {
    let imported;
    const context = {
        window: {},
        console,
        game: {
            import(kind, factory) {
                assert.equal(kind, type);
                imported = factory;
            },
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
    assert.equal(typeof imported, "function");
    return { context, imported };
}

const extensionLoad = runImport(path.join(extensionRoot, "extension.js"), "extension");
const loadedScripts = [];
const extensionLib = {
    assetURL: "/assets/",
    config: { characters: [] },
    translate: {},
    init: {
        jsSync(base, file) {
            loadedScripts.push({ base, file });
        },
    },
};
const extension = extensionLoad.imported(extensionLib, {}, {}, {}, {}, { extension: "MechanismTest" });
assert.equal(extension.name, "MechanismTest");
assert.equal(extension.connect, true);
assert.equal(extension.package.version, "0.2.0");
extension.precontent();
assert.deepEqual(extensionLib.config.characters, ["mechanism_test"]);
assert.deepEqual(loadedScripts, [{ base: "/assets/extension/MechanismTest/", file: "character" }]);
assert.equal(extensionLoad.context.window.MECHANISM_TEST_EXTENSION_NAME, "MechanismTest");

const characterLoad = runImport(path.join(extensionRoot, "character.js"), "character");
characterLoad.context.window.MECHANISM_TEST_EXTENSION_NAME = "MechanismTest";
const pack = characterLoad.imported({}, {}, {}, { translation: value => value }, {}, {});
assert.equal(pack.name, "mechanism_test");
assert.equal(pack.connect, true);
assert.ok(pack.character.mechanism_test_actor);
assert.deepEqual(Array.from(pack.character.mechanism_test_actor[3]), ["mechanism_test_console", "mechanism_test_history"]);
assert.equal(pack.character.mechanism_test_actor[4][0], "ext:MechanismTest/image/character/mechanism_test_actor.svg");
assert.equal(pack.skill.mechanism_test_console.enable, "phaseUse");
assert.equal(pack.translate.mechanism_test_actor, "机制测试员");
assert.equal(pack.translate.mechanism_test_console_info.includes("忽略距离和次数且不计次数"), true);
assert.equal(pack.translate.mechanism_test_console_info.includes("移动场上装备/判定牌"), true);

const info = JSON.parse(fs.readFileSync(path.join(extensionRoot, "info.json"), "utf8"));
assert.equal(info.name, "MechanismTest");
assert.equal(info.connect, true);
assert.equal(info.version, "0.2.0");
assert.equal(fs.existsSync(path.join(extensionRoot, "image", "character", "mechanism_test_actor.svg")), true);

for (const file of ["extension.js", "character.js", "info.json", "README.md"]) {
    assert.equal(fs.existsSync(path.join(extensionRoot, file)), true, file);
}

const source = fs.readFileSync(path.join(extensionRoot, "character.js"), "utf8");
assert.equal(source.includes("forbidai"), false);
assert.equal(source.includes("nihil_"), false);
assert.equal(source.includes("!excludeSelf ||"), false, "remote chooseTarget callbacks must not capture excludeSelf");
assert.equal(source.includes("return CANCEL"), false, "remote AI callback must not capture CANCEL");
assert.equal(source.includes('forced: false'), true, "gain/discard choices must remain cancellable");
assert.equal(source.includes('nodistance: true'), true);
assert.equal(source.includes('addCount: false'), true);
assert.equal(source.includes('cards: []'), true, "materialless slash must use an explicit empty material list");
assert.equal(source.includes('player.moveCard({'), true);
assert.equal(source.includes('game.cardsGotoPile(cards.slice().reverse(), "insert")'), true);
assert.equal(source.includes('Object.keys(lib.card)'), true);

console.log("mechanism_test_structure: PASS");
