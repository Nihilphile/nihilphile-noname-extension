const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engineRoot = process.env.NONAME_ENGINE_ROOT || 'F:/AI_project/nameless_game/无名杀子琪懒人包v1.11.3-win32-x64/resources/app';
const read = file => fs.readFileSync(path.join(engineRoot, file), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../nihilphile武将包/module/jie_luofei.js'), 'utf8');
const aiSource = fs.readFileSync(path.join(__dirname, '../nihilphile武将包/module/jie_luofei_ai.js'), 'utf8');
const playerSource = read('noname/library/element/player.js');
const librarySource = read('noname/library/index.js');
const gameSource = read('noname/game/index.js');
const eventSource = read('noname/library/element/gameEvent.js');
const getSource = read('noname/get/index.js');
const hooksSource = read('noname/library/hooks/index.js').replace(/^import .*;\r?\n/gm, '').replace(/export\s*\{\s*defaultHooks\s*\};?\s*$/, 'globalThis.nativeHooks = defaultHooks;');
const createSource = read('noname/ui/create/index.js');
const clickSource = read('noname/ui/click/index.js');
const contentSource = read('noname/library/element/content.js').replace(/^import .*;\r?\n/gm, '').replace(/export\s*\{\s*Content\s*\};?\s*$/, 'globalThis.nativeContent = Content;');
const checkSource = read('noname/game/check.js').replace(/^import .*;\r?\n/gm, '').replace(/export\s*\{\s*Check\s*\};?\s*$/, 'game.Check = new Check();');
const cases = [];
const test = (name, run) => cases.push({ name, run });
const TAG = 'nihil_jie_yulei';
const MARK = 'nihil_jie_xueou';
function nativeMethod(text, name, indent) {
    const start = text.indexOf(' '.repeat(indent) + name);
    assert.ok(start >= 0, 'native method exists ' + name);
    const end = text.indexOf('\n' + ' '.repeat(indent) + '}', start);
    return '({' + text.slice(start, end + indent + 2).trim() + '})';
}
for (const [key, value] of Object.entries({ add(x) { if (!this.includes(x)) this.push(x); return this; }, remove(x) { const i = this.indexOf(x); if (i >= 0) this.splice(i, 1); return this; }, addArray(xs) { xs.forEach(x => this.add(x)); return this; }, removeArray(xs) { xs.forEach(x => this.remove(x)); return this; }, sortBySeat() { return this; } })) {
    if (!Array.prototype[key]) Object.defineProperty(Array.prototype, key, { value, configurable: true });
}
function classes() { const s = new Set(); return { add: x => s.add(x), remove: x => s.delete(x), contains: x => s.has(x) }; }
function fixture(moduleSource = source) {
    let self;
    const state = { active: { name: 'test', clearStepCache() {}, getParent() { return null; } }, deck: [], discarded: [], uses: [], choices: [], bools: [], controls: [], prompts: [], targetChoices: [], events: [], broadcasts: [], history: { changeHp: [], useCard: [] }, pending: [], serial: 0 };
    const lib = { hook: {}, hookmap: {}, relatedTrigger: {}, phaseName: [], natureAudio: { damage: {}, hujia_damage: {} }, natureSeparator: "|", skill: { global: [] }, card: {}, filter: {}, translate: {}, suit: { randomGet: () => 'spade' }, element: { content: {} }, config: { sort_card: () => 0 } };
    const ui = { selected: { cards: [], targets: [], buttons: [] }, ordering: { zone: 'o' }, discardPile: { zone: 'd' }, arena: { classList: classes() }, canvas: {}, touchlines: [] };
    const status = { dying: [], globalHistory: [], currentPhase: null, lastdragchange: [], dragline: [], get event() { return state.active; } };
    status.pauseManager = { async waitPause() {} };
    lib.onround = [() => false];
    const get = {
        event: () => state.active, card: () => state.active._get_card, player: () => state.active.player,
        info: c => typeof c === 'string' ? lib.skill[c] : lib.card[c?.name],
        filter: x => x, noSelected: () => !ui.selected.cards.length && !ui.selected.targets.length && !ui.selected.buttons.length,
        numOf: (xs,x)=>xs.filter(v=>v===x).length, id: () => ++state.serial, owner: c => game.players.find(p => p.getCards("hej").includes(c)) || false, tag: (c,t) => lib.card[c.name]?.ai?.tag?.[t],
        name: c => c.name, type: c => lib.card[typeof c === 'string' ? c : c.name]?.type,
        color: c => ['heart', 'diamond'].includes(c.suit) ? 'red' : 'black',
        autoViewAs: c => c, copy: x => Array.isArray(x) ? x.slice() : x,
        select: x => typeof x === 'function' ? x() : Array.isArray(x) ? x : x === undefined ? [1, 1] : [x, x],
        itemtype(x) { if (x?.cardid) return 'card'; if (x?.playerid) return 'player'; if (Array.isArray(x)) return x.length && x.every(v => v?.playerid) ? 'players' : x.length && x.every(v => v?.cardid) ? 'cards' : x.length === 2 && x.every(v => typeof v === 'number') ? 'select' : undefined; },
        is: { object: x => x && typeof x === 'object' && !Array.isArray(x), versus: () => false },
        mode: () => 'identity', rand: () => 1, attitude: () => 1, effect_use: target => state.aiScores?.[target.playerid] ?? 1, distance: (a, b) => b.far ? 5 : 1,
        selectableTargets: () => game.players.filter(p => p.classList.contains('selectable') && !ui.selected.targets.includes(p)),
        translation: x => Array.isArray(x) ? x.map(get.translation).join(',') : x?.name || x?.playerid || x,
        position: c => c.zone, cnNumber: String,
        cards(n) { return Array.from({ length: n }, () => state.deck.shift() || card('shan')); },
    };
    const game = {
        globalEventHandlers: { addHandlerToEvent() {} },
        players: [], dead: [], playerMap: {}, filterPlayer: (fn = () => true) => game.players.filter(p => p.isIn() && fn(p)),
        hasPlayer: fn => game.filterPlayer(fn).length > 0,
        checkMod(...args) { const name = args[args.length - 2], p = args[1], target = args[2]; if (name === 'cardEnabled' && p.disabled) return false; if (name === 'targetEnabled' && target.immune) return false; return args[args.length - 3]; },
        import(type, factory) { Object.assign(lib.card, factory().card); },
        expandSkills(list) { for (let i = 0; i < list.length; i++) { const group = lib.skill[list[i]]?.group; for (const s of typeof group === 'string' ? [group] : group || []) list.add(s); } return list; },
        log() {}, broadcastAll(fn,...args) { if(args[0]?.skills && typeof args[1] === 'string') fn(...args); }, callHook(name,args) { state.onHook?.(name,args); }, async delayx() {}, broadcast(fn, ...args) { state.broadcasts.push(args); }, getGlobalHistory: key => key === 'everything' ? (state.history.everything ||= []) : state.history,
        cardsDiscard: cards => action('cardsDiscard', async () => cards.forEach(c => move(c, 'd'))),
        createEvent(name) { const ev = action(name, async ev => {
            if (name === 'useCard') await resolveUse(ev);
            else if (name === 'useSkill') { for (const step of content.useSkill.slice(0, 3)) await step(ev, null, ev.player); await drain(); }
            else if (name === 'useCardToTarget') { state.targetEvents ||= []; state.targetEvents.push(ev.target); await dispatch(name, ev); }
            else if (name === 'dying') { state.dyingEvents ||= []; state.dyingEvents.push(ev); for (const step of content.dying) { if (ev.cancelled) break; await step(ev, null, ev.player); } }
            else if (name === '_save') { state.events.push(['save', ev._trigger.player.playerid]); await state.onSave?.(ev._trigger); }
            else if (ev._content) await ev._content(ev, null, ev.player);
        }); state.pending.push(ev); return ev; },
    };
    class CacheContext { static setCacheContext() {} static setInCacheEnvironment() {} static removeCacheContext() {} }
    const ai = { basic: {} };
    const context = vm.createContext({ window: {}, lib, game, get, ui, _status: status, ai, CacheContext, console, HTMLDivElement: class {} });
    vm.runInContext('Array.prototype.add=function(x){if(!this.includes(x))this.push(x);return this;};Array.prototype.remove=function(x){let i=this.indexOf(x);if(i>=0)this.splice(i,1);return this;};Array.prototype.addArray=function(xs){xs.forEach(x=>this.add(x));return this;};Array.prototype.removeArray=function(xs){xs.forEach(x=>this.remove(x));return this;};Array.prototype.sortBySeat=function(){return this;};', context);
    vm.runInContext(aiSource, context);
    vm.runInContext(moduleSource, context);
    const mod = context.window.nihilModules.jie_luofei;
    Object.assign(lib.skill, mod.skill);
    for (const [name, skill] of Object.entries(mod.skill)) for (const [key, sub] of Object.entries(skill.subSkill || {})) lib.skill[name + '_' + key] = sub;
    vm.runInContext(contentSource, context); vm.runInContext(checkSource, context);
    const compilerCode = ['ContentCompilerBase', 'ArrayCompiler'].map(name => read('noname/library/element/GameEvent/compilers/' + name + '.js').replace(/^import .*;\r?\n/gm, '').replace(/export\s*\{[\s\S]*?\};?\s*$/, '')).join('\n');
    vm.runInContext(compilerCode + '\nconst compiler = { compile(content) { return new ArrayCompiler().compile(Array.isArray(content) ? content : [content]); } };\n' + eventSource.replace(/^import .*;\r?\n/gm, '').replace(/export\s*\{[\s\S]*?\};?\s*$/, 'globalThis.NativeGameEvent = GameEvent;'), context);
    const manager = { stack: [], setStatusEvent(ev) { this.stack.push(state.active); state.active = ev; }, popStatusEvent() { state.active = this.stack.pop(); } };
    function nativePhase(p, parent = state.active) {
        const ev = new context.NativeGameEvent('phase', false, manager);
        Object.assign(ev, { player: p, parent, num: 0, phaseList: [], trigger: async function (name) { state.events.push(name); await state.onTrigger?.(name, this); await dispatch(name, this); } });
        ev.setContent(content.phase.slice(-3));
        return ev;
    }
    async function endTurn(turn = state.active.name === 'phase' ? state.active : state.active.getParent('phase', true)) {
        await turn.start();
    }
    get.select = vm.runInContext(nativeMethod(getSource, 'select(select)', 2), context).select;
    ai.basic.chooseTarget = vm.runInContext(nativeMethod(read('noname/ai/basic.js'), 'chooseTarget(check)', 2), context).chooseTarget;
    game.check = vm.runInContext(nativeMethod(gameSource, 'check(event2 = _status.event)', 2), context).check;
    game.uncheck = vm.runInContext(nativeMethod(gameSource, 'uncheck(...args)', 2), context).uncheck;
    ui.click = { ok() { state.active.result = { bool: true, targets: ui.selected.targets.slice() }; }, cancel() { state.active.result = { bool: false }; } };
    for (const method of ['card()', 'target(e)']) Object.assign(ui.click, vm.runInContext(nativeMethod(clickSource, method, 2), context));
    const content = context.nativeContent;
    for (const file of ['card/standard.js', 'card/extra.js', 'card/huodong.js']) vm.runInContext(read(file).replace(/^import .*;\r?\n/gm, ''), context);
    for (const name of ['cardEnabled: function', 'selectTarget: function', 'targetEnabled(card, player, target)', 'targetEnabled2(card, player, target)', 'cardSavable: function', 'cardRespondable: function', 'targetInRange: function', 'judge: function']) {
        const key = name.split(/[(:]/)[0]; lib.filter[key] = vm.runInContext(nativeMethod(librarySource, name, 4), context)[key];
    }
    lib.filter.cardAiIncluded = () => true; lib.filter.buttonIncluded = () => true;
    const finishCard = vm.runInContext(nativeMethod(gameSource, 'finishCard(cardId)', 2), context).finishCard;
    for (const name of Object.keys(lib.card)) finishCard(name);
    const nativeSet = vm.runInContext(nativeMethod(eventSource, 'set(key, value)', 2), context).set;
    const nativeGetParent = vm.runInContext(nativeMethod(eventSource, 'getParent(level = 1, forced, includeSelf)', 2), context).getParent;
    const addExpansion = vm.runInContext(nativeMethod(playerSource, '$addToExpansion(cards, broadcast, gaintag, check = true)', 2), context).$addToExpansion;
    const getExpansions = vm.runInContext(nativeMethod(playerSource, 'getExpansions(tag)', 2), context).getExpansions;
    const nativeUseCard = vm.runInContext(nativeMethod(playerSource, 'useCard(params)', 2), context).useCard;
    const nativeDying = vm.runInContext(nativeMethod(playerSource, 'dying(reason)', 2), context).dying;
    const nativeSkills = Object.assign({}, ...['addSkill(skill, checkConflict, nobroadcast, addToSkills)', 'addSkillTrigger(skills, hidden, triggeronly)', 'removeSkill(skill)', 'removeSkillTrigger(skills, triggeronly)'].map(name => vm.runInContext(nativeMethod(playerSource, name, 2), context)));
    const nativeGetHistory = vm.runInContext(nativeMethod(playerSource, 'getHistory(key, filter, last)', 2), context).getHistory;
    function card(name, suit = 'spade') { return { name, suit, cardid: 'c' + (++state.serial), zone: 'c', tags: [], classList: classes(), fix() {}, updateTransform() {}, addGaintag(tag) { this.tags.add(tag); }, hasGaintag(tag) { return this.tags.includes(tag); } }; }
    function move(c, zone, target) {
        for (const p of game.players) { const a = p.node.expansions.childNodes; const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); for (const z of ['h', 'e', 'j', 's']) p.zones[z] = p.zones[z].filter(x => x !== c); }
        c.zone = zone; if (zone !== 'x') c.tags = [];
        if (zone === 'd') state.discarded.push(c);
        if (target) target.zones[zone].push(c);
    }
    function action(name, run, fields = {}) {
        const parent = state.active;
        let promise;
        return Object.assign({ name, parent, clearStepCache() {}, childEvents: [], _set: [], set: nativeSet, setContent(fn) { if (typeof fn === 'function') this._content = fn; }, resume() {}, goto() {}, redo() {}, isMine: () => false, untrigger() { this.untriggered = true; }, finish() { this.cancelled = true; }, getParent: nativeGetParent, trigger: async function (n) { state.events.push(n); if (n === 'damage') await drain(); await state.onTrigger?.(n, this); await dispatch(n, this); },
            forResult() { return this.then(() => this.result); },
            then(ok, bad) { promise ||= (async () => { state.pending.remove(this); const saved = state.active; state.active = this; try { await run(this); } finally { state.active = saved; } })(); return promise.then(ok, bad); },
        }, fields);
    }
    function choice(name, p, args) {
        return { name, player: p, args, custom: { add: {}, replace: {} }, clearStepCache() {}, parent: state.active, getParent: nativeGetParent, _set: [], set: nativeSet, isMine: () => false, isOnline: () => !state.autoTargets, send() { this.sent = true; },
            async forResult() {
                const saved = state.active; state.active = this; state.prompts.push(this);
                try {
                    for (const key of ['filterButton', 'filterTarget', 'filterOk', 'selectTarget']) if (typeof this[key] === 'function') this[key] = vm.runInContext('(' + this[key].toString() + ')', context);
                    if (name === 'chooseTarget' && state.manualTargets) return await state.manualTargets(this);
                    if (name === 'chooseBool') return { bool: state.bools.shift() ?? false };
                    if (name === 'chooseControl') return { index: state.controls.shift() ?? 0 };
                    if (name === 'chooseButton') {
                        this.selectButton = 1; this.dialog = args[0].buttons ? args[0] : { buttons: args[0][1].map(link => ({ link, classList: classes() })) };
                        ui.selected.buttons = [];
                        game.Check.button(this, false);
                        state.onButtonRequest?.(this);
                        const desired = state.choices.shift();
                        if (!desired) return { bool: false };
                        const c = typeof desired === 'function' ? desired(this.dialog.buttons.map(b => b.link), p) : desired;
                        assert.ok(this.dialog.buttons.find(b => b.link === c)?.classList.contains('selectable'), 'chosen blood card is selectable through native Check.button');
                        return { bool: true, links: [c] };
                    }
                    await content.chooseTarget[0](this, null, p);
                    state.onTargetRequest?.(this);
                    if (state.autoTargets) {
                        ui.selected.targets = []; this.animate = false;
                        await content.chooseTarget[1](this, null, p);
                        state.autoResult = this.result;
                        state.autoSelected = ui.selected.targets.slice();
                        ui.selected.targets = [];
                        await content.chooseTarget[2](this, null, p);
                        return this.result;
                    }
                    assert.equal(this.sent, true, 'native chooseTarget sends the request');
                    if (!this.forced && !this.nihilPuppetUser && !state.targetChoices.length) return { bool: false };
                    if (state.targetChoices[0] === null) { state.targetChoices.shift(); return { bool: false }; }
                    if (state.rejectTarget) return { bool: false };
                    ui.selected.targets = [];
                    const targets = state.targetChoices.shift() || lib.skill[TAG].useTargets({ card: this._get_card, user: this.nihilPuppetUser || p });
                    assert.ok(targets, 'forced selection has a complete legal target plan');
                    for (const target of targets) {
                        game.Check.target(this, false);
                        assert.ok(target.classList.contains('selectable'), 'target selectable through native Check.target ' + target.playerid);
                        ui.selected.targets.push(target);
                    }
                    assert.equal(game.Check.target(this, false).ok, true);
                    if (this.filterOk) assert.equal(this.filterOk(), true);
                    this.result = { bool: true, targets: targets.slice() }; this.animate = false;
                    await content.chooseTarget[1](this, null, p); await content.chooseTarget[2](this, null, p);
                    ui.selected.targets = [];
                    await state.onTargetResult?.(this);
                    return this.result;
                } finally { state.active = saved; }
            },
        };
    }
    function player(id, owner = false) {
        const p = { ...nativeSkills, initedSkills: [], awakenedSkills: [], hiddenSkills: [], invisibleSkills: [], tempSkills: {}, additionalSkills: {}, checkConflict() {}, removeAdditionalSkills() {}, enableSkill() {}, unmarkSkill(s) { delete this.marks[s]; }, playerid: id, skipList: [], hp: 12, maxHp: 12, hujia: 0, dead: false, skills: owner ? ['nihil_jie_xueyin', 'nihil_jie_shicheng', 'nihil_jie_yulei'] : [], marks: {}, drawn: 0, actionHistory: [{ useCard: [], useSkill: [], damage: [], sourceDamage: [], custom: [] }], zones: { h: [], e: [], j: [], s: [] }, stat: [{ skill: {}, card: { sha: 99 } }], classList: classes(), ai: {},
            node: { equips: { classList: classes() }, expansions: { childNodes: [], get firstChild() { return this.childNodes[0]; }, insertBefore(c) { move(c, 'x'); this.childNodes.unshift(c); } } },
            prompt(text) { this.node.prompt = { innerHTML: text }; }, unprompt() { delete this.node.prompt; },
            isIn() { return !this.dead; }, isAlive() { return !this.dead; }, isDead() { return this.dead; }, isOut() { return false; }, isDamaged() { return this.hp < this.maxHp; },
            hasSkill(s) { return this.skills.includes(s); }, hasSkillTag() { return false; }, getSkills() { return this.skills.slice(); }, getStat(type) { return type ? this.stat.at(-1)[type] : this.stat.at(-1); }, getHistory: nativeGetHistory,
            countMark(s) { return this.marks[s] || 0; }, hasMark(s) { return (this.marks[s] || 0) > 0; }, addMark(s,n) { this.marks[s] = (this.marks[s] || 0) + n; }, removeMark(s,n) { this.marks[s] = Math.max(0,(this.marks[s] || 0)-n); },
            draw(n) { return action("draw", async () => { this.drawn += n; state.events.push(["draw", this.playerid, n]); await state.onDraw?.(this, n); }); },
            getCards(z = "h", fn = () => true) { return [...z].flatMap(k => k === 'x' ? this.node.expansions.childNodes : this.zones[k] || []).filter(typeof fn === 'function' ? fn : () => true); },
            getExpansions, $addToExpansion: addExpansion, getEquips() { return this.zones.e; }, canEquip() { return !this.noEquip; }, canAddJudge() { return !this.zones.j.length; },
            inRange(t) { return !t.far; }, getAttackRange: () => 1, update() {}, $damagepop() {}, logSkill() {},
            addToExpansion(cards) { return action('addToExpansion', async ev => { state.expansions ||= []; state.expansions.push(ev); this.$addToExpansion(cards, true, ev.gaintag); }, { gaintag: [] }); },
            lose(cards, ...args) { const destination = args.find(x => x?.zone) || ui.discardPile; return action('lose', async () => { cards.forEach(c => move(c, destination.zone)); await state.onLose?.(this, cards); }); },
            loseToDiscardpile(cards) { const ev = action('loseToDiscardpile', async () => cards.forEach(c => move(c, 'd'))); state.pendingRemoval = ev; return ev; },
            chooseButton(...args) { return choice('chooseButton', this, args); }, chooseControl(...args) { return choice('chooseControl', this, args); }, chooseBool(...args) { return choice('chooseBool', this, args); },
            chooseTarget(...args) { return Object.assign(choice('chooseTarget', this, args), { forced: args.includes(true) }); },
            showCards() { return action('showCards', async () => {}); }, useCard: nativeUseCard,
            discard(cards) { return this.lose(cards); }, checkShow() {}, line() {}, trySkillAnimate() {}, addTempClass() {}, storage: {},
            changeHp(num) { const ev = action('changeHp', async ev => { await content.changeHp(ev); await dispatch('changeHpAfter', ev); }, { player: this, num }); state.pending.push(ev); return ev; },
            damage(num, source) { return damage(this,num,source); },
            changeHujia(num) { this.hujia += num; return {}; },
            loseHp(num) { return action('loseHp', async ev => { state.events.push(['loseHp', this.playerid, num]); await content.loseHp(ev, null, this); }, { player: this, num }); },
            recover(num) { return action('recover', async ev => { await content.recover(ev, null, this); state.events.push(['recover', this.playerid, ev.num]); }, { player: this, num }); },
            dying: nativeDying, isDying() { return status.dying.includes(this); },
            die(reason) { return action('die', async () => { this.dead = true; state.events.push(['die', this.playerid]); this.deathReason = reason; }); },
        };
        game.players.push(p); game.playerMap[id] = p; p.addSkillTrigger(p.skills.slice()); return p;
    }
    async function dispatch(name, ev) {
        const entries = [...new Set([...game.players,...game.dead])].flatMap(p => game.expandSkills(p.skills.slice()).map(s => [p, s]));
        entries.sort((a, b) => (lib.skill[b[1]].priority || 0) - (lib.skill[a[1]].priority || 0));
        for (const [p, s] of entries) {
            const skill = lib.skill[s], t = skill.trigger;
            if (!p.isIn() && !skill.forceDie || !p.hasSkill(s) || !t || !(t.global === name || t.player === name && ev.player === p || t.source === name && ev.source === p || t.target === name && ev.target === p)) continue;
            if (!skill.filter || skill.filter(ev, p, name)) await skill.content({ triggername: name, player: p }, ev, p);
        }
    }
    async function drain() { while (state.pending.length) await state.pending.shift(); }
    function damage(target, num = 1, sourcePlayer) {
        return action('damage', async ev => {
            for (let i = 0; i < content.damage.length && !ev.cancelled; i++) {
                await content.damage[i](ev, null, target); await drain();
            }
            if (!ev.cancelled) await dispatch('damageEnd', ev);
        }, { player: target, source: sourcePlayer, num, animate: false, cancel() { this.cancelled = true; } });
    }
    async function turn(p) {
        status.currentPhase = p;
        const turn = nativePhase(p);
        await content.phase[1](turn, null, p);
        state.active = turn;
    }
    async function shicheng(target = loser, option = 'damage') {
        nativeShicheng(self);
        const saved = state.active, ev = chooseEvent(); state.active = ev;
        lib.skill.nihil_jie_shicheng_backup = lib.skill.nihil_jie_shicheng.chooseButton.backup([[option, true]]);
        lib.skill.nihil_jie_shicheng_backup.sourceSkill = 'nihil_jie_shicheng';
        ev.result = { bool: true, skill: 'nihil_jie_shicheng_backup', cards: [], targets: [target] };
        try { await owner.useResult(ev.result, ev); await drain(); } finally { state.active = saved; }
        return { event: ev };
    }
    async function resolveUse(ev) {
        await dispatch('useCardBefore', ev);
        ev.animate = false; ev.audio = false; ev.nopopup = true;
        await content.useCard[0](ev, null, ev.player);
        state.uses.push(ev);
        const info = lib.card[ev.card.name];
        if (state.resolveEffects) {
            if (ev.card.name === 'sha') await damage(ev.targets[0], 1, ev.player);
            else if (info.type === 'equip') ev.cards.forEach(c => move(c, 'e', ev.player));
            else if (info.type === 'delay') ev.cards.forEach(c => move(c, 'j', ev.targets[0]));
            else if (ev.card.name === 'jiu') ev.player.drunk = (ev.player.drunk || 0) + 1;
            else if (ev.card.name === 'tao') await ev.targets[0].recover(1);
        }
        await state.onUse?.(ev);
    }
    const owner = player('owner', true), loser = player('loser'), third = player('third');
    function mark(p) { p.addSkill(MARK); if (!p.hasMark(MARK)) p.addMark(MARK,1); }
    const actualTurn = nativePhase(owner, null);
    const phase = action('phaseUse', async () => {}, { player: owner, parent: actualTurn });
    state.active = phase;
    function chooseEvent() {
        const event = action('chooseToUse', async () => {}, { player: owner, type: 'phase' });
        lib.skill.nihil_jie_yulei_active.onChooseToUse(event);
        lib.skill.nihil_jie_shicheng.onChooseToUse(event);
        return event;
    }
    async function active(card, user, controller = owner) {
        await action('nihil_jie_yulei_active', async event => lib.skill.nihil_jie_yulei_active.content(event, null, controller), { cards: [card], target: user, player: controller });
        await drain();
    }
    return self = { state, lib, game, get, ui, context, content, status, owner, loser, third, player, card, move, mark, phase, actualTurn, nativePhase, endTurn, chooseEvent, active, damage, dispatch, drain, action, turn, shicheng, plan: (c, user = owner) => lib.skill[TAG].useTargets({ card: c, user }) };
}
async function fourDamageContract(f) {
    const expected = [[true,true,1,11,0],[false,true,1,11,1],[true,true,1,10,1],[false,true,1,10,2]];
    for (const [sourceMark, ownerMark, drawn, hp, recoveries] of expected) {
        await f.damage(f.owner,1,f.loser);
        assert.equal(f.loser.hasMark(MARK),sourceMark,'source mark must alternate each hit');
        assert.equal(f.owner.hasMark(MARK),ownerMark);assert.equal(f.owner.drawn,drawn);assert.equal(f.owner.hp,hp);
        assert.equal(f.state.events.filter(e=>Array.isArray(e)&&e[0]==='recover'&&e[2]>0).length,recoveries);
    }
}
test('four native damage events alternate source mark and prerecovery without double branching',()=>fourDamageContract(fixture()));

test('unmarked owner damage does nothing until receiving damage grants its own mark',async()=>{
    const f=fixture();await f.damage(f.loser,1,f.owner);
    assert.equal(f.loser.hasMark(MARK),false);assert.equal(f.owner.hasMark(MARK),false);assert.equal(f.owner.drawn,0);
    await f.damage(f.owner,1,f.third);
    assert.equal(f.third.hasMark(MARK),true);assert.equal(f.owner.hasMark(MARK),true);assert.equal(f.owner.drawn,1);
    await f.damage(f.loser,1,f.owner);assert.equal(f.loser.hasMark(MARK),true);assert.equal(f.owner.drawn,2);
});

test('self damage alternates its single source and target mark without readding after removal',async()=>{
    const f=fixture();await f.damage(f.owner,1,f.owner);assert.equal(f.owner.hasMark(MARK),true);assert.equal(f.owner.drawn,1);
    await f.damage(f.owner,1,f.owner);assert.equal(f.owner.hasMark(MARK),false);assert.equal(f.owner.drawn,1);assert.equal(f.owner.hp,11);
});

test('marked source propagates in and outside its turn without owner in damage',async()=>{
    const f=fixture();f.mark(f.loser);f.status.currentPhase=f.loser;
    await f.damage(f.third,1,f.loser);assert.equal(f.owner.drawn,1);assert.equal(f.third.hasMark(MARK),true);
    await f.turn(f.owner);await f.damage(f.third,1,f.loser);assert.equal(f.owner.drawn,2);
});

test('multi-point damage draws by amount and prerecovers once and full-health recovery overflows before damage',async()=>{
    const f=fixture();await f.damage(f.owner,3,f.loser);assert.equal(f.owner.hp,9);assert.equal(f.owner.drawn,3);
    await f.damage(f.owner,3,f.loser);assert.equal(f.owner.hp,7);assert.equal(f.owner.drawn,3);
    assert.deepEqual(f.state.events.filter(e=>Array.isArray(e)&&e[0]==='recover'),[['recover','owner',1]]);
    const g=fixture();g.mark(g.loser);let beforeDamage;
    g.state.onHook=name=>{if(name==='checkDamage4')beforeDamage=g.owner.hp;};
    await g.damage(g.owner,2,g.loser);assert.equal(beforeDamage,12);assert.equal(g.owner.hp,10);assert.equal(g.owner.drawn,0);
    assert.deepEqual(g.state.events.filter(e=>Array.isArray(e)&&e[0]==='recover'),[['recover','owner',0]]);
    assert.equal(g.loser.getHistory('sourceDamage')[0].num,2,'prerecovery must not reduce damage amount');
});

test('late prevention and zero preserve the already executed mark or prerecovery branch without reward',async()=>{
    for(const marked of [false,true])for(const prevent of [true,false]){
        const f=fixture();f.owner.hp=5;if(marked)f.mark(f.loser);
        f.state.onHook=(name,[ev])=>{if(name==='checkDamage4'){if(prevent)ev.cancel();else ev.num=0;}};
        await f.damage(f.owner,1,f.loser);
        assert.equal(f.loser.hasMark(MARK),!marked);assert.equal(f.owner.hp,marked?6:5);
        assert.equal(f.owner.drawn,0);assert.equal(f.owner.hasMark(MARK),false);
    }
});

test('sourceless or invalid-source damage has no before effect and dead owner gains no reward',async()=>{
    const f=fixture();f.owner.hp=5;await f.damage(f.owner);assert.equal(f.owner.hp,4);assert.equal(f.owner.drawn,0);
    f.loser.dead=true;await f.damage(f.owner,1,f.loser);assert.equal(f.loser.hasMark(MARK),false);assert.equal(f.owner.hp,3);
    assert.equal(f.state.events.some(e=>Array.isArray(e)&&e[0]==='recover'),false);
    const g=fixture();g.owner.hp=1;await g.damage(g.owner,1,g.loser);assert.equal(g.owner.dead,true);assert.equal(g.owner.drawn,0);assert.equal(g.loser.hasMark(MARK),true);
});

test('shicheng damage then draw, self source, prevention and fatal damage retain native dying', async () => {
    const f = fixture(), api=nativeShicheng(f); assert.equal(f.lib.skill.nihil_jie_shicheng.usable,undefined);
    f.owner.hp=5; await f.shicheng(); assert.equal(f.owner.hp,4); assert.equal(f.owner.drawn,2); assert.equal(f.loser.hasMark(MARK),true);
    await api.newPhase(); await f.shicheng(f.owner); assert.equal(f.owner.hp,4); assert.equal(f.owner.drawn,3); assert.equal(f.owner.hasMark(MARK),false);
    await api.newPhase(); f.state.onHook=(name,[ev])=>{if(name==='checkDamage4')ev.cancel();}; await f.shicheng(f.third); assert.equal(f.owner.hp,4); assert.equal(f.owner.drawn,4);
    await api.newPhase(); f.state.onHook=null; f.loser.removeMark(MARK,1); f.owner.hp=1; await f.shicheng(f.loser); assert.equal(f.owner.hp,0); assert.equal(f.owner.dead,true); assert.equal(f.owner.drawn,4);
});
test('active physical entrance bypasses exhausted count with actor range and owner controlled targets', async () => {
    const f = fixture(), c=f.card('sha'); f.move(c,'h',f.owner); f.mark(f.loser); f.owner.disabled=true;
    assert.equal(f.lib.skill.nihil_jie_yulei_active.filter(f.chooseEvent(),f.owner),true);
    f.state.targetChoices.push([f.third]); await f.active(c,f.loser);
    const ev=f.state.uses[0]; assert.equal(ev.player,f.loser); assert.deepEqual(ev.targets,[f.third]); assert.equal(ev.addCount,false);
    assert.equal(f.owner.getStat('card').sha,99); assert.equal(f.loser.getStat('card').sha,99); assert.equal(f.owner.actionHistory[0].useCard.length,0); assert.equal(f.loser.actionHistory[0].useCard[0],ev);
    assert.equal(c.zone,'o'); assert.equal(f.owner.getCards('h').length,0); assert.equal(ev.lose_map.owner[0],c);
    assert.ok(f.state.prompts.every(p=>p.player===f.owner)); assert.equal(ev.skill,undefined);
});
test('normal actor range and target immunity remain, count bypass is not cardEnabled bypass', async () => {
    const f=fixture(), c=f.card('sha'); f.mark(f.loser); f.owner.immune=true; f.third.far=true;
    assert.equal(f.plan(c,f.loser),null); f.third.far=false; assert.deepEqual(Array.from(f.plan(c,f.loser)),[f.third]);
    f.loser.disabled=true; assert.equal(f.plan(c,f.loser),null);
});
test('automatic AOE targets are rebuilt for actor and equipment self target follows actor', async () => {
    const f=fixture(); f.mark(f.loser); const c=f.card('nanman'); f.move(c,'h',f.owner); await f.active(c,f.loser); const ev=f.state.uses[0];
    assert.equal(ev.player,f.loser); assert.deepEqual(Array.from(ev.targets),[f.owner,f.third]); assert.deepEqual(Array.from(ev.stocktargets),[f.owner,f.third]);
    const equip=f.card('zhuge'); f.move(equip,'h',f.owner); f.state.resolveEffects=true; f.state.targetChoices.push([f.loser]); await f.active(equip,f.loser); assert.equal(equip.zone,'e'); assert.ok(f.loser.zones.e.includes(equip));
});
test('singleCard native constructor preserves secondary target separately', async () => {
    const f=fixture(); f.mark(f.loser); const weapon=f.card('zhuge'); f.move(weapon,'e',f.third); const c=f.card('jiedao'); f.move(c,'h',f.owner);
    f.state.targetChoices.push([f.third,f.owner]); await f.active(c,f.loser); const ev=f.state.uses[0];
    assert.deepEqual(Array.from(ev.targets),[f.third]); assert.deepEqual(Array.from(ev.addedTargets),[f.owner]); assert.equal(ev.target,f.third); assert.equal(ev.addedTarget,f.owner);
});

test('complete filterOk uses actual actor while remote callbacks retain controller and selected state', async () => {
    const f=fixture(); f.mark(f.loser); f.lib.card.testpair={enable:true,selectTarget:[1,2],filterTarget:(c,p,t)=>t!==p,filterOk:()=>f.get.player()===f.loser&&f.ui.selected.targets.length===2};
    const c=f.card('testpair'); f.move(c,'h',f.owner); f.state.targetChoices.push([f.owner,f.third]); await f.active(c,f.loser);
    assert.deepEqual(f.state.uses[0].targets,[f.owner,f.third]); assert.equal(f.state.prompts[0].player,f.owner); assert.equal(f.state.prompts[0].nihilPuppetUser,f.loser);
});
test('native deadTarget card includes dead recipients', async () => {
    const f=fixture(); f.third.dead=true; f.game.players.remove(f.third); f.game.dead.push(f.third); const c=f.card('guilai'); assert.ok(f.plan(c,f.owner).includes(f.third));
});
test('native Check.card invokes rebuilt active filter with two arguments and chooses puppet independently', async () => {
    const f=fixture(), c=f.card('sha'), no=f.card('shan'); f.move(c,'h',f.owner); f.move(no,'h',f.owner); f.mark(f.loser); f.owner.disabled=true;
    const skill=f.lib.skill.nihil_jie_yulei_active;
    const event=Object.assign(f.chooseEvent(),{position:skill.position,selectCard:1,selectTarget:1,filterCard:vm.runInContext('('+skill.filterCard.toString()+')',f.context),filterTarget:vm.runInContext('('+skill.filterTarget.toString()+')',f.context)});
    f.state.active=event; f.game.Check.target(event,false); assert.equal(f.loser.classList.contains('selectable'),true); f.game.Check.card(event,false); assert.equal(c.classList.contains('selectable'),true); assert.equal(no.classList.contains('selectable'),false);
    f.ui.selected.cards=[c]; f.game.Check.target(event,false); assert.equal(f.loser.classList.contains('selectable'),true); assert.equal(f.third.classList.contains('selectable'),false);
});
test('source dying after dealing damage does not erase an existing blood mark reward', async () => {
    const f=fixture(); f.mark(f.loser);f.loser.dead=true;f.game.players.remove(f.loser);f.game.dead.push(f.loser); await f.dispatch('damageSource',f.action('damage',async()=>{},{source:f.loser,player:f.third,num:1}));assert.equal(f.owner.drawn,1);assert.equal(f.third.hasMark(MARK),true);
    await f.endTurn(f.actualTurn); assert.equal(f.loser.hasMark(MARK),true);
});

test('ordinary use and all response or rescue contexts never offer borrowing', async () => {
    const f = fixture(); f.mark(f.loser);
    assert.equal(f.lib.skill[TAG].trigger, undefined);
    for (const [name, type] of [['sha','phase'],['jiu','phase'],['shan','respond'],['wuxie','wuxie'],['tao','dying']]) {
        const c = f.card(name); f.move(c,'h',f.owner);
        f.state.active = f.action('chooseToUse',async()=>{}, { type, player:f.owner, dying:f.third });
        const ev = f.owner.useCard({card:c,cards:[c],targets:type==='phase'?[f.loser]:[],respondTo:type==='phase'?undefined:[f.third,{name:'sha'}]});
        await f.drain(); assert.equal(ev.player,f.owner); assert.equal(f.state.prompts.length,0);
        if (type !== 'phase') assert.equal(f.lib.skill.nihil_jie_yulei_active.filter(f.state.active,f.owner),false);
    }
    assert.equal(f.phase.nihilPuppetShaUsed,undefined);
    for (const name of ['shan','wuxie']) assert.equal(f.plan(f.card(name),f.loser),null);
});

async function sharedShaContract(f) {
    f.mark(f.loser); f.mark(f.third); f.mark(f.owner);
    const cards = Array.from({length:3},()=>f.card('sha'));
    cards.forEach(c=>f.move(c,'h',f.owner));
    await f.active(cards[0],f.loser);
    f.loser.removeMark(MARK,1); f.mark(f.loser);
    await f.active(cards[1],f.third); await f.active(cards[2],f.owner);
    assert.equal(f.state.uses.length,1,'all blood actors share a single phase quota');
    assert.equal(cards[1].zone,'h'); assert.equal(cards[2].zone,'h');
}
test('all actors including self share one sha even after mark removal and restoration', async () => sharedShaContract(fixture()));

test('self actor spends quota and ordinary sha counts remain independent in either order', async () => {
    for (const ordinaryFirst of [true,false]) {
        const f=fixture();f.mark(f.owner);f.owner.getStat('card').sha=0;
        const normal=f.card('sha'), borrowed=f.card('sha'), extra=f.card('sha');
        [normal,borrowed,extra].forEach(c=>f.move(c,'h',f.owner));
        const own=async()=>{f.owner.useCard(normal,[f.third]);await f.drain();};
        if(ordinaryFirst)await own();
        await f.active(borrowed,f.owner);
        if(!ordinaryFirst)await own();
        await f.active(extra,f.owner);
        assert.equal(f.state.uses.length,2);assert.equal(f.owner.getStat('card').sha,1);assert.equal(extra.zone,'h');
        assert.equal(f.state.uses.find(ev=>ev.cards.includes(borrowed)).addCount,false);
        assert.equal(f.state.prompts.length,1);
    }
});

test('nonsha cards repeat after spending sha quota and wine belongs to the actual actor', async () => {
    const f=fixture();f.mark(f.loser);const kill=f.card('sha');f.move(kill,'h',f.owner);await f.active(kill,f.loser);
    f.state.resolveEffects=true;
    for(const name of ['jiu','jiu','nanman','nanman']) {
        const c=f.card(name);f.move(c,'h',f.owner);
        assert.equal(f.lib.skill.nihil_jie_yulei_active.filter(f.chooseEvent(),f.owner),true);
        await f.active(c,f.loser);assert.equal(f.state.uses.at(-1).player,f.loser);assert.equal(f.state.uses.at(-1).addCount,false);
    }
    assert.equal(f.state.uses.length,5);assert.equal(f.loser.drunk,2);assert.equal(f.owner.drunk,undefined);
    assert.equal(f.loser.getStat('card').jiu,undefined);
});

test('only h cards enter selection and host rejects equipment and special cards', async () => {
    const f=fixture();f.mark(f.loser);const skill=f.lib.skill.nihil_jie_yulei_active;
    assert.equal(skill.position,'h');assert.deepEqual(Array.from(skill.selectCard()),[0,1]);assert.equal(skill.viewAs,undefined);
    const event=f.chooseEvent();f.state.active=event;
    for(const zone of ['e','s']) {
        const c=f.card('sha');f.move(c,zone,f.owner);
        assert.equal(skill.filter(event,f.owner),false);assert.equal(skill.filterCard(c,f.owner),false);
        await f.active(c,f.loser);assert.equal(c.zone,zone);
    }
    assert.equal(f.state.uses.length,0);assert.equal(f.phase.nihilPuppetShaUsed,undefined);
});

test('cancelled card or target choice and illegal initial plan leave the quota free', async () => {
    const f=fixture();f.mark(f.loser);const c=f.card('sha');f.move(c,'h',f.owner);
    const choice=f.chooseEvent();f.state.active=choice;f.ui.selected.cards=[];
    assert.equal(f.lib.skill.nihil_jie_yulei_active.filterTarget(null,f.owner,f.loser),true);
    assert.equal(f.phase.nihilPuppetShaUsed,undefined);
    f.state.targetChoices.push(null);await f.active(c,f.loser);assert.equal(f.state.uses.length,0);assert.equal(c.zone,'h');
    f.loser.disabled=true;await f.active(c,f.loser);assert.equal(f.phase.nihilPuppetShaUsed,undefined);
    f.loser.disabled=false;await f.active(c,f.loser);assert.equal(f.state.uses.length,1);
});

test('host rechecks hand possession mark card permission and targets after selection', async () => {
    const changes = [f=>f.move(f.owner.getCards('h')[0],'d'), f=>f.loser.removeMark(MARK,1), f=>{f.loser.disabled=true;}, f=>{f.third.immune=true;}, f=>{f.third.far=true;}];
    for(const change of changes) {
        const f=fixture();f.mark(f.loser);const c=f.card('sha');f.move(c,'h',f.owner);f.state.targetChoices.push([f.third]);
        f.state.onTargetResult=()=>change(f);await f.active(c,f.loser);
        assert.equal(f.state.uses.length,0);assert.equal(f.phase.nihilPuppetShaUsed,undefined);
    }
});

test('a missed or invalidated sha still spends quota and fire thunder share it', async () => {
    for(const nature of ['fire','thunder']) {
        const f=fixture();f.mark(f.loser);const first=f.card('sha'),second=f.card('sha');first.nature=nature;second.nature=nature==='fire'?'thunder':'fire';
        [first,second].forEach(c=>f.move(c,'h',f.owner));f.state.onUse=ev=>{ev.cancelled=true;};
        await f.active(first,f.loser);await f.active(second,f.loser);
        assert.equal(f.state.uses.length,1);assert.equal(f.state.uses[0].card.nature,nature);assert.equal(f.phase.nihilPuppetShaUsed,true);assert.equal(f.third.hp,12);
    }
});

test('new extra and nested phase events own independent quotas and outer stays spent', async () => {
    const f=fixture();f.mark(f.loser);
    const use=async()=>{const c=f.card('sha');f.move(c,'h',f.owner);await f.active(c,f.loser);};
    await use();const outer=f.phase;
    const nested=f.action('phaseUse',async()=>{},{player:f.owner});f.state.active=nested;
    assert.equal(f.chooseEvent().nihilPuppetShaAvailable,true);await use();await use();
    assert.equal(f.state.uses.length,2);f.state.active=outer;assert.equal(f.chooseEvent().nihilPuppetShaAvailable,false);await use();assert.equal(f.state.uses.length,2);
    f.state.active=f.action('phaseUse',async()=>{},{player:f.owner,parent:null});await use();assert.equal(f.state.uses.length,3);
});

test('nearest other player phase blocks access to an outer owner phase', async () => {
    const f=fixture();f.mark(f.loser);const c=f.card('sha');f.move(c,'h',f.owner);
    f.state.active=f.action('phaseUse',async()=>{},{player:f.third});
    assert.equal(f.chooseEvent().nihilPuppetShaAvailable,false);await f.active(c,f.loser);
    assert.equal(f.state.uses.length,0);assert.equal(f.phase.nihilPuppetShaUsed,undefined);
    f.state.active=f.action('test',async()=>{},{parent:null});await f.active(c,f.loser);assert.equal(f.state.uses.length,0);
});

test('quota commits before native loss and nested use effects can reenter the active skill', async () => {
    const f=fixture();f.mark(f.loser);const first=f.card('sha'),second=f.card('sha');[first,second].forEach(c=>f.move(c,'h',f.owner));
    let losses=0;f.state.onLose=async()=>{losses++;assert.equal(f.phase.nihilPuppetShaUsed,true);await f.active(second,f.loser);};
    await f.active(first,f.loser);assert.equal(losses,1);assert.equal(f.state.uses.length,1);assert.equal(second.zone,'h');
});

test('serialized quota snapshot survives remote missing ancestors and refreshes on new choices', async () => {
    const f=fixture();f.mark(f.loser);const c=f.card('sha');f.move(c,'h',f.owner);
    const skill=f.lib.skill.nihil_jie_yulei_active, host=f.chooseEvent();
    assert.deepEqual(host._set.filter(x=>x[0]==='nihilPuppetShaAvailable').map(x=>Array.from(x)),[['nihilPuppetShaAvailable',true]]);
    const remote={type:'phase',player:f.owner};for(const [k,v] of JSON.parse(JSON.stringify(host._set)))remote[k]=v;
    f.game.online=true;skill.onChooseToUse(remote);f.state.active=remote;
    const filter=vm.runInContext('('+skill.filterCard.toString()+')',f.context);assert.equal(filter(c,f.owner),true);
    f.game.online=false;f.state.active=f.phase;await f.active(c,f.loser);
    const second=f.card('sha');f.move(second,'h',f.owner);const spent=f.chooseEvent();assert.equal(spent.nihilPuppetShaAvailable,false);
    f.state.active=spent;assert.equal(filter(second,f.owner),false);f.ui.selected.cards=[second];assert.equal(skill.filterTarget(null,f.owner,f.loser),false);
    f.state.active=f.action('phaseUse',async()=>{},{player:f.owner,parent:null});assert.equal(f.chooseEvent().nihilPuppetShaAvailable,true);
});

test('stale available snapshot cannot override quota spent during target selection', async () => {
    const f=fixture();f.mark(f.loser);const c=f.card('sha');f.move(c,'h',f.owner);const choice=f.chooseEvent();f.state.active=choice;
    f.state.onTargetResult=()=>{f.phase.nihilPuppetShaUsed=true;};await f.active(c,f.loser);
    assert.equal(choice.nihilPuppetShaAvailable,true);assert.equal(f.state.uses.length,0);assert.equal(c.zone,'h');
});


async function noDefenseContract(f, cardName) {
    f.mark(f.loser);
    const original = cardName === 'sha' ? [f.owner] : [f.owner, f.loser];
    const use = f.action('useCard', async () => {}, { card: f.card(cardName), cards: [], player: f.third, targets: original.slice(), num: 0 });
    f.state.active = use; await f.content.useCard[5](use, null, f.third);
    const step = f.content.useCard.find(fn => fn.toString().includes('if (!event.triggeredTargets2)'));
    for (let n = 0; n < original.length + 1; n++) { await step(use, null, f.third); await f.drain(); }
    assert.deepEqual(Array.from(use.targets), original, 'damage card must retain original targets');
    assert.deepEqual(f.state.targetEvents, original, 'native target queue must include owner exactly once');
    assert.equal(f.state.prompts.length, 0, 'removed defense must never ask for a target');
    assert.equal(f.loser.hasMark(MARK), true, 'ordinary targeting must not consume a blood mark');
    assert.equal(f.lib.skill.nihil_jie_yulei_redirect, undefined);
    assert.equal(f.actualTurn.nihilPuppetRedirectOwners, undefined);
    for (const target of f.state.targetEvents) await f.damage(target, 1, f.third);
    assert.equal(f.owner.hp, 11); assert.equal(f.loser.hp, cardName === 'sha' ? 12 : 11);
}
test('ordinary sha keeps owner as native target without defense prompt or mark payment', () => noDefenseContract(fixture(), 'sha'));
test('ordinary area damage keeps every original native target without defense transfer', () => noDefenseContract(fixture(), 'nanman'));

async function repeatedRewardContract(f) {
    f.mark(f.loser);await f.damage(f.third,3,f.loser);
    assert.equal(f.owner.drawn,3,'three damage points must draw three cards');
    f.lib.skill.nihil_jie_xueyin.removeBlood(f.third);await f.damage(f.third,1,f.loser);
    assert.equal(f.owner.drawn,3,'a second damage by this source must not reward');assert.equal(f.third.hasMark(MARK),false);
    await f.endTurn(f.actualTurn);assert.equal(f.loser.hasMark(MARK),true,'marks must persist across turn end');assert.equal(f.third.hasMark(MARK),false);
}
test('source damage draws its amount once per turn and source mark persists',()=>repeatedRewardContract(fixture()));

test('unmarked damage does not spend quota and different sources have separate quotas',async()=>{
    const f=fixture();await f.damage(f.third,1,f.loser);assert.equal(f.owner.drawn,0);
    f.mark(f.loser);await f.damage(f.third,2,f.loser);assert.equal(f.owner.drawn,2);
    await f.damage(f.loser,3,f.third);assert.equal(f.owner.drawn,5);
    await f.endTurn(f.actualTurn);assert.equal(f.loser.hasMark(MARK),true);assert.equal(f.third.hasMark(MARK),true);
});

test('blood marks persist across normal extra and nested native turn endings',async()=>{
    const f=fixture();f.mark(f.loser);await f.damage(f.third,1,f.loser);
    const outer=f.state.active;await f.turn(f.third);await f.endTurn();
    assert.equal(f.loser.hasMark(MARK),true);assert.equal(f.third.hasMark(MARK),true);
    f.state.active=outer;await f.endTurn(f.actualTurn);
    for(const p of [f.owner,f.third,f.third]){await f.turn(p);await f.endTurn();assert.equal(f.loser.hasMark(MARK),true);assert.equal(f.third.hasMark(MARK),true);}
    assert.equal(f.actualTurn.after.length,0);
});

test('quota is spent before nested draw reentry while every living owner draws the original amount',async()=>{
    const f=fixture(),second=f.player('secondOwner',true);f.mark(f.loser);let nested=false;
    f.state.onDraw=async p=>{if(p===f.owner&&!nested){nested=true;await f.damage(f.third,3,f.loser);f.loser.removeMark(MARK,1);}};
    await f.damage(f.third,2,f.loser);assert.equal(f.owner.drawn,2);assert.equal(second.drawn,2);
    await f.damage(f.third,1,f.loser);assert.equal(f.owner.drawn,2);assert.equal(second.drawn,2);
});

test('a nested turn and mark removal during draw cannot cancel the second owner reward',async()=>{
    const f=fixture(),second=f.player('secondOwner',true);f.mark(f.loser);let nested=false;
    f.state.onDraw=async p=>{if(p===f.owner&&!nested){nested=true;const saved=f.state.active;await f.turn(f.third);await f.endTurn();f.loser.removeMark(MARK,1);f.state.active=saved;}};
    await f.damage(f.third,2,f.loser);assert.equal(f.owner.drawn,2);assert.equal(second.drawn,2);assert.equal(f.third.hasMark(MARK),true);
});

test('owner skill loss or death does not schedule removal of existing marks',async()=>{
    for(const dead of [false,true]){const f=fixture();f.mark(f.loser);await f.damage(f.third,1,f.loser);f.owner.skills=[];f.owner.dead=dead;await f.endTurn(f.actualTurn);assert.equal(f.loser.hasMark(MARK),true);assert.equal(f.third.hasMark(MARK),true);}
});

test('phaseAfter damage leaves both source and propagated recipient marked',async()=>{
    const f=fixture();f.mark(f.loser);f.state.onTrigger=async name=>{if(name==='phaseAfter')await f.damage(f.third,1,f.loser);};
    await f.endTurn(f.actualTurn);assert.equal(f.owner.drawn,1);assert.equal(f.loser.hasMark(MARK),true);assert.equal(f.third.hasMark(MARK),true);
});

test('damage without a phase uses source custom history window once',async()=>{
    const f=fixture();f.mark(f.loser);f.state.active=f.action('setup',async()=>{},{parent:null});
    await f.damage(f.third,1,f.loser);await f.damage(f.third,1,f.loser);assert.equal(f.owner.drawn,1);assert.equal(f.third.hasMark(MARK),true);assert.equal(f.loser.hasMark(MARK),true);
});


test('native source skill hooks appear immediately and are removed with either removal path',async()=>{
    const f=fixture();await f.damage(f.owner,1,f.loser);
    assert.ok(f.lib.hook.loser_source_damageSource.includes(MARK));assert.equal(f.owner.drawn,1);
    await f.damage(f.owner,1,f.loser);assert.equal(f.loser.hasSkill(MARK),false);assert.equal(f.lib.hook.loser_source_damageSource,undefined);
    f.mark(f.third);await f.shicheng(f.third,'remove');assert.equal(f.third.hasSkill(MARK),false);assert.equal(f.lib.hook.third_source_damageSource,undefined);
});

test('source quota resets in normal and extra turns and nested turns isolate both directions',async()=>{
    for(const outerFirst of [true,false]){
        const f=fixture();f.mark(f.loser);const outer=f.state.active;
        if(outerFirst)await f.damage(f.third,1,f.loser);
        await f.turn(f.third);await f.damage(f.third,2,f.loser);await f.damage(f.third,2,f.loser);
        assert.equal(f.owner.drawn,outerFirst?3:2);await f.endTurn();f.state.active=outer;
        await f.damage(f.third,1,f.loser);assert.equal(f.owner.drawn,3);
        await f.damage(f.third,1,f.loser);assert.equal(f.owner.drawn,3);
        await f.endTurn(f.actualTurn);
        for(const actor of [f.owner,f.owner,f.third]){const old=f.owner.drawn;await f.turn(actor);await f.damage(f.third,1,f.loser);await f.damage(f.third,1,f.loser);assert.equal(f.owner.drawn,old+1);await f.endTurn();}
    }
});

test('zero and cancelled damage leave the derived skill quota available',async()=>{
    for(const cancel of [true,false]){
        const f=fixture();f.mark(f.loser);f.state.onHook=(name,[ev])=>{if(name==='checkDamage4'){if(cancel)ev.cancel();else ev.num=0;}};
        await f.damage(f.third,2,f.loser);assert.equal(f.owner.drawn,0);assert.equal(f.third.hasMark(MARK),false);
        f.state.onHook=null;await f.damage(f.third,2,f.loser);assert.equal(f.owner.drawn,2);assert.equal(f.third.hasMark(MARK),true);
    }
});

test('propagation occurs before draw and its source can immediately use an independent quota',async()=>{
    const f=fixture();f.mark(f.loser);let entered=false;
    f.state.onDraw=async()=>{assert.equal(f.third.hasMark(MARK),true);assert.equal(f.third.hasSkill(MARK),true);if(!entered){entered=true;await f.damage(f.loser,2,f.third);}};
    await f.damage(f.third,3,f.loser);assert.equal(f.owner.drawn,5);
});

test('draw amount is fixed and each owner is rechecked for life and skill before drawing',async()=>{
    for(const death of [true,false]){
        const f=fixture(), second=f.player('secondOwner',true), third=f.player('thirdOwner',true);f.mark(f.loser);
        const ev=f.damage(f.third,3,f.loser);f.state.onDraw=async p=>{if(p===f.owner){ev.num=9;if(death)second.dead=true;else second.removeSkill('nihil_jie_xueyin');}};
        await ev;assert.equal(f.owner.drawn,3);assert.equal(second.drawn,0);assert.equal(third.drawn,3);
    }
});

test('derived skill propagates with no living blood pact owner',async()=>{
    const f=fixture();f.mark(f.loser);f.owner.removeSkill('nihil_jie_xueyin');await f.damage(f.third,2,f.loser);
    assert.equal(f.third.hasMark(MARK),true);assert.equal(f.third.hasSkill(MARK),true);assert.equal(f.owner.drawn,0);
});

test('content rechecks source skill mark amount identity and spent quota',async()=>{
    for(const invalidate of [f=>f.loser.removeSkill(MARK),f=>f.loser.removeMark(MARK,1),f=>{f.ev.num=0;},f=>{f.ev.source=f.third;}]){
        const f=fixture();f.mark(f.loser);f.ev=f.action('damage',async()=>{},{source:f.loser,player:f.third,num:1});const skill=f.lib.skill[MARK];assert.equal(skill.filter(f.ev,f.loser),true);invalidate(f);
        await skill.content({},f.ev,f.loser);assert.equal(f.owner.drawn,0);assert.equal(f.third.hasMark(MARK),false);
    }
    const f=fixture();f.mark(f.loser);const ev=f.action('damage',async()=>{},{source:f.loser,player:f.third,num:2});await f.lib.skill[MARK].content({},ev,f.loser);await f.lib.skill[MARK].content({},ev,f.loser);assert.equal(f.owner.drawn,2);
});

test('fallback quota survives skill regain and resets with native history rotation',async()=>{
    const f=fixture();f.mark(f.loser);const setup=f.action('setup',async()=>{},{parent:null});f.state.active=setup;
    await f.damage(f.third,1,f.loser);f.lib.skill.nihil_jie_xueyin.removeBlood(f.loser);f.mark(f.loser);await f.damage(f.third,1,f.loser);assert.equal(f.owner.drawn,1);
    await f.turn(f.third);f.state.active=setup;await f.damage(f.third,2,f.loser);assert.equal(f.owner.drawn,3);
});

test('external native removeSkill clears blood mark storage icon and trigger hook',async()=>{
    const f=fixture();nativeMarks(f);f.mark(f.loser);assertMark(f,f.loser,true);f.loser.removeSkill(MARK);
    assertMark(f,f.loser,false);assert.equal(f.loser.storage[MARK],undefined);assert.equal(f.lib.hook.loser_source_damageSource,undefined);
    await f.damage(f.third,1,f.loser);assert.equal(f.owner.drawn,0);assert.equal(f.third.hasMark(MARK),false);
});

test('remove option heals only its target, permits self and full health, and rechecks payment', async () => {
    for (const self of [true, false]) {
        const f = fixture(), target = self ? f.owner : f.loser; f.mark(target); f.owner.hp = 5; target.hp = 5;
        await f.shicheng(target, 'remove');
        assert.equal(target.hp, 6); assert.equal(f.owner.hp, self ? 6 : 5); assert.equal(target.hasMark(MARK), false);
        await nativeShicheng(f).newPhase(); f.mark(target); f.owner.hp = 5; target.hp = target.maxHp; await f.shicheng(target, 'remove');
        assert.equal(target.hp, target.maxHp); assert.equal(f.owner.hp, self ? f.owner.maxHp : 5); assert.equal(target.hasMark(MARK), false);
    }
    for (const invalidate of [f => f.loser.removeMark(MARK, 1), f => { f.loser.dead = true; }]) {
        const f = fixture(); f.owner.hp = 5; f.loser.hp = 4; f.mark(f.loser); invalidate(f);
        await f.shicheng(f.loser, 'remove'); assert.equal(f.owner.hp, 5); assert.equal(f.loser.hp, 4);
    }
});

test('damage option uses normal saving and never removes a blood mark during dying', async () => {
    for (const saved of [true, false]) {
        const f = fixture(); f.owner.hp = 1; f.mark(f.third);
        f.state.onSave = async ev => { if (saved) await ev.player.recover(1); };
        await f.shicheng();
        assert.equal(f.owner.dead, !saved); assert.equal(f.owner.hp, saved ? 1 : 0); assert.equal(f.owner.drawn, saved ? 2 : 0);
        assert.equal(f.loser.hasMark(MARK), true); assert.equal(f.third.hasMark(MARK), true);
        assert.equal(f.state.prompts.length, 0); assert.equal(f.lib.skill.nihil_jie_shicheng_rescue, undefined);
        assert.equal(f.state.events.filter(x => Array.isArray(x) && x[0] === 'recover').length, saved ? 1 : 0);
        assert.equal(f.state.events.filter(x => Array.isArray(x) && x[0] === 'save').length, 1);
    }
});

test('damage branch allows marked or unmarked living source but rechecks source presence', async () => {
    for (const marked of [true, false]) {
        const f = fixture(); if (marked) f.mark(f.loser); f.owner.hp = 5;
        await f.shicheng(); assert.equal(f.owner.hp, marked ? 5 : 4); assert.equal(f.owner.drawn, marked ? 1 : 2);
    }
    const f = fixture(); f.owner.hp = 5; f.loser.dead = true;
    await f.shicheng(); assert.equal(f.owner.hp, 5); assert.equal(f.owner.drawn, 0);
});

test('active removal and regain do not refresh the source quota', async () => {
    const f = fixture(); f.mark(f.loser); await f.damage(f.third, 1, f.loser);
    await f.shicheng(f.loser, 'remove'); f.mark(f.loser); await f.damage(f.third, 1, f.loser);
    assert.equal(f.owner.drawn, 1); await f.endTurn(f.actualTurn); assert.equal(f.loser.hasMark(MARK),true);
});

test('displayed names agree across blood reward active removal and puppet skills', async () => {
    const f=fixture();assert.equal(f.context.window.nihilModules.jie_luofei.translate.nihil_jie_xueou,'血印');
    assert.equal(f.context.window.nihilModules.jie_luofei.title.nihil_jie_luofei,'血偶师'); assert.equal(source.includes('御儡'),false); assert.equal(f.context.window.nihilModules.jie_luofei.translate.nihil_jie_yulei,'驭傀');assert.equal(f.lib.skill[MARK].marktext,'印');
});

test('mutations restoring fixed draw or disabling marked-source branch fail blood contracts',async()=>{
    assert.ok(source.includes('await owner.draw(num);'));
    await assert.rejects(()=>repeatedRewardContract(fixture(source.replace('await owner.draw(num);','await owner.draw(1);'))),/three damage points/);
    const needle='return event.num > 0 && event.source && event.source.isIn();';assert.ok(source.includes(needle));
    await assert.rejects(()=>fourDamageContract(fixture(source.replace(needle,'return event.num > 0 && event.source && event.source.isIn() && !event.source.hasMark(PUPPET);'))),/source mark must alternate/);
});

test('in memory removal of phase quota is caught by shared actor contract', async () => {
    const original='if (get.name(card) === "sha") phase.nihilPuppetShaUsed = true;';assert.ok(source.includes(original));
    const changed=source.replace(original,'if (get.name(card) === "sha") phase.nihilPuppetShaUsed = false;');
    await assert.rejects(()=>sharedShaContract(fixture(changed)),/all blood actors share a single phase quota/);
});


function firstSelection(f, remote = false) {
    const event = f.chooseEvent();
    if (remote) {
        event.parent = null;
        for (const [key, value] of JSON.parse(JSON.stringify(event._set))) event[key] = value;
    }
    vm.runInContext(nativeMethod(eventSource, 'backup(skill)', 2), f.context).backup.call(event, 'nihil_jie_yulei_active');
    for (const key of ['filterCard', 'filterTarget', 'filterOk', 'selectCard']) event[key] = vm.runInContext('(' + event[key].toString() + ')', f.context);
    f.state.active = event;
    f.game.check();
    return event;
}
function click(f, type, item) {
    f.status.clicked = false;
    f.ui.click[type].call(item);
    return f.game.check();
}
function nativePuppetSelection(f, autoConfirm = false) {
    nativeShicheng(f);
    vm.runInContext(hooksSource,f.context);f.lib.hooks=f.context.nativeHooks;
    f.game.callHook=vm.runInContext(nativeMethod(gameSource,'callHook(name2, args)',2),f.context).callHook;
    f.lib.config.auto_confirm=autoConfirm;f.lib.config.cardtempname='off';
    f.get.links=buttons=>buttons.map(button=>button.link);f.get.is.phoneLayout=()=>false;
    f.game.countChoose=()=>{};f.game.pause=()=>{};f.game.closePopped=()=>{};
    f.ui.controls=[];f.ui.shortcut={classList:classes()};f.ui.shortcut.classList.add('hidden');
    f.ui.create.confirm=letters=>{f.ui.confirm={letters,classList:classes(),close(){delete f.ui.confirm;}};};
    f.ui.create.dialog=()=>({buttons:[],close(){},add(){return {};}});
    for(const player of f.game.players){player.isLinked=()=>false;player.isTurnedOver=()=>false;player.countCharge=()=>0;}
    for(const card of f.owner.getCards('h'))card.recheck=()=>{};
    for(const method of ['ok(node)','cancel(node)','window()'])Object.assign(f.ui.click,vm.runInContext(nativeMethod(clickSource,method,2),f.context));
    const useStep=f.content.chooseToUse.find(fn=>fn.toString().includes('player.useResult(event.result, event)'));
    const api={stage:'idle',launches:0,targetRequests:0,resumes:[],pending:Promise.resolve(),request:null,first:null};
    let resolveTarget;
    f.state.manualTargets=async request=>{
        api.stage='targets';api.targetRequests++;api.request=request;
        request.isMine=()=>true;request.prompt=false;request.animate=false;
        request.custom.replace.window=vm.runInContext('('+request.custom.replace.window.toString()+')',f.context);
        const result=new Promise(resolve=>{resolveTarget=resolve;});
        await f.content.chooseTarget[0](request,null,request.player);
        await result;await f.content.chooseTarget[1](request,null,request.player);await f.content.chooseTarget[2](request,null,request.player);
        return request.result;
    };
    f.game.resume=()=>{
        const event=f.state.active;api.resumes.push(event.name);
        if(event===api.first&&event.result?.bool&&api.stage==='pair'){
            api.launches++;api.stage='resolving';
            api.pending=(async()=>{await useStep(event,null,f.owner);await f.drain();api.stage='idle';f.state.active=event;})();
        }else if(event===api.request&&event.result&&resolveTarget){const resolve=resolveTarget;resolveTarget=null;resolve();}
    };
    api.begin=(reuse=false)=>{
        if(!reuse){f.state.active=f.phase;api.first=f.chooseEvent();}
        const event=api.first;event.isMine=()=>true;event._aiexclude=[];event._skillChoice=[];delete event.result;
        for(const method of ['backup(skill)','restore()'])Object.assign(event,vm.runInContext(nativeMethod(eventSource,method,2),f.context));
        f.state.active=event;event.backup('nihil_jie_yulei_active');
        for(const key of ['filterCard','filterTarget','filterOk','selectCard'])if(typeof event[key]==='function')event[key]=vm.runInContext('('+event[key].toString()+')',f.context);
        api.stage='pair';api.request=null;f.game.check();return event;
    };
    api.flush=async()=>{for(let i=0;i<30&&api.stage==='resolving';i++)await Promise.resolve();if(api.stage==='idle')await api.pending;};
    api.click=async(type,item)=>{f.ui.click[type].call(item);f.ui.click.window();await api.flush();};
    api.blank=async()=>{f.ui.click.window();await api.flush();if(api.request?.result?.bool===false)await api.pending;};
    api.confirm=async()=>{f.ui.click.ok();await api.pending;};
    return api;
}

async function bidirectionalContract(f, autoConfirm = false, actorFirst = true) {
    const c=f.card('sha'),no=f.card('shan');f.move(c,'h',f.owner);f.move(no,'h',f.owner);f.mark(f.loser);f.owner.disabled=true;
    const api=nativePuppetSelection(f,autoConfirm);api.begin();
    assert.equal(f.loser.classList.contains('selectable'),true,'actor must be selectable before a card through full game.check');
    assert.equal(no.classList.contains('selectable'),false);assert.equal(api.launches,0);
    await api.click(actorFirst?'target':'card',actorFirst?f.loser:c);assert.equal(api.stage,'pair');assert.equal(api.launches,0);
    await api.click(actorFirst?'card':'target',actorFirst?c:f.loser);assert.equal(api.stage,'targets','complete pair must enter targets without intermediate confirm');assert.equal(api.launches,1);
    assert.equal(f.lib.config.auto_confirm,autoConfirm);assert.equal(api.targetRequests,1);assert.equal(api.request.result,undefined,'selection bubble must not cancel new targets');
    assert.equal(f.phase.nihilPuppetShaUsed,undefined);assert.equal(c.zone,'h');
    await api.click('target',f.third);
    if(!autoConfirm){assert.equal(api.stage,'targets');assert.equal(f.state.uses.length,0);await api.confirm();}else await api.pending;
    assert.equal(f.state.uses.length,1);assert.equal(f.state.uses[0].player,f.loser);assert.deepEqual(f.state.uses[0].targets,[f.third]);
    assert.equal(f.phase.nihilPuppetShaUsed,true);assert.equal(api.launches,1);
}

test('native check autoConfirm and click enter actual targets in both orders with either global setting',async()=>{
    for(const auto of [false,true])for(const actorFirst of [false,true])await bidirectionalContract(fixture(),auto,actorFirst);
});

test('previous static range entrance reproduces intermediate confirmation with native autoConfirm',async()=>{
    const old=source.replace('position: "h", direct: true, selectTarget: 1,','position: "h", selectTarget: 1,').replace('selectCard: function () { return ui.selected.cards.length ? 1 : [0, 1]; },','selectCard: [0, 1],');
    for(const auto of [false,true]){
        const f=fixture(old),c=f.card('sha');f.move(c,'h',f.owner);f.mark(f.loser);const api=nativePuppetSelection(f,auto);api.begin();
        await api.click('card',c);await api.click('target',f.loser);assert.equal(f.game.check(),true);assert.equal(api.stage,'pair');assert.equal(api.launches,0);
        assert.equal(f.ui.confirm.letters.includes('o'),true);
    }
});

test('native blank cancels either stage and reuse restores ordinary choice without leaked behavior',async()=>{
    const f=fixture(),c=f.card('sha');f.move(c,'h',f.owner);f.mark(f.loser);const api=nativePuppetSelection(f,false);
    for(const half of ['card','target']){api.begin(!!api.first);await api.click(half,half==='card'?c:f.loser);await api.blank();assert.equal(api.first.skill,undefined);assert.equal(api.first.selectCard,undefined);assert.equal(api.first.direct,undefined);assert.equal(api.first.custom?.replace?.window,undefined);assert.equal(api.launches,0);}
    api.begin(true);await api.click('target',f.loser);await api.click('card',c);assert.equal(api.stage,'targets');
    await api.click('target',f.third);assert.equal(api.request.result,undefined);await api.blank();assert.equal(api.request.result.bool,false);assert.equal(api.stage,'idle');assert.equal(f.state.uses.length,0);assert.equal(c.zone,'h');assert.equal(f.phase.nihilPuppetShaUsed,undefined);
    api.begin(true);await api.click('card',c);await api.click('target',f.loser);await api.click('target',f.third);await api.confirm();assert.equal(f.state.uses.length,1);assert.equal(api.launches,2);assert.equal(f.lib.config.auto_confirm,false);
});

test('cancel restores ordinary card selection without automatic completion or global changes',async()=>{
    const f=fixture(),c=f.card('sha');f.move(c,'h',f.owner);f.mark(f.loser);const api=nativePuppetSelection(f,false);const event=api.begin();
    await api.click('target',f.loser);await api.blank();
    Object.assign(event,{filterCard:card=>card===c,selectCard:1,filterTarget:(card,player,target)=>target===f.third,selectTarget:1});
    f.game.check();await api.click('card',c);await api.click('target',f.third);
    assert.equal(f.game.check(),true);assert.equal(event.skill,undefined);assert.equal(event.result,undefined);assert.equal(api.resumes.length,0);assert.equal(f.lib.config.auto_confirm,false);
    assert.equal(event.forceAuto,undefined);assert.equal(event.custom?.replace?.window,undefined);
});

test('native send carries custom cancellation through set and native result serialization',async()=>{
    const f=fixture(),c=f.card('sha');f.move(c,'h',f.owner);f.mark(f.loser);const api=nativePuppetSelection(f,false);api.begin();
    await api.click('card',c);await api.click('target',f.loser);const request=api.request;assert.equal(api.stage,'targets');
    f.context.TYPE_KEY='__type';f.context.security={isSandboxRequired:()=>false,exec:code=>vm.runInContext('(function(){'+code+'})()',f.context)};
    f.context.ErrorManager={setCodeSnippet(){}};f.context.CodeSnippet=class {};f.get.pureFunctionStr=str=>str;
    for(const method of ['stringifiedResult(item, level, nomore)','parsedResult(item)','funcInfoOL(func)','infoFuncOL(info)'])Object.assign(f.get,vm.runInContext(nativeMethod(getSource,method,2),f.context));
    const customSet=request._set.find(([key])=>key==='custom');assert.ok(customSet);
    const serialized=f.get.stringifiedResult(customSet);assert.equal(typeof serialized[1].replace.window,'string');assert.ok(serialized[1].replace.window.startsWith('_noname_func:'));
    const rebuilt=f.get.parsedResult(JSON.parse(JSON.stringify(serialized)));request.set(rebuilt[0],rebuilt[1]);
    let sent;f.owner.send=(...args)=>{sent=args;};f.owner.wait=()=>{};f.get.skillState=()=>({});
    vm.runInContext(nativeMethod(eventSource,'send()',2),f.context).send.call({...request,parent:null});
    assert.equal(sent[1],'chooseTarget');assert.equal(sent[3],request._set);assert.ok(sent[3].some(([key])=>key==='custom'));
    await api.blank();assert.equal(request.result.bool,false);assert.equal(api.stage,'idle');assert.equal(c.zone,'h');assert.equal(f.state.uses.length,0);assert.equal(f.phase.nihilPuppetShaUsed,undefined);
});

test('native autoConfirm rejects stale and forged pairs before launching the skill',async()=>{
    for(const stale of ['mark','hand','pair']){
        const f=fixture(),c=f.card('sha');f.move(c,'h',f.owner);f.mark(f.loser);const api=nativePuppetSelection(f,true);api.begin();
        f.ui.selected.cards=[c];f.ui.selected.targets=[f.loser];
        if(stale==='mark')f.loser.removeMark(MARK,1);else if(stale==='hand')f.move(c,'e',f.owner);else f.ui.selected.targets=[f.third];
        assert.equal(f.game.check(),false);assert.equal(api.launches,0);assert.equal(f.state.uses.length,0);
    }
});

test('native automatic entrance preserves no-target and all-target cards without a second prompt',async()=>{
    for(const name of ['testNoTarget','nanman']){
        const f=fixture();f.lib.card.testNoTarget={enable:true,notarget:true};const c=f.card(name);f.move(c,'h',f.owner);f.mark(f.loser);const api=nativePuppetSelection(f,false);api.begin();
        await api.click('card',c);await api.click('target',f.loser);await api.pending;
        assert.equal(api.targetRequests,0);assert.equal(f.state.uses.length,1);assert.equal(f.phase.nihilPuppetShaUsed,undefined);
        assert.deepEqual(Array.from(f.state.uses[0].targets),name==='nanman'?[f.owner,f.third]:[]);
    }
});

test('first selection cross filters actors and cards and rejects stale or forged complete pairs', () => {
    const f = fixture(); f.mark(f.loser); f.mark(f.third);
    f.lib.card.actorA = { enable: (c, p) => p === f.loser, notarget: true };
    f.lib.card.actorB = { enable: (c, p) => p === f.third, notarget: true };
    const a = f.card('actorA'), b = f.card('actorB');
    f.move(a, 'h', f.owner); f.move(b, 'h', f.owner);
    firstSelection(f);
    click(f, 'target', f.loser);
    assert.equal(a.classList.contains('selectable'), true); assert.equal(b.classList.contains('selectable'), false);
    click(f, 'target', f.loser); click(f, 'card', b);
    assert.equal(f.loser.classList.contains('selectable'), false); assert.equal(f.third.classList.contains('selectable'), true);
    click(f, 'target', f.third); assert.equal(f.game.check(), true);
    f.third.removeMark(MARK, 1); assert.equal(f.game.check(), false, 'lost mark invalidates a selected pair');
    click(f, 'target', f.third); click(f, 'card', b); click(f, 'card', a); click(f, 'target', f.loser);
    assert.equal(f.game.check(), true);
    f.move(a, 'e', f.owner); assert.equal(f.game.check(), false, 'card leaving hand invalidates confirmation');
    f.ui.selected.cards = [b]; f.ui.selected.targets = [f.loser]; assert.equal(f.game.check(), false, 'forged incompatible pair cannot confirm');
});

test('confirmed actor is distinct from actual card targets and all target callbacks rebuild without closures', async () => {
    const f = fixture(); f.mark(f.loser); f.owner.disabled = true;
    const c = f.card('sha'); f.move(c, 'h', f.owner);
    const original = f.chooseEvent(); firstSelection(f); click(f, 'target', f.loser); click(f, 'card', c);
    f.ui.selected.cards = []; f.ui.selected.targets = []; f.state.active = original;
    f.state.targetChoices.push([f.third]); await f.active(c, f.loser);
    assert.equal(f.state.prompts[0].nihilPuppetUser, f.loser);
    assert.ok(f.state.prompts[0].args[0].includes('替loser选择sha的目标'));
    assert.deepEqual(f.state.uses[0].targets, [f.third]); assert.equal(f.state.uses[0].player, f.loser);
});

function markNode() {
    const node = { classList: classes(), style: { transform: '' }, children: [], innerHTML: '', parentNode: null,
        appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
        remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; },
        querySelector(selector) { return this.children.find(child => child.classList.contains(selector.slice(1))) || null; },
    };
    node.delete = node.remove;
    return node;
}
function nativeMarks(f, createNode = markNode) {
    const methods = ['addMark(i, num, log)', 'removeMark(i, num, log)', 'countMark(i)', 'hasMark(i)', 'updateMark(i, storage)', 'updateMarks(connect)', 'markSkill(name2, info, card, nobroadcast)', 'unmarkSkill(name2, nobroadcast)'];
    f.game.addVideo = () => {};
    f.ui.updatem = () => {};
    f.ui.create = { div(selector, parent) { const n = createNode(); for (const name of selector.split('.').filter(Boolean)) n.classList.add(name); return parent.appendChild(n); } };
    for (const p of f.game.players) {
        p.storage = {}; p.marks = {}; p.node.marks = createNode(); p.syncStorage = () => {};
        p.mark = function (name, info) { const n = createNode(); n.classList.add('mark'); n.innerHTML = f.lib.skill[name].marktext; n.info = info; return this.node.marks.appendChild(n); };
        for (const method of methods) Object.assign(p, vm.runInContext(nativeMethod(playerSource, method, 2), f.context));
    }
}
function nativeSkillIntro(f, createNode = markNode) {
    Object.assign(f.lib.translate,f.context.window.nihilModules.jie_luofei.translate);
    f.status.skillOwner={nihil_jie_xueyin:'nihil_jie_luofei'};
    f.get.character=()=>['female','shen',3,['nihil_jie_xueyin','nihil_jie_shicheng','nihil_jie_yulei']];
    f.get.groupnature=()=> 'shen';f.get.translation=s=>f.lib.translate[s]||s;
    f.get.skillInfoTranslation=s=>f.lib.translate[s+'_info'];
    f.ui.create ||= {};
    f.ui.create.buttonPresets={vcard(){const node=createNode();node.node={name:createNode(),background:createNode()};node.setBackground=()=>{};node.appendChild(node.node.name);return node;}};
    f.ui.create.buttonPresets.skill=vm.runInContext(nativeMethod(createSource,'skill: (item, type, position, noclick, node) =>',4),f.context).skill;
    const root=createNode(), texts=[], links=[];
    const intro={add(value){if(typeof value==='string'){texts.push(value);const node=createNode();node.innerHTML=value;root.appendChild(node);return node;}for(const item of value[0]){links.push(item[0]);const node=value[1](item);root.appendChild(node);node._customintro(intro);}}};
    const main=f.ui.create.buttonPresets.skill('nihil_jie_xueyin');main._customintro(intro);
    assert.ok(texts.includes('—— 衍生技能 ——'));assert.ok(links.includes(MARK));assert.ok(texts.some(text=>text.includes('每个回合限一次')&&text.includes('此次伤害值')));
    assert.equal(f.lib.skill[MARK].charlotte,undefined);
    return {root,texts,links};
}

