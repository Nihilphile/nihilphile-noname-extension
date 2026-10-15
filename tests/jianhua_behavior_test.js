// Isolated rule/load regression. It does not replace real-engine acceptance.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../nihilphile武将包");
const cases = [];
const test = (name, run) => cases.push({ name, run });

function nativeArray(items) {
    const result = Array.from(items);
    Object.defineProperty(result, "addArray", {
        value(values) {
            for (const value of values)
                if (!this.includes(value)) this.push(value);
            return this;
        },
    });
    return result;
}

function fixture(options = {}) {
    const discardPile = [];
    const game = {
        players: [],
        filterPlayer(filter) {
            return this.players.filter(filter);
        },
        hasPlayer(filter) {
            return this.players.some(filter);
        },
        countPlayer(filter) {
            this.players.forEach(filter);
        },
        addGroup() {},
        log() {},
    };
    const lib = {
        card: {},
        group: [],
        groupnature: {},
        translate: {},
        filter: {
            targetEnabled2(card, source, target) {
                return target !== source && !target.prohibited;
            },
            targetInRange(card, source, target) {
                return (source.distances.get(target.id) ?? 1) <= source.range;
            },
            cardEnabled() {
                return true;
            },
        },
    };
    const get = {
        name(card) {
            return card && (card.viewAs || card.name);
        },
        type(card) {
            return card && (card.type || lib.card[this.name(card)]?.type);
        },
        subtype(card) {
            return card && (card.subtype || lib.card[this.name(card)]?.subtype);
        },
        itemtype(item) {
            return item && item.physical ? "card" : undefined;
        },
        owner(card) {
            return card.owner;
        },
        position(card) {
            return card.position;
        },
        autoViewAs(card, cards) {
            return Object.assign({}, card, { cards: cards || [] });
        },
        translation(item) {
            return typeof item === "string" ? item : item.id;
        },
        effect(target) {
            return target.effect ?? (target.prohibited ? 0 : -1);
        },
        attitude(source, target) {
            return target.attitude ?? -1;
        },
        value(card) {
            return card.value ?? 3;
        },
        nature(card) {
            return card && card.nature;
        },
        info(card) {
            return card && (lib.card[this.name(card)] || card);
        },
        distance(source, target) {
            return source.distances.get(target.id) ?? 1;
        },
        discardPile(name) {
            return discardPile.find((card) => this.name(card) === name) || null;
        },
        equipValue(card, player) {
            const value = lib.card[this.name(card)]?.ai?.basic?.equipValue;
            return typeof value === "function"
                ? value(card, player)
                : typeof value === "number"
                  ? value
                  : this.value(card, player);
        },
        player() {
            return game.players[0];
        },
    };
    const context = {
        window: {},
        game,
        lib,
        get,
        console,
        ui: {
            create: {
                dialog() {
                    return {};
                },
            },
            discardPile,
        },
        _status: { event: {}, currentPhase: null },
    };
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(root, "module/jianhua.js"), "utf8"),
        context,
    );
    const mod = context.window.nihilModules.jianhua;
    Object.assign(lib.card, mod.card);
    Object.assign(lib.translate, mod.translate);
    lib.filter.cardEnabled = () => true;

    function physical(id, name, position = "h") {
        return { id, name, physical: true, position, owner: null, value: 3 };
    }
    function player(id) {
        const p = {
            id,
            playerid: id,
            inGame: true,
            phaseUsing: false,
            range: 1,
            effect: -1,
            attitude: -1,
            prohibited: false,
            hand: [],
            equips: [],
            vEquips: [],
            storage: {},
            marks: {},
            distances: new Map(),
            used: [],
            history: { sourceDamage: [] },
            isIn() {
                return this.inGame;
            },
            isDead() {
                return !this.inGame;
            },
            isOut() {
                return false;
            },
            isPhaseUsing() {
                return this.phaseUsing;
            },
            inRange(target) {
                return (this.distances.get(target.id) ?? 1) <= this.range;
            },
            getStorage(name) {
                return this.storage[name] || [];
            },
            getCards(position) {
                if (position === "h") return this.hand.slice();
                if (position === "e") return this.equips.slice();
                return this.hand.concat(this.equips);
            },
            getEquips(type) {
                return type === 1 ? this.equips.slice() : [];
            },
            getVEquips(name) {
                if (!name) return this.vEquips.slice();
                if (name === 1 || name === "equip1")
                    return this.vEquips.slice();
                return this.vEquips.filter((card) => card.name === name);
            },
            getEquip(type) {
                return type === 1 ? this.equips[0] || null : null;
            },
            countMark(name) {
                return this.marks[name] || 0;
            },
            addMark(name, num) {
                this.marks[name] = this.countMark(name) + num;
            },
            removeMark(name, num) {
                assert.ok(this.countMark(name) >= num);
                this.marks[name] -= num;
            },
            addTempSkill(name, expiry) {
                this.tempSkill = { name, expiry };
            },
            markSkill(name) {
                (this.markRefreshed = this.markRefreshed || []).push(name);
            },
            getHistory(name, filter) {
                const history = (this.history[name] || []).slice();
                return filter ? history.filter(filter) : history;
            },
            markAuto(name, values) {
                this.storage[name] = nativeArray(
                    this.getStorage(name)
                        .concat(values)
                        .filter((v, i, a) => a.indexOf(v) === i),
                );
            },
            removeVirtualEquip(vcard) {
                this.vEquips = this.vEquips.filter((item) => item !== vcard);
            },
            addVirtualEquip(vcard, cards) {
                if (!this.vEquips.includes(vcard)) this.vEquips.push(vcard);
                for (const card of cards || []) {
                    this.hand = this.hand.filter((item) => item !== card);
                    if (!this.equips.includes(card)) this.equips.push(card);
                    card.owner = this;
                    card.position = "e";
                    card.viewAs = vcard.name;
                }
            },
            chooseTarget(forced, prompt, filter) {
                assert.equal(forced, true);
                const request = {
                    player: this,
                    set(key, value) {
                        this[key] = value;
                        return this;
                    },
                    forResult: async () => {
                        const remote = { _status: { event: request }, get };
                        const rebuilt = vm.runInNewContext(
                            "(" + filter.toString() + ")",
                            remote,
                        );
                        const targets = game.players.filter((target) =>
                            rebuilt(null, this, target),
                        );
                        return targets.length
                            ? { bool: true, targets: [targets[0]] }
                            : { bool: false };
                    },
                };
                return request;
            },
            async useCard(card, targets, addCount) {
                const list = Array.isArray(targets)
                    ? Array.from(targets)
                    : [targets];
                this.used.push({
                    card,
                    targets: list,
                    addCount,
                    cards: card.cards || [],
                });
            },
            async gain(cards) {
                const items = Array.isArray(cards) ? cards : [cards];
                for (const item of items) {
                    const virtual =
                        item && !item.physical && Array.isArray(item.cards)
                            ? item
                            : null;
                    const moving = virtual ? virtual.cards : [item];
                    if (virtual)
                        this.vEquips = this.vEquips.filter(
                            (vcard) => vcard !== virtual,
                        );
                    for (const card of moving) {
                        for (const owner of game.players) {
                            owner.equips = owner.equips.filter(
                                (item) => item !== card,
                            );
                            if (!options.targetEquipSemantics) {
                                owner.vEquips = owner.vEquips.filter(
                                    (vcard) =>
                                        !(vcard.cards || []).includes(card),
                                );
                            }
                        }
                        card.owner = this;
                        card.position = "h";
                        card.viewAs = undefined;
                        if (!this.hand.includes(card)) this.hand.push(card);
                    }
                }
            },
            async discard(cards) {
                for (const card of Array.isArray(cards) ? cards : [cards]) {
                    this.hand = this.hand.filter((item) => item !== card);
                    this.equips = this.equips.filter((item) => item !== card);
                    card.owner = null;
                    card.position = "d";
                    card.viewAs = undefined;
                    if (!discardPile.includes(card)) discardPile.push(card);
                }
            },
        };
        game.players.push(p);
        return p;
    }
    function equip(owner, name, material) {
        if (options.targetEquipSemantics && owner.vEquips.length) {
            for (const old of owner.vEquips) {
                for (const card of old.cards || []) {
                    owner.hand = owner.hand.filter((item) => item !== card);
                    owner.equips = owner.equips.filter((item) => item !== card);
                    card.position = "d";
                    card.owner = null;
                }
            }
        }
        material.owner = owner;
        material.position = "e";
        material.viewAs = name;
        owner.hand = owner.hand.filter((card) => card !== material);
        owner.equips = [material];
        const vcard = {
            name,
            type: "equip",
            subtype: "equip1",
            cards: [material],
        };
        owner.vEquips = [vcard];
        return vcard;
    }
    function equipEvent(owner, name, material, vcard) {
        const use = {
            name: "useCard",
            player: owner,
            card: { name },
            cards: [material],
        };
        return {
            card: vcard,
            cards: [material],
            getParent(type) {
                return type === "useCard" ? use : undefined;
            },
        };
    }
    function replacementEvent(owner, name, oldVcard) {
        const card = { name, type: "equip", subtype: "equip1" };
        const use = { name: "useCard", player: owner, card };
        const equipParent = { name: "equip", player: owner, card, parent: use };
        return {
            name: "replaceEquip",
            player: owner,
            card,
            result: {
                vcards: nativeArray([oldVcard]),
                cards: nativeArray((oldVcard.cards || []).slice()),
            },
            getParent(type) {
                if (type === "equip") return equipParent;
                if (type === "useCard") return use;
                return null;
            },
        };
    }
    return {
        game,
        lib,
        get,
        mod,
        player,
        physical,
        equip,
        equipEvent,
        replacementEvent,
        discardPile,
        context,
    };
}

