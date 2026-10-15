const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../nihilphile武将包");
const cases = [];
function test(name, run) { cases.push({ name, run }); }

function fixture() {
    const discardPile = [];
    const game = {
        players: [],
        filterPlayer(filter) { return this.players.filter(filter); },
    };
    const get = {
        name(card) {
            if (!card) throw new TypeError("card is required");
            return card.name;
        },
        discardPile(name) {
            return discardPile.find(card => card.name === name) || null;
        },
        effect(target) { return target.effect || 0; },
    };
    const context = {
        window: {},
        game,
        get,
        console,
        ui: {},
        ai: {},
        lib: {
            filter: {
                targetEnabled2(card, player, target) {
                    return card.name === "tiesuo" && target.enabled !== false;
                },
            },
        },
        _status: { currentPhase: null, event: null },
    };
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(root, "module/shencangfeng.js"), "utf8"),
        context,
    );
    const mod = context.window.nihilModules.shencangfeng;

    function player(id) {
        const p = {
            id,
            playerid: id,
            storage: {},
            marks: {},
            hand: [],
            histories: { sourceDamage: [] },
            inGame: true,
            linked: false,
            enabled: true,
            hp: 4,
            drawn: 0,
            lostHp: 0,
            logs: [],
            recastCalls: [],
            gainCalls: [],
            uses: [],
            cardChoice: { bool: false },
            targetChoice: { bool: false },
            controlChoice: { index: 0 },
            isIn() { return this.inGame; },
            isLinked() { return this.linked; },
            getHistory(type, filter) {
                const list = this.histories[type] || [];
                return typeof filter === "function" ? list.filter(filter) : list.slice();
            },
            countMark(mark) { return this.marks[mark] || 0; },
            addMark(mark, num) { this.marks[mark] = this.countMark(mark) + num; },
            removeMark(mark, num) {
                assert.ok(this.countMark(mark) >= num);
                this.marks[mark] -= num;
            },
            countCards(zone, filter) {
                assert.equal(zone, "h");
                return typeof filter === "function" ? this.hand.filter(filter).length : this.hand.length;
            },
            getCards(zone) {
                assert.equal(zone, "h");
                return this.hand.slice();
            },
            async gain(card, animation) {
                this.gainCalls.push({ card, animation });
                const index = discardPile.indexOf(card);
                if (index >= 0) discardPile.splice(index, 1);
                this.hand.push(card);
            },
            async draw(num = 1) {
                this.drawn += num;
            },
            async loseHp() {
                this.lostHp++;
                this.hp--;
            },
            async recast(cards) {
                this.recastCalls.push(cards.slice());
                this.hand = this.hand.filter(card => !cards.includes(card));
                this.drawn += cards.length;
            },
            logSkill(skill) {
                this.logs.push(skill);
            },
            chooseCard(zone, range, prompt, filter) {
                const action = {
                    player: p,
                    set() { return this; },
                    async forResult() {
                        if (p.cardChoice.cards) {
                            for (const card of p.cardChoice.cards) {
                                assert.equal(filter(card, p), card.name === "sha");
                            }
                        }
                        return p.cardChoice;
                    },
                };
                p.lastCardRequest = { zone, range: Array.from(range), prompt };
                return action;
            },
            chooseTarget(range, prompt, filter) {
                const action = {
                    player: p,
                    set(key, value) {
                        this[key] = value;
                        return this;
                    },
                    async forResult() {
                        context._status.event = this;
                        const result = p.targetChoice;
                        for (const target of result.targets || []) {
                            assert.equal(filter(null, p, target), true);
                        }
                        return result;
                    },
                };
                p.lastTargetRequest = { range: Array.from(range), prompt };
                return action;
            },
            chooseControl() {
                const action = {
                    player: p,
                    settings: {},
                    set(key, value) {
                        this.settings[key] = value;
                        return this;
                    },
                    async forResult() { return p.controlChoice; },
                };
                p.lastControlRequest = action;
                return action;
            },
            async useCard(card, targets, addCount) {
                const list = Array.isArray(targets) ? targets.slice() : [targets];
                this.uses.push({ card, targets: list, addCount });
                if (card.name === "tiesuo") {
                    for (const target of list) target.linked = !target.linked;
                }
            },
        };
        game.players.push(p);
        return p;
    }

    return { context, discardPile, game, get, mod, player };
}