test('native skill preset customintro displays blood pact derivation and full derived rule',()=>nativeSkillIntro(fixture()));

function assertMark(f, p, present) {
    assert.equal(p.hasMark(MARK), present);
    assert.equal(p.hasSkill(MARK), present, 'blood mark and real skill lifecycle agree');
    assert.equal(p.node.marks.children.length, present ? 1 : 0, 'zero blood marks must remove the icon');
    assert.equal(!!p.marks[MARK], present);
    if (present) {
        assert.equal(p.marks[MARK].innerHTML, '印');
        assert.equal(p.marks[MARK].querySelector('.markcount'), null, 'singleton blood mark must not show a numeric badge');
    }
}
async function markerContract(f, createNode) {
    nativeMarks(f, createNode);
    assertMark(f, f.loser, false);
    await f.damage(f.owner, 1, f.loser); assertMark(f, f.loser, true);
    await f.damage(f.owner, 1, f.loser); assert.equal(f.loser.countMark(MARK), 0); assertMark(f, f.loser, false);
    await f.damage(f.owner, 1, f.loser); assertMark(f, f.loser, true);
    await f.shicheng(f.loser, 'remove'); assertMark(f, f.loser, false);
    f.loser.updateMark(MARK); assertMark(f, f.loser, false);
    await f.damage(f.owner, 1, f.loser); assertMark(f, f.loser, true);
    await nativeShicheng(f).newPhase();
    f.owner.hp = 1; await f.shicheng(f.loser, 'remove');
    assert.equal(f.owner.dead, false); assertMark(f, f.loser, false);
    f.mark(f.loser); f.loser.updateMark(MARK); assertMark(f, f.loser, true);
}
test('native mark lifecycle shows one unnumbered icon and active removal removes it', () => markerContract(fixture()));