test("registration, custom group, cards and package wiring", () => {
    const f = fixture();
    assert.deepEqual(Array.from(f.mod.character.nihil_jianhua.skills), [
        "nihil_jianhua_skill",
        "nihil_lingren",
        "nihil_xinliu",
    ]);
    assert.equal(f.mod.character.nihil_jianhua.group, "zhong");
    assert.equal(f.mod.character.nihil_jianhua.hp, 4);
    assert.equal(f.mod.card.nihil_zhuofeng.distance.attackFrom, -1);
    assert.equal(f.mod.card.nihil_hengsha.distance.attackFrom, 0);
    assert.deepEqual(Array.from(f.mod.card.nihil_hengsha.skills), [
        "nihil_hengsha_skill",
    ]);
    f.mod.init(f.lib, f.game);
    assert.equal(f.lib.translate.zhong_config, "中势力");
    assert.match(
        fs.readFileSync(path.join(root, "extension.js"), "utf8"),
        /"jianhua"/,
    );
    assert.match(
        fs.readFileSync(path.join(root, "extension.js"), "utf8"),
        /"nihil_jianhua"/,
    );
    assert.match(
        fs.readFileSync(path.join(root, "character/intro.js"), "utf8"),
        /nihil_jianhua/,
    );
    assert.match(
        fs.readFileSync(path.join(root, "character/pinyin.js"), "utf8"),
        /nihil_jianhua:\s*\["jian", "hua"\]/,
    );
});