async function useSha(f, player, marks, baseDamage = 1) {
    player.marks.nihil_xushi = marks;
    const use = {
        name: "useCard",
        player,
        card: { name: "sha" },
        targets: [],
        baseDamage,
    };
    const skill = f.mod.skill.nihil_badao;
    assert.equal(skill.filter(use, player), true);
    await skill.content({}, use, player);
    return use;
}

function damage(use, victim, source, num, linked = false) {
    return {
        name: "damage",
        card: use.card,
        player: victim,
        source,
        num,
        notLink() { return !linked; },
        getParent(name) { return name === "useCard" ? use : null; },
    };
}

test("v1.5 metadata: male Zhong 4hp, supplied portrait and three skills", () => {
    const f = fixture();
    const character = f.mod.character.nihil_shencangfeng;
    assert.equal(character.sex, "male");
    assert.equal(character.group, "zhong");
    assert.equal(character.hp, 4);
    assert.equal(character.maxHp, 4);
    assert.deepEqual(Array.from(character.skills), [
        "nihil_xushi",
        "nihil_badao",
        "nihil_suoxin",
    ]);
    assert.equal(
        character.img,
        "extension/Nihilphile/image/character/nihil_shencangfeng.jpg",
    );
    assert.equal(
        fs.existsSync(path.join(root, "image/character/nihil_shencangfeng.jpg")),
        true,
    );
    assert.equal(f.mod.title.nihil_shencangfeng, "一刃破势");
});

test("xushi: game start initializes once; three Shi turn every Sha into fire", async () => {
    const f = fixture(), p = f.player("p");
    const skill = f.mod.skill.nihil_xushi;
    const init = skill.subSkill.init;
    assert.equal(init.filter({}, p), true);
    await init.content({}, {}, p);
    assert.equal(p.countMark("nihil_xushi"), 1);
    assert.equal(init.filter({}, p), false);
    assert.equal(skill.mod.cardnature({ name: "sha" }, p), undefined);
    p.addMark("nihil_xushi", 2);
    assert.equal(skill.mod.cardnature({ name: "sha" }, p), "fire");
    assert.equal(skill.mod.cardnature({ name: "shan" }, p), undefined);
});

test("xushi: no Sha damage gains one Shi and the first discard Sha", async () => {
    const f = fixture(), p = f.player("p");
    const trick = { name: "juedou", id: 1 };
    const fire = { name: "sha", nature: "fire", id: 2 };
    const normal = { name: "sha", id: 3 };
    f.discardPile.push(trick, fire, normal);
    p.histories.sourceDamage.push({ card: trick, num: 2 });
    const skill = f.mod.skill.nihil_xushi;
    assert.equal(skill.filter({}, p), true, "non-Sha damage does not suppress Xushi");
    await skill.content({}, {}, p);
    assert.equal(p.countMark("nihil_xushi"), 1);
    assert.equal(p.hand[0], fire);
    assert.deepEqual(p.gainCalls, [{ card: fire, animation: "gain2" }]);
});

test("xushi: positive Sha damage suppresses it; zero damage and empty discard do not", async () => {
    let f = fixture(), p = f.player("p");
    const skill = f.mod.skill.nihil_xushi;
    p.histories.sourceDamage.push({ card: { name: "sha" }, num: 1 });
    assert.equal(skill.filter({}, p), false);

    f = fixture();
    p = f.player("p");
    const skill2 = f.mod.skill.nihil_xushi;
    p.histories.sourceDamage.push({ card: { name: "sha" }, num: 0 });
    assert.equal(skill2.filter({}, p), true);
    await skill2.content({}, {}, p);
    assert.equal(p.countMark("nihil_xushi"), 1);
    assert.equal(p.hand.length, 0, "Shi is still gained when discard has no Sha");
});

test("badao: every Shi adds one range and one damage", async () => {
    const f = fixture(), p = f.player("p");
    const skill = f.mod.skill.nihil_badao;
    p.marks.nihil_xushi = 3;
    assert.equal(skill.mod.attackRange(p, 1), 4);
    const use = await useSha(f, p, 3);
    assert.equal(use.baseDamage, 4);
    assert.equal(use._nihilBadaoSnapshot, 3);
});

