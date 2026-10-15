const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const load = require('./fixtures/luofei_effect_harness');
const characters = require('./fixtures/luofei_effect_characters');
const candidate = fs.readFileSync(path.join(__dirname,'../nihilphile武将包/module/jie_luofei_ai.js'),'utf8');
const SHA = '12a90c940db21d7dbd87296fa3c754f60b32c2ced8f6a3d474e00a6ecb96d1dc';
const clean = v => JSON.parse(JSON.stringify(v));
const api = load(candidate);
function fixture(factory=api) {
    const f = factory.fixture();
    for (const p of f.game.players) { p.mayHaveShan = () => false; p.mayHaveSha = () => false; }
    Object.assign(f.lib.skill,characters.skill); f.lib.character = characters.character; f.loser.name = f.third.name = "effect_plain_blank";
    f.phase.nihilJieShichengUsed = ['damage','remove'];
    f.lib.card.sha.ai.result.target = -1.5;
    return f;
}
function inspect(f) { return clean(f.planner.inspect(f.owner)); }
function skill(f,p,effect,name='probe') { f.lib.skill[name]={ai:{effect}}; p.skills.push(name); }
function attack(f) { const c=f.card('sha'); f.move(c,'h',f.owner); f.open(); return c; }
const tests=[]; const test=(name,run)=>tests.push({name,run});
test('pseudo blanks contain only AI effects and preserve gameplay mechanics',()=>{
    assert.equal(Object.keys(characters.character).length,3);
    for(const info of Object.values(characters.skill)) assert.deepEqual(Object.keys(info),['ai']);
});
test('actor pseudo blank blocks own attack, keeps stop and bypasses both continuations',()=>{
    const f=fixture(); attack(f); f.owner.skills.push('effect_actor_penalty');
    const d=inspect(f).decision; assert.equal(d.source,'conservative-risk'); assert.equal(d.firstAction.kind,'stop');
    assert.equal(d.ranked.length,0); assert.equal(d.coverage.coreWork,0); assert.equal(d.coverage.ordinaryWork,0); assert.deepEqual(d.continuation,[]);
});
test('target pseudo blank removes every risky ranked alternative but keeps safe target',()=>{
    const f=fixture(); attack(f); f.third.name='effect_retaliation_blank'; f.third.skills.push('effect_target_retaliation');
    const d=inspect(f).decision; assert.equal(d.source,'conservative-risk');
    assert.ok(d.ranked.every(r=>!r.action.targets.includes(f.third.playerid)));
    assert.ok(d.ranked.some(r=>r.action.targets.includes(f.loser.playerid)));
});
test('actual allied and hostile puppet actor owns the penalty',()=>{
    for(const who of ['loser','third']) { const f=fixture(); f.mark(f[who]); f.owner.disabled=true; attack(f); f[who].name='effect_actor_blank'; f[who].skills.push('effect_actor_penalty'); const d=inspect(f).decision; assert.equal(d.source,'conservative-risk'); assert.equal(d.firstAction.kind,'stop'); assert.ok(Object.values(d.guard.evidence).some(v=>v.reasons.some(r=>r.user===f[who].playerid))); }
});
test('same event skill add, storage-only mutation, and removal invalidate cached evidence',()=>{
    const f=fixture(); attack(f); assert.equal(inspect(f).decision.source,'benchmark-winner');
    skill(f,f.owner,{player_use:(c,u)=>c.name==='sha'?[1,-(u.storage.penalty||0)]:undefined});
    f.owner.storage.penalty=4; assert.equal(inspect(f).decision.source,'conservative-risk');
    f.owner.storage.penalty=0; assert.equal(inspect(f).decision.source,'benchmark-winner');
    f.owner.storage.penalty=4; assert.equal(inspect(f).decision.firstAction.kind,'stop');
    f.owner.skills.pop(); assert.equal(inspect(f).decision.source,'benchmark-winner');
});
test('native player_use precedence, numeric multiplier and separate additive accumulators',()=>{
    const f=fixture(); const c=attack(f); f.lib.card.sha.ai.result.player=1;
    const inputs=[];
    skill(f,f.owner,{player:()=>[1,-50],player_use:(card,u,t,v)=>{inputs.push(v);return 2;}},'scale');
    skill(f,f.owner,{player_use:()=>[1,3]},'bonus');
    skill(f,f.owner,{player_use:(card,u,t,v)=>{inputs.push(v);return [1,-4];}},'loss');
    const d=inspect(f).decision; assert.equal(d.source,'conservative-risk'); assert.ok(inputs.includes(1)); assert.ok(inputs.includes(2));
    assert.ok(Object.values(d.guard.evidence).some(v=>v.reasons.some(r=>r.skill==='loss')));
    assert.equal(f.lib.card.sha.ai.result.player,1); c.name='sha';
});
test('unrelated bonus never cancels separately severe actor loss',()=>{
    const f=fixture(); attack(f); skill(f,f.owner,{player_use:()=>[1,20]},'bonus'); f.owner.skills.push('effect_actor_penalty');
    assert.equal(inspect(f).decision.firstAction.kind,'stop');
});
test('numeric zero, zero tokens, minor losses and lost positive benefit keep original branch',()=>{
    for(const value of [0,'zeroplayer','zerotarget','zeroplayertarget',[1,-1],null]) {
        const f=fixture(); attack(f); if(value===null) f.lib.card.sha.ai.result.player=5;
        skill(f,f.owner,{player_use:()=>value===null?0:value});
        assert.equal(inspect(f).decision.source,'benchmark-winner');
    }
});
test('legacy target tuple reversal and ignoreSkill follow native dispatch',()=>{
    const f=fixture(); attack(f); skill(f,f.third,()=>[1,0,1,-4]); assert.equal(inspect(f).decision.source,'conservative-risk');
    f.owner.hasSkillTag=tag=>tag==='ignoreSkill'; assert.equal(inspect(f).decision.source,'benchmark-winner');
});
test('globals and expanded groups discover target actor retaliation',()=>{
    const f=fixture(); attack(f); f.lib.skill.parent={group:'effect_target_retaliation'}; f.third.skills.push('parent'); assert.equal(inspect(f).decision.source,'conservative-risk');
    f.third.skills.pop(); f.lib.skill.global.push('effect_actor_penalty'); assert.equal(inspect(f).decision.firstAction.kind,'stop');
});
test('callback exceptions and malformed values are diagnosed as unknown',()=>{
    for(const callback of [()=>{throw Error('test');},()=>null,()=>[1,NaN],()=>[1,0,2],()=>({length:2,0:1,1:-4})]) {
        const f=fixture(); attack(f); skill(f,f.owner,{player_use:callback}); const d=inspect(f).decision;
        assert.equal(d.source,'benchmark-winner'); assert.ok(d.guard.diagnostics.length>0); assert.equal(d.guard.active,false);
    }
});
test('probe restores event descriptors, selection array identities and contents even after exception',()=>{
    const f=fixture(); const c=attack(f); const e=f.state.active; const targets=f.ui.selected.targets, cards=f.ui.selected.cards;
    Object.defineProperty(e,'probeDescriptor',{value:7,writable:true,configurable:true,enumerable:false});
    const before=Object.getOwnPropertyDescriptors(e);
    skill(f,f.owner,{player_use:()=>{ e.probeDescriptor=8; e.addedByEffect=1; f.ui.selected.cards.push(c); f.ui.selected.targets=[f.third]; throw Error('probe'); }});
    inspect(f); assert.deepEqual(Object.getOwnPropertyDescriptors(e),before); assert.equal(f.ui.selected.targets,targets); assert.equal(f.ui.selected.cards,cards); assert.equal(cards.length,0);
});
test('adapter never asks other private hand identities and is invariant to hidden cards',()=>{
    const f=fixture(); attack(f); const hidden=f.card('shan'); f.move(hidden,'h',f.third);
    const original=f.third.getCards; f.third.getCards=function(zone){assert.ok(!zone.includes('h'),'adapter private hand read');return original.call(this,zone);};
    f.third.skills.push('effect_target_retaliation'); const before=inspect(f); hidden.name='tao'; assert.deepEqual(inspect(f),before);
});
test('modeled own and equipment callbacks are skipped while external equipment remains visible',()=>{
    const f=fixture(); attack(f); f.lib.skill.qinglong={ai:{effect:{player_use:()=>{throw Error('modeled');}}}}; f.owner.skills.push('qinglong');
    assert.equal(inspect(f).decision.guard,undefined);
    skill(f,f.owner,{player_use:()=>[1,-4]},'external_equipment'); assert.equal(inspect(f).decision.firstAction.kind,'stop');
});
test('native effect_use oracle agrees on actor-side numeric, tuple, precedence and legacy protocols',()=>{
    const protocols=[
        {seed:1,effect:{player_use:()=>-3},expected:-3,blocked:true},
        {seed:0,effect:{player_use:()=>-4},expected:0,blocked:false},
        {seed:0,effect:{player_use:()=>[1,-4]},expected:-4,blocked:true},
        {seed:1,effect:{player:()=>[1,-99],player_use:()=>2},expected:2,blocked:false},
        {seed:0,effect:()=>[1,0,1,-4],target:true,expected:-4,blocked:true},
        {seed:0,effect:{target:()=>[1,0,1,-4]},target:true,expected:-4,blocked:true},
        {seed:0,effect:{target_use:()=>-4},target:true,expected:0,blocked:false},
        {seed:3,effect:{player_use:()=>0},expected:0,blocked:false},
    ];
    for(const protocol of protocols){
        const f=fixture(); const c=attack(f); Object.assign(f.lib.card.sha.ai.result,{player:protocol.seed,ignoreStatus:true});
        f.get.result=card=>f.lib.card[card.name].ai.result; f.get.attitude=(a,b)=>a===b?1:0;
        f.context.CacheContext.requireCacheContext=()=>({get:{attitude:f.get.attitude},delegate:value=>value});
        skill(f,protocol.target?f.third:f.owner,protocol.effect);
        const native=vm.runInContext(api.harness.nativeMethod(api.harness.getSource,'effect_use(target, card, player, player2, isLink)',2),f.context).effect_use;
        assert.equal(native(f.third,c,f.owner,f.owner,true),protocol.expected);
        const d=inspect(f).decision;
        const row=d.guard?.evidence[`normal|${c.cardid}|owner|third`]; assert.equal(!!row?.blocked,protocol.blocked);
    }
});
test('borrowed sword indirect Sha and Qinglong known followup cannot bypass actor penalty',()=>{
    const f=fixture(); const sword=f.card('jiedao'),weapon=f.card('qinglong'); f.move(sword,'h',f.owner); f.move(weapon,'e',f.loser); f.loser.skills.push('effect_actor_penalty'); f.open();
    const d=inspect(f).decision; assert.equal(d.source,'conservative-risk'); assert.ok(d.ranked.every(r=>r.action.card!==sword.cardid||r.action.targets[0]!==f.loser.playerid));
    const g=fixture(); const sha=attack(g), fire=g.card('sha'), blade=g.card('qinglong');fire.nature='fire';g.move(fire,'h',g.owner);g.move(blade,'e',g.owner);
    skill(g,g.owner,{player_use:card=>card.nature==='fire'?[1,-4]:undefined});
    const guarded=inspect(g).decision;assert.ok(guarded.ranked.every(r=>r.action.card!==sha.cardid));
});
test('borrowed sword response refreshes same-event storage risk and refuses penalized Sha',()=>{
    const f=fixture(); const sha=f.card('sha'),weapon=f.card('qinglong'),sword=f.card('jiedao');f.move(sha,'h',f.owner);f.move(weapon,'e',f.owner);f.owner.getStat('card').sha=99;
    const parent=f.action('jiedao',async()=>{},{player:f.loser,parent:f.phase});
    const event=f.action('chooseToUse',async()=>{},{player:f.owner,parent,addCount:false,sourcex:f.third,respondTo:[f.loser,sword]});f.state.active=event;
    skill(f,f.owner,{player_use:(c,u)=>[1,-(u.storage.penalty||0)]});
    assert.equal(f.planner.score('order',f.owner,{card:sha}),100);
    f.owner.storage.penalty=4;assert.equal(f.planner.score('order',f.owner,{card:sha}),0);
    f.owner.storage.penalty=0;assert.equal(f.planner.score('order',f.owner,{card:sha}),100);
    f.lib.card.sha.ai.result.player=u=>u.storage.seed||0;f.lib.skill.probe.ai.effect.player_use=()=>-4;
    assert.equal(f.planner.score('order',f.owner,{card:sha}),100);f.owner.storage.seed=1;assert.equal(f.planner.score('order',f.owner,{card:sha}),0);f.owner.storage.seed=0;assert.equal(f.planner.score('order',f.owner,{card:sha}),100);
});
test('out-of-range penalized Sha preflight disables weapon and mark continuation planning',()=>{
    const f=fixture();attack(f);f.third.far=true;f.loser.far=true; const weapon=f.card('qinglong');f.move(weapon,'h',f.owner);f.owner.skills.push('effect_actor_penalty');
    const d=inspect(f).decision;assert.equal(d.source,'conservative-risk');assert.equal(d.coverage.coreWork,0);assert.equal(d.coverage.ordinaryWork,0);assert.deepEqual(d.continuation,[]);
    const g=fixture();attack(g);g.phase.nihilJieShichengUsed=[];g.third.skills.push('effect_actor_penalty');const e=inspect(g).decision;assert.equal(e.source,'conservative-risk');assert.deepEqual(e.continuation,[]);
});
test('native puppet material, actual user and target remain available when only owner is penalized',async()=>{
    const f=fixture(); f.mark(f.loser); const c=attack(f); f.owner.skills.push('effect_actor_penalty');
    const d=inspect(f).decision;assert.equal(d.firstAction.kind,'puppet');assert.equal(d.firstAction.user,f.loser.playerid);assert.equal(d.firstAction.card,c.cardid);assert.deepEqual(d.firstAction.targets,[f.third.playerid]);
    const event=api.harness.firstSelection(f);assert.equal(f.context.ai.basic.chooseCard(f.lib.skill.nihil_jie_yulei_active.check),true);assert.equal(f.ui.selected.cards[0],c);assert.equal(f.context.ai.basic.chooseTarget(event.ai2),true);assert.equal(f.ui.selected.targets[0],f.loser);
    f.ui.selected.cards=[];f.ui.selected.targets=[];f.state.autoTargets=true;await f.active(c,f.loser);assert.equal(f.state.uses[0].player,f.loser);assert.equal(f.state.uses[0].targets[0],f.third);
});
test('native own Sha remains selectable when only another actual user is penalized',async()=>{
    const f=fixture(); f.mark(f.loser);const c=attack(f);f.loser.skills.push('effect_actor_penalty');
    const d=inspect(f).decision;assert.equal(d.firstAction.kind,'normal');assert.equal(d.firstAction.user,f.owner.playerid);assert.equal(d.firstAction.card,c.cardid);
    const event=f.open();Object.assign(event,{result:'ai',filterCard:x=>x===c,selectCard:1,position:'h',filterTarget:(x,p,t)=>p!==t,selectTarget:1,ai1:f.get.cacheOrder,custom:{add:{},replace:{}},_aiexclude:[],_skillChoice:[]});
    await f.content.chooseToUse[1](event,null,f.owner);assert.equal(event.result.bool,true);assert.equal(f.ui.selected.cards[0],c);assert.equal(event.result.targets[0],f.third);
    assert.ok(d.ranked.every(r=>r.action.user!==f.loser.playerid));
});
test('zero actor token neutralizes final actor evaluation and seed-only state changes refresh cache',()=>{
    const f=fixture();attack(f);f.owner.skills.push('effect_actor_penalty');skill(f,f.owner,{player_use:()=> 'zeroplayer'},'zero');assert.equal(inspect(f).decision.source,'benchmark-winner');
    const g=fixture();attack(g);g.lib.card.sha.ai.result.player=u=>u.storage.seed||0;skill(g,g.owner,{player_use:()=>-4});
    assert.equal(inspect(g).decision.source,'benchmark-winner');g.owner.storage.seed=1;assert.equal(inspect(g).decision.source,'conservative-risk');g.owner.storage.seed=0;assert.equal(inspect(g).decision.source,'benchmark-winner');
});
test('equivalent normal and marked-owner puppet probes are reused within one request',()=>{
    const f=fixture();f.mark(f.owner);attack(f);let calls=0;skill(f,f.owner,{player_use:()=>{calls++;return [1,-4];}});inspect(f);assert.equal(calls,2);
});
(async()=>{ let passed=0; for(const t of tests){try{await t.run();passed++;console.log('PASS '+t.name);}catch(e){console.error('FAIL '+t.name+'\n'+e.stack);}} console.log(`${passed}/${tests.length} effect risk tests passed`); if(passed!==tests.length)process.exitCode=1; })();
