"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
    const phase = { getParent: () => undefined };
    const status = { currentPhase: null, event: phase };
    const ui = { selected: { cards: [], buttons: [] } };
    const get = {
        cacheEffectUse: () => 7, buttonValue: () => 8,
        name: card => card.name, suit: card => card.suit,
        position: card => card.zone, owner: card => card.owner,
        prompt: () => "", translation: () => "目标", event: () => status.event,
        itemtype: card => card.zone ? "card" : null,
        attitude: (a, b) => a.side === b.side ? 5 : -5,
        effect(target, card, source, viewer) {
            if (target.armor === "tengjia3" && !card.nature) return 0;
            if (target.armor === "renwang_skill" && card.suit === "spade") return 0;
            return -get.attitude(viewer, target);
        },
    };
    const game = {
        players: [],
        filterPlayer(fn) { return this.players.filter(fn); },
        hasPlayer(fn) { return this.players.some(fn); },
        hasNature(card, nature) { return nature ? card.nature === nature : !!card.nature; },
    };
    const lib = { filter: { cardEnabled: () => true, cardUsable: () => true, targetEnabled: () => true, cardRespondable: () => true } };
    function person(side, size) {
        const p = {
            side, size, known: [], hp: 3, armor: null, limit: 4, lord: false,
            isIn: () => true, isPhaseUsing: () => true, isZhu2() { return this.lord; },
            countCards() { return this.size; }, getKnownCards() { return this.known; },
            needsToDiscard(add = 0) { return Math.max(0, this.size + add - this.limit); },
            hasSkill(name) { return ["ycc_huangming", "ycc_lixing", "ycc_yuce", this.armor].includes(name); },
            hasSkillTag: () => false, canUse(card, target) { return this !== target; },
            getStat() { return this.triggerSkill ||= {}; }, getCardUsable: () => 1, getCards() { return this.known; },
            countGainableCards() { return this.size; },
            countDiscardableCards(by, zone) {
                return (zone.includes("h") ? this.size : 0) + (zone.includes("e") ? this.equips || 0 : 0);
            },
        };
        game.players.push(p);
        return p;
    }
    const owner = person(1, 3), ally = person(1, 5), victim = person(-1, 1), enemy = person(-1, 1);
    const context = { window: {}, game, get, lib, ui, _status: status };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../nihilphile武将包/module/ycc.js"), "utf8"), context);
    const mod = context.window.nihilModules.ycc;
    const observe = mod.skill.ycc_huangming_observe;
    async function emit(trigger) {
        if (observe.filter(trigger, owner)) await observe.content({}, trigger, owner);
    }
    async function scores() {
        let result;
        owner.chooseTarget = () => ({
            set(k, v) { this[k] = v; return this; },
            async forResult() {
                result = [this.ai(ally), this.ai(enemy)];
                return { bool: false };
            },
        });
        await mod.skill.ycc_huangming.content({}, { targets: [victim] }, owner);
        return result;
    }
    async function respond(parent, bool) {
        await emit({ name: "chooseToRespond", player: ally, respondTo: [enemy, parent.card],
            getParent: () => parent, result: { bool } });
    }
    async function gain(names, visible = false) {
        const cards = names.map(name => ({ name, suit: "heart", zone: "h", owner: ally }));
        ally.size += cards.length;
        if (visible) ally.known.push(...cards);
        await emit({ name: "gain", player: ally, cards });
        return cards;
    }
    return { status, scores, gain, respond, owner, ally, victim, enemy, mod, get, ui, lib };
}