test('mutation restoring mandatory card selection is detected by native actor-first interaction', async () => {
    assert.ok(source.includes('selectCard: function () { return ui.selected.cards.length ? 1 : [0, 1]; }'));
    await assert.rejects(() => bidirectionalContract(fixture(source.replace('return ui.selected.cards.length ? 1 : [0, 1];', 'return 1;'))), /actor must be selectable before a card|complete pair must enter targets/);
});
test('mutation omitting derived skill removal is detected by native lifecycle', async () => {
    assert.ok(source.includes('player.removeSkill(PUPPET);'));
    await assert.rejects(() => markerContract(fixture(source.replace('player.removeSkill(PUPPET);', ''))), /blood mark and real skill lifecycle agree/);
});

function nativeShicheng(f) {
    f.lib.filter.filterEnable = vm.runInContext(nativeMethod(librarySource, 'filterEnable: function', 4), f.context).filterEnable;
    f.get.skillCount = vm.runInContext(nativeMethod(getSource, 'skillCount(skill, player)', 2), f.context).skillCount;
    f.get.skillTranslation = skill => skill;
    for (const method of ['useSkill(params)', 'useResult(result, event)']) Object.assign(f.owner, vm.runInContext(nativeMethod(playerSource, method, 2), f.context));
    f.game.trySkillAudio = () => {}; f.game.logv = () => {}; f.game.stopCountChoose = () => {};
    f.ui.control = { addTempClass() {} };
    f.ui.create ||= {};
    f.ui.create.dialog = (title, [items]) => ({ title, buttons: items.map(([link, label]) => ({ link, label, classList: classes() })), close() {} });
    const steps = f.content.chooseToUse;
    const chooseStep = steps.find(fn => fn.toString().includes('info.chooseButton.dialog'));
    const backupStep = steps.find(fn => fn.toString().includes('].sourceSkill = event.buttoned'));
    const useStep = steps.find(fn => fn.toString().includes('player.useResult(event.result, event)'));
    assert.ok(chooseStep && backupStep && useStep);
    function entrance() {
        const event = f.chooseEvent(); event._aiexclude = [];
        for (const method of ['backup(skill)', 'restore()']) Object.assign(event, vm.runInContext(nativeMethod(eventSource, method, 2), f.context));
        f.state.active = event;
        return event;
    }
    function available(event = entrance()) { return f.lib.filter.filterEnable(event, f.owner, 'nihil_jie_shicheng'); }
    async function choose(option, event = entrance()) {
        event.result = { bool: true, skill: 'nihil_jie_shicheng' };
        f.state.choices.push(option ? links => links.find(link => link[0] === option) : null);
        const result = await chooseStep(event, null, f.owner);
        await backupStep(event, null, f.owner, result);
        if (option) {
            const backup = f.lib.skill.nihil_jie_shicheng_backup;
            for (const key of ['filterCard', 'filterTarget', 'onuse', 'content']) {
                const value = backup[key].toString();
                backup[key] = vm.runInContext(value.startsWith('async content(') ? '({' + value + '}).content' : '(' + value + ')', f.context);
            }
            event.filterCard = backup.filterCard; event.filterTarget = backup.filterTarget;
            assert.equal(backup.sourceSkill, 'nihil_jie_shicheng');
            f.game.check();
        }
        return { event };
    }
    function cancel(event) {
        f.state.active = event;
        vm.runInContext(nativeMethod(clickSource, 'cancel(node)', 2), f.context).cancel();
    }
    async function confirm(event, target, beforeUse) {
        f.state.active = event; f.ui.selected.targets = [target];
        assert.equal(f.game.check(), true, 'native backup accepts selected target');
        event.result = { bool: true, skill: event.skill, cards: [], targets: [target] };
        f.ui.selected.targets = []; f.game.uncheck();
        beforeUse?.(); await useStep(event, null, f.owner); await f.drain();
        return event;
    }
    async function newPhase() {
        f.state.active = f.action('phaseUse', async () => {}, { player: f.owner, parent: f.actualTurn });
        await f.content.phaseUse[0](f.state.active, null, f.owner);
    }
    return { available, choose, cancel, confirm, newPhase };
}

