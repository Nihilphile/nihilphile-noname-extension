const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const load=require('./fixtures/luofei_effect_harness');
const characters=require('./fixtures/luofei_effect_characters');
const clean=value=>JSON.parse(JSON.stringify(value));
const expectedSha='12a90c940db21d7dbd87296fa3c754f60b32c2ced8f6a3d474e00a6ecb96d1dc';
const candidate=fs.readFileSync(path.join(__dirname,'../nihilphile武将包/module/jie_luofei_ai.js'),'utf8');
const goldenFile=path.join(__dirname,'fixtures/luofei_blank_baseline.json');
const baselineIndex=process.argv.indexOf('--baseline');
const baseline=baselineIndex<0?null:fs.readFileSync(process.argv[baselineIndex+1],'utf8');
if(baseline)assert.equal(crypto.createHash('sha256').update(baseline).digest('hex'),expectedSha,'baseline must be verified original bytes');
const scenarios=[
    {name:'basic-use',cards:['sha']},
    {name:'marked-owner-and-ally',cards:['sha','shan'],marks:['owner','loser']},
    {name:'puppet-material',cards:['sha','shan'],marks:['loser'],disabled:true},
    {name:'equipment-preparation',cards:['qinglong','sha'],far:true},
    {name:'wine-chain',cards:['jiu','sha','sha'],steps:3},
    {name:'fire-chain',cards:['tiesuo','sha'],nature:'fire',linked:true},
    {name:'self-rescue',cards:['tao','sha'],hp:1},
    {name:'ally-rescue',cards:['tao','sha'],allyHp:1,marks:['loser']},
    {name:'identity-lord',cards:['sha','wuzhong'],identity:true},
    {name:'fallback-card',cards:['huogong','wuxie']},
];
async function nativeChoice(f,decision){
    const first=decision.firstAction;
    if(first.kind==='puppet'){
        const event=factoryHarness.get(f).firstSelection(f);
        const cardSelected=f.context.ai.basic.chooseCard(f.lib.skill.nihil_jie_yulei_active.check);
        const userSelected=f.context.ai.basic.chooseTarget(event.ai2);
        const result={kind:'puppet',cardSelected,userSelected,card:f.ui.selected.cards[0]?.cardid,user:f.ui.selected.targets[0]?.playerid};
        f.ui.selected.cards.length=0;f.ui.selected.targets.length=0;f.state.autoTargets=true;
        if(cardSelected&&userSelected){const c=f.owner.zones.h.find(c=>c.cardid===result.card),u=f.game.players.find(p=>p.playerid===result.user);await f.active(c,u);result.targets=f.state.uses.at(-1).targets.map(p=>p.playerid);}
        return result;
    }
    if(first.kind==='damage'||first.kind==='remove')return {kind:first.kind,option:f.lib.skill.nihil_jie_shicheng.chooseButton.check({link:[first.kind,true]})};
    const event=f.open();
    Object.assign(event,{result:'ai',filterCard:c=>!!f.lib.card[c.name].enable,selectCard:1,position:'h',filterTarget:(c,p,t)=>f.lib.filter.targetEnabled(c,p,t)&&f.lib.filter.targetInRange(c,p,t),selectTarget:1,ai1:c=>f.planner.score('order',f.owner,{card:c})||0,custom:{add:{},replace:{}},_aiexclude:[],_skillChoice:[]});
    await f.content.chooseToUse[1](event,null,f.owner);
    return {kind:first.kind,bool:!!event.result.bool,cards:f.ui.selected.cards.map(c=>c.cardid),targets:(event.result.targets||[]).map(p=>p.playerid)};
}
const factoryHarness=new WeakMap();
async function capture(ai){
    const factory=load(ai),records=[];
    for(const scenario of scenarios){
        const f=factory.fixture();factoryHarness.set(f,factory.harness);f.lib.character=characters.character;f.loser.name=f.third.name="effect_plain_blank";
        f.phase.nihilJieShichengUsed=['damage','remove'];
        f.owner.disabled=!!scenario.disabled;
        for(const who of scenario.marks||[])f.mark(f[who]);
        for(const name of scenario.cards){const card=f.card(name);if(name==='sha'&&scenario.nature)card.nature=scenario.nature;f.move(card,'h',f.owner);}
        if(scenario.far)f.third.far=true;
        if(scenario.linked){f.loser.linked=true;f.third.linked=true;}
        if(scenario.hp)f.owner.hp=scenario.hp;
        if(scenario.allyHp)f.loser.hp=scenario.allyHp;
        if(scenario.identity){f.game.zhu=f.owner;f.owner.isZhu=true;f.owner.identity='zhu';f.loser.identity='zhong';f.third.identity='fan';f.loser.identityShown=f.third.identityShown=true;}
        const steps=[];
        for(let step=0;step<(scenario.steps||1);step++){
            f.ui.selected.cards.length=0;f.ui.selected.targets.length=0;f.open();
            const view=clean(f.planner.inspect(f.owner,{cache:false}));
            const choice=await nativeChoice(f,view.decision);steps.push({view,choice});
            if(scenario.steps){
                const a=view.decision.firstAction,c=f.owner.zones.h.find(c=>c.cardid===a.card);
                if(!c||a.kind==='stop')break;
                if(a.kind==='normal'){
                    if(c.name==='jiu'){f.owner.storage.jiu=(f.owner.storage.jiu||0)+1;f.owner.getStat('card').jiu=(f.owner.getStat('card').jiu||0)+1;}
                    if(c.name==='sha'){f.owner.getStat('card').sha=(f.owner.getStat('card').sha||0)+1;f.owner.storage.jiu=0;}
                    if(f.lib.card[c.name].type==='equip')f.move(c,'e',f.owner);else f.move(c,'d');
                }
            }
        }
        records.push({scenario:scenario.name,steps});
    }
    const failures=[];
    for(const name of ['effect_actor_penalty','effect_target_retaliation']){
        const f=factory.fixture();Object.assign(f.lib.skill,characters.skill);f.lib.card.sha.ai.result.target=-1.5;f.phase.nihilJieShichengUsed=['damage','remove'];
        const c=f.card('sha');f.move(c,'h',f.owner);(name==='effect_actor_penalty'?f.owner:f.third).skills.push(name);f.open();
        const d=clean(f.planner.inspect(f.owner).decision);failures.push({name,action:d.firstAction});
    }
    return clean({sha256:expectedSha,records,pseudoBlankOriginal:failures});
}
(async()=>{
    let golden;
    if(baseline){golden=await capture(baseline);if(process.argv.includes('--write-golden'))fs.writeFileSync(goldenFile,JSON.stringify(golden,null,2)+'\n');else assert.deepEqual(golden,JSON.parse(fs.readFileSync(goldenFile,'utf8')),'direct original rerun matches stored golden');}
    else golden=JSON.parse(fs.readFileSync(goldenFile,'utf8'));
    assert.equal(golden.sha256,expectedSha);
    const actual=await capture(candidate);
    assert.deepEqual(actual.records,golden.records,'true blank snapshots, complete decisions and native choices match original');
    assert.equal(golden.pseudoBlankOriginal[0].action.kind,'normal');assert.equal(golden.pseudoBlankOriginal[1].action.targets[0],'third');
    assert.equal(actual.pseudoBlankOriginal[0].action.kind,'stop');assert.ok(!actual.pseudoBlankOriginal[1].action.targets.includes('third'));
    const decisions=golden.records.reduce((n,r)=>n+r.steps.length,0),trace=golden.records.find(r=>r.scenario==='wine-chain');
    assert.ok(trace.steps.length>=2);assert.ok(trace.steps[0].view.decision.firstAction.card);assert.notEqual(trace.steps[0].view.decision.firstAction.card,trace.steps[1].view.decision.firstAction.card);
    if(baseline){const begin='// BEGIN EXACT BENCHMARK WINNER',end='// END EXACT BENCHMARK WINNER';const block=s=>s.slice(s.indexOf(begin),s.indexOf(end)+end.length);assert.equal(block(candidate),block(baseline));}
    console.log(`PASS original SHA ${expectedSha}; ${golden.records.length} true blank scenarios, ${decisions} decisions/native choices; ${trace.steps.length}-decision trace; 2 original dangerous pseudo blank choices now refused`);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
