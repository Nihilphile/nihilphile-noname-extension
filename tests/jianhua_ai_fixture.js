const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../nihilphile武将包/module/jianhua.js"), "utf8");
const engineRoot = process.env.NONAME_ENGINE_ROOT || path.resolve(__dirname, "../../game/noname/resources/app/noname");
const engineSkillPath = path.join(engineRoot, "library/skill.js");
const engineSkillSource = fs.readFileSync(engineSkillPath, "utf8").replace(/^import .*;\r?\n/gm, "")
    .replace(/export\s*\{\s*skills as default\s*\};?\s*$/, "") + "; window._jianhuaEngineSkills = skills;";
const cases = [];
function test(name, run) { cases.push({ name, run }); }

function fixture(options = {}) {
    const lib = { skill: { global: [] }, card: {}, filter: {} };
    const status = { event: null };
    const game = {
        players: [],
        filterPlayer(fn) { return this.players.filter(fn); },
        expandSkills(names) {
            for (const name of names.slice()) for (const suffix of lib.skill[name]?.group || [])
                if (!names.includes(suffix)) names.push(suffix);
        },
        checkMod(...args) {
            const name = args[args.length - 2], owner = args[args.length - 1];
            let skills = Array.isArray(owner) ? owner : owner.getSkills().concat(lib.skill.global);
            this.expandSkills(skills);
            const values = args.slice(0, -2);
            for (const skill of skills) {
                const mod = lib.skill[skill]?.mod?.[name];
                if (!mod) continue;
                const result = mod(...values);
                if (result !== undefined && typeof values[values.length - 1] !== "object") values[values.length - 1] = result;
            }
            return values[values.length - 1];
        },
    };
    const info = {
        sha: { type: "basic", range: { attack: 1 }, usable: 1 },
        tao: { type: "basic" }, jiu: { type: "basic" }, shan: { type: "basic" },
        guohe: { type: "trick" }, shunshou: { type: "trick" },
        sword: { type: "equip", subtype: "equip1", distance: { attackFrom: -1 } },
        long: { type: "equip", subtype: "equip1", distance: { attackFrom: -3 } },
        zhuge: { type: "equip", subtype: "equip1", distance: { attackFrom: 0 }, skills: ["zhuge_skill"] },
        qinggang: { type: "equip", subtype: "equip1", distance: { attackFrom: -1 }, skills: ["qinggang_skill"] },
        renwang: { type: "equip", subtype: "equip2" }, tengjia: { type: "equip", subtype: "equip2" },
        baiyin: { type: "equip", subtype: "equip2" }, bagua: { type: "equip", subtype: "equip2" },
        hanbing: { type: "equip", subtype: "equip1", distance: { attackFrom: -1 }, skills: ["hanbing_skill"] },
        cixiong: { type: "equip", subtype: "equip1", distance: { attackFrom: -1 }, skills: ["cixiong_skill"] },
        qinglong: { type: "equip", subtype: "equip1", distance: { attackFrom: -2 }, skills: ["qinglong_skill"] },
        guanshi: { type: "equip", subtype: "equip1", distance: { attackFrom: -2 }, skills: ["guanshi_skill"] },
        zhangba: { type: "equip", subtype: "equip1", distance: { attackFrom: -2 }, skills: ["zhangba_skill"] },
        fangtian: { type: "equip", subtype: "equip1", distance: { attackFrom: -3 }, skills: ["fangtian_skill"] },
        qilin: { type: "equip", subtype: "equip1", distance: { attackFrom: -4 }, skills: ["qilin_skill"] },
        guding: { type: "equip", subtype: "equip1", distance: { attackFrom: -1 }, skills: ["guding_skill"] },
        zhuque: { type: "equip", subtype: "equip1", distance: { attackFrom: -3 }, skills: ["zhuque_skill"] },
        chitu: { type: "equip", subtype: "equip4", distance: { globalFrom: -1 } },
        dilu: { type: "equip", subtype: "equip3", distance: { globalTo: 1 } },
        wuzhong: { type: "trick" }, tiesuo: { type: "trick" },
    };
    Object.assign(lib.card, info);
    const get = {
        name(card) { return card.name; }, type(card) { return lib.card[card.name]?.type; },
        subtype(card) { return lib.card[card.name]?.subtype; },
        info(card) { return typeof card === "string" ? lib.skill[card] : lib.card[card.name]; },
        nature(card) { return card.nature || ""; },
        color(card) { return card.color || "none"; },
        suit(card) { return card.suit || "none"; },
        order(card, player) {
            const native = card.name === "sha" ? 3 : card.name === "wuzhong" ? 7 : 5;
            return game.checkMod(player, card, native, "aiOrder", player);
        },
        priority() { return 0; },
        discardPile() { return options.discardSha ? { name: "sha" } : null; },
        equipValue(card) { return lib.card[card.name]?.ai?.basic?.equipValue || 4; },
        value(card) { return card.value || 3; }, useful(card) { return card.useful || 3; },
        position(card) { return card.position || "h"; },
        autoViewAs(card, materials) { return { ...card, cards: materials }; },
        attitude(player, target) { return target === player ? 5 : target.attitude; },
        distance(player, target) { return Math.max(1, (player.distances[target.id] || 1) - (player.horse || 0)); },
        effect(target, card, player) {
            if (card.name === "tao") return target.hp < target.maxHp ? 3 : 0;
            if (card.name === "wuzhong" && target === player) return 3;
            if (target.effectHook) return target.effectHook(card, player);
            return target.effect ?? (target.attitude < 0 ? 2 : -2);
        },
        player() { return game.players[0]; },
    };
    lib.filter = {
        cardEnabled(card, player) {
            return !player.disabled.has(card.name) && game.checkMod(card, player, undefined, "unchanged", "cardEnabled", player) !== false;
        },
        targetEnabled2(card, player, target) { return target !== player && !target.prohibited; },
        targetEnabled(card, player, target) { return card.name === "tao" && target === player || target !== player; },
        targetInRange(card, player, target) { return card.name !== "sha" || get.distance(player, target) <= player.getAttackRange(); },
        cardUsableTarget() { return true; }, canBeGained() { return true; }, canBeDiscarded() { return true; },
    };
    const context = { window: {}, lib, game, get, _status: status, ui: { selected: { cards: [] } }, console };
    vm.createContext(context);
    let moduleSource = options.synchronousAiHandlers ? source
        .replace(/async content\(event, trigger\) \{\s+(aiObserveShaHit\(trigger\);)/, "content(event, trigger) {\n $1")
        .replace(/async content\(event, trigger, player\) \{\s+(recordJianhuaResolution\(trigger, player\);)/, "content(event, trigger, player) {\n $1") : source;
    if (options.legacyNoTargetAdmission) moduleSource = moduleSource.replace(
        /if \(target === undefined && event\.filterTarget === undefined &&\s+event\.skill === "nihil_lingren" && decision\.selection\.skillId === event\.skill\) return 10;/, "");
    vm.runInContext(moduleSource, context);
    const mod = context.window.nihilModules.jianhua;
    Object.assign(lib.card, mod.card);
    Object.assign(lib.skill, mod.skill);
    vm.runInContext(engineSkillSource, context);
    const engineGlobals = Object.keys(context.window._jianhuaEngineSkills).filter(name => name.startsWith("_"));
    for (const name of engineGlobals) lib.skill[name] = context.window._jianhuaEngineSkills[name];
    lib.skill.global.push(...engineGlobals);
    function card(id, name = "sha", nature = "") { return { id, cardid: id, name, nature, color: "red", position: "h" }; }
    function player(id, attitude = -5, hp = 4) {
        const p = { id, playerid: id, hp, maxHp: 4, attitude, hand: [], weapons: [], armor: [],
            storage: {}, disabled: new Set(), tags: new Set(), skills: [], distances: {}, used: 0, linked: false, extra: [], sex: "male",
            isIn() { return !this.dead; }, isPhaseUsing() { return true; }, isLinked() { return this.linked; },
            isDead() { return !!this.dead; }, isOut() { return false; },
            isMin() { return !!this.min; },
            hasSkill(name) { return this.getSkills().includes(name); }, hasSkillTag(name) { return this.tags.has(name); },
            getSkills() { return this.skills.concat(this.getVEquips().flatMap(w => lib.card[w.name]?.skills || [])); },
            getVEquips(slot) { return slot === 1 ? this.weapons : slot === 2 ? this.armor : slot === "nihil_hengsha" ?
                this.weapons.filter(w => w.name === slot) : this.weapons.concat(this.armor, this.extra); },
            getVCards(position, filter) { const cards = position === "e" ? this.getVEquips() : []; return filter ? cards.filter(filter) : cards; },
            getCards(position) { return [...(position.includes("h") ? this.hand : []),
                ...(position.includes("e") ? this.getVEquips().flatMap(w => w.cards) : [])]; },
            countCards(position) { return this.getCards(position).length; },
            countMark(name) { return this.storage[name] || 0; },
            getStorage(name) { return this.storage[name] || []; },
            getEquipRange(cards = this.weapons) { return Math.max(1, ...cards.map(w => 1 - (lib.card[w.name]?.distance?.attackFrom || 0))); },
            getAttackRange() { return this.getEquipRange(); }, countUsed(name) { return name === "jiu" ? this.wineUsed || 0 : this.used; },
            getCardUsable() { return this.weapons.some(w => w.name === "zhuge") ? Infinity : 1 - this.used; },
            getHandcardLimit() { return this.limit ?? this.hp; },
            getHistory(name, filter) { const entries = name === "sourceDamage" && this.hadDamage ? [{ num: 1 }] : []; return filter ? entries.filter(filter) : entries; },
        };
        game.players.push(p);
        return p;
    }
    function equip(p, name, material = card("equip-" + name, name)) {
        material.position = "e";
        const weapon = { name, cards: [material] };
        (lib.card[name].subtype === "equip2" ? p.armor : lib.card[name].subtype === "equip1" ? p.weapons : p.extra).push(weapon);
        return weapon;
    }
    const owner = player("owner", 5);
    owner.skills = ["nihil_jianhua_skill", "nihil_lingren", "nihil_xinliu"];
    const phase = { name: "phaseUse" };
    function root() {
        const r = { name: "chooseToUse", type: "phase", player: owner, _aiexclude: [],
            ai1() { return 7; }, ai2() { return 6; },
            filterCard(c) { return lib.filter.cardEnabled(c, owner) && (c.name !== "sha" || owner.getCardUsable(c) > 0); },
            getParent(name) { return !name || name === "phaseUse" ? phase : null; } };
        status.event = r;
        return r;
    }
    return { lib, game, get, context, status, owner, card, player, equip, root, mod, ai: mod.aiDecision };
}


module.exports = { fixture, engineRoot };
