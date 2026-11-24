"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = file => fs.readFileSync(path.join(process.env.NONAME_ENGINE_ROOT, file), "utf8");
const content = read("noname/library/element/content.js");
const save = content.slice(content.indexOf("  async _save("), content.indexOf("  async chooseNumbers("));
const get = {
    name: c => c.name, nature: c => c.nature, value: () => 5, type: c => c.name === "du" ? "trick" : "basic",
    attitude: (a,b) => a.side === b.side ? 5 : -5, itemtype: c => c?.name ? "card" : undefined,
    info: key => typeof key === "string" ? lib.skill[key] : {}, translation: p => p.name,
};
const lib = {skill:{},config:{},filter:{
    cardRespondable: () => true,
    cardSavable: (c, p, t) => !c.blocked && (c.name === "tao" || (c.name === "jiu" && p === t)),
}};
const status = {};
get.event = () => status.event;
const game = {
    log() {},dead:[],players:[],
    filterPlayer(fn = () => true) {
        const list = this.players.filter(fn);
        list.sortBySeat = start => list.slice(list.indexOf(start)).concat(list.slice(0,list.indexOf(start)));
        return list;
    },
    countPlayer(fn) { return this.players.filter(fn).length; },
};
const context = vm.createContext({window:{nihilModules:{}},game,get,lib,_status:status});
vm.runInContext(fs.readFileSync(path.join(__dirname,"../nihilphile武将包/module/zhao.js"),"utf8"),context);
Object.assign(lib.skill, context.window.nihilModules.zhao.skill);
const {nihil_yizhi: point, nihil_fuzhu: bury, nihil_qianmian: faces} = lib.skill;
const nativeSave = vm.runInContext("({"+save+"})._save",context);

function person(side) {
    return {
        side,hp:3,maxHp:3,getHandcardLimit() { return this.hp; },getDamagedHp() { return this.maxHp-this.hp; },hand:[],storage:{},marks:[],drawn:0,isIn:()=>true,isAlive:()=>true,isDead:()=>false,isOut:()=>false,
        canSave:()=>true,getExpansions() { return this.marks; },
        countCards() { return this.hand.length; },
        getCards(zone, filter=()=>true) { return this.hand.filter(filter); },
        getKnownCards() { return this.hand.filter(c=>c.known); },
        getUseValue:()=>3,hasSkill:()=>false,getCardUsable:()=>1,canUse:(c,t)=>!t.far,
        logSkill(){},markSkill(){},addTempSkill(){},hasSkillTag:()=>false,
    };
}

async function testPlans() {
    const z=person(1), a=person(-1), b=person(-1); game.players=[z,a,b];
    let budgetBonus=0;
    z.getCardUsable=()=>1+budgetBonus;
    z.chooseNumbers=opts=>({async forResult(){return {bool:true,numbers:opts.processAI(opts)};}});
    async function check(expected) {
        await faces.content({}, {}, z);
        const {draw,hand,sha,damage}=z.storage.nihil_qianmian_turn;
        assert.deepEqual([draw,hand,sha,damage],expected);
    }
    await check([4,3,1,0]);
    z.hand=[{name:"sha"}]; await check([3,3,2,0]);
    b.marks=[{}]; await check([4,3,1,0]);
    a.marks=[{}]; await check([2,1,1,2]);
    budgetBonus=1; await check([2,2,1,2]); budgetBonus=0;
    a.far=b.far=true; await check([4,4,0,0]);
    a.far=false; z.hand=[]; await check([4,4,0,0]);
    z.hp=1; z.hand=[{name:"shan"},{name:"tao"},{name:"shan"},{name:"jiu"}];
    await check([2,6,0,0]);
    a.marks=[]; b.marks=[]; z.hand=[{name:"sha"}];
    const effect=t=>bury.ai.effect.player(z.hand[0],z,t,0,false)[1];
    a.hp=1; b.hp=2; a.hand=[{},{}]; assert.ok(effect(a)>effect(b));
    b.hp=1; assert.ok(effect(b)>effect(a));
    assert.ok(bury.check({target:a,getParent:()=>({})},z));
}