test("badao: nonlethal Sha can clear all Shi and draw that many", async () => {
    const f = fixture(), p = f.player("p");
    const use = await useSha(f, p, 3);
    p.controlChoice = { index: 0 };
    const settle = f.mod.skill.nihil_badao.subSkill.settle;
    assert.equal(settle.filter(use, p), true);
    await settle.content({}, use, p);
    assert.equal(p.countMark("nihil_xushi"), 0);
    assert.equal(p.drawn, 3);
    assert.equal(p.lostHp, 0);
    assert.equal(settle.filter(use, p), false, "one Sha settles only once");
});

test("badao: nonlethal Sha may lose one HP and keep all Shi", async () => {
    const f = fixture(), p = f.player("p");
    const use = await useSha(f, p, 2);
    p.controlChoice = { index: 1 };
    await f.mod.skill.nihil_badao.subSkill.settle.content({}, use, p);
    assert.equal(p.countMark("nihil_xushi"), 2);
    assert.equal(p.drawn, 0);
    assert.equal(p.lostHp, 1);
    assert.equal(p.hp, 3);
});

test("badao: direct or chain death caused by this Sha skips the choice", async () => {
    for (const linked of [false, true]) {
        const f = fixture(), p = f.player("p"), victim = f.player("victim");
        const use = await useSha(f, p, 3);
        const reason = damage(use, victim, p, 4, linked);
        const kill = f.mod.skill.nihil_badao.subSkill.kill;
        assert.equal(kill.filter({ player: victim, reason }, p), true);
        await kill.content({}, { player: victim, reason }, p);
        await f.mod.skill.nihil_badao.subSkill.settle.content({}, use, p);
        assert.equal(p.countMark("nihil_xushi"), 3);
        assert.equal(p.lastControlRequest, undefined);
        assert.equal(p.drawn, 0);
        assert.equal(p.lostHp, 0);
    }
});

test("badao: unrelated or other-source death is not attributed to this Sha", async () => {
    const f = fixture(), p = f.player("p"), other = f.player("other");
    const victim = f.player("victim");
    const use = await useSha(f, p, 1);
    const kill = f.mod.skill.nihil_badao.subSkill.kill;
    assert.equal(kill.filter({ player: victim, reason: { name: "loseHp" } }, p), false);
    assert.equal(
        kill.filter({ player: victim, reason: damage(use, victim, other, 2) }, p),
        false,
    );
});

test("suoxin: works even after a Sha, recasts first, then uses virtual Tiesuo on up to X", async () => {
    const f = fixture(), p = f.player("p"), a = f.player("a");
    const b = f.player("b"), c = f.player("c");
    b.linked = true;
    const sha1 = { name: "sha", id: 1 };
    const sha2 = { name: "sha", id: 2 };
    const shan = { name: "shan", id: 3 };
    p.hand = [sha1, sha2, shan];
    p.storage.nihil_shencangfeng_used_sha = true;
    const skill = f.mod.skill.nihil_suoxin;
    assert.equal(skill.filter({}, p), true, "old no-Sha-used restriction is removed");
    p.cardChoice = { bool: true, cards: [sha1, sha2] };
    p.targetChoice = { bool: true, targets: [a, b] };
    await skill.content({}, {}, p);
    assert.deepEqual(p.lastCardRequest.range, [1, 2]);
    assert.deepEqual(p.lastTargetRequest.range, [1, 2]);
    assert.deepEqual(p.recastCalls, [[sha1, sha2]]);
    assert.equal(p.drawn, 2);
    assert.deepEqual(p.hand, [shan]);
    assert.equal(p.uses.length, 1);
    assert.equal(p.uses[0].card.name, "tiesuo");
    assert.equal(p.uses[0].card.isCard, true);
    assert.deepEqual(p.uses[0].targets, [a, b]);
    assert.equal(p.uses[0].addCount, false);
    assert.equal(a.linked, true);
    assert.equal(b.linked, false, "standard Tiesuo can reset an already linked target");
    assert.equal(c.linked, false);
});