test("v1.4 M1: weapons are free of the hand-size limit and nothing is left of the v1.3 quota/limit hooks", () => {
    const f = fixture(),
        p = f.player("owner"),
        mod = f.mod.skill.nihil_jianhua_skill.mod;
    const weapon = f.physical("weapon", "blade"),
        sha = f.physical("sha", "sha");
    weapon.type = "equip";
    weapon.subtype = "equip1";
    weapon.owner = p;
    sha.owner = p;
    p.hand = [weapon, sha];
    assert.equal(mod.ignoredHandcard(weapon, p), true);
    assert.equal(mod.ignoredHandcard(sha, p), undefined);
    assert.equal(
        mod.cardUsable,
        undefined,
        "v1.3 base sha quota reduction is removed",
    );
    assert.equal(
        mod.cardEnabled,
        undefined,
        "weapons are no longer gated by an equip limit",
    );
    assert.equal(mod.cardEnabled2, undefined);
    assert.equal(
        f.mod.skill.nihil_jianhua_skill.subSkill.guard,
        undefined,
        "the weapon-discard damage guard is removed",
    );
    assert.equal(
        f.mod.skill.nihil_jianhua_skill.mod.cardRespondable,
        undefined,
        "responding is not disabled",
    );
    assert.equal(
        f.mod.skill.nihil_lingren.chooseButton
            .backup(["equip", "", "nihil_zhuofeng"])
            .filterCard(sha, p),
        true,
    );
});