function ask(z, name, type, base, dying) {
    const req={name, type, dying, player:z, isMine:()=>false,isOnline:()=>false,
        getParent:()=>({}),filterCard:c=>dying ? lib.filter.cardSavable(c,z,dying) : c.name==="sha",
        [name==="chooseToRespond"?"ai":"ai1"]:base};
    status.event=req;
    point[name==="chooseToRespond"?"onChooseToRespond":"onChooseToUse"](req);
    const score=req.ai1("nihil_yizhi");
    return {req,score};
}

function testSelf() {
    const z=person(1), ally=person(1);game.players=[z,ally];z.hand=[{name:"sha",nature:"fire"}];
    for(const name of ["chooseToUse","chooseToRespond"]) {
        const {req,score}=ask(z,name,name==="chooseToUse"?"phase":undefined,c=>typeof c==="string"?2:9);
        assert.ok(score>req.ai1(z.hand[0]));
        status.event={getParent:()=>req};get.player=()=>z;
        const link=["basic","","sha","fire"];
        assert.ok(point.chooseButton.check({link})>point.chooseButton.check({link:["basic","","sha","thunder"]}));
        lib.skill.backup=point.chooseButton.backup([link]);req.skill="backup";status.event=req;
        assert.ok(lib.skill.backup.ai2(z)>lib.skill.backup.ai2(ally));
    }
}

async function testSave(hp, startWithDying, names, expectedWine, expectedHp) {
    const z=person(1), victim=person(1);victim.hp=hp;
    z.hand=names.map(name=>({name}));game.players=[z,victim];
    const start=startWithDying?victim:z;status.currentPhase=start;z.next=victim;victim.next=z;
    let sent=0, selfPeaches=0;
    const trigger={player:victim,untrigger(){}};
    for(const helper of game.players) helper.chooseToUse=config=>({
        async forResult() {
            if(helper===z && !sent && !selfPeaches && z.hand.length) {
                const {req,score}=ask(z,"chooseToUse","dying",c=>typeof c==="string"?7:1,victim);
                const peach=z.hand.find(c=>c.name==="tao" && req.filterCard(c));
                if(peach) {
                    assert.equal(req.zhaoWine,undefined);
                    assert.equal(req.zhaoPreferredBasic.name,"tao");
                    assert.ok(score>req.ai1(peach));
                    req.skill="backup";
                    const backup=lib.skill.backup=point.chooseButton.backup([["basic","","tao"]]);
                    assert.ok(backup.ai2(z)>backup.ai2(victim));
                    selfPeaches++;
                } else if(req.zhaoWine && score>0) {
                    status.event=req;req.skill="backup";
                    const backup=lib.skill.backup=point.chooseButton.backup([["basic","","tao"]]);
                    const gift=z.hand.filter(c=>backup.ai1(c)>0), recipient=game.players.filter(p=>backup.ai2(p)>0);
                    assert.equal(gift.length,1);assert.equal(gift[0].name,"jiu");assert.deepEqual(recipient,[victim]);
                    z.hand.splice(z.hand.indexOf(gift[0]),1);victim.hand.push(gift[0]);sent++;
                }
            }
            const idx=helper.hand.findIndex(c=>config.filterCard(c,helper,{dying:victim}));
            if(idx<0) return {bool:false};
            helper.hand.splice(idx,1);victim.hp++;return {bool:true};
        },
    });
    await nativeSave({player:start},trigger);
    assert.equal(selfPeaches,Number(names.includes("tao")));
    assert.equal(sent,expectedWine);assert.equal(victim.hp,expectedHp);
}

(async()=>{
    await testPlans();testSelf();
    await testSave(0,false,["jiu"],1,1);
    await testSave(-1,false,["jiu"],0,-1);
    await testSave(-1,false,["jiu","tao"],0,0);
    await testSave(-1,false,["tao","tao","jiu"],0,1);
    await testSave(0,false,["jiu","tao"],0,1);
    await testSave(0,true,["jiu"],0,0);
    console.log("PASS 昭 AI：千面分配、伏诛目标、自指用牌和响应、濒死求桃顺序与送酒");
})().catch(e=>{console.error(e);process.exitCode=1;});