async function shichengOptions(f, api) {
    await api.choose(null);
    return Object.fromEntries(f.state.prompts.at(-1).dialog.buttons.map(b => [b.link[0], b.classList.contains('selectable')]));
}

async function independentOptionsContract(f) {
    const api = nativeShicheng(f); f.mark(f.loser); f.owner.hp = 5;
    await api.confirm((await api.choose('damage')).event, f.loser);
    const hp = f.owner.hp, drawn = f.owner.drawn;
    await f.shicheng(f.loser, 'damage');
    assert.equal(f.owner.drawn, drawn, 'spent damage option must not execute twice');
    assert.equal(f.owner.hp, hp);
    f.mark(f.loser);
    assert.equal(api.available(), true, 'unused remove option remains available');
    await api.confirm((await api.choose('remove')).event, f.loser);
    assert.equal(f.loser.hasMark(MARK), false); assert.equal(api.available(), false);
}

test('native chooseButton backup allows each option once in either order and new phase refreshes both', async () => {
    for (const first of ['remove', 'damage']) {
        const f=fixture(), api=nativeShicheng(f), second=first==='remove'?'damage':'remove'; f.mark(f.loser); f.owner.hp=5;
        assert.equal(api.available(),true);
        await api.confirm((await api.choose(first)).event,f.loser);
        assert.equal(f.get.skillCount('nihil_jie_shicheng',f.owner),1);
        f.mark(f.loser);
        const options=await shichengOptions(f,api); assert.equal(options[first],false); assert.equal(options[second],true);
        assert.equal(api.available(),true);
        await api.confirm((await api.choose(second)).event,f.loser);
        assert.equal(f.get.skillCount('nihil_jie_shicheng',f.owner),2); assert.equal(api.available(),false);
        assert.deepEqual(await shichengOptions(f,api),{remove:false,damage:false});
        await api.newPhase(); f.mark(f.loser); assert.equal(api.available(),true);
        assert.deepEqual(await shichengOptions(f,api),{remove:true,damage:true});
    }
});