test("v1.4 M2/M4: equipping is unlimited but only the first equip of each name in the play phase makes a sha", async () => {
    const f = fixture(),
        p = f.player("owner"),
        enemy = f.player("enemy"),
        material = f.physical("m", "blade");
    material.type = "equip";
    material.subtype = "equip1";
    p.phaseUsing = true;
    const vcard = f.equip(p, "blade", material),
        trigger = f.equipEvent(p, "blade", material, vcard);
    const skill = f.mod.skill.nihil_jianhua_skill.subSkill.equip;
    assert.equal(skill.filter(trigger, p), true);
    await skill.content({}, trigger, p);
    assert.deepEqual(Array.from(p.getStorage("nihil_jianhua_skill_used")), [
        "blade",
    ]);
    assert.equal(p.tempSkill.expiry.global, "phaseAfter");
    assert.equal(p.used.length, 1);
    assert.equal(p.used[0].card.name, "sha");
    assert.deepEqual(p.used[0].cards, []);
    assert.equal(
        p.used[0].addCount,
        false,
        "the triggered sha never consumes the play-phase sha quota",
    );
    assert.deepEqual(p.used[0].targets, [enemy]);
    // Same weapon a second time in the same turn: legal to equip, but no further sha.
    assert.equal(
        skill.filter(trigger, p),
        false,
        "second equip of the same weapon name does not fire",
    );
    // A different weapon name still fires, and it may be equipped again afterwards.
    const other = f.physical("m2", "other_blade");
    other.type = "equip";
    other.subtype = "equip1";
    const otherVcard = f.equip(p, "other_blade", other);
    assert.equal(
        skill.filter(f.equipEvent(p, "other_blade", other, otherVcard), p),
        true,
    );
});

test("v1.4 M4: an equip outside the play phase does not produce a sha", () => {
    const f = fixture(),
        p = f.player("owner"),
        material = f.physical("m", "blade");
    material.type = "equip";
    material.subtype = "equip1";
    const vcard = f.equip(p, "blade", material);
    const skill = f.mod.skill.nihil_jianhua_skill.subSkill.equip;
    p.phaseUsing = false;
    assert.equal(
        skill.filter(f.equipEvent(p, "blade", material, vcard), p),
        false,
        "the trigger is scoped to the play phase even though the equip itself succeeded",
    );
});

test("v1.4 L1: Lingren may convert a second sha into the same weapon name once the equip limit is gone", () => {
    const f = fixture(),
        p = f.player("owner"),
        first = f.physical("sha1", "sha"),
        second = f.physical("sha2", "sha");
    p.phaseUsing = true;
    p.hand = [first, second];
    const skill = f.mod.skill.nihil_lingren;
    const event = { filterCard: () => true };
    assert.equal(skill.filter(event, p), true);
    p.storage.nihil_jianhua_skill_used = ["nihil_zhuofeng"];
    assert.equal(
        skill.filter(event, p),
        true,
        "an already-fired weapon name no longer blocks conversion",
    );
    const button = { link: ["equip", "", "nihil_zhuofeng"] };
    f.get.event = () => ({ getParent: () => ({ filterCard: () => true }) });
    assert.equal(
        skill.chooseButton.filter(button, p),
        true,
        "the button stays clickable for an already-fired weapon name",
    );
});

test("M2/M4: failed placement records nothing; successful placement with no legal target keeps weapon and uses no sha", async () => {
    const f = fixture(),
        p = f.player("owner"),
        enemy = f.player("enemy"),
        material = f.physical("m", "blade");
    material.type = "equip";
    material.subtype = "equip1";
    p.phaseUsing = true;
    const vcard = {
            name: "blade",
            type: "equip",
            subtype: "equip1",
            cards: [material],
        },
        trigger = f.equipEvent(p, "blade", material, vcard);
    const skill = f.mod.skill.nihil_jianhua_skill.subSkill.equip;
    assert.equal(skill.filter(trigger, p), false);
    enemy.prohibited = true;
    f.equip(p, "blade", material);
    assert.equal(skill.filter(trigger, p), true);
    await skill.content({}, trigger, p);
    assert.deepEqual(Array.from(p.getStorage("nihil_jianhua_skill_used")), [
        "blade",
    ]);
    assert.equal(p.used.length, 0);
    assert.equal(p.equips[0], material);
});

test("v1.2 M3: ending phase no longer returns either ordinary or transformed weapons", () => {
    const f = fixture(),
        p = f.player("owner"),
        sha = f.physical("sha", "sha");
    f.equip(p, "nihil_zhuofeng", sha);
    assert.equal(f.mod.skill.nihil_jianhua_skill.subSkill.return, undefined);
    assert.equal(p.equips[0], sha);
    assert.equal(p.getVEquips(1)[0].name, "nihil_zhuofeng");
    assert.equal(p.hand.includes(sha), false);
});

