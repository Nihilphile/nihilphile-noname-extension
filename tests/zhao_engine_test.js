// Exercise Zhao's hooks with the target engine's actual target dispatch, sword filter and damage constructor.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const root = process.env.NONAME_ENGINE_ROOT;
if (!root) throw new Error("Set NONAME_ENGINE_ROOT to the target engine directory");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const content = read("noname/library/element/content.js");
const source = read("noname/library/element/player.js");
const standard = read("card/standard.js");
const pack = path.join(__dirname, "../nihilphile武将包");
const trace = [];
let answer, bury, supplier, gift, wanted, currentUse;
const ctx = {
    window: { nihilModules: {}, NIHIL_EXTENSION_NAME: "Nihilphile" },
    lib: { skill: {}, filter: { cardRespondable: () => true } },
    get: {
        info: () => ({}), position: c => c.pos, nature: c => c.nature, name: c => c.name,
        suit: c => c.suit, number: c => c.number, color: c => c.color, translation: c => c.name,
        autoViewAs: (c, cards) => ({ ...c, cards }), itemtype: () => undefined,
        natureList: n => n ? [n] : [], is: { sameNature: (a,b) => a.some(n => b.includes(n)) },
    }, _status: { event: {} },
    game: { log() {}, filterPlayer: () => [] },
};
vm.createContext(ctx);
const run = script => vm.runInContext(script, ctx);
run(fs.readFileSync(path.join(pack, "module/zhao.js"), "utf8"));
const mod = ctx.window.nihilModules.zhao;
Object.assign(ctx.lib.skill, mod.skill);
const S = mod.skill, tag = "nihil_zhusha", plan = "nihil_qianmian_turn";
const playerMethod = name => {
    const start = source.indexOf("\n  " + name + "(") + 1;
    assert.ok(start > 0, name);
    return run("({" + source.slice(start, source.indexOf("\n  }", start) + 4) + "})." + name);
};
const damage = playerMethod("damage");
const give = playerMethod("give");
const sword = standard.slice(standard.indexOf("cixiong_skill: {"));
const swordFilter = run("({" + sword.slice(sword.indexOf("filter(event"), sword.indexOf("content()")) + "}).filter");
function response(res) {
    return { set(k,v) { this[k]=v; return this; }, async forResult() { return res; } };
}
function unit(name) {
    return {
        name, storage: {}, hand: [], drawn: 0, used: false,
        isIn: () => true, isDead: () => false, canUse: () => true, differentSexFrom: () => true,
        getExpansions() { return phys.pos === "x" ? [phys] : []; },
        addToExpansion(cards) { cards.forEach(c => c.pos = "x"); trace.push("bury"); return { gaintag: new Set() }; },
        markSkill() {}, addSkill() {}, removeSkill(k) { S[k].onremove(this); },
        logSkill() {}, addTempSkill(k) { this.used = k; }, hasSkill(k) { return this.used === k; },
        countCards() { return this.hand.length; }, draw(n = 1) { this.drawn += n; },
        damageHistory: [], hasHistory: playerMethod("hasHistory"),
        getHistory(key) { assert.equal(key, "damage"); return this.damageHistory; },
        getCards() { return this.hand.slice(); },
        give,
        gain({cards,source}) { for (const c of cards) {
            source.hand.splice(source.hand.indexOf(c),1); this.hand.push(c);
        } return {}; },
        chooseToRespond(prompt, filter) {
            const c = this.hand.find(c => c.name === wanted);
            const req = response({bool: !!(answer && c), card:c, cards:c ? [c] : []});
            req.getParent = () => req;
            const resolve = req.forResult;
            req.forResult = async () => {
                ctx.get.event = () => req;
                if (answer && c) {
                    if (!filter(c,this)) return {bool:false};
                    this.hand.splice(this.hand.indexOf(c),1); c.pos="o";
                }
                return resolve();
            };
            return req;
        },
    };
}
const zhao = unit("昭"), target = unit("甲"), ally = unit("乙");
ctx.game.hasPlayer2 = fn => [zhao, target, ally].some(fn);
const phys = {name:"sha", nature:"fire", suit:"heart", number:7, pos:"o"};
const library = read("noname/library/index.js");
const rangeStart = library.indexOf("    targetInRange: function");
assert.ok(rangeStart > 0);
const inRange = vm.runInNewContext("({" + library.slice(rangeStart, library.indexOf("\n    },", rangeStart) + 6) + "}).targetInRange", {
    get: {info: card => ({range: card.name === "sha" ? {attack:1} : {global:1}}), distance: () => 4},
    game: {checkMod(card, user, victim, fallback) {
        return S.nihil_fuzhu.mod.targetInRange(card, user, victim) ?? fallback;
    }},
});
zhao.getAttackRange = () => 1;
const named = ["useCardToTarget", "useCardToPlayered", "useCardToTargeted"];
const stages = named.map(name => {
    const index = content.indexOf('game.createEvent("' + name + '", false)');
    const start = content.lastIndexOf("async (event, trigger, player) => {", index);
    return run("(" + content.slice(start, content.indexOf("\n    },",index)+6) + ")");
});
function collection() {
    const list = [];
    list.add = value => { if (!list.includes(value)) list.push(value); };
    return list;
}
ctx.game.createEvent = function(name) {
    if (name === "damage") return { setContent() {}, trigger(n) { this.zero = n; }, finish() {} };
    const e = {
        getParent: () => currentUse, setContent() {},
        async then(resolve,reject) {
            try {
                if (name === named[0] && S.nihil_fuzhu_watch.filter(e,zhao)) await S.nihil_fuzhu_watch.content({},e,zhao);
                if (name === named[1] && swordFilter(e,e.player)) trace.push("sword");
                if (name === named[2]) {
                    if (e.player === zhao && bury && S.nihil_fuzhu.filter(e,zhao)) await S.nihil_fuzhu.content({},e,zhao);
                    if (name === S.nihil_fuzhu_follow.trigger.global && S.nihil_fuzhu_follow.filter(e,zhao)) await S.nihil_fuzhu_follow.content({},e,zhao);
                }
                resolve();
            } catch (err) { reject(err); }
        }
    };
    return e;
};
async function slash(user,card,cards,props={},useEvent={}) {
    const prev = currentUse;
    const use = currentUse = Object.assign(useEvent, {card,cards,targets:[target],player:user,excluded:collection(),directHit:collection(),
        getTriggerTarget: () => target, sortTarget() {}, redo() {}, ...props});
    cards.forEach(c => c.pos="o");
    for (const stage of stages) await stage(use,{},user);
    if (!use.excluded.includes(target) && !use.directHit.includes(target) && target.hand.some(c => c.name === "shan")) {
        target.hand.splice(target.hand.findIndex(c => c.name === "shan"),1);
        trace.push("dodge");
    } else if (!use.excluded.includes(target)) {
        const hit = { name:"sha", card, player:user, baseDamage:1, extraDamage:props.bonus || 0 };
        if (user.storage[plan]) await S[plan].content({},hit,user);
        ctx._status.event = hit;
        const ev = damage.call(target);
        ev.getParent = name => name === "useCard" ? use : hit;
        if (ev.num > 0) target.getHistory("damage").push(ev);
        trace.push("hit " + ev.num + (use.directHit.includes(target) ? " direct" : ""));
        if (!ev.num) { assert.ok(ev.filterStop()); assert.equal(ev.zero,"damageZero"); }
    }
    currentUse=prev;
}
for (const user of [ally,zhao]) user.useCard = function(card,cards,victim,count) {
    assert.equal(victim,target); assert.equal(count,false);
    assert.equal(card.nature,"fire"); assert.equal(card.number,7);
    return { set(k,v) { this[k]=v; return this; }, then(resolve,reject) {
        slash(user,card,cards,{},this).then(resolve,reject);
    } };
};
function checkFocusAI() {
    const getters = read("noname/get/index.js");
    const get = {
        info: key => key === tag ? S[tag] : {}, name: card => card.name,
        autoViewAs: card => card, result: () => ({target:-1}), tag: () => false,
        attitude: (a,b) => a.side === b.side ? 5 : -5,
    };
    const context = {get, lib:{skill:{global:[]}}, game:{expandSkills() {}}, _status:{event:{}},
        CacheContext:{requireCacheContext: () => ({get,delegate: value => value})}};
    ctx.get.attitude = get.attitude;
    const unit = (side,hp) => ({
        side,hp,storage:{},isIn:()=>true,getSkills:()=>[],hasSkill:()=>false,hasSkillTag:()=>false,countCards:()=>2,
    });
    const source=unit(1,3), owner=unit(1,3), markedEnemy=unit(-1,3), other=unit(-1,2);
    const material={name:"sha"}, buried=[material], sha={name:"sha"};
    owner.hasSkill = name => name === "nihil_fuzhu_follow";
    markedEnemy.getExpansions = () => buried;
    markedEnemy.getSkills = () => [tag];
    source.canUse = (card,target,dist) => target===markedEnemy && dist===false && card.nature==="fire";
    const trap = {owner,cards:[material],nature:"fire"};
    for (const name of ["effect_use","effect"]) {
        const start = getters.indexOf("\n  "+name+"(target, card, player, player2, isLink)");
        assert.ok(start >= 0);
        const effect=vm.runInNewContext("({"+getters.slice(start,getters.indexOf("\n  }",start)+4)+"})."+name,context);
        const score=(target,card=sha,link=false)=>effect(target,card,source,source,link);
        delete markedEnemy.storage[tag];
        const base=score(markedEnemy);
        assert.ok(score(other)>base);
        markedEnemy.storage[tag]=trap;
        assert.ok(score(markedEnemy)>score(other),"队友应把有诛杀的敌人排到普通敌人前");
        assert.equal(score(markedEnemy,{name:"juedou"}),base);
        assert.equal(score(markedEnemy,sha,{source:other}),base);
        owner.side=-1;
        assert.equal(score(markedEnemy),base);
        owner.side=1;
        markedEnemy.side=1;
        const allyScore=score(markedEnemy);
        delete markedEnemy.storage[tag];
        assert.equal(score(markedEnemy),allyScore);
        markedEnemy.side=-1;
        markedEnemy.storage[tag]=trap;
        trap.nature="thunder";
        assert.equal(score(markedEnemy),base,"埋杀受限时不计追击");
        trap.nature="fire";
        buried.pop();
        assert.equal(score(markedEnemy),base);
        buried.push(material);
    }
}
function checkTargetOrder(card, borrowedScore) {
    const owner=unit("昭"), friend=unit("队友"), fresh=unit("未埋"), trapped=unit("已埋"), weak=unit("残血未埋");
    owner.side=friend.side=1;
    fresh.side=trapped.side=weak.side=-1;
    fresh.hp=4; trapped.hp=weak.hp=1;
    owner.hasSkill=k=>["nihil_fuzhu","nihil_fuzhu_follow"].includes(k);
    const buried={name:"sha"};
    trapped.storage[tag]={owner,cards:[buried]};
    for (const t of [friend,fresh,trapped,weak]) t.getExpansions=()=>t===trapped?[buried]:[];
    const saved=ctx.get;
    const event={player:owner};
    ctx.get={...saved,event:()=>event,card:()=>card,cacheEffectUse:t=>t.base};
    try {
        event.ai2=ctx.get.cacheEffectUse;
        S[S.nihil_fuzhu.global].onChooseToUse(event);
        const score=borrowedScore || event.ai2;
        function pick(...candidates) {
            const best=candidates.reduce((a,b)=>score(b,candidates)>score(a,candidates)?b:a);
            return score(best)>0 ? best : null;
        }
        fresh.base=0; trapped.base=50; friend.base=-5; weak.base=0;
        assert.equal(pick(trapped,friend,fresh),fresh,"昭的零伤杀也先埋未标记敌人");
        assert.equal(pick(trapped,fresh,weak),weak,"未标记敌人中优先低血量");
        fresh.hp=weak.hp; weak.hand=[{},{}];
        assert.equal(pick(weak,trapped,fresh),fresh,"同血时优先手牌少的敌人");
        assert.equal(pick(trapped,friend),trapped,"仅剩已标记敌人可选时仍可出杀");
        event.player=friend;
        fresh.base=50; trapped.base=1;
        assert.equal(pick(fresh,trapped),trapped,"队友优先引爆诛杀");
        friend.canUse=()=>false;
        assert.equal(pick(trapped,fresh),fresh,"追杀不合法时回到正常选敌");
    } finally { ctx.get=saved; }
}
function checkPhaseBorrow() {
    const filter = ctx.lib.filter;
    for (const [name, head] of [["filterEnable", "filterEnable: function"], ["filterCard", "filterCard("],
        ["cardEnabled", "cardEnabled: function"], ["cardUsable", "cardUsable("]]) {
        const start = library.indexOf("\n    " + head) + 1;
        assert.ok(start > 0, name);
        filter[name] = run("({" + library.slice(start, library.indexOf("\n    },",start)+6) + "})." + name);
    }
    const getters = read("noname/get/index.js");
    const start = getters.indexOf("  inpileVCardList(filter)");
    ctx.get.inpileVCardList = run("({" + getters.slice(start,getters.indexOf("\n  }",start)+4) + "}).inpileVCardList");
    ctx.lib.inpile = ["sha"]; ctx.lib.inpile_nature = ["fire","thunder"]; ctx.lib.skill.global=[];
    ctx.get.type = () => "basic";
    ctx.get.info = key => typeof key === "string" ? S[key] :
        {name:"sha", enable:true, usable:1, updateUsable:"phaseUse", selectTarget:1};
    ctx.get.copy = v => v;
    ctx.game.expandSkills = skills => skills;
    ctx.game.hasPlayer2 = () => false;
    ctx.game.checkMod = (...args) => args.at(-2) === "cardUsable" ?
        S[plan].mod.cardUsable(args[0],zhao,args[2]) : args.at(-3);
    zhao.getSkills = () => ["nihil_yizhi"];
    zhao.countUsed = () => 0;
    zhao.storage[plan] = {sha:1,damage:0};
    zhao.hand=[{name:"du"}]; zhao.used=false;
    const phase = {name:"phaseUse", player:zhao};
    const evt = {name:"chooseToUse",type:"phase",player:zhao,getParent:()=>phase,filterCard:filter.filterCard};
    ctx._status.event = evt;
    ctx.ui = { create:{ dialog:(label,[choices]) => choices } };
    const choices = () => S.nihil_yizhi.chooseButton.dialog(evt,zhao);
    assert.equal(filter.filterEnable(evt,zhao,"nihil_yizhi"),true);
    assert.ok(choices().some(c => c[2] === "sha" && !c[3]));
    zhao.countUsed = () => 1;
    assert.equal(choices().length,0);
    zhao.countUsed = () => 0;
    zhao.storage[plan].sha = 0;
    assert.equal(choices().length,0);
    zhao.hand = [];
}