async function testAllyResponse() {
    const { owner, ally, victim, enemy, status, get, mod } = fixture();
    status.currentPhase = owner;
    const card = { name: "sha", zone: "h" };
    const actions = [];
    ally.equips = 1;
    get.order = () => 3;
    get.card = () => card;
    get.info = () => ({});
    get.effect = () => -8;
    owner.logSkill = () => {};
    owner.chooseTarget = () => ({
        set() { return this; },
        async forResult() { return { bool: true, targets: [ally] }; },
    });
    ally.chooseToUse = request => ({
        async forResult() {
            const previous = status.event;
            status.event = { ...request, player: ally };
            try {
                if (!ally.hasCardToUse || request.ai1(card) <= 0 || request.ai2(victim) <= 0) return { bool: false };
                return { bool: true, card, targets: [victim] };
            } finally {
                status.event = previous;
            }
        },
    });
    ally.useResult = async () => actions.push("追杀");
    ally.draw = async () => actions.push("摸一");
    owner.discardPlayerCard = (target, zone, forced) => {
        assert.equal(target, ally);
        assert.equal(zone, "he");
        assert.equal(forced, true);
        actions.push("由瑞弃牌");
        return { player: owner, target, set(key, value) {
            this[key] = value;
            if (key === "ai") {
                const previous = status.event;
                status.event = this;
                const h = this.ai({ link: { zone: "h" } }), e = this.ai({ link: { zone: "e" } });
                status.event = previous;
                assert.ok(this.preferredZone === "h" ? h > e : e > h);
                actions.push(this.preferredZone);
            }
            return this;
        } };
    };
    async function check(own, teammate, canUseSha, expected) {
        owner.size = own;
        ally.size = teammate;
        ally.hasCardToUse = canUseSha;
        victim.size = enemy.size = 2;
        actions.length = 0;
        await mod.skill.ycc_huangming.content({}, { targets: [victim] }, owner);
        assert.deepEqual(actions, expected);
    }
    await check(4, 4, true, ["追杀", "摸一"]);
    await check(5, 4, true, ["追杀", "摸一"]);
    await check(3, 4, true, ["由瑞弃牌", "h"]);
    await check(3, 5, true, ["追杀", "摸一"]);
    await check(4, 4, false, ["由瑞弃牌"]);
    await check(2, 2, false, ["由瑞弃牌", "e"]);
}