test("L2: Zhuofeng takes the target's current weapon once only after positive sha damage", async () => {
    for (const [num, name, gains] of [
        [1, "sha", 1],
        [2, "sha", 1],
        [0, "sha", 0],
        [1, "juedou", 0],
        [1, null, 0],
    ]) {
        const f = fixture(),
            p = f.player("owner"),
            target = f.player("target"),
            weapon = f.physical("weapon", "blade", "e");
        f.equip(target, "blade", weapon);
        const skill = f.mod.skill.nihil_zhuofeng_skill;
        const trigger = {
            num,
            card: name ? { name } : undefined,
            player: target,
        };
        if (skill.filter(trigger, p)) await skill.content({}, trigger, p);
        assert.equal(p.hand.includes(weapon), !!gains);
        assert.equal(
            target.getVEquips(1).length,
            gains ? 0 : 1,
            "weapon transfer and virtual slot removal stay in sync",
        );
    }
});

test("L3: Hengsha continuously adds every in-range legal other target to the same sha", async () => {
    const f = fixture(),
        p = f.player("owner"),
        original = f.player("original"),
        friend = f.player("friend"),
        far = f.player("far"),
        banned = f.player("banned");
    const shaMaterial = f.physical("sha", "sha");
    f.equip(p, "nihil_hengsha", shaMaterial);
    p.range = 1;
    p.distances.set(far.id, 2);
    banned.prohibited = true;
    const trigger = { card: { name: "sha" }, targets: nativeArray([original]) };
    const skill = f.mod.skill.nihil_hengsha_skill;
    assert.equal(skill.filter(trigger, p), true);
    await skill.content({}, trigger, p);
    assert.deepEqual(Array.from(trigger.targets), [original, friend]);
    p.vEquips = [];
    assert.equal(skill.equipSkill, true);
    assert.equal(
        p
            .getVEquips(1)
            .some((vcard) =>
                (f.lib.card[vcard.name]?.skills || []).includes(
                    "nihil_hengsha_skill",
                ),
            ),
        false,
        "after unequipping, the engine no longer mounts the Hengsha equip skill",
    );
});

test("M4/L3: equipping Hengsha creates one sha whose initial targets are already the full legal set", async () => {
    const f = fixture(),
        p = f.player("owner"),
        enemy = f.player("enemy"),
        friend = f.player("friend"),
        far = f.player("far"),
        sha = f.physical("sha", "sha");
    p.range = 1;
    p.distances.set(far.id, 2);
    const vcard = f.equip(p, "nihil_hengsha", sha),
        trigger = f.equipEvent(p, "nihil_hengsha", sha, vcard);
    await f.mod.skill.nihil_jianhua_skill.subSkill.equip.content(
        {},
        trigger,
        p,
    );
    assert.equal(p.used.length, 1);
    assert.deepEqual(p.used[0].targets, [enemy, friend]);
});

test("v1.4 F1: Xinliu is locked and gains three ning per point of actual damage", async () => {
    const f = fixture(),
        p = f.player("owner"),
        skill = f.mod.skill.nihil_xinliu;
    assert.equal(skill.locked, true);
    assert.equal(skill.forced, true);
    assert.equal(skill.enable, undefined);
    assert.equal(skill.marktext, "凝");
    assert.equal(
        skill.subSkill.fallback,
        undefined,
        "the no-damage sha gain moved to Jianhua",
    );
    const flow = skill.subSkill.flow;
    for (const num of [0, 1, 2])
        if (flow.filter({ num })) await flow.content({}, { num }, p);
    assert.equal(p.countMark("nihil_xinliu"), 9);
});