test("suoxin: cancelling activation changes nothing; cancelling targets keeps the recast", async () => {
    let f = fixture(), p = f.player("p");
    const sha = { name: "sha", id: 1 };
    p.hand = [sha];
    await f.mod.skill.nihil_suoxin.content({}, {}, p);
    assert.deepEqual(p.hand, [sha]);
    assert.deepEqual(p.recastCalls, []);

    f = fixture();
    p = f.player("p");
    const target = f.player("target");
    const sha2 = { name: "sha", id: 2 };
    p.hand = [sha2];
    p.cardChoice = { bool: true, cards: [sha2] };
    p.targetChoice = { bool: false };
    await f.mod.skill.nihil_suoxin.content({}, {}, p);
    assert.deepEqual(p.recastCalls, [[sha2]]);
    assert.equal(p.drawn, 1);
    assert.equal(p.uses.length, 0);
    assert.equal(target.linked, false);
});

test("package registration: module, pinyin and intro remain present; AI selection is unblocked", () => {
    const extension = fs.readFileSync(path.join(root, "extension.js"), "utf8");
    const pinyin = fs.readFileSync(path.join(root, "character/pinyin.js"), "utf8");
    const intro = fs.readFileSync(path.join(root, "character/intro.js"), "utf8");
    assert.match(extension, /"shencangfeng"/);
    assert.match(pinyin, /nihil_shencangfeng:\s*\["shen", "cang", "feng"\]/);
    assert.match(intro, /nihil_shencangfeng:/);

    const lib = {
        assetURL: "",
        group: ["yao"],
        groupnature: {},
        translate: {},
        config: {},
        init: { jsSync() {} },
    };
    let pack;
    const game = {
        import(type, factory) {
            assert.equal(type, "extension");
            pack = factory(lib, game, {}, {}, {}, {});
        },
    };
    vm.runInNewContext(extension, { game, window: {} });
    pack.precontent();
    assert.equal(lib.config.forbidai.includes("nihil_shencangfeng"), false);

    lib.config.forbidai = ["custom_forbid", "nihil_shencangfeng", "nihil_shencangfeng"];
    pack.precontent();
    assert.equal(lib.config.forbidai.includes("nihil_shencangfeng"), false);
    assert.equal(lib.config.forbidai.filter(name => name === "custom_forbid").length, 1);
});

test("AI vulnerability observers remain invisible and leave card mechanics unchanged", async () => {
    const f = fixture();
    const subskills = f.mod.skill.nihil_badao.subSkill;
    const observer = subskills.ai_vulnerable, clear = subskills.ai_vulnerable_clear;
    for (const skill of [observer, clear]) {
        assert.equal(skill.charlotte, true);
        assert.equal(skill.silent, true);
        assert.equal(skill.popup, false);
        for (const property of ["mark", "marktext", "intro", "mod"]) {
            assert.equal(Object.hasOwn(skill, property), false);
        }
    }
    assert.deepEqual(Array.from(observer.trigger.global), ["shaHit", "chooseToUseAfter", "chooseToRespondAfter"]);
    assert.deepEqual(Array.from(clear.trigger.global), ["gainAfter", "loseAsyncAfter"]);
    for (const name of ["ai_vulnerable", "ai_vulnerable_clear"]) {
        assert.ok(f.mod.skill.nihil_badao.group.includes("nihil_badao_" + name));
    }
    const target = f.player("target");
    target._nihilShenNoShanVulnerable = true;
    const card = { name: "sha", nature: "thunder", baseDamage: 7 };
    const before = JSON.stringify(card);
    const gain = { card, getg: player => player === target ? [{ name: "shan" }] : [] };
    assert.equal(clear.filter(gain), true);
    await clear.content({ triggername: "gainAfter" }, gain);
    assert.equal(target._nihilShenNoShanVulnerable, undefined);
    assert.equal(JSON.stringify(card), before);
    assert.deepEqual(target.marks, {});
    assert.deepEqual(target.storage, {});
});

(async () => {
    for (const item of cases) {
        await item.run();
        console.log("PASS", item.name);
    }
    console.log(
        "Passed " + cases.length +
        " Shencangfeng v1.5 checks (engine: mock, realEngineAcceptance: false)",
    );
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