async function main() {
    await testAllyResponse();
    const f = fixture();
    const { owner, ally, victim, enemy, mod } = f;
    async function follow() { return (await f.scores())[0] > 0; }
    for (const [hp, threshold] of [[4, 5], [3, 5], [2, 4], [1, 3]]) {
        victim.hp = hp;
        ally.size = threshold - 1;
        assert.equal(await follow(), false);
        ally.size++;
        const [unknown, donor] = await f.scores();
        assert.ok(unknown > 0 && donor > unknown);
    }
    ally.size = 5;
    const parent = { name: "juedou", card: { name: "juedou" }, turn: ally, shaRequired: 2 };
    await f.respond(parent, true);
    parent.shaRequired = 1;
    await f.respond(parent, false);
    assert.equal(await follow(), true, "responding once in a two-Sha exchange is not a miss");
    parent.directHit = true;
    await f.respond(parent, false);
    assert.equal(await follow(), true);
    parent.directHit = false;
    f.lib.filter.cardRespondable = () => false;
    await f.respond(parent, false);
    assert.equal(await follow(), true);
    f.lib.filter.cardRespondable = () => true;
    await f.respond(parent, false);
    assert.equal(await follow(), false);
    await f.gain(["tao"], true);
    await f.gain(["shan"]);
    assert.equal(await follow(), false);
    await f.gain(["tao"]);
    assert.equal(await follow(), true);
    const nanman = { name: "nanman", card: { name: "nanman" }, target: ally };
    await f.respond(nanman, false);
    assert.equal(await follow(), false);
    const publicSha = await f.gain(["sha", "sha"], true);
    await f.respond(nanman, false);
    ally.size = 2;
    ally.known = [publicSha[1]];
    let [known, donor] = await f.scores();
    assert.ok(known > donor, "one remaining known Sha outranks collecting an enemy card");
    ally.known[0].suit = "spade";
    victim.armor = "renwang_skill";
    assert.equal(await follow(), false);
    ally.known = [];
    victim.armor = null;
    ally.size = 5;
    [known, donor] = await f.scores();
    assert.ok(known > 0 && known < donor, "last known Sha leaving restores unknown status");

    f.status.currentPhase = owner;
    owner.size = 3; ally.size = 4; victim.size = 2; enemy.size = 3;
    await f.respond(nanman, false);
    assert.ok((await f.scores())[0] >= 1600, "discarding from the sole leader unlocks Yuce");
    owner.lord = true;
    owner.size = 5; ally.size = 1;
    assert.equal(await follow(), true, "Lixing supplies Sha despite negative evidence");
    owner.getStat("triggerSkill").ycc_lixing = 1;
    assert.equal(await follow(), false, "used Lixing cannot supply a second Sha this turn");
    const spentScores = await f.scores();
    owner.lord = false;
    assert.deepEqual(await f.scores(), spentScores, "spent Lixing ranks all candidates like ordinary Huangming");
    owner.lord = true;
    owner.getStat("triggerSkill").ycc_lixing = 0;
    assert.equal(await follow(), true, "a fresh turn restores Lixing support");
    victim.armor = "tengjia3";
    const armorScores = await f.scores();
    assert.equal(armorScores[0], 0);
    assert.ok(armorScores[1] > 0 && armorScores[1] < 300, "enemy can use Lixing for a harmless attack");
    const sha = { name: "sha", zone: "h", owner };
    const order = () => mod.skill.ycc_yuce.mod.aiOrder(owner, sha, 3);
    owner.limit = 5;
    assert.equal(order(), 0, "preserve a non-overflowing hand");
    owner.limit = 4;
    assert.ok(order() > 0 && order() < 0.1, "overflow Sha can earn Huangming even through armor");
    owner.limit = 5;
    sha.nature = "thunder";
    const thunder = order();
    sha.nature = "fire";
    assert.ok(thunder > 0 && order() > thunder);
    owner.size = 3; enemy.size = 4; victim.size = ally.size = 3;
    assert.ok(mod.removalBonus(owner, enemy, true, "h") > mod.removalBonus(owner, enemy, true, "e"));
    owner.size = enemy.size = 4;
    assert.ok(mod.removalBonus(owner, enemy, false, "h") > mod.removalBonus(owner, enemy, false, "e"));
    const phaseChoice = { type: "phase", player: owner, ai2: f.get.cacheEffectUse };
    mod.skill.ycc_yuce.onChooseToUse(phaseChoice);
    sha.nature = null;
    owner.size = 5; owner.limit = 4;
    f.ui.selected.cards = [sha];
    f.get.card = () => sha;
    assert.ok(phaseChoice.ai2(victim) > 0, "the actual target chooser can attack through armor for Huangming");
    assert.ok(phaseChoice.ai2(ally) < 0);
    owner.limit = 5;
    assert.ok(phaseChoice.ai2(victim) < 0);

    async function marks(target) {
        const choices = [];
        owner.choosePlayerCard = (p, zone, count) => ({
            count,
            player: owner, target,
            set(key, value) { this[key] = value; return this; },
            async forResult() {
                const previous = f.status.event;
                this.getParent = () => undefined;
                f.status.event = this;
                f.ui.selected.buttons = choices;
                try {
                    for (let i = 0; i < Math.min(this.count, target.size); i++) {
                        const button = {};
                        if (this.ai(button) <= 0) break;
                        choices.push(button);
                    }
                } finally {
                    f.status.event = previous;
                    f.ui.selected.buttons = [];
                }
                return { bool: false };
            },
        });
        await mod.skill.ycc_lixing.cost({ indexedData: target }, { skill: "ycc_huangming" }, owner);
        return choices.length;
    }
    owner.size = 3; ally.size = 4; enemy.size = victim.size = 3;
    assert.equal(await marks(ally), 0, "no conversion when discarding an ally hand card secures first");
    assert.equal(await marks(enemy), 1);
    ally.size = 2;
    assert.equal(await marks(ally), 1, "even high-value buttons must allow one conversion");

    console.log("PASS 瑞：皇命选人、暗标、主公真杀收尾、顺拆手牌变化");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