test("v1.4 F2/F3: replacement protection pays 6,5,4,3,2,1,0,0 and resets to six next turn", async () => {
    const f = fixture({ targetEquipSemantics: true }),
        p = f.player("owner");
    p.marks.nihil_xinliu = 40;
    const preserve = f.mod.skill.nihil_xinliu.subSkill.preserve;
    const expected = [6, 5, 4, 3, 2, 1, 0, 0],
        paid = [];
    for (let i = 0; i < expected.length; i++) {
        const old = f.physical("old" + i, i % 2 ? "sha" : "blade", "e");
        const oldName = i % 2 ? "nihil_hengsha" : "blade" + i;
        const oldVcard = f.equip(p, oldName, old);
        const replacement = f.replacementEvent(p, "new_blade" + i, oldVcard);
        const before = p.countMark("nihil_xinliu");
        assert.equal(preserve.filter(replacement, p), true);
        await preserve.content({}, replacement, p);
        paid.push(before - p.countMark("nihil_xinliu"));
        assert.equal(replacement.result.cards.length, 0);
        assert.equal(replacement.result.vcards.length, 0);
        assert.equal(p.hand.includes(old), true);
        assert.equal(
            p.getVEquips(1).length,
            0,
            "old virtual weapon is removed before native replacement resumes",
        );
    }
    assert.deepEqual(paid, expected);
    assert.equal(
        p.storage.nihil_xinliu_turn,
        8,
        "zero-cost successes still advance the counter",
    );
    assert.deepEqual(
        p.markRefreshed,
        expected.map(() => "nihil_xinliu_cost"),
        "each paid protection refreshes the cost gauge",
    );
    delete p.storage.nihil_xinliu_turn;
    const old = f.physical("next_old", "blade", "e"),
        oldVcard = f.equip(p, "next_old", old);
    const replacement = f.replacementEvent(p, "next_new", oldVcard),
        before = p.countMark("nihil_xinliu");
    await preserve.content({}, replacement, p);
    assert.equal(before - p.countMark("nihil_xinliu"), 6);
});

test("v1.4 gauge: the cost mark always reads the current X without the player doing arithmetic", () => {
    const f = fixture(),
        p = f.player("owner"),
        cost = f.mod.skill.nihil_xinliu_cost;
    assert.equal(cost.charlotte, true);
    assert.equal(cost.marktext, "费");
    assert.equal(
        cost.intro.markcount(undefined, p),
        "6",
        "fresh turn costs six ning",
    );
    p.storage.nihil_xinliu_turn = 3;
    assert.equal(cost.intro.markcount(undefined, p), "3");
    p.storage.nihil_xinliu_turn = 9;
    assert.equal(
        cost.intro.markcount(undefined, p),
        "0",
        "the floor is shown as a literal zero, not hidden",
    );
    delete p.storage.nihil_xinliu_turn;
    assert.equal(
        f.mod.skill.nihil_xinliu.subSkill.gauge.trigger.player,
        "phaseBegin",
    );
    f.mod.skill.nihil_xinliu.subSkill.gauge.content({}, {}, p);
    assert.deepEqual(
        p.markRefreshed,
        ["nihil_xinliu_cost"],
        "own turn start mounts/refreshes the gauge",
    );
    assert.match(cost.intro.content(undefined, p), /6/);
});

test("v1.4 F2: insufficient ning or a non-use replacement follows native loss without spending or advancing", async () => {
    const f = fixture({ targetEquipSemantics: true }),
        p = f.player("owner"),
        preserve = f.mod.skill.nihil_xinliu.subSkill.preserve;
    p.marks.nihil_xinliu = 5;
    const old = f.physical("old", "blade", "e"),
        oldVcard = f.equip(p, "old_blade", old);
    const replacement = f.replacementEvent(p, "new_blade", oldVcard);
    assert.equal(
        preserve.filter(replacement, p),
        false,
        "five ning cannot pay the opening six",
    );
    assert.equal(p.countMark("nihil_xinliu"), 5);
    assert.equal(p.storage.nihil_xinliu_turn, undefined);
    assert.deepEqual(
        Array.from(replacement.result.cards),
        [old],
        "native replaceEquip result remains untouched",
    );
    p.marks.nihil_xinliu = 6;
    assert.equal(
        preserve.filter(replacement, p),
        true,
        "the same replacement unlocks once six ning are available",
    );
    const thirdParty = f.replacementEvent(p, "new_blade", oldVcard);
    thirdParty.getParent = () => null;
    assert.equal(
        preserve.filter(thirdParty, p),
        false,
        "direct/third-party equip is not protected",
    );
});