async function main() {
    checkFocusAI();
    checkTargetOrder({name:"sha",cards:[phys]});
    assert.equal(S.nihil_qianmian.trigger.player, "phaseBegin");
    assert.equal(mod.character.nihil_zhao.hp,3);
    assert.equal(fs.existsSync(path.join(pack,"image/character/nihil_zhao.png")),true);
    const numbersStart = content.indexOf("  async chooseNumbers(");
    const nativeChoose = run("({" + content.slice(numbersStart, content.indexOf("\n  },", numbersStart) + 4) + "}).chooseNumbers");
    let config;
    let selection = [4,3,1,0];
    let handModifier = 0;
    Object.assign(zhao, { hp: 3, maxHp: 3, getHp: playerMethod("getHp"),
        getDamagedHp: playerMethod("getDamagedHp"), getHandcardLimit: playerMethod("getHandcardLimit") });
    const originalCheckMod = ctx.game.checkMod;
    ctx.game.checkMod = (player, num, hook) => {
        if (hook === "maxHandcard") return num + handModifier;
        if (hook === "maxHandcardFinal") return S[plan].mod.maxHandcardFinal(player, num) ?? num;
        return num;
    };
    zhao.getCardUsable = () => 1;
    zhao.chooseNumbers = opts => {
        config = opts;
        return { async forResult() {
            const evt = { ...opts, isMine: () => false, isOnline: () => false };
            await nativeChoose(evt, {}, zhao);
            assert.equal(evt.result.bool,true);
            assert.equal(opts.filterOk({...opts,numbers:evt.result.numbers}),true);
            return {bool:selection !== null, numbers:selection};
        } };
    };
    await S.nihil_qianmian.content({}, {}, zhao);
    assert.deepEqual(Array.from(config.numbers),[2,3,1,1]);
    assert.equal(config.filterSelect(3,0,config),false);
    config.numbers[3] = 0;
    assert.equal(config.filterOk(config),false);
    assert.equal(config.filterSelect(4,0,config),true);
    config.numbers[0] = 4;
    assert.equal(config.filterOk(config),true);
    const ordinaryPlan = zhao.storage[plan];
    selection = null;
    await S.nihil_qianmian.content({}, {}, zhao);
    assert.equal(zhao.storage[plan],ordinaryPlan);
    delete zhao.storage[plan];
    zhao.hp = 1;
    selection = [2,1,1,2];
    await S.nihil_qianmian.content({}, {}, zhao);
    assert.deepEqual(Array.from(config.numbers), [2,1,1,1]);
    assert.equal(config.budget, 8);
    assert.equal(config.filterOk(config), false);
    assert.equal(config.filterSelect(2,3,config), true);
    assert.equal(config.filterSelect(3,3,config), false);
    assert.equal(config.filterSelect(3,1,config), true);
    assert.equal(zhao.storage[plan].damage, 2);
    delete zhao.storage[plan];
    handModifier = 2;
    selection = [2,0,2,3];
    await S.nihil_qianmian.content({}, {}, zhao);
    assert.equal(config.budget, 10);
    assert.equal(zhao.getHandcardLimit(), 0);
    handModifier++;
    assert.equal(zhao.getHandcardLimit(), 1);
    delete zhao.storage[plan];
    assert.equal(zhao.getHandcardLimit(), 4);
    handModifier = 0;
    zhao.hp = 3;
    // 已生效的界英姿和有限出杀加成能折算；后续事件只施加差额。
    zhao.hasSkill = k => k === "reyingzi";
    zhao.getCardUsable = () => 2;
    selection = [1,3,2,2];
    await S.nihil_qianmian.content({}, {}, zhao);
    assert.deepEqual(Array.from(config.numbers),[3,3,2,1]);
    assert.equal(config.budget,10);
    const boostedDraw = {name:"phaseDraw",num:4};
    await S[plan].content({},boostedDraw,zhao);
    assert.equal(boostedDraw.num,2);
    assert.equal(S[plan].mod.cardUsable(phys,zhao,3),3);
    zhao.hasSkill = k => zhao.used === k;
    zhao.getCardUsable = () => Infinity;
    selection = [4,3,1,0];
    await S.nihil_qianmian.content({}, {}, zhao);
    assert.equal(config.budget,8);
    ctx.game.checkMod = originalCheckMod;
    const phaseDraw = {name:"phaseDraw", num:3};
    await S[plan].content({},phaseDraw,zhao); assert.equal(phaseDraw.num,5);
    zhao.storage[plan].sha = 0;
    assert.equal(S[plan].mod.cardUsable(phys,zhao,1),0);
    assert.equal(S[plan].mod.cardUsable(phys,zhao,Infinity),Infinity);
    bury=true;
    assert.equal(inRange(phys,zhao,target),true, "无诛杀时火杀可选远处目标");
    assert.equal(inRange({name:"shunshou"},zhao,target),false, "距离特权仅适用于杀");
    await slash(zhao,phys,[phys]);
    assert.deepEqual(trace.splice(0),["sword","bury"]);
    assert.equal(inRange(phys,zhao,target),false, "已埋诛杀时恢复正常距离");
    // 昭可以把自己的零伤追杀重新埋回。使用追杀仍摸一张。
    await slash(zhao,{name:"sha"},[]);
    assert.deepEqual(trace.splice(0),["sword","sword","bury","hit 0"]);
    assert.equal(zhao.drawn,1);
    assert.ok(target.storage[tag]);
    // 追杀被闪，原杀命中。只有使用者摸牌。
    bury=false;
    target.hand=[{name:"tao"},{name:"shan"}];
    await slash(ally,{name:"sha"},[]);
    assert.deepEqual(trace.splice(0),["sword","sword","dodge","hit 1"]);
    assert.deepEqual([ally.drawn,zhao.drawn],[1,1]);
    assert.equal(target.hand[0].name,"tao");
    assert.equal(target.storage[tag],undefined);
    assert.equal(inRange({name:"sha",isCard:true},zhao,target),true, "诛杀移除后视为使用的杀也可指定远处目标");
    bury=true; await slash(zhao,phys,[phys]); trace.length=0;
    ally.canUse=()=>false;
    await slash(ally,{name:"sha"},[]);
    assert.deepEqual(trace.splice(0),["sword","hit 1"]);
    assert.deepEqual([ally.drawn,zhao.drawn],[1,1]);
    assert.ok(target.storage[tag]);
    ally.canUse=()=>true;
    await slash(ally,{name:"sha"},[]);
    assert.deepEqual(trace.splice(0),["sword","sword","hit 1","hit 1"]);
    assert.deepEqual([ally.drawn,zhao.drawn],[2,2]);
    await slash(zhao,phys,[phys]); trace.length=0;
    zhao.storage[plan].damage=2; bury=false;
    await slash(zhao,{name:"sha"},[]);
    assert.deepEqual(trace.splice(0),["sword","sword","hit 2","hit 2"]);
    assert.equal(zhao.drawn,4, "昭自己引爆并造成两点伤害，总共摸两张");
    bury=true; await slash(zhao,phys,[phys]); trace.length=0;
    zhao.storage[plan].damage=0; bury=false;
    await slash(zhao,{name:"sha"},[],{bonus:1});
    assert.deepEqual(trace.splice(0),["sword","sword","hit 0","hit 1"]);
    assert.equal(zhao.drawn,5, "追杀为零伤，原杀有额外伤害，昭只摸使用者的一张");
    checkPhaseBorrow();
    const skill=S.nihil_yizhi;
    const eventSource = read("noname/library/element/gameEvent.js"), clicks = read("noname/ui/click/index.js");
    const methods = eventSource.slice(eventSource.indexOf("  backup(skill)"), eventSource.indexOf("// #endregion", eventSource.indexOf("  restore()")));
    const eventMethods = run("({" + methods.replace("  restore()", ", restore()") + "})");
    const ok = run("({" + clicks.slice(clicks.indexOf("  ok(node)"),clicks.indexOf("  cancel(node)")) + "}).ok");
    const cancel = run("({" + clicks.slice(clicks.indexOf("  cancel(node)"),clicks.indexOf("  logv(")) + "}).cancel");
    const buttonSteps = run("({" + content.slice(content.indexOf("  chooseButton: ["), content.indexOf("\n  ],",content.indexOf("  chooseButton: ["))+5) + "}).chooseButton");
    run("Array.prototype.add = function (item) { if (!this.includes(item)) this.push(item); return this; }");
    const nativeUseResult = playerMethod("useResult");
    const shan = standard.slice(standard.indexOf("shan: {"));
    const shanContent = run("({" + shan.slice(shan.indexOf("content()"),shan.indexOf("ai: {")) + "}).content");
    const selectCardStart = standard.indexOf('next.set("filterCard", function (card, player)',standard.indexOf("请使用一张闪响应杀"));
    const shanFilter = run("(" + standard.slice(standard.indexOf("function",selectCardStart),standard.indexOf("});",selectCardStart)+1) + ")");
    const saveStart=content.indexOf("filterCard(card, player2, event2)",content.indexOf("async _save("));
    const saveFilters=run("({"+content.slice(saveStart,content.indexOf("          prompt,",saveStart))+"})");
    const savableStart=library.indexOf("cardSavable: function");
    ctx.lib.filter.cardSavable=run("({"+library.slice(savableStart,library.indexOf("\n    },",savableStart)+6)+"}).cardSavable");
    const extra=read("card/extra.js"), wineStart=extra.indexOf("savable(card, player, dying)");
    const wine=run("({"+extra.slice(wineStart,extra.indexOf("usable: 1",wineStart))+"})");
    ctx.lib.inpile=["sha","shan","tao","jiu"];
    zhao.hasSkillTag=()=>false;
    ctx.get.info = key => typeof key === "string" ? S[key] :
        {notarget:key?.name === "shan",savable:key?.name==="tao" || (key?.name==="jiu" && wine.savable)};
    ctx.get.filter = filter => typeof filter === "function" ? filter : () => true;
    ctx.get.links = list => list.map(button=>button.link);
    ctx.get.select = n => typeof n === "function" ? ctx.get.select(n()) : Array.isArray(n) ? n : [n,n];
    const hooks = read("noname/library/hooks/index.js");
    const autoConfirm = hooks.slice(hooks.indexOf("function autoConfirm("), hooks.indexOf(",\n    function createChooseAll"));
    ctx.lib.hooks = {checkEnd:[run("("+autoConfirm+")")]};
    ctx.lib.config = {auto_confirm:false};
    ctx.ui.window = {addEventListener() {}};
    ctx.ui.click = {ok};
    ctx.ui.create.confirm = () => {};
    ctx.game.import = (_, factory) => factory(ctx.lib,ctx.game,ctx.ui,ctx.get,{},ctx._status).arenaReady();
    run(fs.readFileSync(path.join(pack,"extension.js"),"utf8"));
    function checkSelection(event, valid) {
        const selection = {ok:valid, auto:true, autoConfirm:false};
        for (const hook of ctx.lib.hooks.checkEnd) hook(event, selection);
    }
    ctx.game.check=ctx.game.uncheck=ctx.game.resume=ctx.game.delay=()=>{};
    ctx.game.cardsDiscard=cards=>cards.forEach(c=>c.pos="d");
    ctx.get.event=()=>ctx._status.event;
    const checker=read("noname/game/check.js");
    ctx.game.Check=run("new ("+checker.slice(checker.indexOf("class Check"),checker.indexOf("export {"))+")()");
    const gameSource=read("noname/game/index.js");
    const checkGift=run("({"+gameSource.slice(gameSource.indexOf("  check(event2 ="),gameSource.indexOf("  Check = new Check()"))+"}).check");
    ctx.game.Check.confirm=()=>{};
    ctx.HTMLDivElement=class {};
    ctx.game.callHook=(name,args)=>ctx.lib.hooks[name]?.forEach(fn=>fn(...args));
    ctx.game.players=[zhao,ally,target];
    ctx.lib.filter.cardAiIncluded=()=>true;
    ctx.get.card=()=>null;
    ctx.get.noSelected=()=>!ctx.ui.selected.cards.length && !ctx.ui.selected.targets.length;
    function classList() {
        const classes=new Set();
        return {add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)};
    }
    for (const unit of ctx.game.players) {
        unit.isOut=()=>false;
        unit.node={equips:{classList:classList()}};
    }
    const supplierResponse = ally.chooseToRespond;
    async function ask(who, accepts, name, opts={}) {
        wanted=name; supplier=who; answer=accepts;
        gift={name:opts.gift || "du",pos:"h",recheck(){}}; zhao.hand=[gift]; zhao.used=false;
        const supplyCard={name,nature:opts.suppliedNature,pos:"h",recheck(){}};
        if (who===zhao && gift.name!==name) who.hand.push(supplyCard);
        if (who!==zhao) who.hand=[supplyCard];
        const req={...eventMethods, isMine:()=>true, name:opts.request || "chooseToUse",player:zhao,selectTarget:opts.fixed?-1:1,
            filterCard:opts.filter || (name==="shan"?shanFilter:card=>card.name===name),
            filterTarget:(_card,player,victim)=>victim===target, getParent:()=>({})};
        if (opts.dying) Object.assign(req, saveFilters, {type:"dying",dying:opts.dying});
        ctx.get.event=()=>ctx._status.event;
        ctx._status.event=req;
        const options = skill.chooseButton.dialog(req,zhao);
        assert.equal(options.direct,options.length===1);
        if (opts.trick) {
            assert.deepEqual(Array.from(options,c=>[c[2],c[3]]),[[name,undefined]],opts.trick);
        }
        if (opts.dying) {
            assert.deepEqual(Array.from(options,c=>c[2]), opts.dying===zhao ? ["tao","jiu"] : ["tao"]);
        }
        req.buttoned="nihil_yizhi";
        const pick={name:"chooseButton",getParent:()=>req,
            dialog:{buttons:options.map(link=>({link})),style:{},open(){},close(){}},
            selectButton:1,direct:options.direct,isMine:()=>true};
        if (options.direct) {
            await buttonSteps[0](pick,{},zhao);
            assert.equal(pick.result.links[0][2],name,"单项由引擎自动选中");
        } else {
            ctx._status.event=pick;
            ctx.ui.selected={cards:[],targets:[],buttons:[]};
            checkSelection(pick,false);
            assert.equal(pick.result,undefined);
            const selected=pick.dialog.buttons.find(({link})=>link[2]===name && link[3]===opts.declaredNature);
            assert.ok(selected);
            ctx.ui.selected.buttons.push(selected);
            checkSelection(pick,true);
            assert.equal(pick.result?.links[0],selected.link,"点选牌名即提交");
        }
        ctx._status.event=req;
        delete req.buttoned;
        const backup="nihil_yizhi_backup", info=S[backup]=skill.chooseButton.backup(pick.result.links);
        req.backup(backup);
        assert.equal(req.position,"h");
        assert.equal(req.selectTarget,1);
        assert.ok(req.filterCard(gift,zhao) && req.filterTarget(gift,zhao,who));
        for (const item of [...ctx.game.players,...zhao.hand]) item.classList=classList();
        ctx.ui.selected={cards:[],targets:[],buttons:[]};
        assert.equal(checkGift(req),false);
        assert.ok(gift.classList.contains("selectable") && who.classList.contains("selectable"));
        const pickGift=()=>ctx.ui.selected.cards.push(gift);
        const pickRecipient=()=>ctx.ui.selected.targets.push(who);
        (opts.personFirst ? pickRecipient : pickGift)();
        assert.equal(checkGift(req),false);
        assert.equal(req.result,undefined);
        if (opts.cancelGift) {
            cancel();
            assert.equal(req.skill,undefined);
            assert.ok(zhao.hand.includes(gift) && !zhao.used);
            return;
        }
        (opts.personFirst ? pickGift : pickRecipient)();
        assert.equal(checkGift(req),true);
        assert.equal(req.skill,undefined);
        assert.ok(!req.result.card, "交牌阶段不能提前指定要使用的牌或其目标");
        const order=[];
        who.chooseToRespond=function(...args) {
            assert.ok(this.hand.includes(gift) && zhao.used==="nihil_yizhi_used");
            order.push("供牌");
            return supplierResponse.apply(this,args);
        };
        zhao.chooseTarget=function(opts2) {
            order.push("杀目标");
            assert.equal(opts2._get_card.name,name);
            if (name==="sha") checkTargetOrder(opts2._get_card,opts2.ai);
            assert.equal(opts2.filterTarget(opts2._get_card,zhao,target),true);
            return response(opts.cancelTarget?{bool:false}:{bool:true,targets:[target]});
        };
        ctx.game.filterPlayer2=filter=>[ally,target,zhao].filter(t=>filter(t));
        const draws=who.drawn, zhaoDraws=zhao.drawn;
        const pre={result:req.result,getParent:()=>req,player:zhao};
        ctx._status.event=pre;
        await info.precontent(pre,{},zhao);
        who.chooseToRespond=supplierResponse;
        return {result:req.result,order,draws:who.drawn-draws,zhaoDraws:zhao.drawn-zhaoDraws,req,supplyCard};
    }
    assert.ok(!skill.hiddenCard(zhao,"shan"), "空手时不能支付");
    await ask(zhao,true,"shan",{cancelGift:true});
    await ask(ally,true,"sha",{personFirst:true,cancelGift:true});
    const self=await ask(zhao,true,"shan",{gift:"shan",personFirst:true});
    assert.deepEqual(self.order,["供牌"]);
    assert.equal(self.result.cards[0],gift);
    assert.equal(self.draws,2);
    let miss;
    zhao.useCard=(card,cards,targets)=>{
        assert.equal(card.name,"shan"); assert.equal(targets.length,0);
        ctx.event={getParent:()=>self.req};
        shanContent();
        miss=ctx.event.result;
        return {};
    };
    nativeUseResult.call(zhao,self.result,self.req);
    assert.equal(miss,"shaned","原生闪应向杀返回闪避成功");
    const own=await ask(zhao,true,"shan");
    assert.ok(zhao.hand.includes(gift)); assert.equal(own.draws,2);
    const borrowed=await ask(ally,true,"sha",{suppliedNature:"fire",personFirst:true});
    assert.deepEqual([borrowed.zhaoDraws,borrowed.draws],[1,1]);
    assert.deepEqual(borrowed.order,["供牌","杀目标"]);
    assert.equal(borrowed.result.targets[0],target); assert.equal(borrowed.result.card.nature,"fire");
    for (const [range, immediate] of [[[1,1],true],[[1,2],false],[[2,2],false]]) {
        const choice={name:"chooseTarget",nihilCanCancel:true,isMine:()=>true,selectTarget:range,_get_card:{name:"sha"}};
        ctx._status.event=choice;
        ctx.get.event=()=>choice;
        ctx.ui.selected={cards:[],targets:[target],buttons:[]};
        checkSelection(choice,range[0]===1);
        assert.equal(!!choice.result?.bool,immediate);
    }
    for (const [trick,name,nature] of [["nanman","sha","fire"],["wanjian","shan"],["juedou","sha","thunder"]]) {
        const entry=standard.indexOf(trick+": {");
        const filterStart=standard.indexOf('next.set("filterCard", function',entry);
        const filter=run("("+standard.slice(standard.indexOf("function",filterStart),standard.indexOf("});",filterStart)+1)+")");
        const responded=await ask(ally,true,name,{trick,filter,request:"chooseToRespond",suppliedNature:nature});
        assert.deepEqual(responded.order,["供牌"]);
        assert.equal(responded.result.card.name,name);
        assert.equal(responded.result.card.nature,nature);
        assert.equal(responded.result.targets.length,0);
    }
    for (const [dying,name] of [[target,"tao"],[zhao,"jiu"],[zhao,"tao"]]) {
        dying.hp=0;
        const saved=await ask(ally,true,name,{fixed:true,dying});
        assert.deepEqual(saved.order,["供牌"]);
        assert.equal(saved.result.targets.length,1);
        assert.equal(saved.result.targets[0],dying);
        assert.equal(saved.result.card.name,name);
    }
    const declined=await ask(ally,false,"sha");
    assert.ok(declined.result.cancel && ally.hand.includes(gift)); assert.deepEqual(declined.order,["供牌"]);
    assert.deepEqual([declined.zhaoDraws,declined.draws],[0,0]);
    target.hp=0;
    const wineGift=await ask(target,false,"tao",{gift:"jiu",fixed:true,dying:target});
    assert.ok(wineGift.result.cancel && target.hand.includes(gift));
    assert.equal(gift.name,"jiu");
    assert.ok(ctx.lib.filter.cardSavable(gift,target,target),"拒绝供桃后，队友仍可用收到的酒自救");
    const wrong=await ask(ally,true,"sha",{declaredNature:"thunder",suppliedNature:"fire"});
    assert.deepEqual([wrong.zhaoDraws,wrong.draws],[0,0]);
    assert.ok(wrong.result.cancel && ally.hand.includes(wrong.supplyCard));
    const cancelled=await ask(ally,true,"sha",{cancelTarget:true});
    assert.ok(cancelled.result.cancel); assert.equal(cancelled.supplyCard.pos,"d");
    console.log("PASS 昭：千面回合开始加减分配、零伤雌雄剑、诛杀埋回、追杀命中和被闪的摸牌归属、颐指自给/他给/拒绝重选");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