test('native option and target cancellation leave both option receipts unused', async () => {
    const f=fixture(),api=nativeShicheng(f);f.mark(f.loser);
    const {event:optionCancelled}=await api.choose(null);assert.equal(optionCancelled.skill,undefined);
    const {event}=await api.choose('remove');api.cancel(event);assert.equal(event.skill,undefined);
    assert.equal(f.get.skillCount('nihil_jie_shicheng',f.owner),0);assert.equal(f.phase.nihilJieShichengUsed,undefined);
    assert.deepEqual(await shichengOptions(f,api),{remove:true,damage:true});
    await api.confirm((await api.choose('damage')).event,f.owner);
    assert.deepEqual(Array.from(f.phase.nihilJieShichengUsed),['damage']);
});

test('native option filter rejects no-mark removal and rebuilt backup allows self', async () => {
    const f=fixture(),api=nativeShicheng(f);
    assert.deepEqual(await shichengOptions(f,api),{remove:false,damage:true});
    let {event}=await api.choose('damage'); assert.equal(event.filterTarget(null,f.owner,f.owner),true);api.cancel(event);
    f.mark(f.owner);({event}=await api.choose('remove'));
    assert.equal(event.filterTarget(null,f.owner,f.owner),true);assert.equal(event.filterTarget(null,f.owner,f.loser),false);
    await api.confirm(event,f.owner);assert.equal(f.owner.hasMark(MARK),false);
});

