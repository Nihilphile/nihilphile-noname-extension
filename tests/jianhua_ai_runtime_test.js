// Real engine AI selection and compiler adapters with fixture card values. Not a native match.
const assert=require("node:assert/strict"), fs=require("node:fs"), path=require("node:path"), vm=require("node:vm");
const {fixture,engineRoot}=require("./jianhua_ai_fixture.js");
const cases=[],test=(name,run)=>cases.push({name,run});
test("real ContentCompiler preserves closure access in every asynchronous AI event hook", async () => {
    const f=fixture(), p=f.owner, enemy=f.player("enemy"); p.hand=[f.card("S")];
    const r=f.root(); f.ai.prepare(r);
    const dir=path.join(engineRoot,"library/element/GameEvent/compilers");
    const bodies=["ContentCompilerBase.js","ArrayCompiler.js","AsyncCompiler.js","StepCompiler.js","ContentCompiler.js"]
        .map(file=>fs.readFileSync(path.join(dir,file),"utf8").replace(/^import .*;\r?\n/gm,"").replace(/export\s*\{[^}]*\};?\s*$/, ""));
    f.context.security={isSandboxRequired:()=>false,getIsolatedsFrom:()=>[null,null,vm.runInContext("Function",f.context)]};
    f.context.ErrorManager={setCodeSnippet(){}}; f.context.CodeSnippet=class {}; f.context.ai={};
    vm.runInContext("const AsyncFunction=(async function(){}).constructor;const GeneratorFunction=(function*(){}).constructor;const AsyncGeneratorFunction=(async function*(){}).constructor;\n"+bodies.join("\n")+"\nwindow._compiler=compiler;",f.context);
    function event(name,trigger){ let step=0,next=null;return {name,player:p,_trigger:trigger,finished:false,get step(){return step},set step(x){next=x},updateStep(){if(next!==null){step=next;next=null}},finish(){this.finished=true},getDefaultHandlerType(){return "on"+name},callHandler(){},clearStepCache(){},async waitNext(){}}; }
    const children=f.mod.skill.nihil_jianhua_skill.subSkill;
    const use={name:"useCard",cards:p.hand.slice(),getParent(name){return name==="phaseUse"?r.getParent("phaseUse"):r}};
    const compiled=f.context.window._compiler;
    for(const name of ["ai_record","ai_observe","ai_window"]){
        const fn=compiled.compile(children[name].content);assert.equal(fn.type,"async");assert.equal(fn.original,children[name].content);
        const trigger=name==="ai_record"?use:name==="ai_observe"?{target:enemy,card:{name:"sha"},getParent(){return use}}:{name:"chooseBool",getParent(){return null}};
        await fn(event(name,trigger));
    }
});
test("nested responses retain native AI and Qinglong ignores the spent active-phase quota", () => {
    const f=fixture(), p=f.owner, enemy=f.player("enemy",-5,8);f.equip(p,"qinglong");p.used=1;p.hand=[f.card("S")];
    const r=f.root(); const original=()=>7;
    const ordinary={name:"chooseToUse",type:"respond",player:p,ai1:original,getParent(){return r}};
    f.status.event=ordinary;f.ai.prepare(ordinary);assert.equal(ordinary.ai1,original);assert.equal(f.ai.current(p),null);
    const parent={skill:"qinglong_skill",_trigger:{target:enemy}};
    const follow={name:"chooseToUse",player:p,type:"respond",filterCard:c=>c.name==="sha",getParent(){return parent},logSkill:"qinglong_skill"};
    f.status.event=follow;f.ai.prepare(follow);assert.equal(follow.ai1(p.hand[0]),10);assert.equal(follow.ai2(enemy),10);assert.equal(f.ai.current(p),null);
});
test("Hengsha target chosen by Q is retained in the matching actual equipment attack state", () => {
    const f=fixture(),p=f.owner,enemy=f.player("enemy",-5,8);p.used=1;p.hand=[f.card("S")];p.distances.enemy=2;
    const r=f.root();f.ai.prepare(r);const d=r._nihilJianhuaDecision;assert.equal(d.form,"nihil_zhuofeng");
    const material=p.hand[0];p.hand=[];f.equip(p,d.form,material);p.storage.nihil_jianhua_skill_used=[d.form];
    const request={name:"chooseTarget",player:p,getParent(){return r}};f.status.event=request;
    assert.equal(f.ai.scoreActualTarget(p,{name:"sha",storage:{nihilJianhuaEquipSha:true}},enemy),10);
    assert.equal(request._nihilJianhuaActualDecision.reason,"BOUND_CONDITIONAL_Q_TARGET");
});
test("forced target fallback completes when only an allied target remains", () => {
    const f=fixture(),p=f.owner,friend=f.player("friend",5,1);const request={name:"chooseTarget",player:p};f.status.event=request;
    assert.equal(f.ai.scoreActualTarget(p,{name:"sha"},friend),10);
});
test("Axe can use other equipment and Hanbing cancel generates no damage or flow", () => {
    const f=fixture(),p=f.owner,enemy=f.player("enemy",-5,4);f.equip(p,"guanshi");f.equip(p,"chitu");f.equip(p,"dilu");
    const parent={skill:"guanshi_skill",_trigger:{card:{name:"sha"},target:enemy,baseDamage:2,extraDamage:0}};
    const window={name:"chooseToDiscard",player:p,logSkill:"guanshi_skill",getParent(){return parent}};f.ai.prepareWindow(window,p);
    assert.deepEqual(Array.from(window._nihilJianhuaWindowDecision.materials).sort(),["equip-chitu","equip-dilu"]);
    assert.equal(window.ai(p.extra[0].cards[0]),10);
    p.weapons=[];f.equip(p,"hanbing");f.equip(enemy,"tengjia");p.hand=[f.card("S")];
    const snap=f.ai.buildSnapshot(p,f.root()),attack=snap.candidates.find(a=>a.kind==="NORMAL_SHA");
    const results=f.ai.evaluate(snap.state,attack,snap.env).outcomes;
    assert.ok(results.every(o=>o.state.flow===0));
});
test("exclusions replan only the failed material and other weapon candidates remain", () => {
    const f=fixture(),p=f.owner;f.player("enemy",-5,10);p.hand=[f.card("a","sword"),f.card("b","long")];
    const r=f.root();f.ai.prepare(r);const chosen=r._nihilJianhuaDecision.selection.materialIds[0];r._aiexclude.push(p.hand.find(c=>c.id===chosen));
    const next=f.ai.current(p,r);assert.ok(next.selection);assert.ok(!next.selection.materialIds.includes(chosen));assert.equal(f.ai.memory(r).failed.size,1);
});
test("real weapons and unmanaged cards have an actually reachable native fallback", () => {
    const f=fixture(),p=f.owner;f.player("enemy").prohibited=true;f.equip(p,"long");p.storage.nihil_xinliu=1;p.storage.nihil_jianhua_skill_used=["sword"];
    p.hand=[f.card("W","sword"),f.card("other","guohe")];const r=f.root();f.ai.prepare(r);assert.equal(r._nihilJianhuaDecision.kind,"NATIVE");
    assert.equal(r.ai1(p.hand[0]),7);assert.equal(r.ai1(p.hand[1]),7);
});
test("native Lingren admission reaches chooseButton, restores the root, equips self and resolves the material's slash", async () => {
    const engine = engineRoot;
    function method(f, file, marker) {
        const text = fs.readFileSync(path.join(engine, file), "utf8"), start = text.indexOf(marker);
        assert.ok(start >= 0); const open = text.indexOf("{", start); let depth = 1, end = open + 1;
        for (; depth; end++) { if (text[end] === "{") depth++; if (text[end] === "}") depth--; }
        const fragment = text.slice(start, end);
        return vm.runInContext("({" + fragment + "})", f.context)[marker.split("(")[0]];
    }
    function setup(options = {}) {
        const f = fixture(options), p = f.owner, enemy = f.player("enemy");
        const material = f.card("retained", "sha", "thunder"); material.recheck = () => {};
        material.classList = { add() {} };
        p.hand = [material]; p.used = 1; p.distances.enemy = 2;
        const r = f.root(); r.filterTarget = (card, owner, target) => owner === target;
        r.selectTarget = r.selectCard = 1; r.isMine = () => false;
        r.backup = method(f, "library/element/gameEvent.js", "backup(skill)");
        r.restore = method(f, "library/element/gameEvent.js", "restore()");
        f.ai.prepare(r);
        f.game.check = () => true; f.game.uncheck = f.game.resume = () => {};
        f.get.filter = filter => filter;
        f.get.event = () => f.status.event;
        f.get.links = buttons => buttons.map(button => button.link);
        f.get.suit = () => "heart"; f.get.number = () => 7;
        f.get.select = count => typeof count === "number" ? [count, count] : [1, 1];
        function selection() {
            const entries = [];
            entries.add = item => { if (!entries.includes(item)) entries.push(item); };
            return entries;
        }
        f.context.ui.selected = { cards: selection(), targets: selection(), buttons: selection() };
        f.context.ui.click = {
            skill: method(f, "ui/click/index.js", "skill(skill)"),
            ok: method(f, "ui/click/index.js", "ok(node)"),
        };
        f.context.CacheContext = class { static setCacheContext() {} static setInCacheEnvironment() {} static removeCacheContext() {} };
        const basic = {
            chooseCard: method(f, "ai/basic.js", "chooseCard(check)"),
            chooseTarget: method(f, "ai/basic.js", "chooseTarget(check)"),
            chooseButton: method(f, "ai/basic.js", "chooseButton(check)"),
        };
        f.get.skills = () => r.skill ? [] : ["nihil_lingren"];
        f.get.selectableCards = () => p.hand.filter(card => r.filterCard && r.filterCard(card, p, r));
        return { f, p, r, enemy, material, basic };
    }
    const legacy = setup({ legacyNoTargetAdmission: true });
    assert.equal(legacy.basic.chooseCard(legacy.r.ai1), true);
    assert.equal(legacy.r.skill, "nihil_lingren"); assert.equal(legacy.r.filterTarget, undefined);
    assert.equal(legacy.basic.chooseTarget(legacy.r.ai2), false);

    const { f, p, r, enemy, material, basic } = setup();
    const plan = r._nihilJianhuaDecision;
    assert.equal(plan.kind, "LINGREN"); assert.equal(plan.selection.form, "nihil_zhuofeng");
    assert.equal(basic.chooseCard(r.ai1), true);
    assert.equal(r.skill, "nihil_lingren"); assert.equal(r.filterTarget, undefined);
    assert.equal(basic.chooseTarget(r.ai2), true);
    assert.equal(r._aiexclude.includes("nihil_lingren"), false);
    assert.equal(f.ai.memory(r).reached.size, 0);
    f.context.ui.click.ok();
    assert.equal(r.result.skill, "nihil_lingren"); assert.equal(r.skill, undefined);
    assert.equal(typeof r.filterTarget, "function");

    const buttons = ["nihil_zhuofeng", "nihil_hengsha"].map(name => ({ link: ["equip", "", name], classList: { add() {} } }));
    const buttonEvent = { name: "chooseButton", player: p, selectButton: 1, getParent() { return r; } };
    f.status.event = buttonEvent; f.get.selectableButtons = () => buttons;
    assert.equal(basic.chooseButton(f.mod.skill.nihil_lingren.chooseButton.check), true);
    assert.equal(f.context.ui.selected.buttons[0].link[2], plan.selection.form);
    const backup = f.mod.skill.nihil_lingren.chooseButton.backup(f.get.links(f.context.ui.selected.buttons), p);
    f.lib.skill.nihil_lingren_backup = { ...backup, sourceSkill: "nihil_lingren" };
    f.context.ui.selected.buttons.length = 0;
    f.status.event = r; f.context.ui.click.skill("nihil_lingren_backup");
    assert.equal(r.ai2(), -10); assert.equal(r.ai2(p), 10); assert.equal(r.ai2(enemy), -10);
    assert.equal(basic.chooseCard(r.ai1), true);
    assert.equal(f.context.ui.selected.cards[0], material); assert.equal(backup.check(material), 10);
    p.classList = { add() {} }; enemy.classList = { add() {} };
    f.get.selectableTargets = () => [p, enemy].filter(target => r.filterTarget({ name: backup.viewAs.name }, p, target));
    assert.equal(basic.chooseTarget(r.ai2), true); assert.equal(f.context.ui.selected.targets[0], p);
    f.context.ui.click.ok();
    assert.equal(r.result.skill, "nihil_lingren_backup"); assert.equal(r.result.card.name, plan.selection.form);
    assert.equal(r.result.cards[0], material); assert.equal(r.result.targets[0], p);

    const accepted = r.result, weapon = f.equip(p, accepted.card.name, material); p.hand = [];
    p.addTempSkill = () => {};
    p.markAuto = (name, names) => { p.storage[name] = (p.storage[name] || []).concat(names); };
    const use = { name: "useCard", player: p, card: accepted.card, cards: accepted.cards,
        getParent(name) { return name === "phaseUse" ? r.getParent("phaseUse") : r; } };
    const trigger = { card: weapon, cards: accepted.cards, getParent(name) { return name === "useCard" ? use : r; } };
    let resolved;
    p.chooseTarget = () => ({ player: p, name: "chooseTarget", getParent() { return r; },
        set(name, value) { this[name] = value; return this; },
        async forResult() {
            f.status.event = this;
            const targets = this._nihilJianhuaTargets.slice().sort((a, b) => this.ai(b) - this.ai(a));
            return { targets: [targets[0]] };
        },
    });
    p.useCard = async (card, target, addCount) => { resolved = { card, target, addCount }; };
    await f.mod.skill.nihil_jianhua_skill.subSkill.equip.content({}, trigger, p);
    assert.equal(resolved.card.nature, "thunder"); assert.equal(resolved.target, enemy); assert.equal(resolved.addCount, false);
    f.ai.recordResolution(use, p); assert.equal(f.ai.memory(r).reached.size, 1);
});


async function run() {
    for (const c of cases) {
        await c.run();
        console.log("PASS", c.name);
    }
    console.log(cases.length + " runtime adapter checks passed (real engine selection/compiler, fixture scoring)");
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1});
module.exports={fixture,run};