test("v1.4 F2: failed migration neither spends ning nor advances, and restores the old virtual weapon", async () => {
    const f = fixture(),
        p = f.player("owner"),
        preserve = f.mod.skill.nihil_xinliu.subSkill.preserve;
    p.marks.nihil_xinliu = 6;
    const old = f.physical("old", "sha", "e"),
        oldVcard = f.equip(p, "nihil_zhuofeng", old);
    const replacement = f.replacementEvent(p, "new_blade", oldVcard);
    p.gain = async () => {};
    await preserve.content({}, replacement, p);
    assert.equal(p.countMark("nihil_xinliu"), 6);
    assert.equal(p.storage.nihil_xinliu_turn, undefined);
    assert.equal(
        p.markRefreshed,
        undefined,
        "a failed protection does not touch the gauge",
    );
    assert.equal(p.getVEquips(1)[0], oldVcard);
    assert.deepEqual(Array.from(replacement.result.cards), [old]);
});

test("v1.4 F2 regression: target-engine display wrapper does not block Hengsha material recovery", async () => {
    const f = fixture({ targetEquipSemantics: true }),
        p = f.player("owner");
    const preserve = f.mod.skill.nihil_xinliu.subSkill.preserve;
    const hengshaMaterial = f.physical("hengsha_material", "sha", "s");
    const oldVcard = {
        name: "nihil_hengsha",
        type: "equip",
        subtype: "equip1",
        cards: [hengshaMaterial],
    };
    const displayWrapper = f.physical("hengsha_display", "nihil_hengsha", "e");
    displayWrapper.isViewAsCard = true;
    displayWrapper.cards = [hengshaMaterial];
    displayWrapper.owner = p;
    p.vEquips = [oldVcard];
    p.equips = [displayWrapper];
    p.marks.nihil_xinliu = 14;
    p.gain = async function (cards) {
        const moving = Array.isArray(cards) ? cards : [cards];
        assert.deepEqual(
            moving,
            [displayWrapper],
            "the engine display wrapper must be passed to native gain",
        );
        this.equips = [];
        this.vEquips = [];
        hengshaMaterial.owner = this;
        hengshaMaterial.position = "h";
        this.hand.push(hengshaMaterial);
    };

    const replacement = f.replacementEvent(p, "nihil_zhuofeng", oldVcard);
    replacement.result.cards = nativeArray([displayWrapper]);
    assert.equal(
        preserve.filter(replacement, p),
        true,
        "14 ning makes the six-cost protection mandatory",
    );
    await preserve.content({}, replacement, p);

    assert.equal(p.countMark("nihil_xinliu"), 8);
    assert.equal(
        p.hand.includes(hengshaMaterial),
        true,
        "the physical sha material must return to hand",
    );
    assert.equal(
        replacement.result.cards.length,
        0,
        "native replacement must not discard the display wrapper again",
    );
    assert.equal(replacement.result.vcards.length, 0);
});

test("v1.4 F2: protected transformed weapon remains in hand after the replacement is equipped", async () => {
    for (const weaponName of ["nihil_hengsha", "nihil_zhuofeng"]) {
        const f = fixture({ targetEquipSemantics: true }),
            p = f.player("owner"),
            sha = f.physical(weaponName + "_sha", "sha");
        p.marks.nihil_xinliu = 6;
        const oldVcard = f.equip(p, weaponName, sha);
        const replacement = f.replacementEvent(p, "next_blade", oldVcard);
        await f.mod.skill.nihil_xinliu.subSkill.preserve.content(
            {},
            replacement,
            p,
        );
        const next = f.physical(weaponName + "_next", "next_blade");
        next.type = "equip";
        next.subtype = "equip1";
        f.equip(p, "next_blade", next);
        assert.equal(
            p.hand.includes(sha),
            true,
            weaponName +
                ": later native equip must not consume the recovered sha",
        );
        assert.equal(p.getVEquips(1)[0].name, "next_blade");
    }
});