test('serialized option snapshots and rebuilt callbacks work without remote ancestors', async () => {
    const f=fixture(),api=nativeShicheng(f);f.mark(f.loser);await api.confirm((await api.choose('damage')).event,f.loser);f.mark(f.loser);
    const remote=f.chooseEvent();remote.parent=null;remote._aiexclude=[];
    for(const [key,value] of JSON.parse(JSON.stringify(remote._set)))remote[key]=value;
    f.game.online=true;f.lib.skill.nihil_jie_shicheng.onChooseToUse(remote);f.state.active=remote;
    await api.choose(null,remote);
    assert.deepEqual(Object.fromEntries(f.state.prompts.at(-1).dialog.buttons.map(b=>[b.link[0],b.classList.contains('selectable')])),{remove:true,damage:false});
    const entry=f.lib.skill.nihil_jie_shicheng;
    const rebuilt=vm.runInContext('('+entry.chooseButton.filter.toString()+')',f.context);
    assert.equal(rebuilt({link:JSON.parse(JSON.stringify(['damage',false]))}),false);
    assert.equal(rebuilt({link:JSON.parse(JSON.stringify(['remove',true]))}),true);
});

test('confirmed prevented damage and invalidated mark spend only their chosen option', async () => {
    for(const option of ['remove','damage']){
        const f=fixture(),api=nativeShicheng(f);f.mark(f.loser);f.owner.hp=5;
        f.loser.hp=4;
        const {event}=await api.choose(option);
        if(option==='damage')f.state.onHook=(name,[ev])=>{if(name==='checkDamage4')ev.cancel();};
        await api.confirm(event,f.loser,()=>{if(option==='remove')f.loser.removeMark(MARK,1);});
        assert.equal(f.owner.hp,option==='damage'?6:5);assert.equal(f.owner.drawn,option==='damage'?1:0);assert.equal(f.loser.hp,4);
        f.mark(f.loser);const options=await shichengOptions(f,api);assert.equal(options[option],false);assert.equal(options[option==='remove'?'damage':'remove'],true);
    }
});

