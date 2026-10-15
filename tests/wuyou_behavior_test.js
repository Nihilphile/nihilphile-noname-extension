const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../nihilphile武将包/module/wuyou.js"), "utf8");
const cases = [];
function test(name, run) { cases.push({ name, run }); }
function array(values = []) {
    values.add = function (value) { if (!this.includes(value)) this.push(value); return this; };
    values.addArray = function (items) { items.forEach(value => this.add(value)); return this; };
    return values;
}
function fixture(moduleSource = source) {
    const state = { pile: [], revealed: [], discarded: [], logs: [], windows: [], button: { bool: false }, targets: [], bools: [], active: null };
    const game = {
        players: [], filterPlayer(fn) { return this.players.filter(fn); }, log(...args) { state.logs.push(args); },
        broadcast() {}, // Matches native offline behavior when no clients are connected.
        async cardsGotoOrdering(cards) { cards.forEach(card => card.position = "o"); },
        async cardsDiscard(cards) { state.discarded.push(...cards); cards.forEach(card => card.position = "d"); },
    };
    const get = {
        suit(card, player) { return player && player.suitOverride || card.suit || "none"; }, type(card) { return card.type; },
        tag(card, tag) { return tag === "damage" && !!card.damage; },
        info(card) { return card.info || {}; }, position(card) { return card.position; },
        cards(num) { state.requested = num; return state.pile.splice(0, num); }, event() { return state.active; },
    };
    const context = { window: {}, game, get, console, lib: { filter: {
        cardRecastable(card, player) { return !card.recastBlocked; },
        targetEnabled2(card, player, target) { return target.enabled !== false; },
        targetInRange(card, player, target) { return target.inRange !== false; },
    } } };
    vm.createContext(context);
    vm.runInContext(moduleSource, context);
    const skills = context.window.nihilModules.wuyou.skill;
    function request(result, filter) {
        const event = { set(key, value) { this[key] = value; return this; }, async forResult() {
            state.active = this;
            if (filter && result.targets) {
                // Rebuild callbacks as remote clients do: no local closure is available.
                const rebuilt = vm.runInContext("(" + filter.toString() + ")", context);
                result.targets.forEach(target => assert.equal(rebuilt(null, player, target), true));
            }
            return result;
        } };
        return event;
    }
    const player = {
        playerid: "owner", storage: {}, hand: [], history: [], drawn: 0, gains: [], logs: [], recastCalls: [], marks: new Set(),
        syncStorage() {}, markSkill(skill) { this.marks.add(skill); }, unmarkSkill(skill) { this.marks.delete(skill); },
        line() {}, logSkill(skill) { this.logs.push(skill); },
        getHistory(type, filter) { assert.equal(type, "lose"); return this.history.filter(filter); },
        getCards(zone, filter) { const cards = zone === "h" ? this.hand : zone === "e" ? this.equipment || [] : zone === "j" ? this.judges || [] : [];
            return filter ? cards.filter(filter) : cards.slice(); },
        async recast(cards) {
            this.recastCalls.push(cards.slice());
            const lost = cards.filter(card => this.hand.includes(card));
            this.hand = this.hand.filter(card => !lost.includes(card));
            const event = loss("loseToDiscardpile", lost, [], { name: "recast" });
            this.history.push(event);
            state.discarded.push(...lost);
            if (skills.nihil_liulian.filter(event, this)) await skills.nihil_liulian.content({}, event, this);
            await this.draw(cards.length);
        },
        async draw(num = 1) { this.drawn += num; this.hand.push(...(state.drawCards || []).splice(0, num)); },
        async showCards(cards) { state.revealed.push(...cards); },
        chooseButton(dialog, range) { state.dialog = dialog; state.range = Array.from(range); return request(state.button); },
        chooseBool(prompt) { state.windows.push(prompt); return request({ bool: state.bools.shift() || false }); },
        chooseTarget(...args) { state.windows.push(args.find(arg => typeof arg === "string")); state.targetRequests = (state.targetRequests || 0) + 1; return request(state.targets.shift() || { bool: false }, args.find(arg => typeof arg === "function")); },
        async gain(card, target, animation) { assert.equal(animation, "giveAuto"); this.gains.push({ card, target }); target.hand--; },
        gainPlayerCard() { throw new Error("random gain must not open a card choice"); },
    };
    function target(id, hand = 1) { return {
        playerid: id, hand, isIn() { return !this.dead; }, countCards() { return this.hand; },
        getCards(zone) { const cards = zone === "h" ? Array.from({ length: this.hand }, (_, index) => ({ owner: id, index })) :
            zone === "e" ? this.equipment || [] : zone === "j" ? this.judges || [] : [];
            cards.randomGet = () => cards.at(-1); return cards; },
    }; }
    function use(type = "basic", suit = "spade") {
        return { card: { type, suit }, cards: [], targets: array(), excluded: array(), directHit: array(), effectCount: 1 };
    }
    function loss(type, hs, es = [], parent = null) {
        return { type, hs, es, getlx: false, getParent() { return parent; } };
    }
    function effect(use, target, multitarget = false) {
        return { type: "card", card: use.card, target, targets: use.targets, multitarget, getParent() { return use; } };
    }
    return { state, game, player, skills, target, use, loss, effect, context, get, mod: context.window.nihilModules.wuyou };
}
test("single hand material preserves transformed suit; recasting two draws two and grants two memories once", async () => {
    const f = fixture(), use = f.use("equip", "heart"), material = { suit: "spade" };
    use.cards = [material]; use.getParent = () => ({ player: f.player });
    f.player.history = [f.loss("use", [material], [], use)];
    assert.equal(f.skills.nihil_menglong.subSkill.record.filter(use, f.player), true);
    f.skills.nihil_menglong.subSkill.record.content({}, use, f.player);
    use.card.suit = "diamond";
    const heart = { suit: "heart", name: "sha" }, protectedHeart = { suit: "heart", name: "shan", protected: true };
    const blockedHeart = { suit: "heart", recastBlocked: true }, drawnHeart = { suit: "heart", name: "tao" };
    f.player.hand = [heart, protectedHeart, blockedHeart, { suit: "spade" }];
    f.state.drawCards = [drawnHeart, { suit: "club" }];
    assert.equal(f.skills.nihil_menglong.filter(use, f.player), true);
    await f.skills.nihil_menglong.content({}, use, f.player);
    assert.equal(f.player.drawn, 2); assert.equal(f.player.hand.includes(heart), false);
    assert.equal(f.player.hand.includes(protectedHeart), false);
    assert.equal(f.player.hand.includes(blockedHeart), true); assert.equal(f.player.hand.includes(drawnHeart), true);
    assert.equal(f.player.recastCalls.length, 1); assert.equal(f.player.recastCalls[0].length, 2);
    assert.equal(f.player.storage.nihil_liulian.heart, 2); assert.equal(f.state.discarded.length, 2);
    use.cards.push({ suit: "heart" });
    assert.equal(f.skills.nihil_menglong.subSkill.record.filter(use, f.player), false);
    use.cards = [];
    assert.equal(f.skills.nihil_menglong.subSkill.record.filter(use, f.player), false);
});
test("zero recastable cards gives no draw or move; own phase and hand provenance are required", async () => {
    const f = fixture(), use = f.use(); use._nihilMenglong = { owner: "owner", suit: "spade" };
    f.player.hand = [{ suit: "spade", recastBlocked: true }, { suit: "heart" }];
    await f.skills.nihil_menglong.content({}, use, f.player); assert.equal(f.player.drawn, 0);
    assert.equal(f.player.recastCalls.length, 0); assert.equal(f.player.hand.length, 2);
    const material = { suit: "spade" }; use.cards = [material];
    use.getParent = () => ({ player: {} }); f.player.history = [f.loss("use", [material], [], use)];
    assert.equal(f.skills.nihil_menglong.subSkill.record.filter(use, f.player), false);
    use.getParent = () => ({ player: f.player }); f.player.history = [f.loss("use", [], [material], use)];
    assert.equal(f.skills.nihil_menglong.subSkill.record.filter(use, f.player), false);
});
test("no same-suit hand cards gives no recast draw or memory", async () => {
    const f = fixture(), use = f.use(), card = { suit: "heart" };
    use._nihilMenglong = { owner: "owner", suit: "spade" };
    f.player.hand = [card];
    await f.skills.nihil_menglong.content({}, use, f.player);
    assert.equal(f.player.recastCalls.length, 0); assert.equal(f.player.drawn, 0);
    assert.deepEqual(f.player.hand, [card]); assert.equal(f.state.discarded.length, 0);
    assert.equal(f.player.storage.nihil_liulian, undefined);
});
test("non-use hand/equip loss counts, including response/recast/replacement under useCard; materials do not", () => {
    const f = fixture(), spade = { suit: "spade" }, heart = { suit: "heart" };
    const bulk = f.loss("discard", [spade, spade, heart, { suit: "none" }], [{ suit: "club" }]);
    assert.equal(f.skills.nihil_liulian.filter(bulk, f.player), true);
    f.skills.nihil_liulian.content({}, bulk, f.player);
    assert.equal(f.player.storage.nihil_liulian.spade, 1); assert.equal(f.player.storage.nihil_liulian.heart, 1);
    assert.equal(f.player.storage.nihil_liulian.club, 1);
    const response = f.loss("respond", [heart]); f.skills.nihil_liulian.content({}, response, f.player);
    const replace = f.loss("equip", [], [spade], { name: "useCard" });
    assert.equal(f.skills.nihil_liulian.filter(replace, f.player), true);
    f.skills.nihil_liulian.content({}, replace, f.player);
    assert.equal(f.player.storage.nihil_liulian.spade, 2); assert.equal(f.player.storage.nihil_liulian.heart, 2);
    const materialLoss = f.loss("use", [spade]);
    assert.equal(f.skills.nihil_liulian.filter(materialLoss, f.player), false);
    assert.equal(f.player.storage.nihil_liulian.spade, 2);
    const recastLoss = f.loss("loseToDiscardpile", [heart], [], { name: "useCard" });
    assert.equal(f.skills.nihil_liulian.filter(recastLoss, f.player), true);
    f.skills.nihil_liulian.content({}, recastLoss, f.player);
    assert.equal(f.player.storage.nihil_liulian.heart, 3);
    assert.equal(f.skills.nihil_liulian.filter(f.loss("discard", []), f.player), false);
    assert.equal(f.skills.nihil_liulian.trigger.global, undefined); // no duplicate wrapper subscription
});
test("judge special and expansion losses count each physical card once across all zones", async () => {
    const f = fixture(), heart = { suit: "heart" }, spade = { suit: "spade" };
    const lost = f.loss("discard", [heart], [heart]);
    lost.js = [spade]; lost.ss = [spade, { suit: "club" }]; lost.xs = [{ suit: "diamond" }, heart];
    assert.equal(f.skills.nihil_liulian.filter(lost, f.player), true);
    await f.skills.nihil_liulian.content({}, lost, f.player);
    assert.deepEqual({ ...f.player.storage.nihil_liulian }, { spade: 1, heart: 1, club: 1, diamond: 1 });
    for (const zone of ["js", "ss", "xs"]) {
        const single = f.loss("discard", []); single[zone] = [{ suit: "heart" }];
        assert.equal(f.skills.nihil_liulian.filter(single, f.player), true);
        await f.skills.nihil_liulian.content({}, single, f.player);
    }
    assert.equal(f.player.storage.nihil_liulian.heart, 4);
    assert.equal(f.skills.nihil_liulian.trigger.player, "loseAfter");
});
test("menglong owns memory initialization removal and reacquisition", async () => {
    const f = fixture(), main = f.skills.nihil_menglong, helper = f.skills.nihil_liulian;
    const marks = ["spade", "heart", "club", "diamond"].map(suit => "nihil_liulian_" + suit);
    assert.ok(main.group.includes("nihil_liulian"));
    assert.equal(helper.charlotte, true); assert.equal(helper.popup, false);
    assert.equal(helper.init, undefined); assert.equal(helper.onremove, undefined);
    main.init(f.player);
    assert.deepEqual([...f.player.marks], marks);
    await helper.content({}, f.loss("discard", [{ suit: "heart" }]), f.player);
    assert.equal(f.player.storage.nihil_liulian.heart, 1);
    main.onremove(f.player);
    assert.equal(f.player.storage.nihil_liulian, undefined); assert.equal(f.player.marks.size, 0);
    main.init(f.player);
    assert.deepEqual({ ...f.player.storage.nihil_liulian }, { spade: 0, heart: 0, club: 0, diamond: 0 });
    assert.deepEqual([...f.player.marks], marks);
});
test("huanghu only prompts for a damage card with a real suit and matching memory", () => {
    const f = fixture(), use = f.use(), event = { card: use.card, getParent: () => use };
    const skill = f.skills.nihil_huanghu;
    assert.equal(skill.direct, true); assert.equal(skill.trigger.target, "useCardToTargeted");
    use.card.damage = true;
    f.player.storage.nihil_liulian = { spade: 0, heart: 3, club: 0, diamond: 0 };
    assert.equal(skill.filter(event, f.player), false);
    f.player.storage.nihil_liulian.spade = 2;
    assert.equal(skill.filter(event, f.player), true);
    use.card.damage = false; assert.equal(skill.filter(event, f.player), false);
    use.card.damage = true; use.card.suit = "none"; assert.equal(skill.filter(event, f.player), false);
    use.card.suit = "spade"; use.excluded.add(f.player); assert.equal(skill.filter(event, f.player), false);
    assert.equal(f.state.windows.length, 0);
});
test("huanghu pays all matching memories; one fails to cancel and two or more exclude only the owner", async () => {
    for (const amount of [1, 2, 5]) {
        const f = fixture(), use = f.use("trick", "heart"), other = f.target("other");
        const alreadyExcluded = f.target("excluded");
        use.card.damage = true; use.targets.addArray([f.player, other, alreadyExcluded]);
        use.excluded.add(alreadyExcluded);
        f.player.storage.nihil_liulian = { spade: 3, heart: amount, club: 1, diamond: 0 };
        f.player.suitOverride = "spade";
        const event = { card: use.card, getParent: () => use };
        assert.equal(f.skills.nihil_huanghu.filter(event, f.player), true);
        f.state.bools = [true];
        await f.skills.nihil_huanghu.content({}, event, f.player);
        assert.deepEqual({ ...f.player.storage.nihil_liulian }, { spade: 3, heart: 0, club: 1, diamond: 0 });
        assert.equal(use.excluded.includes(f.player), amount >= 2);
        assert.equal(use.excluded.includes(other), false); assert.equal(use.excluded.includes(alreadyExcluded), true);
        assert.equal(use.targets.length, 3); assert.equal(use.effectCount, 1);
        assert.equal(f.state.windows.length, 1); assert.deepEqual(f.player.logs, ["nihil_huanghu"]);
        assert.equal(f.player.marks.size, 4);
    }
});
test("huanghu cancellation leaves memories and targets unchanged", async () => {
    const f = fixture(), use = f.use("basic", "spade"); use.card.damage = true;
    f.player.storage.nihil_liulian = { spade: 3, heart: 2, club: 0, diamond: 0 };
    const event = { card: use.card, getParent: () => use };
    assert.equal(f.skills.nihil_huanghu.filter(event, f.player), true);
    f.state.bools = [false]; await f.skills.nihil_huanghu.content({}, event, f.player);
    assert.deepEqual({ ...f.player.storage.nihil_liulian }, { spade: 3, heart: 2, club: 0, diamond: 0 });
    assert.equal(use.excluded.length, 0); assert.equal(f.state.windows.length, 1);
    assert.equal(f.player.logs.length, 0); assert.equal(f.state.logs.length, 0);
});
test("native use material loss cannot create memory or provide same-use useCard2 payment", async () => {
    const f = fixture(), use = f.use("basic", "heart"), material = { suit: "heart" };
    use.cards = [material];
    const materialLoss = f.loss("use", [material], [], use);
    // Native content resolves owner.lose(type:use) before useCard0/1/2.
    assert.equal(f.skills.nihil_liulian.filter(materialLoss, f.player), false);
    assert.equal(f.skills.nihil_zhuihuan.filter(use, f.player), false);
    assert.equal(f.player.storage.nihil_liulian.heart, 0);
    assert.equal(f.state.requested, undefined); assert.equal(f.state.discarded.length, 0);
});
test("native-response use-typed material loss belongs to respond under nanman and grants memory", async () => {
    const f = fixture(), nanman = { name: "useCard", card: { name: "nanman" } };
    const respond = { name: "respond", getParent() { return nanman; } };
    const spade = { name: "sha", suit: "spade", number: 7 }, club = { name: "sha", suit: "club", number: 9 };
    // Native respond uses type:use too, both for single-owner and loseAsync paths.
    const direct = f.loss("use", [spade], [], respond);
    assert.equal(f.skills.nihil_liulian.filter(direct, f.player), true);
    await f.skills.nihil_liulian.content({}, direct, f.player);
    const asyncLoss = f.loss("use", [club], [], { name: "loseAsync", getParent() { return respond; } });
    asyncLoss.relatedEvent = respond;
    assert.equal(f.skills.nihil_liulian.filter(asyncLoss, f.player), true);
    await f.skills.nihil_liulian.content({}, asyncLoss, f.player);
    assert.equal(f.player.storage.nihil_liulian.spade, 1); assert.equal(f.player.storage.nihil_liulian.club, 1);
    assert.equal(f.skills.nihil_liulian.filter(f.loss("use", [spade], [], nanman), f.player), false);
});
test("native-equipment early hand proof survives absent material-loss history and recasts spade guding once", async () => {
    const f = fixture(), phase = { name: "phaseUse", player: f.player };
    const bagua = { name: "bagua", suit: "spade", number: 2 }, guding = { name: "guding", suit: "spade", number: 1 };
    // player.useCard has already built the VCard, while useCardBefore still
    // precedes content's material loss. Missing later history is a compatibility
    // simulation, not a reproduction of the inspected local engine.
    const use = f.use("equip", "spade"); use.name = "useCard";
    use.card = { name: "bagua", type: "equip", suit: "spade", number: 2, isCard: true, cards: [bagua] };
    use.cards = [bagua]; use.getParent = level => level === "phaseUse" ? phase : { name: "chooseToUse" };
    f.player.hand = [bagua, guding];
    const prepare = f.skills.nihil_menglong.subSkill.prepare;
    if (prepare && prepare.filter(use, f.player)) await prepare.content({}, use, f.player);
    f.player.hand = [guding]; f.player.history = []; // the hand provenance must already be preserved
    assert.equal(f.skills.nihil_menglong.subSkill.record.filter(use, f.player), true);
    await f.skills.nihil_menglong.subSkill.record.content({}, use, f.player);
    assert.equal(f.skills.nihil_menglong.filter(use, f.player), true);
    await f.skills.nihil_menglong.content({}, use, f.player);
    assert.equal(f.player.recastCalls.length, 1); assert.equal(f.player.recastCalls[0][0], guding);
    assert.equal(f.player.drawn, 1); assert.equal(f.player.storage.nihil_liulian.spade, 1);
    // The same early window still requires one physical card held by this owner.
    if (prepare) {
        assert.equal(prepare.filter(use, f.player), false); // material has left hand
        f.player.hand = [bagua, guding]; use.cards = [bagua, guding];
        assert.equal(prepare.filter(use, f.player), false);
        use.cards = []; assert.equal(prepare.filter(use, f.player), false);
        use.cards = [bagua]; phase.player = {}; assert.equal(prepare.filter(use, f.player), false);
    }
});
test("cancel spends nothing and does not reveal; delay/equip are ineligible", async () => {
    const f = fixture(); f.player.storage.nihil_liulian = { spade: 1, heart: 0, club: 0, diamond: 0 };
    assert.equal(f.skills.nihil_zhuihuan.filter(f.use("basic"), f.player), true);
    assert.equal(f.skills.nihil_zhuihuan.filter(f.use("trick"), f.player), true);
    assert.equal(f.skills.nihil_zhuihuan.filter(f.use("delay"), f.player), false);
    assert.equal(f.skills.nihil_zhuihuan.filter(f.use("equip"), f.player), false);
    await f.skills.nihil_zhuihuan.content({}, f.use(), f.player);
    assert.equal(f.player.storage.nihil_liulian.spade, 1); assert.equal(f.state.requested, undefined);
    assert.equal(f.state.revealed.length, 0); assert.equal(f.state.logs.length, 0);
});
test("same-suit inventory presents one choice; repeated or unavailable same-suit costs pay nothing", async () => {
    const f = fixture(), use = f.use(), original = f.target("a"), extra = f.target("b"), far = f.target("far");
    far.inRange = false; use.targets.add(original); f.game.players = [original, extra, far];
    f.player.storage.nihil_liulian = { spade: 0, heart: 4, club: 0, diamond: 0 };
    f.state.button = { bool: true, links: ["heart:1"] };
    const revealed = { name: "shan", suit: "heart", number: 8 };
    f.state.pile = [revealed];
    f.state.targets = [{ bool: true, targets: [extra] }]; f.state.bools = [true, true, true];
    await f.skills.nihil_zhuihuan.content({}, use, f.player);
    assert.equal(f.player.storage.nihil_liulian.heart, 3); assert.equal(f.state.requested, 1);
    assert.deepEqual(f.state.range, [1, 1]);
    assert.deepEqual(Array.from(f.state.dialog[1][0], item => item[0]), ["heart:1"]);
    assert.equal(f.state.discarded.length, 1); assert.equal(use.targets.includes(extra), true);
    assert.equal(use.targets.includes(far), false); assert.equal(use.directHit.length, 0);
    assert.equal(use._nihilZhuihuanGainOwner, undefined);
    assert.equal(use.effectCount, 1); assert.equal(f.state.bools.length, 3); assert.equal(f.state.targetRequests, 1);
    const revealLog = f.state.logs.find(args => args.includes("翻开的牌为"));
    assert.equal(revealLog[0], f.player); assert.equal(revealLog[3][0], revealed);
    assert.ok(f.state.logs.some(args => args.includes("匹配了") && args.includes("#y1")));
    for (const illegal of [["heart:1", "heart:1"], ["heart:1", "heart:2"]]) {
        f.state.requested = undefined; f.state.logs = []; f.state.button = { bool: true, links: illegal };
        await f.skills.nihil_zhuihuan.content({}, use, f.player);
        assert.equal(f.player.storage.nihil_liulian.heart, 3);
        assert.equal(f.state.requested, undefined); assert.equal(f.state.logs.length, 0);
    }
});
test("one through four matches offer target, gain, response, extra in order; each choice can cancel independently", async () => {
    const suits = ["spade", "heart", "club", "diamond"];
    const classify = prompt => prompt.includes("自动随机") ? "gain" : prompt.includes("额外指定") ? "target" : prompt.includes("无法被响应") ? "response" : "extra";
    async function setup(matches, choices, targetAccepted = true) {
        const f = fixture(), use = f.use(), original = f.target("original", 3), extra = f.target("extra", 3);
        use.targets.add(original); f.game.players = [original, extra];
        f.player.storage.nihil_liulian = { spade: 1, heart: 1, club: 1, diamond: 1 };
        f.state.button = { bool: true, links: suits.slice(0, matches).map(suit => suit + ":1") };
        f.state.pile = suits.slice(0, matches).map(suit => ({ name: "sha", suit, number: 1 }));
        f.state.bools = choices; f.state.targets = [{ bool: targetAccepted, targets: targetAccepted ? [extra] : undefined }];
        await f.skills.nihil_zhuihuan.content({}, use, f.player);
        return { f, use, extra };
    }
    for (let matches = 1; matches <= 4; matches++) {
        const { f, use, extra } = await setup(matches, [true, true, true]);
        assert.deepEqual(f.state.windows.map(classify), ["target", "gain", "response", "extra"].slice(0, matches));
        assert.equal(use._nihilZhuihuanGainOwner, matches >= 2 ? "owner" : undefined);
        assert.equal(use.targets.includes(extra), true);
        assert.equal(use.directHit.length, matches >= 3 ? 2 : 0);
        assert.equal(use.effectCount, matches >= 4 ? 2 : 1);
    }
    const gainCancelled = await setup(4, [false, true, true]);
    assert.equal(gainCancelled.use._nihilZhuihuanGainOwner, undefined);
    assert.equal(gainCancelled.use.targets.includes(gainCancelled.extra), true);
    assert.equal(gainCancelled.use.directHit.length, 2); assert.equal(gainCancelled.use.effectCount, 2);
    const targetCancelled = await setup(4, [true, false, true], false);
    assert.equal(targetCancelled.use._nihilZhuihuanGainOwner, "owner");
    assert.equal(targetCancelled.use.targets.includes(targetCancelled.extra), false);
    assert.equal(targetCancelled.use.directHit.length, 0); assert.equal(targetCancelled.use.effectCount, 2);
    const extraCancelled = await setup(4, [true, true, false]);
    assert.equal(extraCancelled.use._nihilZhuihuanGainOwner, "owner");
    assert.equal(extraCancelled.use.targets.includes(extraCancelled.extra), true);
    assert.equal(extraCancelled.use.directHit.length, 2); assert.equal(extraCancelled.use.effectCount, 1);
});
test("four distinct matches offer cumulative choices; two targets with extra settlement auto-gain four cards", async () => {
    const f = fixture(), use = f.use(), original = f.target("a", 3), extra = f.target("b", 3), dead = f.target("c");
    dead.dead = true; use.targets.add(original); f.game.players = [f.player, original, extra, dead];
    f.player.storage.nihil_liulian = { spade: 1, heart: 1, club: 1, diamond: 1 };
    f.state.button = { bool: true, links: ["spade:1", "heart:1", "club:1", "diamond:1"] };
    const flipped = ["heart", "diamond", "spade", "club"].map((suit, index) => ({ suit, name: "sha", number: index + 1 }));
    f.state.pile = flipped.slice();
    f.state.targets = [{ bool: true, targets: [extra] }]; f.state.bools = [true, true, true];
    await f.skills.nihil_zhuihuan.content({}, use, f.player);
    assert.equal(use.directHit.length, 4); assert.equal(use.effectCount, 2);
    const revealLog = f.state.logs.find(args => args.includes("翻开的牌为"));
    assert.deepEqual(Array.from(revealLog[3]), flipped);
    assert.ok(f.state.logs.some(args => args.includes("匹配了") && args.includes("#y4")));
    assert.equal(use._nihilZhuihuanGainOwner, "owner"); assert.equal(f.player.gains.length, 0);
    const requestsBefore = f.state.targetRequests;
    for (let pass = 0; pass < use.effectCount; pass++) {
        for (const target of use.targets) {
            const effect = f.effect(use, target);
            assert.equal(f.skills.nihil_zhuihuan.subSkill.gain.filter(effect, f.player), true);
            await f.skills.nihil_zhuihuan.subSkill.gain.content({}, effect, f.player);
            assert.equal(f.skills.nihil_zhuihuan.subSkill.gain.filter(effect, f.player), false);
            await f.skills.nihil_zhuihuan.subSkill.gain.content({}, effect, f.player); // actual-event dedup guard
        }
    }
    assert.equal(f.player.gains.length, 4); assert.equal(original.hand, 1); assert.equal(extra.hand, 1);
    assert.equal(f.state.targetRequests, requestsBefore); // no target/card choice during gains
    assert.equal(f.skills.nihil_zhuihuan.subSkill.gain.filter(f.effect(use, dead), f.player), false);
    extra.hand = 0; assert.equal(f.skills.nihil_zhuihuan.subSkill.gain.filter(f.effect(use, extra), f.player), false);
});
test("shared multitarget effects gain from each live hand without a total cap; empty/dead skip", async () => {
    const f = fixture(), use = f.use("trick"); use._nihilZhuihuanGainOwner = "owner";
    const targets = Array.from({ length: 6 }, (_, index) => f.target("target" + index, 3));
    const empty = f.target("empty", 0), dead = f.target("dead", 3), excluded = f.target("excluded", 3); dead.dead = true;
    use.excluded = [excluded];
    use.targets.addArray([...targets, empty, dead, excluded, targets[0]]);
    for (let pass = 0; pass < 2; pass++) {
        const effect = f.effect(use, targets[0], true);
        await f.skills.nihil_zhuihuan.subSkill.gain.content({}, effect, f.player);
    }
    assert.equal(f.player.gains.length, 12); targets.forEach(target => assert.equal(target.hand, 1));
    assert.equal(empty.hand, 0); assert.equal(dead.hand, 3); assert.equal(excluded.hand, 3); assert.equal(f.state.targetRequests, undefined);
    // No gain at the one-time target-designation or whole-use completion windows.
    assert.equal(f.skills.nihil_zhuihuan.subSkill.gain.trigger.player, "useCardToEnd");
    assert.equal(f.skills.nihil_zhuihuan.subSkill.gain.filter({ type: "precard", getParent: () => use }, f.player), false);
});
test("no matches and target restrictions do not refund paid memory; all optional effects can cancel", async () => {
    const f = fixture(), use = f.use(), original = f.target("a");
    use.targets.add(original); use.card.info = { allowMultiple: false }; f.game.players = [original, f.target("b")];
    f.player.storage.nihil_liulian = { spade: 1, heart: 1, club: 1, diamond: 1 };
    f.state.button = { bool: true, links: ["spade:1", "heart:1", "club:1", "diamond:1"] };
    f.state.pile = ["spade", "heart", "club", "diamond"].map(suit => ({ suit }));
    await f.skills.nihil_zhuihuan.content({}, use, f.player);
    assert.equal(use.targets.length, 1); assert.equal(use.directHit.length, 0); assert.equal(use.effectCount, 1);
    assert.equal(use._nihilZhuihuanGainOwner, undefined);
    f.player.storage.nihil_liulian = { spade: 1, heart: 0, club: 0, diamond: 0 };
    f.state.button = { bool: true, links: ["spade:1"] }; f.state.pile = [{ suit: "none" }];
    await f.skills.nihil_zhuihuan.content({}, use, f.player); assert.equal(f.player.storage.nihil_liulian.spade, 0);
    assert.ok(f.state.logs.some(args => args.includes("匹配了") && args.includes("#y0")));
});
test("extension loader registers Wuyou and clears legacy AI exclusions", () => {
    const root = path.join(__dirname, "../nihilphile武将包");
    const packs = {};
    const lib = { assetURL: "", group: ["yao"], groupnature: {}, translate: {}, config: {
        forbidai: ["other_character", "nihil_wuyou", "nihil_xianxueyinhua", "nihil_wuyou", "nihil_xianxueyinhua", "nihil_jie_luofei"],
    }, init: {} };
    const context = { window: {}, lib, ui: {}, get: {}, ai: {}, _status: {} };
    const game = context.game = { import(kind, callback) { packs[kind] = callback(lib, game, context.ui, context.get, context.ai, context._status); } };
    vm.createContext(context);
    lib.init.jsSync = (base, name) => {
        if (!base.endsWith("module") || ["jie_luofei_ai", "jie_luofei", "wuyou"].includes(name)) {
            vm.runInContext(fs.readFileSync(path.join(root, base.endsWith("module") ? "module" : "character", name + ".js"), "utf8"), context);
        }
    };
    vm.runInContext(fs.readFileSync(path.join(root, "extension.js"), "utf8"), context);
    packs.extension.precontent();
    assert.equal(packs.character.character.nihil_wuyou.sex, "female");
    assert.ok(packs.character.character.nihil_jie_luofei);
    assert.ok(packs.character.skill.nihil_jie_xueyin);
    assert.equal(typeof context.window.nihilJieLuofeiAI.create, "function");
    assert.ok(packs.character.skill.nihil_zhuihuan);
    assert.equal(packs.character.translate.nihil_menglong, "朦胧");
    assert.deepEqual(Array.from(packs.character.character.nihil_wuyou.skills), ["nihil_menglong", "nihil_huanghu", "nihil_zhuihuan"]);
    assert.equal(packs.character.translate.nihil_menglong_info, "<b>锁定技</b>，出牌阶段，当你使用一张手牌后，重铸所有同花色手牌。每当你因使用外的方式失去一张牌，获得一个同花色的<b>“忆”</b>");
    assert.equal(packs.character.translate.nihil_huanghu, "恍惚");
    assert.equal(packs.character.translate.nihil_huanghu_info, "当你成为伤害牌的目标时，你可以移除与其同花色的所有“忆”，若数量不小于2，则取消之。");
    assert.equal(packs.character.translate.nihil_liulian, "朦胧");
    assert.equal(packs.character.translate.nihil_liulian_info, undefined);
    assert.deepEqual(Array.from(packs.character.pinyins.nihil_wuyou), ["wu", "you"]);
    assert.ok(packs.character.characterIntro.nihil_wuyou.includes("如水中望月"));
    assert.deepEqual(Array.from(lib.config.forbidai), ["other_character", "nihil_yinhua"]);
    packs.extension.precontent();
    assert.deepEqual(Array.from(lib.config.forbidai), ["other_character", "nihil_yinhua"]);
    lib.config.forbidai = [];
    packs.extension.precontent();
    assert.deepEqual(Array.from(lib.config.forbidai), ["nihil_yinhua"]);
    packs.extension.precontent();
    assert.deepEqual(Array.from(lib.config.forbidai), ["nihil_yinhua"]);
    assert.ok(fs.existsSync(path.join(root, "image/character/nihil_wuyou.png")));
});
module.exports = { fixture, array };
if (require.main === module) (async () => {
    const selected = cases.filter(({ name }) => !process.argv[2] || name.includes(process.argv[2]));
    for (const { name, run } of selected) { await run(); console.log("PASS " + name); }
    const f = fixture(); assert.equal(f.mod.character.nihil_wuyou.hp, 3);
    assert.equal(f.mod.character.nihil_wuyou.group, "zhong");
    // The native AsyncCompiler preserves module helpers; legacy StepCompiler
    // rebuilds synchronous content and drops its lexical closure.
    for (const skill of Object.values(f.skills)) {
        if (skill.content) assert.equal(skill.content.constructor.name, "AsyncFunction");
        for (const sub of Object.values(skill.subSkill || {})) {
            if (sub.content) assert.equal(sub.content.constructor.name, "AsyncFunction");
        }
    }
    assert.equal(typeof f.skills.nihil_menglong.onChooseToUse, "function");
    assert.equal(typeof f.skills.nihil_menglong.mod.aiOrder, "function");
    assert.equal(typeof f.skills.nihil_menglong.mod.aiUseful, "function");
    assert.equal(typeof f.skills.nihil_menglong.ai.effect.player_use, "function");
    assert.equal(typeof f.skills.nihil_menglong.wuyouAI.planZhuihuan, "function");
    console.log(`PASS ${selected.length} behavior cases + character metadata + AI wiring`);
})().catch(error => { console.error(error); process.exitCode = 1; });