test("v1.4 F4: Jianhua's own end phase recovers a sha when nothing was damaged; damage or no sha suppresses it", async () => {
    let f = fixture(),
        p = f.player("owner"),
        fallback = f.mod.skill.nihil_jianhua_skill.subSkill.fallback;
    const trick = f.physical("trick", "juedou", "d"),
        fire = f.physical("fire", "sha", "d"),
        normal = f.physical("normal", "sha", "d");
    fire.nature = "fire";
    f.discardPile.push(trick, fire, normal);
    assert.equal(fallback.filter({}, p), true);
    await fallback.content({}, {}, p);
    assert.equal(
        p.hand[0],
        fire,
        "discard order selects the first sha, including an elemental sha",
    );

    f = fixture();
    p = f.player("owner");
    fallback = f.mod.skill.nihil_jianhua_skill.subSkill.fallback;
    f.discardPile.push(f.physical("sha", "sha", "d"));
    p.history.sourceDamage.push({ num: 1 });
    assert.equal(
        fallback.filter({}, p),
        false,
        "actual source damage in this turn suppresses fallback",
    );

    f = fixture();
    p = f.player("owner");
    fallback = f.mod.skill.nihil_jianhua_skill.subSkill.fallback;
    f.discardPile.push(f.physical("trick", "juedou", "d"));
    assert.equal(
        fallback.filter({}, p),
        false,
        "without a sha in discard there is no trigger",
    );
});

test("v1.1 L1: equip-triggered sha inherits normal, fire, and thunder nature from Lingren material", async () => {
    for (const [weaponName, nature] of [
        ["nihil_zhuofeng", undefined],
        ["nihil_zhuofeng", "fire"],
        ["nihil_zhuofeng", "thunder"],
        ["nihil_hengsha", undefined],
        ["nihil_hengsha", "fire"],
        ["nihil_hengsha", "thunder"],
    ]) {
        const f = fixture(),
            p = f.player("owner");
        f.player("enemy");
        const material = f.physical("sha_" + (nature || "normal"), "sha");
        material.nature = nature;
        const vcard = f.equip(p, weaponName, material);
        await f.mod.skill.nihil_jianhua_skill.subSkill.equip.content(
            {},
            f.equipEvent(p, weaponName, material, vcard),
            p,
        );
        assert.equal(
            p.used[0].card.nature,
            nature,
            weaponName +
                ": " +
                (nature || "normal") +
                " sha nature must be preserved",
        );
    }
});

test("v1.1 L3: Jiedao-required hand sha reaches Hengsha expansion with the same legal target checks", async () => {
    const f = fixture(),
        p = f.player("owner"),
        forced = f.player("forced"),
        extra = f.player("extra"),
        far = f.player("far"),
        banned = f.player("banned");
    f.equip(p, "nihil_hengsha", f.physical("hengsha_material", "sha"));
    p.distances.set(far.id, 2);
    banned.prohibited = true;
    const trigger = {
        card: {
            name: "sha",
            cards: [f.physical("jiedao_sha", "sha")],
            storage: { jiedao: true },
        },
        targets: nativeArray([forced]),
        getParent() {
            return { card: { name: "jiedao" } };
        },
    };
    const skill = f.mod.skill.nihil_hengsha_skill;
    const getVEquips = p.getVEquips;
    p.getVEquips = function (name) {
        // The engine has already mounted this equipSkill; the trigger must not depend on a second by-name lookup.
        if (name === "nihil_hengsha") return [];
        return getVEquips.call(this, name);
    };
    assert.equal(skill.filter(trigger, p), true);
    await skill.content({}, trigger, p);
    assert.deepEqual(Array.from(trigger.targets), [forced, extra]);
});

test("AI: equipment values are finite and independent of attack planning", () => {
    const f = fixture();
    assert.equal(f.mod.card.nihil_zhuofeng.ai.basic.equipValue, 5);
    assert.equal(f.mod.card.nihil_hengsha.ai.basic.equipValue, 4);
    assert.equal(typeof f.mod.aiDecision.decide, "function");
});

test("AI: active hooks preserve native order outside the root phase choice", () => {
    const f = fixture(), p = f.player("owner");
    assert.equal(f.mod.skill.nihil_jianhua_skill.mod.aiOrder(p, { name: "sha" }, 5), undefined);
    assert.equal(f.mod.skill.nihil_hengsha_skill.mod.aiOrder(p, { name: "sha" }, 5), undefined);
    assert.equal(f.mod.skill.nihil_lingren.chooseButton.check({ link: ["equip", "", "nihil_zhuofeng"] }), 0);
    assert.equal(f.mod.skill.nihil_lingren.mod, undefined);
});

(async () => {
    const selected = process.argv[2];
    const selectedCases = cases.filter(
        (item) => !selected || item.name.includes(selected),
    );
    for (const item of selectedCases) {
        await item.run();
        console.log("PASS", item.name);
    }
    console.log(
        "Passed " +
            selectedCases.length +
            " Jianhua checks (engine: mock, realEngineAcceptance: false)",
    );
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