test('native onuse reserves before useSkill and a dead target skipped by native content remains spent', async () => {
    for(const option of ['remove','damage']){
        const f=fixture(),api=nativeShicheng(f);f.mark(f.loser);f.owner.hp=5;let triggered=false;
        f.state.onTrigger=name=>{if(name==='useSkill'){triggered=true;assert.ok(f.phase.nihilJieShichengUsed.includes(option));f.loser.dead=true;}};
        await api.confirm((await api.choose(option)).event,f.loser);
        assert.equal(triggered,true);assert.equal(f.owner.hp,5);assert.equal(f.owner.drawn,0);
        f.loser.dead=false;const options=await shichengOptions(f,api);assert.equal(options[option],false);assert.equal(options[option==='remove'?'damage':'remove'],true);
    }
});

test('same-option stale confirmation cannot execute twice',()=>independentOptionsContract(fixture()));

test('nested extra phase retains outer receipt and nested backup replacement cannot change outer effect',async()=>{
    const f=fixture(),api=nativeShicheng(f),outer=f.phase;f.mark(f.loser);f.owner.hp=5;f.loser.hp=4;let nested=false;
    f.state.onTrigger=async name=>{if(name==='useSkill'&&!nested){nested=true;const saved=f.state.active;await api.newPhase();await f.shicheng(f.third,'damage');f.state.active=saved;}};
    await api.confirm((await api.choose('remove')).event,f.loser);
    assert.equal(f.loser.hasMark(MARK),false,'outer remove survives nested damage backup');assert.equal(f.owner.hp,4);assert.equal(f.owner.drawn,2);assert.equal(f.loser.hp,5);
    assert.deepEqual(Array.from(outer.nihilJieShichengUsed),['remove']);
    f.state.active=outer;f.mark(f.loser);assert.deepEqual(await shichengOptions(f,api),{remove:false,damage:true});
});

test('mutation removing option reservation is caught by repeated native confirmation',async()=>{
    const needle='phase.nihilJieShichengUsed.push(option);';assert.ok(source.includes(needle));
    await assert.rejects(()=>independentOptionsContract(fixture(source.replace(needle,''))),/spent damage option/);
});

test('mutation healing after lost payment is caught by active removal outcome', async () => {
    const needle = 'if (!target.hasMark("nihil_jie_xueou")) return;'; assert.ok(source.includes(needle));
    const f = fixture(source.replace(needle, '')); f.owner.hp = 5; f.loser.hp = 4;
    await f.shicheng(f.loser, 'remove');
    assert.equal(f.owner.hp, 5);
    assert.throws(() => assert.equal(f.loser.hp, 4, 'missing payment must never heal'), /missing payment/);
});

