"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const gameRoot = path.resolve(__dirname, "..", "..");
const runtimeName = fs.readdirSync(gameRoot).find(name => name.includes("v1.11.3-win32-x64"));
assert.ok(runtimeName, "missing 1.11.3 runtime source");
const appRoot = path.join(gameRoot, runtimeName, "resources", "app");

const contentPath = path.join(appRoot, "noname", "library", "element", "content.js");
const playerPath = path.join(appRoot, "noname", "library", "element", "player.js");
const gamePath = path.join(appRoot, "noname", "game", "index.js");
const standardPath = path.join(appRoot, "card", "standard.js");
for (const file of [contentPath, playerPath, gamePath, standardPath]) assert.equal(fs.existsSync(file), true, file);

const content = fs.readFileSync(contentPath, "utf8");
const chooseStart = content.indexOf("chooseUseTarget: [");
const chooseEnd = content.indexOf("async chooseToDuiben", chooseStart);
assert.ok(chooseStart >= 0 && chooseEnd > chooseStart);
const chooseUseTarget = content.slice(chooseStart, chooseEnd);
const usableAt = chooseUseTarget.indexOf("lib.filter.cardUsable(card, player, evt)");
const rangeAt = chooseUseTarget.indexOf("lib.filter.targetInRange(card2, player2, target)");
const enabledAt = chooseUseTarget.indexOf("lib.filter.targetEnabledx(card2, player2, target)");
const useAt = chooseUseTarget.indexOf("player.useCard(...args)");
assert.ok(usableAt >= 0, "chooseUseTarget must check normal card quota");
assert.ok(chooseUseTarget.includes('event.addCount !== false && !lib.filter.cardUsable(card, player, evt)'), "addCount=false must bypass quota gate");
assert.ok(chooseUseTarget.includes('event.nodistance ? false : null'), "nodistance must bypass range in canUse path");
assert.ok(rangeAt > usableAt, "range check must follow card usable gate");
assert.ok(enabledAt > rangeAt, "target prohibition check must be present");
assert.ok(useAt > enabledAt, "successful target choice must enter native useCard");

const player = fs.readFileSync(playerPath, "utf8");
assert.ok(player.includes("if (event.addCount === false) {\n        next.addCount = false;"), "choose event must propagate addCount=false to native useCard");
const damageStart = player.indexOf("damage(params) {");
const damageEnd = player.indexOf("recover(params)", damageStart);
const damage = player.slice(damageStart, damageEnd > damageStart ? damageEnd : damageStart + 5000);
assert.ok(damage.includes("Object.assign(next, params)"), "damage object form must preserve source/num/nature");
assert.ok(damage.includes("if (params.nocard)"), "damage object form must support nocard");

const moveStart = content.indexOf("async moveCard(event, trigger, player)");
const moveEnd = content.indexOf("useCard: [", moveStart);
assert.ok(moveStart >= 0 && moveEnd > moveStart);
const moveCard = content.slice(moveStart, moveEnd);
assert.ok(moveCard.includes("target.canEquip(js[i]" ) === false, "judge cards must not use equip legality");
assert.ok(moveCard.includes("target.canAddJudge(js[i])"), "judge movement must respect canAddJudge");
assert.ok(moveCard.includes("target.canEquip(es[i], _status.event.canReplace)"), "equipment movement must respect slot/replacement legality");
assert.ok(moveCard.includes("waiting = targets[1].equip(link)"), "equipment movement must enter native equip event");
assert.ok(moveCard.includes("waiting = targets[1].addJudge(link, link?.cards)"), "judge movement must enter native addJudge event");

const game = fs.readFileSync(gamePath, "utf8");
const createStart = game.indexOf("createCard2() {");
assert.ok(createStart >= 0);
assert.ok(game.slice(createStart, createStart + 300).includes("delete card.storage.vanish"));
const pileStart = game.indexOf("$cardsGotoPile(event2)");
assert.ok(pileStart >= 0);
const pileMove = game.slice(pileStart, pileStart + 1200);
assert.ok(pileMove.includes("pile.insertBefore(cards[i], pile.firstChild)"), "insert mode must put each card on top");

const standard = fs.readFileSync(standardPath, "utf8");
const jiedaoStart = standard.indexOf("jiedao: {");
const jiedaoEnd = standard.indexOf("wuxie: {", jiedaoStart);
assert.ok(jiedaoStart >= 0 && jiedaoEnd > jiedaoStart);
const jiedao = standard.slice(jiedaoStart, jiedaoEnd);
assert.ok(jiedao.includes('chooseToUse("对"'), "jiedao must request native slash use from weapon holder");
assert.ok(jiedao.includes('.set("addCount", false)'), "jiedao slash must naturally skip phase-use slash count");

console.log("mechanism_test_engine_contract: PASS");