async function browserVerification() {
    const puppeteer = require(process.env.NONAME_PUPPETEER || 'F:/AI_project/nameless_game/agent_test/node_modules/puppeteer');
    const browser = await puppeteer.launch({ executablePath: process.env.NONAME_CHROMIUM || 'C:/Users/Dreamjiao/AppData/Local/ms-playwright/chromium-1237/chrome-win64/chrome.exe', headless: true });
    const output = process.env.NONAME_BROWSER_OUTPUT || path.join(__dirname, '../artifacts/jieluofei-v4.8.3-ui');
    fs.mkdirSync(output, { recursive: true });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1100, height: 700 });
        await page.setContent('<!doctype html><meta charset="utf-8"><style>body{font:20px sans-serif;background:#17252c;color:white;padding:28px}.row{display:flex;gap:20px;margin:24px 0}.card,.player{border:2px solid #52646b;border-radius:12px;padding:24px;min-width:150px;min-height:70px}.selectable{border-color:#57baad;cursor:pointer}.selected{background:#335b62;border-color:#f5c269}.marks{display:flex;margin-top:15px}.mark{border-radius:50%;background:#a52d41;padding:10px;color:white}.prompt{color:#f5c269}button{font:inherit;padding:8px 30px}#status{color:#bddbd7}</style><h1>落绯 v4.8.3 原生方法隔离验证</h1><p>同一界面选择手牌和用牌者。此页只验证原生方法与真实 DOM，不是完整游戏。</p><div id="players" class="row"></div><div id="cards" class="row"></div><button id="confirm" disabled>确认组合</button><p id="status"></p>');
        const files = Object.fromEntries(['noname/ai/basic.js', 'card/standard.js', 'card/extra.js', 'card/huodong.js', 'noname/library/element/GameEvent/compilers/ContentCompilerBase.js', 'noname/library/element/GameEvent/compilers/ArrayCompiler.js'].map(file => [file, read(file)]));
        const helpers = [nativeMethod, classes, fixture, firstSelection, click, markNode, nativeMarks, assertMark, markerContract, nativeShicheng, nativeSkillIntro, nativePuppetSelection].map(fn => fn.toString()).join('\n');
        await page.evaluate(payload => {
            const assert = {
                equal(a, b, message = 'values differ') { if (a !== b) throw new Error(message + ' ' + String(a) + ' !== ' + String(b)); },
                ok(value, message = 'assertion failed') { if (!value) throw new Error(message); },
                deepEqual(a, b, message = 'arrays differ') { if (a === b) return; if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) throw new Error(message); for (let i = 0; i < a.length; i++) this.deepEqual(a[i], b[i], message); },
            };
            const vm = { createContext(value) { value.globalThis = value; return value; }, runInContext(code, context) { return new Function('context', 'code', 'with(context){return eval(code)}')(context, code); } };
            const env = { ...payload, assert, vm, read: file => payload.files[file], TAG: 'nihil_jie_yulei', MARK: 'nihil_jie_xueou' };
            const api = new Function(...Object.keys(env), payload.helpers + '\nreturn {fixture,firstSelection,nativeMarks,assertMark,markerContract,nativeShicheng,nativeSkillIntro,nativePuppetSelection};')(...Object.values(env));
            const createNode = () => { const node = document.createElement('div'); node.delete = () => node.remove(); return node; };
            window.mountPuppet = auto => {
                document.body.innerHTML='<h1>落绯 v4.8.3 驭傀自动进入目标</h1><p>原生 check、autoConfirm、click 与真实 DOM；隔离调度。全局自动确认 '+auto+'</p><div id="players" class="row"></div><div id="cards" class="row"></div><button id="begin">重新发动</button><button id="confirm" disabled>确认实际目标</button><button id="cancel">取消</button><div id="blank" style="height:55px;margin-top:15px;background:#1b3038">空白区域（点击取消）</div><p id="status"></p>';
                const f=api.fixture();api.nativeMarks(f,createNode);f.mark(f.loser);
                const c=f.card('sha'),no=f.card('shan');f.move(c,'h',f.owner);f.move(no,'h',f.owner);f.owner.disabled=true;
                const interaction=api.nativePuppetSelection(f,auto);
                for(const p of f.game.players){
                    const node=createNode();node.id=p.playerid;node.classList.add('player');node.textContent=p.playerid;p.classList=node.classList;
                    p.node.marks.classList.add('marks');node.appendChild(p.node.marks);document.querySelector('#players').appendChild(node);
                    p.prompt=text=>{const label=createNode();label.classList.add('prompt');label.innerHTML=text;node.appendChild(label);p.node.prompt=label;};
                    p.unprompt=()=>{p.node.prompt?.remove();delete p.node.prompt;};
                    node.onclick=()=>f.ui.click.target.call(p);
                }
                for(const card of [c,no]){const node=createNode();node.id=card.name;node.classList.add('card');node.textContent=card.name;card.classList=node.classList;document.querySelector('#cards').appendChild(node);node.onclick=()=>f.ui.click.card.call(card);}
                function refresh(){
                    document.querySelector('#confirm').disabled=interaction.stage!=='targets'||!f.ui.confirm?.letters.includes('o');
                    document.querySelector('#status').textContent='当前步骤 '+interaction.stage+'；进入技能 '+interaction.launches+' 次；目标请求 '+interaction.targetRequests+' 次；用牌 '+f.state.uses.length+' 次';
                }
                const bubbles=[];
                document.body.onclick=()=>{bubbles.push({stage:interaction.stage,clicked:!!f.status.clicked});f.ui.click.window();Promise.resolve().then(async()=>{await interaction.flush();refresh();});};
                document.querySelector('#begin').onclick=()=>{f.status.clicked=true;interaction.begin(true);};
                document.querySelector('#confirm').onclick=()=>{f.status.clicked=true;f.ui.click.ok();};
                document.querySelector('#cancel').onclick=()=>{f.status.clicked=true;f.ui.click.cancel();};
                interaction.begin();refresh();window.probe={f,c,api,createNode,refresh,assert,interaction,bubbles};
            };
            window.mountPuppet(false);
        }, { source, aiSource, playerSource, librarySource, gameSource, eventSource, getSource, clickSource, createSource, hooksSource, contentSource, checkSource, files, helpers });
        const observations=[];
        const settle=()=>page.evaluate(async()=>{await window.probe.interaction.flush();window.probe.refresh();});
        const observe=async name=>{
            await settle();const value=await page.evaluate(()=>{const {f,c,interaction:a,bubbles}=window.probe;return {stage:a.stage,launches:a.launches,targetRequests:a.targetRequests,targetCancelled:a.request?.result?.bool===false,uses:f.state.uses.length,cardZone:c.zone,quota:!!f.phase.nihilPuppetShaUsed,globalAuto:f.lib.config.auto_confirm,skill:a.first.skill,confirm:!document.querySelector('#confirm').disabled,badges:document.querySelectorAll('.markcount').length,bubbles:bubbles.slice()};});
            observations.push({name,...value});return value;
        };
        for(const auto of [false,true])for(const actorFirst of [true,false]){
            await page.evaluate(auto=>window.mountPuppet(auto),auto);
            await page.click(actorFirst?'#loser':'#sha');const half=await observe('half-'+actorFirst+'-'+auto);assert.equal(half.launches,0);assert.equal(half.confirm,false);
            await page.click(actorFirst?'#sha':'#loser');const pair=await observe('pair-'+actorFirst+'-'+auto);assert.equal(pair.stage,'targets');assert.equal(pair.launches,1);assert.equal(pair.targetRequests,1);assert.equal(pair.targetCancelled,false);assert.equal(pair.globalAuto,auto);assert.equal(pair.badges,0);assert.equal(pair.bubbles.at(-1).clicked,true);
            await page.screenshot({path:path.join(output,(actorFirst?'actor-first':'card-first')+'-auto-'+auto+'.png')});
            await page.click('#third');await settle();
            if(!auto){assert.equal((await observe('actual-target-selected')).stage,'targets');await page.click('#confirm');}
            await page.evaluate(()=>window.probe.interaction.pending);const used=await observe('used-'+actorFirst+'-'+auto);assert.equal(used.uses,1);assert.equal(used.launches,1);assert.equal(used.quota,true);
        }
        await page.evaluate(()=>window.mountPuppet(false));
        for(const selector of ['#sha','#loser']){
            await page.click(selector);await page.click('#blank');const cancelled=await observe('first-blank-'+selector);assert.equal(cancelled.skill,undefined);assert.equal(cancelled.launches,0);assert.equal(cancelled.cardZone,'h');assert.equal(cancelled.quota,false);
            await page.click('#begin');
        }
        await page.screenshot({path:path.join(output,'first-stage-cancel-reentered.png')});
        await page.click('#sha');await page.click('#loser');await settle();await page.click('#third');await page.click('#blank');await page.evaluate(()=>window.probe.interaction.pending);
        const cancelled=await observe('second-blank');assert.equal(cancelled.stage,'idle');assert.equal(cancelled.targetCancelled,true);assert.equal(cancelled.uses,0);assert.equal(cancelled.cardZone,'h');assert.equal(cancelled.quota,false);
        await page.screenshot({path:path.join(output,'second-stage-blank-cancel.png')});
        await page.click('#begin');await page.click('#loser');await page.click('#sha');await settle();await page.click('#third');await page.click('#confirm');await page.evaluate(()=>window.probe.interaction.pending);
        const reentered=await observe('cancel-reenter-success');assert.equal(reentered.uses,1);assert.equal(reentered.launches,2);assert.equal(reentered.globalAuto,false);
        await page.screenshot({path:path.join(output,'cancel-reenter-success.png')});
        await page.evaluate(()=>{document.body.onclick=null;});
        const lifecycle = await page.evaluate(async () => {
            const { api, createNode, assert } = window.probe;
            const f = api.fixture(); await api.markerContract(f, createNode);
            const active = api.nativeShicheng(f);
            await active.newPhase();
            let { event } = await active.choose('remove'); active.cancel(event);
            assert.equal(f.get.skillCount('nihil_jie_shicheng', f.owner), 0);
            ({ event } = await active.choose('remove')); await active.confirm(event, f.loser);
            api.assertMark(f, f.loser, false); assert.equal(active.available(), true);
            await active.newPhase(); assert.equal(active.available(), true);
            ({ event } = await active.choose('damage')); await active.confirm(event, f.owner);
            assert.equal(f.get.skillCount('nihil_jie_shicheng', f.owner), 1); assert.equal(active.available(), false);
            const p = window.probe.f;
            p.state.active = p.phase; p.ui.selected.cards = []; p.ui.selected.targets = [];
            await p.shicheng(p.loser, 'remove'); api.assertMark(p, p.loser, false);
            document.querySelector('#status').textContent = '誓生主动移印后图标消失。取消不消耗选项，重获仅一个无数字图标；每项独立计次，新出牌阶段刷新。';
            return { nativeMarkerLifecycle: true, activeRemovalCost: true, nativeShichengBackupCountCancelAndReset: true, cancellationPreservesIcon: true, regainSingletonNoBadge: true, finalVisibleMarks: document.querySelectorAll('#loser .mark').length };
        });
        assert.equal(lifecycle.finalVisibleMarks, 0);
        await page.screenshot({ path: path.join(output, 'mark-removed.png') });
        await page.evaluate(() => {
            const { api, createNode } = window.probe;
            const f=api.fixture();api.nativeMarks(f,createNode);window.probe.blood=f;
            document.body.innerHTML='<h1>落绯 v4.8.3 血印四刀循环</h1><p>原生伤害、回复及标记方法。技能触发分发使用隔离适配器。</p><div id="blood-players" class="row"></div><p id="status"></p>';
            for(const [player,label] of [[f.owner,'落绯'],[f.loser,'同一伤害来源'],[f.third,'后续传播目标']]){
                const node=createNode();node.id='blood-'+player.playerid;node.classList.add('player');node.textContent=label;
                player.node.marks.classList.add('marks');node.appendChild(player.node.marks);document.querySelector('#blood-players').appendChild(node);
            }
        });
        const bloodCycle=[];
        for(let hit=1;hit<=4;hit++){
            const observation=await page.evaluate(async hit=>{
                const {blood:f,api}=window.probe;await f.damage(f.owner,1,f.loser);
                api.assertMark(f,f.loser,hit%2===1);api.assertMark(f,f.owner,true);
                const recoveries=f.state.events.filter(e=>Array.isArray(e)&&e[0]==='recover'&&e[2]>0).length;
                document.querySelector('#status').textContent='第'+hit+'刀：来源'+(f.loser.hasMark('nihil_jie_xueou')?'有印':'无印')+'；落绯体力 '+f.owner.hp+'；累计摸牌 '+f.owner.drawn+'；实际回复 '+recoveries+' 次。';
                return {hit,sourceSkill:f.loser.hasSkill('nihil_jie_xueou'),sourceIcons:document.querySelectorAll('#blood-loser .mark').length,ownerIcons:document.querySelectorAll('#blood-owner .mark').length,hp:f.owner.hp,drawn:f.owner.drawn,recoveries,badges:document.querySelectorAll('.markcount').length};
            },hit);
            bloodCycle.push(observation);await page.screenshot({path:path.join(output,'blood-hit-'+hit+'.png')});
        }
        assert.deepEqual(bloodCycle,[
            {hit:1,sourceSkill:true,sourceIcons:1,ownerIcons:1,hp:11,drawn:1,recoveries:0,badges:0},
            {hit:2,sourceSkill:false,sourceIcons:0,ownerIcons:1,hp:11,drawn:1,recoveries:1,badges:0},
            {hit:3,sourceSkill:true,sourceIcons:1,ownerIcons:1,hp:10,drawn:1,recoveries:1,badges:0},
            {hit:4,sourceSkill:false,sourceIcons:0,ownerIcons:1,hp:10,drawn:1,recoveries:2,badges:0},
        ]);
        const bloodPersistent=await page.evaluate(async()=>{
            const {blood:f,api}=window.probe;await f.damage(f.third,1,f.owner);await f.endTurn(f.actualTurn);
            api.assertMark(f,f.owner,true);api.assertMark(f,f.third,true);
            document.querySelector('#status').textContent='带印的落绯造伤后传播血印；原生回合结束后，自己和传播目标的单枚无数字血印均保留。';
            return {ownerIcons:document.querySelectorAll('#blood-owner .mark').length,recipientIcons:document.querySelectorAll('#blood-third .mark').length,drawn:f.owner.drawn,pendingAfter:f.actualTurn.after.length};
        });
        assert.deepEqual(bloodPersistent,{ownerIcons:1,recipientIcons:1,drawn:2,pendingAfter:0});
        await page.screenshot({path:path.join(output,'blood-marks-persist.png')});
        const derivedUi=await page.evaluate(()=>{
            const {blood:f,api,createNode}=window.probe;const view=api.nativeSkillIntro(f,createNode);
            document.body.innerHTML='<h1>落绯 v4.8.3 血契与衍生血印</h1><p>以下内容由原生 create.buttonPresets.skill._customintro 生成。</p>';
            document.body.appendChild(view.root);
            const target=f.third;target.removeSkill('nihil_jie_xueou');api.assertMark(f,target,false);
            return {texts:view.texts,links:view.links,externalRemovalClearsSkill:!target.hasSkill('nihil_jie_xueou'),externalRemovalClearsIcon:target.node.marks.children.length===0};
        });
        assert.equal(derivedUi.externalRemovalClearsSkill,true);assert.equal(derivedUi.externalRemovalClearsIcon,true);
        await page.screenshot({path:path.join(output,'blood-derived-description.png')});
        await page.evaluate(async () => {
            const { api, createNode } = window.probe;
            const f = api.fixture(); api.nativeMarks(f, createNode); const active = api.nativeShicheng(f); f.owner.hp = 5; f.loser.hp = 5;
            document.body.innerHTML = '<h1>落绯 v4.8.3 誓生原生备份隔离验证</h1><p>真实 DOM 的项目和目标选择。事件调度由适配器执行，不是完整游戏。</p><div id="options" class="row"></div><div id="actors" class="row"></div><button id="shicheng-cancel">取消目标</button><button id="shicheng-confirm" disabled>确认目标</button><p id="status"></p>';
            const probe = window.probe.shicheng = { f, active, event: null, pending: Promise.resolve() };
            const refresh = () => {
                document.querySelector('#shicheng-confirm').disabled = !probe.event?.skill || !f.game.check();
                document.querySelector('#status').textContent = '誓生次数 ' + f.get.skillCount('nihil_jie_shicheng', f.owner) + '；已选目标 ' + f.ui.selected.targets.length + '；发动者体力 ' + f.owner.hp + '；移印目标体力 ' + f.loser.hp;
            };
            f.ui.create.dialog = (title, [items]) => {
                const root = document.querySelector('#options'); root.innerHTML = '';
                return { title, close() {}, buttons: items.map(([link, label]) => {
                    const node = document.createElement('button'); node.id = 'option-' + link[0]; node.textContent = label; root.appendChild(node);
                    node.addEventListener('click', () => {
                        probe.pending = (async () => {
                            const result = await active.choose(link[0]); probe.event = result.event;
                            document.querySelector('#option-' + link[0]).classList.add('selected'); refresh();
                        })();
                    });
                    return { link, classList: node.classList, node };
                }) };
            };
            f.state.onButtonRequest = request => {
                for (const button of request.dialog.buttons) button.node.disabled = !button.classList.contains('selectable');
            };
            for (const player of f.game.players) {
                const node = createNode(); node.id = 'target-' + player.playerid; node.classList.add('player'); node.textContent = player.playerid;
                player.classList = node.classList; node.appendChild(player.node.marks); document.querySelector('#actors').appendChild(node);
                node.addEventListener('click', () => { f.status.clicked = false; f.ui.click.target.call(player); refresh(); });
            }
            document.querySelector('#shicheng-cancel').onclick = () => { active.cancel(probe.event); refresh(); };
            document.querySelector('#shicheng-confirm').onclick = () => {
                probe.pending = (async () => { await active.confirm(probe.event, f.ui.selected.targets[0]); refresh(); })();
            };
            await active.choose(null); refresh();
        });
        const shichengUi = {};
        shichengUi.noMark = await page.evaluate(() => ({ removeDisabled: document.querySelector('#option-remove').disabled, damageDisabled: document.querySelector('#option-damage').disabled, options: document.querySelectorAll('#options button').length }));
        assert.deepEqual(shichengUi.noMark, { removeDisabled: true, damageDisabled: false, options: 2 });
        await page.screenshot({ path: path.join(output, 'shicheng-options-no-mark.png') });
        await page.click('#option-damage'); await page.evaluate(() => window.probe.shicheng.pending);
        assert.equal(await page.$eval('#target-owner', node => node.classList.contains('selectable')), true);
        await page.click('#target-owner'); assert.equal(await page.$eval('#shicheng-confirm', node => node.disabled), false);
        await page.click('#shicheng-cancel');
        shichengUi.targetCancelCount = await page.evaluate(() => { const p = window.probe.shicheng; return p.f.get.skillCount('nihil_jie_shicheng', p.f.owner); });
        assert.equal(shichengUi.targetCancelCount, 0);
        await page.click('#option-damage'); await page.evaluate(() => window.probe.shicheng.pending);
        await page.click('#target-owner'); await page.click('#shicheng-confirm'); await page.evaluate(() => window.probe.shicheng.pending);
        shichengUi.damageConfirmedCount = await page.evaluate(() => { const p = window.probe.shicheng; return p.f.get.skillCount('nihil_jie_shicheng', p.f.owner); });
        assert.equal(shichengUi.damageConfirmedCount, 1);
        await page.evaluate(async () => { const p = window.probe.shicheng; p.f.mark(p.f.loser); await p.active.choose(null); });
        assert.equal(await page.$eval('#option-remove', node => node.disabled), false);
        assert.equal(await page.$eval('#option-damage', node => node.disabled), true);
        shichengUi.afterDamage = { removeDisabled: false, damageDisabled: true };
        await page.screenshot({ path: path.join(output, 'shicheng-damage-spent.png') });
        await page.click('#option-remove'); await page.evaluate(() => window.probe.shicheng.pending);
        await page.click('#target-loser'); assert.equal(await page.$eval('#shicheng-confirm', node => node.disabled), false);
        await page.screenshot({ path: path.join(output, 'shicheng-remove-target.png') });
        await page.click('#shicheng-confirm'); await page.evaluate(() => window.probe.shicheng.pending);
        shichengUi.removeConfirmed = await page.evaluate(() => { const p = window.probe.shicheng; return { count: p.f.get.skillCount('nihil_jie_shicheng', p.f.owner), targetMarks: document.querySelectorAll('#target-loser .mark').length, ownerHp: p.f.owner.hp, targetHp: p.f.loser.hp, enabledAgain: p.active.available() }; });
        assert.deepEqual(shichengUi.removeConfirmed, { count: 2, targetMarks: 0, ownerHp: 4, targetHp: 6, enabledAgain: false });
        await page.screenshot({ path: path.join(output, 'shicheng-remove-complete.png') });
        await page.evaluate(async () => { const p = window.probe.shicheng; await p.active.choose(null); document.querySelector('#status').textContent = '同一出牌阶段两项各使用一次，两个项目均已禁用，誓生不能再次发动。'; });
        shichengUi.bothSpent = await page.evaluate(() => ({ removeDisabled: document.querySelector('#option-remove').disabled, damageDisabled: document.querySelector('#option-damage').disabled }));
        assert.deepEqual(shichengUi.bothSpent, { removeDisabled: true, damageDisabled: true });
        await page.screenshot({ path: path.join(output, 'shicheng-both-spent.png') });
        await page.evaluate(async () => { const p = window.probe.shicheng; await p.active.newPhase(); p.f.mark(p.f.loser); await p.active.choose(null); document.querySelector('#status').textContent = '新的出牌阶段，两项均重新可用。'; });
        shichengUi.newPhase = await page.evaluate(() => ({ removeDisabled: document.querySelector('#option-remove').disabled, damageDisabled: document.querySelector('#option-damage').disabled, enabled: window.probe.shicheng.active.available() }));
        assert.deepEqual(shichengUi.newPhase, { removeDisabled: false, damageDisabled: false, enabled: true });
        await page.screenshot({ path: path.join(output, 'shicheng-new-phase.png') });
        const report = { scope: 'Isolated Chromium real DOM with native GameEvent start/loop/waitNext, native ArrayCompiler/ContentCompilerBase and Content.phase final three steps. Native Content.damage/recover/changeHp, addSkill/removeSkill/addSkillTrigger/removeSkillTrigger, marker methods and create.buttonPresets.skill._customintro run in the fixture. Skill vcard shell and intro.add rendering are adapters; native text and derivation selection run unchanged. Trigger dispatch, damage/draw action scheduling, game shell, animations and content-type routing are adapters. Also full defaultHooks from library/hooks/index.js via native game.callHook, checkEnd.autoConfirm, game.check, GameEvent.backup/restore, ui.click.card/target/window/cancel/ok, chooseToUse chooseButton backup, useResult/useSkill counting, phaseUse reset and addMark/removeMark/updateMark/markSkill/unmarkSkill. Not a full game or real multiplayer session.', moduleSha256: require('node:crypto').createHash('sha256').update(source).digest('hex'), aiModuleSha256: require('node:crypto').createHash('sha256').update(aiSource).digest('hex'), browser: await browser.version(), observations, lifecycle, bloodCycle, bloodPersistent, derivedUi, shichengUi };
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log('PASS isolated browser real DOM interaction and native marker lifecycle');
    } finally { await browser.close(); }
}

(async () => {
    let passed = 0;
    for (const { name, run } of cases) {
        try { await run(); passed++; console.log('PASS ' + name); }
        catch (e) { console.error('FAIL ' + name + '\n' + e.stack); }
    }
    console.log(passed + '/' + cases.length + ' passed');
    if (passed !== cases.length) process.exitCode = 1;
    if (process.argv.includes('--browser')) {
        try { await browserVerification(); }
        catch (e) { process.exitCode = 1; console.error('FAIL browser verification\n' + e.stack); }
    }
})();
