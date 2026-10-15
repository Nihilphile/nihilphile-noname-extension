'use strict';
// Public rules copied at build time. Runtime inputs are observations only.
const CARD_RULES = Object.freeze({
  sha: { kind: 'basic', target: 'sha' },
  shan: { kind: 'response' },
  tao: { kind: 'basic', target: 'healSelf' },
  jiu: { kind: 'basic', target: 'self' },
  wuzhong: { kind: 'trick', target: 'self' },
  shunshou: { kind: 'trick', target: 'steal' },
  guohe: { kind: 'trick', target: 'zone' },
  juedou: { kind: 'trick', target: 'other' },
  nanman: { kind: 'trick', target: 'others' },
  wanjian: { kind: 'trick', target: 'others' },
  taoyuan: { kind: 'trick', target: 'all' },
  wugu: { kind: 'trick', target: 'all' },
  tiesuo: { kind: 'trick', target: 'chain' },
  huogong: { kind: 'trick', target: 'fire' },
  jiedao: { kind: 'trick', target: 'borrow' },
  wuxie: { kind: 'response' },
  lebu: { kind: 'delay', target: 'other' },
  bingliang: { kind: 'delay', target: 'supply' },
  shandian: { kind: 'delay', target: 'self' },
  zhuge: { kind: 'equip', slot: 'weapon', range: 1 },
  cixiong: { kind: 'equip', slot: 'weapon', range: 2 },
  qinggang: { kind: 'equip', slot: 'weapon', range: 2 },
  qinglong: { kind: 'equip', slot: 'weapon', range: 3 },
  zhangba: { kind: 'equip', slot: 'weapon', range: 3 },
  guanshi: { kind: 'equip', slot: 'weapon', range: 3 },
  fangtian: { kind: 'equip', slot: 'weapon', range: 4 },
  qilin: { kind: 'equip', slot: 'weapon', range: 5 },
  hanbing: { kind: 'equip', slot: 'weapon', range: 2 },
  zhuque: { kind: 'equip', slot: 'weapon', range: 4 },
  guding: { kind: 'equip', slot: 'weapon', range: 2 },
  bagua: { kind: 'equip', slot: 'armor' },
  renwang: { kind: 'equip', slot: 'armor' },
  tengjia: { kind: 'equip', slot: 'armor' },
  baiyin: { kind: 'equip', slot: 'armor' },
  chitu: { kind: 'equip', slot: 'offhorse' },
  dayuan: { kind: 'equip', slot: 'offhorse' },
  zixing: { kind: 'equip', slot: 'offhorse' },
  jueying: { kind: 'equip', slot: 'defhorse' },
  dilu: { kind: 'equip', slot: 'defhorse' },
  zhuahuang: { kind: 'equip', slot: 'defhorse' },
  hualiu: { kind: 'equip', slot: 'defhorse' },
});

const CAPABILITIES = Object.freeze({
  rules: 'luofei-benchmark-v1',
  cards: Object.keys(CARD_RULES),
  unsupported: ['muniu', 'treasure equipment', 'numeric shield armor (hujia)', 'character skills other than God Luofei'],
  defaults: { suit: 'spade', rank: 7, ownerSex: 'female', whiteboardSex: 'male' },
});

function card(input, id) {
  const value = typeof input === 'string' ? { name: input } : { ...input };
  if (value.name === 'huosha') { value.name = 'sha'; value.nature = 'fire'; }
  if (value.name === 'leisha') { value.name = 'sha'; value.nature = 'thunder'; }
  if (!CARD_RULES[value.name]) throw new Error(`Unsupported card ${value.name}`);
  const result = { id: value.id ?? id, name: value.name, suit: value.suit ?? 'spade', rank: value.rank ?? 7 };
  if (typeof result.id !== 'string' || !['spade', 'heart', 'club', 'diamond'].includes(result.suit) || !Number.isInteger(result.rank) || result.rank < 1 || result.rank > 13) throw new Error('Invalid card identity, suit or rank');
  if (value.nature) {
    if (result.name !== 'sha' || !['fire', 'thunder'].includes(value.nature)) throw new Error('Invalid card nature');
    result.nature = value.nature;
  }
  return result;
}

function balancedDeck() {
  const names = ['sha','sha','sha','sha','shan','shan','shan','tao','tao','jiu','wuzhong','shunshou','guohe','juedou','nanman','wanjian','taoyuan','wugu','tiesuo','huogong','jiedao','wuxie','lebu','bingliang','shandian','qinggang','zhuge','guding','bagua','tengjia','baiyin','chitu','dilu'];
  return names.flatMap((name, i) => [0, 1].map(j => ({ name, suit: ['spade','heart','club','diamond'][(i + j) % 4], rank: (i * 3 + j * 5) % 13 + 1, ...(name === 'sha' && j === 1 ? { nature: i % 2 ? 'fire' : 'thunder' } : {}) })));
}


const matches = new WeakMap();
const copy = value => JSON.parse(JSON.stringify(value));
const black = value => value.suit === 'spade' || value.suit === 'club';
const alive = state => state.players.filter(player => player.alive);
const player = (state, id) => state.players.find(value => value.id === id);
const owner = state => player(state, state.owner);
const rule = value => CARD_RULES[value.name];
const emit = (state, type, data = {}) => state.events.push({ type, turn: state.turn, ...data });
const enqueue = (state, ...entries) => state.queue.push(...entries.filter(Boolean));
const prepend = (state, ...entries) => state.queue.unshift(...entries.filter(Boolean));
const combinations = (values, n) => n === 0 ? [[]] : values.flatMap((value, i) => combinations(values.slice(i + 1), n - 1).map(rest => [value, ...rest]));

function rng(seed) {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function shuffle(values, random) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

function distance(state, from, to) {
  if (from.id === to.id) return 0;
  const seats = alive(state), a = seats.indexOf(from), b = seats.indexOf(to);
  const d = Math.abs(a - b);
  return Math.max(1, Math.min(d, seats.length - d) - (from.equipment.offhorse ? 1 : 0) + (to.equipment.defhorse ? 1 : 0));
}

function reachable(state, from, to) {
  return from.alive && to.alive && from.id !== to.id && distance(state, from, to) <= (from.equipment.weapon ? rule(from.equipment.weapon).range : 1);
}

function targetOrder(state, user) {
  const seats = state.players, start = seats.findIndex(p => p.id === user);
  if (start < 0) throw new Error('Unknown seat anchor');
  return [...seats.slice(start), ...seats.slice(0, start)].filter(p => p.alive);
}

function drawOne(state) {
  if (!state.deck.length && state.discard.length) { state.deck = shuffle(state.discard, state.random); state.discard = []; emit(state, 'shuffle', { num: state.deck.length }); }
  return state.deck.shift();
}

function draw(state, target, num, reason) {
  const recipient = player(state, target);
  if (!recipient.alive) return;
  const cards = [];
  for (let i = 0; i < num; i++) { const value = drawOne(state); if (!value) break; recipient.hand.push(value); cards.push(value); }
  if (cards.length) emit(state, 'draw', { target, num: cards.length, reason, cards: copy(cards) });
}

function recover(state, target, num, reason, source) {
  const recipient = player(state, target);
  if (!recipient.alive) return;
  const hpBefore = recipient.hp;
  recipient.hp = Math.min(recipient.maxHp, recipient.hp + num);
  if (recipient.hp > hpBefore) emit(state, 'recover', { target, source, num: recipient.hp - hpBefore, hpBefore, hpAfter: recipient.hp, reason });
}

function removeCard(state, target, id, destination = 'discard') {
  const recipient = player(state, target);
  let value, zone;
  const index = recipient.hand.findIndex(c => c.id === id);
  if (index >= 0) { [value] = recipient.hand.splice(index, 1); zone = 'hand'; }
  else {
    for (const [slot, equip] of Object.entries(recipient.equipment)) if (equip?.id === id) { value = equip; zone = slot; delete recipient.equipment[slot]; if (value.name === 'baiyin') recover(state, target, 1, 'baiyin'); break; }
    if (!value) { const j = recipient.judgments.findIndex(c => c.id === id); if (j >= 0) { [value] = recipient.judgments.splice(j, 1); zone = 'judgment'; } }
  }
  if (!value) throw new Error(`Card ${id} is not owned by ${target}`);
  if (destination === 'discard') state.discard.push(value);
  emit(state, 'loss', { target, card: value.id, name: value.name, zone, destination });
  return value;
}

function mark(state, target, value, reason) {
  const recipient = player(state, target);
  if (!recipient?.alive || recipient.mark === value) return;
  recipient.mark = value;
  emit(state, 'mark', { target, value, reason });
}

function install(state, target, value) {
  const recipient = player(state, target), slot = rule(value).slot;
  const before = alive(state).filter(p => p.team !== recipient.team).map(enemy => [enemy.id, reachable(state, recipient, enemy), reachable(state, enemy, recipient)]);
  if (recipient.equipment[slot]) removeCard(state, target, recipient.equipment[slot].id);
  recipient.equipment[slot] = value;
  const key = before.some(([id, outgoing, incoming]) => (!outgoing && reachable(state, recipient, player(state, id))) || (incoming && !reachable(state, player(state, id), recipient)));
  emit(state, 'equip', { target, slot, cardId: value.id, card: value.id, name: value.name, initiallyEmpty: recipient.initialEmptySlots.includes(slot), key });
}

function zoneOptions(state, target, includeJudgment = true) {
  const recipient = player(state, target);
  const options = recipient.hand.map((_, index) => ({ type: 'choose', kind: 'zone', target, zone: 'hand', index }));
  for (const [slot, value] of Object.entries(recipient.equipment)) options.push({ type: 'choose', kind: 'zone', target, zone: slot, card: value.id });
  if (includeJudgment) for (const value of recipient.judgments) options.push({ type: 'choose', kind: 'zone', target, zone: 'judgment', card: value.id });
  return options;
}

function request(state, kind, actor, actions, continuation, data = {}) {
  state.request = { id: ++state.choiceId, kind, actor, controller: state.owner, ...data };
  state.legalActions = actions;
  state.continuation = continuation;
}

function ask(state, kind, actor, actions, continuation, data = {}) {
  if (actor === state.owner && owner(state).alive) request(state, kind, actor, actions, continuation, data);
  else applyChoice(state, actions[0], continuation, actor, kind);
}

function publicCardContext(task) {
  return { source: task.effect.source, target: task.target, name: task.effect.value.name, useId: task.effect.useId ?? null };
}

function shaMaterials(recipient) {
  const options = recipient.hand.filter(c => c.name === 'sha').map(c => ({ cards: [c.id], value: c }));
  if (recipient.equipment.weapon?.name === 'zhangba') {
    for (const pair of combinations(recipient.hand, 2)) options.push({ cards: pair.map(c => c.id), value: { id: `virtual-${pair.map(c => c.id).join('-')}`, name: 'sha', suit: pair.every(black) ? 'spade' : pair.every(c => !black(c)) ? 'heart' : 'none', rank: 0 } });
  }
  return options;
}

function targetGroups(state, value, user, mode, materials) {
  const definition = rule(value), others = alive(state).filter(p => p.id !== user.id);
  switch (definition.target) {
    case 'sha': {
      if (mode === 'normal' && user.normalSha >= 1 && user.equipment.weapon?.name !== 'zhuge') return [];
      if (mode === 'puppet' && state.quotas.puppetSha) return [];
      const targets = others.filter(p => reachable(state, user, p));
      const max = user.equipment.weapon?.name === 'fangtian' && user.hand.length === materials.length && materials.every(id => user.hand.some(c => c.id === id)) ? 3 : 1;
      return Array.from({ length: Math.min(max, targets.length) }, (_, i) => combinations(targets, i + 1)).flat().map(group => group.map(p => p.id));
    }
    case 'healSelf': return user.hp < user.maxHp ? [[user.id]] : [];
    case 'self': return value.name === 'jiu' && mode === 'normal' && user.normalJiu >= 1 || value.name === 'shandian' && user.judgments.some(c => c.name === value.name) ? [] : [[user.id]];
    case 'other': return others.filter(p => definition.kind !== 'delay' || !p.judgments.some(c => c.name === value.name)).map(p => [p.id]);
    case 'others': return others.length ? [targetOrder(state, state.actor).filter(p => p.id !== user.id).map(p => p.id)] : [];
    case 'all': return [targetOrder(state, state.actor).map(p => p.id)];
    case 'zone': return others.filter(p => zoneOptions(state, p.id).length).map(p => [p.id]);
    case 'steal': return others.filter(p => distance(state, user, p) <= 1 && zoneOptions(state, p.id).length).map(p => [p.id]);
    case 'fire': return alive(state).filter(p => p.hand.length).map(p => [p.id]);
    case 'supply': return others.filter(p => distance(state, user, p) <= 1 && !p.judgments.some(c => c.name === value.name)).map(p => [p.id]);
    case 'borrow': return others.filter(p => p.equipment.weapon).flatMap(first => alive(state).filter(second => reachable(state, first, second)).map(second => [first.id, second.id]));
    case 'chain': return mode === 'normal' ? [[], ...alive(state).map(p => [p.id]), ...combinations(alive(state), 2).map(group => group.map(p => p.id))] : [...alive(state).map(p => [p.id]), ...combinations(alive(state), 2).map(group => group.map(p => p.id))];
    default: return definition.kind === 'equip' ? [[user.id]] : [];
  }
}

function playActions(state, actor = state.owner, puppet = true) {
  const recipient = player(state, actor), actions = [];
  if (!recipient.alive) return actions;
  const users = [{ user: recipient, mode: 'normal' }, ...(puppet ? alive(state).filter(p => p.mark).map(user => ({ user, mode: 'puppet' })) : [])];
  for (const value of recipient.hand) {
    if (rule(value).kind === 'response') continue;
    for (const { user, mode } of users) for (const targets of targetGroups(state, value, user, mode, [value.id])) actions.push({ type: 'play', mode, card: value.id, user: user.id, targets });
  }
  if (recipient.equipment.weapon?.name === 'zhangba') for (const material of shaMaterials(recipient).filter(c => c.cards.length === 2)) for (const targets of targetGroups(state, material.value, recipient, 'normal', material.cards)) actions.push({ type: 'play', mode: 'normal', card: 'zhangba', cards: material.cards, user: actor, targets });
  return actions;
}

function beginPlay(state) {
  if (!owner(state).alive) { state.status = 'owner-dead'; return; }
  if (state.skipPlay) { prepend(state, { kind: 'endPlay' }); return; }
  state.phase = 'play';
  const actions = playActions(state);
  if (!state.quotas.shishengDamage) for (const p of alive(state)) actions.push({ type: 'shisheng', option: 'damage', target: p.id });
  if (!state.quotas.shishengRemove) for (const p of alive(state).filter(p => p.mark)) actions.push({ type: 'shisheng', option: 'remove', target: p.id });
  actions.push({ type: 'endPlay' });
  request(state, 'play', state.owner, actions, { kind: 'playChoice' });
}

function use(state, action, actor = state.owner, extra = {}) {
  const materialOwner = player(state, actor), user = player(state, action.user);
  let value, materials;
  if (action.card === 'zhangba' && action.cards) { materials = action.cards; value = shaMaterials(materialOwner).find(p => JSON.stringify(p.cards) === JSON.stringify(materials)).value; }
  else { value = materialOwner.hand.find(c => c.id === action.card); materials = [value.id]; }
  materials.forEach(id => removeCard(state, actor, id, 'resolution'));
  const useId = ++state.useId;
  const effect = { kind: 'card', useId, value, source: user.id, user: user.id, materialOwner: actor, mode: action.mode ?? 'normal', targets: action.targets, materials: materials.map(id => id === value.id ? value : state.cards[id]), ...extra };
  if (value.name === 'sha') {
    if (effect.mode === 'puppet') state.quotas.puppetSha = true;
    else if (!extra.noCount) user.normalSha++;
    effect.wine = user.wine; user.wine = 0;
  }
  if (value.name === 'jiu' && effect.mode === 'normal') user.normalJiu++;
  emit(state, 'use', { source: user.id, user: user.id, materialOwner: actor, card: value.id, name: value.name, targets: action.targets, mode: effect.mode, useId });
  prepend(state, effect, { kind: 'finishCard', effect });
}

function cardEffect(state, effect) {
  const { value, source } = effect, user = player(state, source), definition = rule(value);
  const targets = ['sha','tiesuo'].includes(value.name) ? targetOrder(state, state.actor).filter(p => effect.targets.includes(p.id)).map(p => p.id) : effect.targets;
  if (!user.alive) return;
  if (definition.kind === 'equip') { install(state, source, value); effect.installed = true; return; }
  if (definition.kind === 'delay') { prepend(state, { kind: 'placeDelay', effect, target: targets[0] }); return; }
  if (value.name === 'sha') { prepend(state, ...targets.map(target => ({ kind: 'shaStart', effect, target }))); return; }
  if (value.name === 'tao') { recover(state, source, 1, 'tao', source); return; }
  if (value.name === 'jiu') { user.wine++; emit(state, 'wine', { target: source, num: user.wine }); return; }
  if (value.name === 'tiesuo' && !targets.length) { draw(state, source, 1, 'recast'); return; }
  if (value.name === 'wugu') {
    const pool = targets.map(() => drawOne(state)).filter(Boolean);
    emit(state, 'reveal', { reason: 'wugu', cards: copy(pool) });
    prepend(state, ...targets.map(target => ({ kind: 'trick', effect, target, next: { kind: 'wugu', effect, target, pool } })), { kind: 'wuguRemainder', pool });
    return;
  }
  if (value.name === 'jiedao') { prepend(state, { kind: 'trick', effect, target: targets[0], next: { kind: 'jiedao', effect } }); return; }
  prepend(state, ...targets.map(target => ({ kind: 'trick', effect, target, next: { kind: 'trickEffect', effect, target } })));
}

function startResponse(state, task) {
  const responder = player(state, task.target);
  if (!responder.alive) return;
  const actions = task.name === 'sha' ? shaMaterials(responder).map(p => ({ type: 'respond', cards: p.cards })) : responder.hand.filter(c => c.name === task.name).map(c => ({ type: 'respond', cards: [c.id] }));
  if (task.name === 'shan' && responder.equipment.armor?.name === 'bagua' && !task.ignoreArmor) actions.unshift({ type: 'choose', kind: 'bagua', yes: true });
  actions.push({ type: 'pass' });
  const wine = task.after === 'sha' ? task.effect.wine || 0 : 0;
  const nature = task.effect?.value.nature;
  let num = 1 + wine;
  if (task.after === 'sha' && player(state, task.source).equipment.weapon?.name === 'guding' && responder.hand.length === 0) num++;
  if (nature === 'fire' && responder.equipment.armor?.name === 'tengjia' && !task.ignoreArmor) num++;
  if (responder.equipment.armor?.name === 'baiyin' && !task.ignoreArmor) num = Math.min(1, num);
  ask(state, 'response', task.target, actions, { kind: 'response', task }, { name: task.name, source: task.source, target: task.target, num, nature: nature ?? 'normal' });
}

function respondDone(state, task, success) {
  if (task.after === 'sha') {
    if (success) prepend(state, { kind: 'shaMiss', effect: task.effect, target: task.target });
    else prepend(state, { kind: 'shaHit', effect: task.effect, target: task.target });
  } else if (task.after === 'duel') {
    if (success) prepend(state, { kind: 'response', target: task.source, source: task.target, name: 'sha', after: 'duel', effect: task.effect });
    else prepend(state, { kind: 'damage', target: task.target, source: task.source, num: 1, effect: task.effect });
  } else if (task.after === 'aoe') {
    if (!success) prepend(state, { kind: 'damage', target: task.target, source: task.source, num: 1, effect: task.effect });
  } else if (task.after === 'jiedao') {
    if (!success) { const first = player(state, task.target), receiver = player(state, task.effect.source); if (first.equipment.weapon && receiver.alive) { const value = removeCard(state, first.id, first.equipment.weapon.id, 'gain'); receiver.hand.push(value); emit(state, 'gain', { source: first.id, target: receiver.id, card: value.id, name: value.name, reason: 'jiedao' }); } }
  }
}

function shaStart(state, task) {
  const target = player(state, task.target), user = player(state, task.effect.source);
  if (!target.alive || !user.alive) return;
  const effect = task.effect;
  if (!effect.natureChosen && !effect.value.nature && user.equipment.weapon?.name === 'zhuque') {
    ask(state, 'zhuque', user.id, [{ type: 'choose', kind: 'zhuque', yes: true }, { type: 'pass' }], { kind: 'zhuque', task }, publicCardContext(task)); return;
  }
  const ignoreArmor = user.equipment.weapon?.name === 'qinggang';
  const nature = effect.value.nature;
  if (!ignoreArmor && target.equipment.armor?.name === 'tengjia' && !nature) { emit(state, 'prevent', { target: target.id, source: user.id, reason: 'tengjia', name: 'sha' }); return; }
  if (!task.cixiongDone && user.equipment.weapon?.name === 'cixiong' && target.sex !== user.sex) {
    ask(state, 'cixiong', user.id, [{ type: 'choose', kind: 'cixiong', yes: true }, { type: 'pass' }], { kind: 'cixiong', task }, publicCardContext(task)); return;
  }
  if (!ignoreArmor && target.equipment.armor?.name === 'renwang' && black(effect.value)) { emit(state, 'prevent', { target: target.id, source: user.id, reason: 'renwang', name: 'sha' }); return; }
  prepend(state, { kind: 'response', target: target.id, source: user.id, name: 'shan', after: 'sha', effect, ignoreArmor });
}

function shaHit(state, task) {
  const user = player(state, task.effect.source), target = player(state, task.target);
  if (!target.alive) return;
  if (user.equipment.weapon?.name === 'hanbing' && zoneOptions(state, target.id, false).length && !task.hanbingDone) {
    ask(state, 'hanbing', user.id, [{ type: 'choose', kind: 'hanbing', yes: true }, { type: 'pass' }], { kind: 'hanbing', task }, publicCardContext(task)); return;
  }
  if (user.equipment.weapon?.name === 'qilin' && !task.qilinDone && (target.equipment.offhorse || target.equipment.defhorse)) {
    const actions = ['offhorse','defhorse'].filter(slot => target.equipment[slot]).map(slot => ({ type: 'choose', kind: 'qilin', target: target.id, card: target.equipment[slot].id })); actions.push({ type: 'pass' });
    ask(state, 'qilin', user.id, actions, { kind: 'qilin', task }, publicCardContext(task)); return;
  }
  const guding = user.equipment.weapon?.name === 'guding' && target.hand.length === 0 ? 1 : 0;
  prepend(state, { kind: 'damage', target: target.id, source: user.id, num: 1 + (task.effect.wine || 0) + guding, nature: task.effect.value.nature, ignoreArmor: user.equipment.weapon?.name === 'qinggang', effect: task.effect });
}

function shaMiss(state, task) {
  const user = player(state, task.effect.source);
  if (!user.alive) return;
  if (user.equipment.weapon?.name === 'guanshi') {
    const values = [...user.hand, ...Object.values(user.equipment).filter(c => c.id !== user.equipment.weapon.id)];
    const actions = combinations(values, 2).map(pair => ({ type: 'choose', kind: 'axe', cards: pair.map(c => c.id) })); actions.push({ type: 'pass' });
    ask(state, 'axe', user.id, actions, { kind: 'axe', task }, publicCardContext(task));
  } else if (user.equipment.weapon?.name === 'qinglong') {
    const actions = shaMaterials(user).map(material => ({ type: 'choose', kind: 'qinglong', cards: material.cards })); actions.push({ type: 'pass' });
    ask(state, 'qinglong', user.id, actions, { kind: 'qinglong', task }, publicCardContext(task));
  }
}

function trick(state, task) {
  if (!player(state, task.target)?.alive) return;
  prepend(state, { kind: 'wuxie', effect: task.effect, target: task.target, next: task.next, index: 0, canceled: false, passes: 0 });
}

function wuxie(state, task) {
  const seats = targetOrder(state, state.actor);
  if (task.passes >= seats.length) {
    if (!task.canceled) prepend(state, task.next);
    else if (task.next.kind === 'judgeDelayResolve') prepend(state, { kind: 'cancelDelay', target: task.target, cardId: task.next.cardId });
    return;
  }
  const responder = seats[task.index % seats.length], cards = responder.hand.filter(c => c.name === 'wuxie');
  if (responder.id === state.owner && cards.length) ask(state, 'wuxie', responder.id, [...cards.map(c => ({ type: 'respond', cards: [c.id] })), { type: 'pass' }], { kind: 'wuxie', task }, { ...publicCardContext(task), canceled: task.canceled });
  else {
    const harmful = ['nanman','wanjian','juedou','huogong','shunshou','guohe','lebu','bingliang','shandian'].includes(task.effect.value.name);
    const protects = player(state, task.target).team === responder.team;
    const useCard = cards.length && responder.policy.wuxie !== 'never' && (harmful ? protects !== task.canceled : !protects !== task.canceled);
    applyChoice(state, useCard ? { type: 'respond', cards: [cards[0].id] } : { type: 'pass' }, { kind: 'wuxie', task }, responder.id, 'wuxie');
  }
}

function trickEffect(state, task) {
  const { effect, target } = task, name = effect.value.name;
  switch (name) {
    case 'wuzhong': draw(state, target, 2, 'wuzhong'); break;
    case 'shunshou': case 'guohe': prepend(state, { kind: 'zone', actor: effect.source, target, operation: name === 'shunshou' ? 'gain' : 'discard', effect }); break;
    case 'juedou': prepend(state, { kind: 'response', target, source: effect.source, name: 'sha', after: 'duel', effect }); break;
    case 'nanman': case 'wanjian':
      if (player(state, target).equipment.armor?.name === 'tengjia') emit(state, 'prevent', { source: effect.source, target, reason: 'tengjia', name });
      else prepend(state, { kind: 'response', target, source: effect.source, name: name === 'nanman' ? 'sha' : 'shan', after: 'aoe', effect });
      break;
    case 'taoyuan': recover(state, target, 1, 'taoyuan', effect.source); break;
    case 'tiesuo': player(state, target).linked = !player(state, target).linked; emit(state, 'link', { target, value: player(state, target).linked }); break;
    case 'huogong': {
      const recipient = player(state, target); if (!recipient.hand.length) break;
      ask(state, 'fireReveal', target, recipient.hand.map(c => ({ type: 'choose', kind: 'fireReveal', card: c.id })), { kind: 'fireReveal', task }); break;
    }
    default: throw new Error(`Missing trick implementation ${name}`);
  }
}

function damage(state, task) {
  const recipient = player(state, task.target), source = player(state, task.source);
  if (!recipient?.alive) return;
  let num = task.num;
  if (task.nature === 'fire' && recipient.equipment.armor?.name === 'tengjia' && !task.ignoreArmor) num++;
  if (recipient.equipment.armor?.name === 'baiyin' && !task.ignoreArmor) num = Math.min(1, num);
  if (num <= 0) return;
  if (recipient.id === state.owner && source?.alive) {
    if (source.mark) { mark(state, source.id, false, 'xueyin'); recover(state, recipient.id, 1, 'xueyin', source.id); }
    else mark(state, source.id, true, 'xueyin');
  }
  const hpBefore = recipient.hp;
  recipient.hp -= num;
  emit(state, 'damage', { source: task.source, target: recipient.id, num, hpBefore, hpAfter: recipient.hp, nature: task.nature ?? 'normal', name: task.effect?.value.name, useId: task.effect?.useId, materialOwner: task.effect?.materialOwner, mode: task.effect?.mode });
  const chain = task.nature && recipient.linked && !task.chain ? targetOrder(state, state.actor).filter(p => p.linked && p.id !== recipient.id).map(p => p.id) : [];
  if (task.nature && recipient.linked) { recipient.linked = false; emit(state, 'link', { target: recipient.id, value: false }); }
  prepend(state,
    recipient.hp <= 0 ? { kind: 'rescue', target: recipient.id, source: task.source, index: 0, passes: 0 } : null,
    { ...task, kind: 'damageAfter', num },
    ...chain.map(target => ({ ...task, target, num, chain: true, ignoreArmor: false })),
  );
}

function damageAfter(state, task) {
  const source = player(state, task.source);
  if (source?.mark && !state.usedSources.includes(source.id)) {
    state.usedSources.push(source.id);
    mark(state, task.target, true, 'damageSource');
    draw(state, state.owner, task.num, 'blood');
  }
}

function rescue(state, task) {
  const dying = player(state, task.target);
  if (!dying.alive || dying.hp > 0) return;
  const seats = targetOrder(state, state.actor);
  if (task.passes >= seats.length) {
    dying.alive = false; dying.mark = false;
    emit(state, 'death', { target: dying.id, source: task.source });
    for (const c of [...dying.hand, ...Object.values(dying.equipment), ...dying.judgments]) removeCard(state, dying.id, c.id);
    return;
  }
  const rescuer = seats[task.index % seats.length];
  const cards = rescuer.hand.filter(c => c.name === 'tao' || c.name === 'jiu' && rescuer.id === dying.id);
  if (rescuer.id === state.owner && cards.length) ask(state, 'rescue', rescuer.id, [...cards.map(c => ({ type: 'respond', cards: [c.id] })), { type: 'pass' }], { kind: 'rescue', task }, { target: dying.id });
  else {
    const allowed = rescuer.team === dying.team && rescuer.policy.rescue !== 'never';
    applyChoice(state, allowed && cards.length ? { type: 'respond', cards: [cards[0].id] } : { type: 'pass' }, { kind: 'rescue', task }, rescuer.id, 'rescue');
  }
}

function applyChoice(state, action, continuation, actor, kind) {
  const recipient = player(state, actor);
  if (actor !== state.owner) emit(state, 'policy', { target: actor, kind, action: copy(action) });
  switch (continuation.kind) {
    case 'playChoice':
      if (action.type === 'endPlay') { prepend(state, { kind: 'endPlay' }); return; }
      enqueue(state, { kind: 'beginPlay' });
      if (action.type === 'play') use(state, action);
      else if (action.option === 'remove') { state.quotas.shishengRemove = true; mark(state, action.target, false, 'shisheng'); recover(state, action.target, 1, 'shisheng', state.owner); }
      else { state.quotas.shishengDamage = true; prepend(state, { kind: 'damage', source: action.target, target: state.owner, num: 1 }, { kind: 'draw', target: state.owner, num: 1, reason: 'shisheng' }); }
      return;
    case 'response': {
      const task = continuation.task;
      if (action.kind === 'bagua') {
        const judgment = drawOne(state);
        if (judgment) { state.discard.push(judgment); emit(state, 'judgment', { target: actor, card: judgment.id, name: judgment.name, suit: judgment.suit, rank: judgment.rank, reason: 'bagua' }); }
        if (judgment && !black(judgment)) { emit(state, 'virtualResponse', { target: actor, name: 'shan', reason: 'bagua' }); respondDone(state, task, true); }
        else { const actions = recipient.hand.filter(c => c.name === 'shan').map(c => ({ type: 'respond', cards: [c.id] })); actions.push({ type: 'pass' }); ask(state, 'response', actor, actions, continuation, { name: 'shan', source: task.source, target: actor }); }
        return;
      }
      if (action.type === 'respond') {
        const sha = task.after === 'jiedao' ? shaMaterials(recipient).find(material => JSON.stringify(material.cards) === JSON.stringify(action.cards)) : undefined;
        const materials = action.cards.map(id => removeCard(state, actor, id, task.after === 'jiedao' ? 'resolution' : 'discard'));
        emit(state, 'response', { target: actor, name: task.name, cards: materials.map(c => c.id), materialOwner: actor, source: task.source, reason: task.after });
        if (task.after === 'jiedao') {
          const virtual = sha.value;
          const effect = { ...task.effect, value: virtual, source: actor, user: actor, materialOwner: actor, targets: [task.effect.targets[1]], materials, wine: recipient.wine, mode: 'forced', useId: ++state.useId };
          recipient.wine = 0;
          emit(state, 'use', { source: actor, user: actor, materialOwner: actor, card: virtual.id, name: 'sha', targets: effect.targets, mode: 'forced', useId: effect.useId });
          prepend(state, { kind: 'shaStart', effect, target: effect.targets[0] }, { kind: 'finishCard', effect });
        }
        respondDone(state, task, true);
      } else respondDone(state, task, false);
      return;
    }
    case 'rescue': {
      const task = continuation.task;
      if (action.type === 'respond') { const value = removeCard(state, actor, action.cards[0]); emit(state, 'response', { target: actor, name: value.name, cards: [value.id], materialOwner: actor, reason: 'rescue', rescueTarget: task.target }); recover(state, task.target, 1, 'rescue', actor); prepend(state, { ...task, index: task.index, passes: 0 }); }
      else prepend(state, { ...task, index: task.index + 1, passes: task.passes + 1 });
      return;
    }
    case 'wuxie': {
      const task = continuation.task;
      if (action.type === 'respond') { const value = removeCard(state, actor, action.cards[0]); emit(state, 'response', { target: actor, name: 'wuxie', cards: [value.id], materialOwner: actor, reason: task.effect.value.name }); prepend(state, { ...task, index: task.index + 1, passes: 0, canceled: !task.canceled, rounds: (task.rounds ?? 0) + 1 }); }
      else prepend(state, { ...task, index: task.index + 1, passes: task.passes + 1 });
      return;
    }
    case 'discard': action.cards.forEach(id => removeCard(state, actor, id)); prepend(state, { kind: 'finish' }); return;
    case 'zone': {
      const task = continuation.task, target = player(state, task.target);
      const id = action.zone === 'hand' ? target.hand[action.index].id : action.card;
      const value = removeCard(state, task.target, id, task.operation === 'gain' ? 'gain' : 'discard');
      if (task.operation === 'gain') { recipient.hand.push(value); emit(state, 'gain', { target: actor, source: task.target, card: value.id, name: value.name, reason: task.effect?.value.name }); }
      if (task.remaining > 1 && zoneOptions(state, task.target, false).length) prepend(state, { ...task, remaining: task.remaining - 1 });
      return;
    }
    case 'fireReveal': {
      const task = continuation.task, value = recipient.hand.find(c => c.id === action.card);
      emit(state, 'reveal', { target: actor, card: copy(value), reason: 'huogong' });
      const user = player(state, task.effect.source);
      const actions = user.hand.filter(c => c.suit === value.suit).map(c => ({ type: 'choose', kind: 'firePay', card: c.id })); actions.push({ type: 'pass' });
      ask(state, 'firePay', user.id, actions, { kind: 'firePay', task }); return;
    }
    case 'firePay': if (action.type !== 'pass') { removeCard(state, actor, action.card); prepend(state, { kind: 'damage', source: actor, target: continuation.task.target, num: 1, nature: 'fire', effect: continuation.task.effect }); } return;
    case 'wugu': {
      const pool = continuation.task.pool, index = pool.findIndex(c => c.id === action.card), [value] = pool.splice(index, 1);
      recipient.hand.push(value); emit(state, 'gain', { target: actor, card: value.id, name: value.name, reason: 'wugu' }); return;
    }
    case 'zhuque': {
      const task = continuation.task;
      task.effect.natureChosen = true;
      if (action.type !== 'pass') task.effect.value = { ...task.effect.value, nature: 'fire' };
      prepend(state, task); return;
    }
    case 'cixiong': {
      const task = continuation.task;
      if (action.type !== 'pass') {
        const target = player(state, task.target);
        if (target.hand.length) ask(state, 'cixiongDiscard', target.id, [...target.hand.map(c => ({ type: 'choose', kind: 'cixiongDiscard', card: c.id })), { type: 'pass' }], { kind: 'cixiongDiscard', task });
        else draw(state, actor, 1, 'cixiong');
      }
      prepend(state, { ...task, cixiongDone: true }); return;
    }
    case 'cixiongDiscard': if (action.type === 'pass') draw(state, continuation.task.effect.source, 1, 'cixiong'); else removeCard(state, actor, action.card); return;
    case 'axe': if (action.type !== 'pass') { action.cards.forEach(id => removeCard(state, actor, id)); prepend(state, { kind: 'shaHit', effect: continuation.task.effect, target: continuation.task.target }); } return;
    case 'qinglong': {
      if (action.type === 'pass') return;
      const sha = shaMaterials(recipient).find(material => JSON.stringify(material.cards) === JSON.stringify(action.cards));
      const materials = action.cards.map(id => recipient.hand.find(c => c.id === id));
      const value = sha.value;
      action.cards.forEach(id => removeCard(state, actor, id, 'resolution'));
      const effect = { ...continuation.task.effect, value, source: actor, user: actor, materialOwner: actor, materials, wine: recipient.wine, mode: 'forced', useId: ++state.useId }; recipient.wine = 0;
      emit(state, 'use', { source: actor, user: actor, materialOwner: actor, card: value.id, name: 'sha', targets: [continuation.task.target], mode: 'forced', useId: effect.useId });
      prepend(state, { kind: 'shaStart', effect, target: continuation.task.target }, { kind: 'finishCard', effect }); return;
    }
    case 'hanbing': if (action.type === 'pass') prepend(state, { ...continuation.task, kind: 'shaHit', hanbingDone: true }); else prepend(state, { kind: 'zone', actor, target: continuation.task.target, operation: 'discard', remaining: 2, includeJudgment: false }); return;
    case 'qilin': if (action.type !== 'pass') removeCard(state, continuation.task.target, action.card); prepend(state, { ...continuation.task, kind: 'shaHit', qilinDone: true }); return;
    default: throw new Error(`Missing choice ${continuation.kind}`);
  }
}

function resolveTask(state, task) {
  switch (task.kind) {
    case 'beginPlay': beginPlay(state); break;
    case 'card': cardEffect(state, task); break;
    case 'finishCard': {
      if (!task.effect.installed) for (const value of task.effect.materials) if (!state.discard.some(c => c.id === value.id) && !state.players.some(p => Object.values(p.equipment).some(c => c.id === value.id) || p.judgments.some(c => c.id === value.id))) state.discard.push(value);
      break;
    }
    case 'shaStart': shaStart(state, task); break;
    case 'shaHit': shaHit(state, task); break;
    case 'shaMiss': shaMiss(state, task); break;
    case 'response': startResponse(state, task); break;
    case 'damage': damage(state, task); break;
    case 'damageAfter': damageAfter(state, task); break;
    case 'rescue': rescue(state, task); break;
    case 'draw': draw(state, task.target, task.num, task.reason); break;
    case 'trick': trick(state, task); break;
    case 'wuxie': wuxie(state, task); break;
    case 'trickEffect': trickEffect(state, task); break;
    case 'placeDelay': if (player(state, task.target).alive) { player(state, task.target).judgments.push(task.effect.value); emit(state, 'delay', { target: task.target, name: task.effect.value.name, card: task.effect.value.id }); } break;
    case 'zone': {
      const actions = zoneOptions(state, task.target, task.includeJudgment !== false);
      if (actions.length) ask(state, 'zone', task.actor, actions, { kind: 'zone', task }, { target: task.target });
      break;
    }
    case 'jiedao': prepend(state, { kind: 'response', source: task.effect.source, target: task.effect.targets[0], name: 'sha', after: 'jiedao', effect: task.effect }); break;
    case 'wugu': if (task.pool.length && player(state, task.target).alive) ask(state, 'wugu', task.target, task.pool.map(c => ({ type: 'choose', kind: 'wugu', card: c.id })), { kind: 'wugu', task }, { pool: copy(task.pool) }); break;
    case 'wuguRemainder': state.discard.push(...task.pool); task.pool.length = 0; break;
    case 'endPlay': {
      state.phase = 'discard';
      const excess = owner(state).hand.length - Math.max(0, owner(state).hp);
      if (excess > 0 && owner(state).alive) request(state, 'discard', state.owner, [owner(state).hand.slice(0, excess)].map(cards => ({ type: 'discard', cards: cards.map(c => c.id) })), { kind: 'discard' }, { num: excess });
      else prepend(state, { kind: 'finish' });
      break;
    }
    case 'finish': state.status = owner(state).alive ? 'finished' : 'owner-dead'; state.phase = 'end'; owner(state).wine = 0; emit(state, 'turnEnd', { target: state.owner }); break;
    case 'turnStart': {
      state.actor = task.actor; state.turn++; state.usedSources = []; const p = player(state, task.actor); p.normalSha = 0; p.normalJiu = 0; p.wine = 0;
      emit(state, 'turnStart', { target: task.actor });
      if (p.alive) prepend(state, ...p.judgments.slice().reverse().map(value => ({ kind: 'judgeDelay', target: p.id, cardId: value.id })));
      break;
    }
    case 'judgeDelay': {
      const value = player(state, task.target).judgments.find(c => c.id === task.cardId);
      if (value) prepend(state, { kind: 'wuxie', effect: { value, source: task.target }, target: task.target, next: { ...task, kind: 'judgeDelayResolve' }, index: 0, canceled: false, passes: 0 });
      break;
    }
    case 'cancelDelay': {
      const target = player(state, task.target), value = target.judgments.find(c => c.id === task.cardId);
      if (value) {
        removeCard(state, target.id, value.id, value.name === 'shandian' ? 'resolution' : 'discard');
        if (value.name === 'shandian') { const next = targetOrder(state, target.id).slice(1).find(p => !p.judgments.some(c => c.name === 'shandian')); if (next) { next.judgments.push(value); emit(state, 'delay', { target: next.id, name: value.name, card: value.id, reason: 'transfer' }); } else state.discard.push(value); }
      }
      break;
    }
    case 'judgeDelayResolve': {
      const target = player(state, task.target), value = target.judgments.find(c => c.id === task.cardId);
      if (!target.alive || !value) break;
      const judgment = drawOne(state);
      if (!judgment) throw new Error('Cannot resolve judgment without a deck card');
      state.discard.push(judgment); emit(state, 'judgment', { target: target.id, card: judgment.id, name: judgment.name, suit: judgment.suit, rank: judgment.rank, reason: value.name });
      removeCard(state, target.id, value.id, value.name === 'shandian' ? 'resolution' : 'discard');
      if (value.name === 'lebu' && judgment.suit !== 'heart') state.skippedPlay.add(target.id);
      if (value.name === 'bingliang' && judgment.suit !== 'club') state.skippedDraw.add(target.id);
      if (value.name === 'shandian') {
        if (judgment.suit === 'spade' && judgment.rank >= 2 && judgment.rank <= 9) { state.discard.push(value); prepend(state, { kind: 'damage', source: undefined, target: target.id, num: 3, nature: 'thunder' }); }
        else { const next = targetOrder(state, target.id).slice(1).find(p => !p.judgments.some(c => c.name === 'shandian')); if (next) { next.judgments.push(value); emit(state, 'delay', { target: next.id, name: value.name, card: value.id, reason: 'transfer' }); } else state.discard.push(value); }
      }
      break;
    }
    case 'script': {
      const recipient = player(state, task.actor);
      if (!recipient.alive || state.skippedPlay.has(recipient.id)) { emit(state, 'scriptSkip', { target: task.actor, reason: 'dead-or-skip-phase' }); break; }
      const available = playActions(state, task.actor, false);
      const intended = available.find(a => (a.card === task.play.card || recipient.hand.find(c => c.id === a.card)?.name === task.play.card) && JSON.stringify(a.targets) === JSON.stringify(task.play.targets ?? []));
      if (intended) use(state, intended, task.actor);
      else emit(state, 'scriptSkip', { target: task.actor, reason: 'invalidated', card: task.play.card });
      break;
    }
    case 'scriptEnd': { const p = player(state, task.actor); if (p.alive) { const excess = Math.max(0, p.hand.length - Math.max(0, p.hp)); p.hand.slice(0, excess).forEach(c => removeCard(state, p.id, c.id)); } p.wine = 0; emit(state, 'turnEnd', { target: p.id }); break; }
    case 'ownerStart': state.skipPlay = state.skippedPlay.has(state.owner); if (!state.skippedDraw.has(state.owner)) draw(state, state.owner, 2, 'normal'); prepend(state, { kind: 'beginPlay' }); break;
    default: throw new Error(`Missing effect ${task.kind}`);
  }
}

function drain(state) {
  let steps = 0;
  while (!state.request && state.queue.length && state.status === 'choice') {
    if (++steps > 10000) throw new Error('Mandatory resolution exceeded effect limit');
    resolveTask(state, state.queue.shift());
  }
  if (!state.request && !state.queue.length && !owner(state).alive) state.status = 'owner-dead';
}

function create(fixture, { seed = 1 } = {}) {
  if (!Number.isInteger(seed)) throw new Error('Seed must be an integer');
  if (!fixture || !Array.isArray(fixture.players) || fixture.players.length < 2) throw new Error('Fixture requires at least two players');
  const random = rng(seed), ids = new Set(), cards = {}, ownerId = fixture.owner ?? 'G';
  const makeCard = (value, id) => { const c = card(value, id); if (cards[c.id]) throw new Error(`Duplicate card ${c.id}`); cards[c.id] = c; return c; };
  const players = fixture.players.map(input => {
    if (typeof input.id !== 'string' || ids.has(input.id) || !['ally','enemy'].includes(input.team)) throw new Error('Invalid player id or team'); ids.add(input.id);
    const hp = input.hp ?? 3, maxHp = input.maxHp ?? 3;
    if (!Number.isInteger(hp) || !Number.isInteger(maxHp) || hp <= 0 || hp > maxHp) throw new Error('Invalid initial HP');
    const equipment = {};
    for (const [slot, value] of Object.entries(input.equipment ?? {})) { if (!value) continue; const c = makeCard(value, `${input.id}-e-${slot}`); if (rule(c).kind !== 'equip' || rule(c).slot !== slot) throw new Error(`Invalid equipment slot ${slot}`); equipment[slot] = c; }
    const judgments = (input.judgments ?? []).map((value, i) => makeCard(value, `${input.id}-j${i}`));
    if (judgments.some(c => rule(c).kind !== 'delay') || new Set(judgments.map(c => c.name)).size !== judgments.length) throw new Error('Invalid judgments');
    const sex = input.sex ?? (input.id === ownerId ? 'female' : 'male');
    if (!['male','female','none'].includes(sex)) throw new Error('Invalid sex');
    if (input.armor !== undefined && input.armor !== 0) throw new Error('Unsupported numeric shield armor (hujia)');
    return { id: input.id, team: input.team, role: input.role ?? '', sex, hp, maxHp, alive: true, hand: (input.hand ?? []).map((value, i) => makeCard(value, `${input.id}-h${i}`)), equipment, judgments, mark: !!input.mark, linked: !!input.linked, armor: input.armor ?? 0, policy: { ...(input.policy ?? {}) }, initialEmptySlots: ['weapon','armor','offhorse','defhorse'].filter(slot => !equipment[slot]), normalSha: 0, normalJiu: 0, wine: 0 };
  });
  if (!ids.has(ownerId) || players.find(p => p.id === ownerId).team !== 'ally') throw new Error('Owner must be a living ally');
  const deckSpec = fixture.deck ?? { cards: [], shuffle: false };
  if (deckSpec.recipe && deckSpec.recipe !== 'balanced-v1') throw new Error('Unknown deck recipe');
  const deckCards = (deckSpec.cards ?? (deckSpec.recipe ? balancedDeck() : [])).map((value, i) => makeCard(value, `deck-${i}`));
  const prefix = (deckSpec.prefix ?? []).map((value, i) => makeCard(value, `prefix-${i}`));
  const start = fixture.start ?? { phase: 'play' };
  if (!['play','prelude'].includes(start.phase ?? 'play')) throw new Error('Unknown starting phase');
  const state = { owner: ownerId, players, cards, deck: [...prefix, ...(deckSpec.shuffle ? shuffle(deckCards, random) : deckCards)], discard: [], random, seed, turn: start.phase === 'prelude' ? 0 : 1, actor: ownerId, phase: start.phase ?? 'play', status: 'choice', events: [], actions: [], queue: [], request: null, legalActions: [], continuation: null, choiceId: 0, useId: 0, usedSources: (start.usedSources ?? []).slice(), quotas: { puppetSha: !!start.puppetSha, shishengDamage: !!start.shishengDamage, shishengRemove: !!start.shishengRemove }, skippedPlay: new Set(), skippedDraw: new Set(), skipPlay: false };
  owner(state).normalSha = start.normalSha ?? 0; owner(state).normalJiu = start.normalJiu ?? 0;
  if (state.usedSources.some(id => !ids.has(id))) throw new Error('Unknown used source');
  if (start.phase === 'prelude') {
    if (!fixture.scripts?.length) throw new Error('Prelude requires scripts');
    for (const script of fixture.scripts) {
      if (!ids.has(script.actor) || script.actor === ownerId || script.fallback && script.fallback !== 'skip') throw new Error('Invalid script actor or fallback');
      for (const play of script.plays ?? []) {
        if (!player(state, script.actor).hand.some(c => c.id === play.card || c.name === play.card) || (play.targets ?? []).some(id => !ids.has(id))) throw new Error('Invalid initial script material or target');
      }
      const first = script.plays?.[0];
      if (first) {
        state.actor = script.actor;
        const recipient = player(state, script.actor);
        const legal = playActions(state, script.actor, false).some(action => (action.card === first.card || recipient.hand.find(c => c.id === action.card)?.name === first.card) && JSON.stringify(action.targets) === JSON.stringify(first.targets ?? []));
        state.actor = ownerId;
        if (!legal) throw new Error('Invalid initial script action');
      }
      enqueue(state, { kind: 'turnStart', actor: script.actor }, ...(script.plays ?? []).map(play => ({ kind: 'script', actor: script.actor, play })), { kind: 'scriptEnd', actor: script.actor });
    }
    enqueue(state, { kind: 'turnStart', actor: ownerId }, { kind: 'ownerStart' });
  } else enqueue(state, { kind: 'beginPlay' });
  const token = Object.freeze({}); matches.set(token, state); drain(state); return token;
}

function get(match) { const state = matches.get(match); if (!state) throw new Error('Invalid match'); return state; }

function observe(match) {
  const state = get(match);
  const publicEvents = state.events.map(event => {
    if (event.type === 'policy') return { type: 'policy', target: event.target, kind: event.kind, turn: event.turn };
    if (event.type === 'draw') return { type: 'draw', target: event.target, num: event.num, reason: event.reason, turn: event.turn };
    if (event.type === 'gain') return event.reason === 'wugu' ? event : { type: 'gain', target: event.target, source: event.source, reason: event.reason, turn: event.turn };
    if (event.type === 'loss' && event.zone === 'hand' && event.destination === 'gain' && event.target !== state.owner) return { type: 'loss', target: event.target, zone: event.zone, destination: event.destination, turn: event.turn };
    return event;
  });
  return copy({ status: state.status, owner: state.owner, actor: state.actor, turn: state.turn, phase: state.phase, request: state.request, legalActions: state.legalActions, ownerHand: owner(state).hand,
    players: state.players.map(p => ({ id: p.id, team: p.team, role: p.role, sex: p.sex, hp: p.hp, maxHp: p.maxHp, alive: p.alive, handCount: p.hand.length, ...(p.id === state.owner ? { hand: p.hand } : {}), equipment: p.equipment, judgments: p.judgments, mark: p.mark, linked: p.linked, armor: p.armor, wine: p.wine })),
    quotas: { ...state.quotas, normalSha: owner(state).normalSha, normalJiu: owner(state).normalJiu, usedSources: state.usedSources }, events: publicEvents });
}

function step(match, action) {
  const state = get(match);
  if (state.status !== 'choice' || !state.request) throw new Error('Match is not awaiting a choice');
  const same = (a, b) => a && b && typeof a === 'object' && typeof b === 'object' ? Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((value, i) => same(value, b[i])) : !Array.isArray(a) && !Array.isArray(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => same(a[key], b[key])) : a === b;
  const legal = state.legalActions.find(candidate => same(candidate, action));
  if (!legal) throw new Error('Illegal action');
  const continuation = state.continuation, actor = state.request.actor, kind = state.request.kind;
  state.actions.push(copy(legal)); state.request = null; state.legalActions = []; state.continuation = null;
  applyChoice(state, legal, continuation, actor, kind); drain(state);
  return observe(match);
}

function result(match) {
  const state = get(match);
  return copy({ status: state.status, owner: state.owner, events: state.events, players: state.players, actions: state.actions, seed: state.seed, turn: state.turn, phase: state.phase, quotas: { ...state.quotas, usedSources: state.usedSources, normalSha: owner(state).normalSha, normalJiu: owner(state).normalJiu }, deckRemaining: state.deck.length, discard: state.discard });
}

const SCORE_KEYS = ['enemyDamage', 'allyDamage', 'enemyDeath', 'allyDeath', 'enemyShan', 'extraDraw', 'recovery', 'equipment'];

function count(value, field) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${field} must be a nonnegative integer`);
  return value;
}

function hp(value) {
  if (!Number.isInteger(value)) throw new TypeError('hpBefore must be an integer');
  return value;
}

function clean(value) {
  return Math.round(value * 1e12) / 1e12;
}

function overkillDecay(config) {
  const decay = config.overkillDecay === undefined ? 0.6 : config.overkillDecay;
  if (!Number.isFinite(decay) || decay < 0 || decay > 1) throw new RangeError('overkillDecay must be between 0 and 1');
  return decay;
}

function damagePoints(hpBefore, num, config = {}) {
  hp(hpBefore);
  count(num, 'num');
  const ordinary = Math.min(num, Math.max(0, hpBefore));
  const excess = num - ordinary;
  const fixed = [1, 0.5, 0.3];
  const decay = overkillDecay(config);
  let value = ordinary;
  for (let i = 0; i < excess; i++) value += i < fixed.length ? fixed[i] : fixed[2] * decay ** (i - 2);
  return clean(value);
}

function scoreEpisode(fixture, report, config = {}) {
  const decay = overkillDecay(config);
  if (!Array.isArray(fixture?.players) || !Array.isArray(report?.players) || !Array.isArray(report?.events)) {
    throw new TypeError('Scoring requires fixture.players, report.players and report.events arrays');
  }
  const initial = new Map(fixture.players.map(player => [player.id, player]));
  const final = new Map(report.players.map(player => [player.id, player]));
  const owner = fixture.owner ?? 'G';
  if (!initial.has(owner) || !final.has(owner)) throw new TypeError('Scoring requires the owner in initial and final players');
  if (initial.size !== fixture.players.length || final.size !== report.players.length) throw new TypeError('Duplicate scoring player ID');
  const ownerTeam = initial.get(owner).team;
  const breakdown = Object.fromEntries(SCORE_KEYS.map(key => [key, 0]));
  const entries = [];
  const equipEvents = new Map();
  const deathTargets = new Set();
  const playerFor = id => {
    const player = initial.get(id);
    if (!player) throw new TypeError(`Unknown scoring player ${id}`);
    return player;
  };
  const friendly = id => id === owner || playerFor(id).team === ownerTeam;
  const add = (entry, category, points) => {
    const rounded = clean(points);
    entry.points = rounded;
    entry.category = category;
    breakdown[category] = clean(breakdown[category] + rounded);
  };
  for (const [index, event] of report.events.entries()) {
    const entry = { eventIndex: index, type: event.type, target: event.target ?? null, points: 0 };
    switch (event.type) {
      case 'damage': {
        playerFor(event.target);
        hp(event.hpBefore);
        count(event.num, 'damage.num');
        if (!friendly(event.target)) add(entry, 'enemyDamage', damagePoints(event.hpBefore, event.num, config));
        else if (event.target !== owner) add(entry, 'allyDamage', -damagePoints(event.hpBefore, event.num, config));
        break;
      }
      case 'death': {
        playerFor(event.target);
        if (deathTargets.has(event.target)) throw new TypeError(`Duplicate death event for ${event.target}`);
        deathTargets.add(event.target);
        if (!friendly(event.target)) add(entry, 'enemyDeath', 2);
        else if (event.target !== owner) add(entry, 'allyDeath', -2);
        break;
      }
      case 'response': {
        const responder = event.materialOwner ?? event.target;
        playerFor(responder);
        if (event.name === 'shan' && !event.virtual && event.consumed !== false && !friendly(responder)) {
          add(entry, 'enemyShan', 0.6 * count(event.num ?? 1, 'response.num'));
        }
        break;
      }
      case 'draw': {
        playerFor(event.target);
        const num = count(event.num, 'draw.num');
        if (typeof event.reason !== 'string') throw new TypeError('Draw event requires its normal or extra draw reason');
        if (event.reason !== 'normal' && friendly(event.target)) add(entry, 'extraDraw', 0.5 * num);
        break;
      }
      case 'recover': {
        playerFor(event.target);
        const num = count(event.num, 'recover.num');
        hp(event.hpBefore);
        if (friendly(event.target)) add(entry, 'recovery', num + (num > 0 && event.hpBefore === 1 ? 0.3 : 0));
        break;
      }
      case 'equip': {
        playerFor(event.target);
        if (!event.slot || typeof event.cardId !== 'string') throw new TypeError('Equip event requires slot and cardId');
        equipEvents.set(`${event.target}/${event.slot}`, { index, event });
        break;
      }
    }
    entries.push(entry);
  }
  for (const { index, event } of equipEvents.values()) {
    const before = playerFor(event.target);
    const after = final.get(event.target);
    if (!after) throw new TypeError(`Missing final scoring player ${event.target}`);
    const installed = after.equipment?.[event.slot];
    if (!friendly(event.target) || after.alive === false || after.dead === true || after.hp <= 0 || before.equipment?.[event.slot] || !event.initiallyEmpty || installed?.id !== event.cardId) continue;
    const base = event.slot === 'armor' || event.key === true ? 1 : 0.6;
    add(entries[index], 'equipment', base * (event.target === owner ? 1.2 : 1));
  }
  const ownerFinal = final.get(owner);
  const ownerAlive = ownerFinal.alive !== false && ownerFinal.dead !== true && ownerFinal.hp > 0;
  return {
    total: clean(Object.values(breakdown).reduce((sum, value) => sum + value, 0)),
    breakdown,
    entries,
    ownerAlive,
    status: report.status ?? (ownerAlive ? 'unknown' : 'owner-dead'),
    successful: ownerAlive && report.status === 'finished',
    scoring: {
      version: 'luofei-score-v1.1',
      overkillBeyondThird: { decay, source: decay === 0.6 ? 'user-approved/default' : 'explicit configuration override' },
    },
  };
}

function tacticalFactory() {
'use strict';

const ranges = { zhuge: 1, cixiong: 2, qinggang: 2, hanbing: 2, guding: 2,
  qinglong: 3, zhangba: 3, guanshi: 3, fangtian: 4, qilin: 5, zhuque: 4 };
const slots = { bagua: 'armor', renwang: 'armor', tengjia: 'armor', baiyin: 'armor',
  chitu: 'offhorse', dayuan: 'offhorse', zixing: 'offhorse', jueying: 'defhorse',
  dilu: 'defhorse', zhuahuang: 'defhorse', hualiu: 'defhorse' };
const harmful = new Set(['nanman', 'wanjian', 'juedou', 'huogong', 'shunshou', 'guohe', 'lebu', 'bingliang', 'shandian']);
const knownCards = new Map();
const responseAmounts = new Map();
let attackContext;

const decide = function (view, ranking = false, selected = null) {
  const actions = view.legalActions, request = view.request || {}, quotas = view.quotas || {};
  const players = new Map(view.players.map(p => [p.id, p]));
  const self = players.get(view.owner), hand = view.ownerHand || self.hand || [];
  const cards = new Map(hand.map(c => [c.id, c]));
  for (const p of players.values()) for (const c of Object.values(p.equipment || {})) cards.set(c.id, c);
  for (const [id, c] of cards) knownCards.set(id, c);
  const living = view.players.filter(p => p.alive !== false);
  const friendly = p => p && (p.id === self.id || p.team === self.team);
  const enemies = living.filter(p => !friendly(p));
  const unused = p => p && !(quotas.usedSources || []).includes(p.id);
  const count = p => p.handCount || 0;
  const weapon = p => p.equipment?.weapon?.name;
  const armor = p => p.equipment?.armor?.name;
  const range = p => ranges[weapon(p)] || 1;
  const shaCards = hand.filter(c => c.name === 'sha');
  const lastUse = [...(view.events || [])].reverse().find(e => e.type === 'use');
  const contextSource = players.get(request.source || lastUse?.source);
  const contextTarget = players.get(request.target || lastUse?.targets?.[0]);
  const contextCard = knownCards.get(lastUse?.card) || { name: request.name || lastUse?.name || 'sha' };
  const responseKey = `${lastUse?.useId}/${request.source}/${request.name}`;
  if (request.kind === 'response' && request.num) responseAmounts.set(responseKey, request.num);
  const contextWine = attackContext && lastUse && attackContext.card === lastUse.card && attackContext.source === lastUse.source ? attackContext.wine : contextSource?.wine || 0;

  function distance(a, b) {
    if (a.id === b.id) return 0;
    const d = Math.abs(living.indexOf(a) - living.indexOf(b));
    return Math.max(1, Math.min(d, living.length - d) - (a.equipment?.offhorse ? 1 : 0) + (b.equipment?.defhorse ? 1 : 0));
  }
  function heal(p, amount = 1) {
    const n = Math.min(amount, Math.max(0, p.maxHp - p.hp));
    if (!friendly(p)) return -0.55 * n;
    return n + (n && p.hp === 1 ? 0.3 : 0) + (p.id === self.id ? n * (p.hp === 1 ? 0.9 : 0.12) : 0);
  }
  function healthCost(p, amount, hp = p.hp) {
    if (p.id !== self.id) return 0;
    if (hp - amount <= 0) return 60 + 15 * (amount - hp + 1);
    return amount * (hp - amount === 1 ? 0.65 : 0.13);
  }
  function cardValue(c) {
    if (!c) return 0.15;
    if (c.name === 'tao') return self.hp < self.maxHp ? 1.4 : 0.55;
    if (c.name === 'wuzhong') return 1.9;
    if (c.name === 'sha') return shaCards.length > 2 && quotas.puppetSha && quotas.normalSha ? 0.1 : 0.65;
    if (c.name === 'shan') return self.hp <= 1 ? 1.25 : 0.2;
    if (c.name === 'jiu') return self.hp <= 1 ? 0.95 : shaCards.length ? 0.5 : 0.15;
    if (c.name === 'wuxie') return 0.45;
    if (['lebu', 'bingliang', 'shandian'].includes(c.name)) return 0.02;
    const slot = slots[c.name] || (ranges[c.name] ? 'weapon' : null);
    if (slot) return self.equipment?.[slot] ? 0.3 : 0.9;
    return 0.45;
  }
  function defense(p, name) {
    if (p.id === self.id) return hand.some(c => c.name === name) ? 1 : 0;
    return 1 - Math.pow(name === 'shan' ? 0.81 : 0.74, count(p));
  }
  function damage(p, source, amount = 1, nature, ignoreArmor = false, chain = true) {
    if (!p) return 0;
    let n = amount;
    if (!ignoreArmor && armor(p) === 'tengjia' && nature === 'fire') n++;
    if (!ignoreArmor && armor(p) === 'baiyin') n = Math.min(n, 1);
    let hp = p.hp, value = 0;
    const preheal = p.id === self.id && source?.mark;
    if (preheal) { value += heal(p); hp = Math.min(p.maxHp, hp + 1); }
    if (!friendly(p)) {
      const ordinary = Math.min(n, Math.max(hp, 0)), excess = Math.max(0, n - ordinary);
      value += ordinary + Math.min(1, excess) + Math.min(1, Math.max(0, excess - 1)) * 0.5 + Math.max(0, excess - 2) * 0.25;
      if (hp <= n) value += 2 * Math.pow(0.93, count(p));
    } else if (p.id !== self.id) value -= n + (hp <= n ? 2.5 : 0);
    else value -= healthCost(p, n, hp);
    const activeSource = source && unused(source) && (p.id === self.id ? !source.mark : source.mark);
    if (activeSource && hp > n) value += n * 0.8 + (!p.mark ? 0.1 : 0);
    else if (activeSource && p.id !== self.id) value += n * 0.72;
    if (p.id === self.id && source && !source.mark && hp > n) value += 0.18;
    if (chain && nature && p.linked) {
      for (const linked of living) if (linked.id !== p.id && linked.linked) value += damage(linked, source, n, nature, false, false);
    }
    return value;
  }
  function sha(p, source, c, extraWine = 0) {
    const w = weapon(source), ignore = w === 'qinggang';
    let nature = c.nature;
    if (!nature && w === 'zhuque' && source.id !== self.id) nature = 'fire';
    if (!nature && w === 'zhuque' && source.id === self.id) {
      if (damage(p, source, 1 + source.wine + extraWine, 'fire') > damage(p, source, 1 + source.wine + extraWine)) nature = 'fire';
    }
    if (!ignore && (armor(p) === 'tengjia' && !nature || armor(p) === 'renwang' && ['spade', 'club'].includes(c.suit))) return 0;
    let dodge = defense(p, 'shan');
    if (!ignore && armor(p) === 'bagua') dodge = 0.5 + dodge * 0.5;
    let hit = damage(p, source, 1 + (source.wine || 0) + extraWine + (w === 'guding' && !count(p) ? 1 : 0), nature, ignore);
    if (w === 'hanbing' && source.id !== self.id && (count(p) || Object.keys(p.equipment).length)) hit = friendly(p) ? -0.1 : 0.2;
    if (w === 'guanshi' && count(source) >= 2 && !friendly(p)) hit += dodge * 0.55;
    let value = (1 - dodge) * hit + (!friendly(p) ? defense(p, 'shan') * 0.6 : 0);
    if (w === 'cixiong' && p.sex !== source.sex && !count(p) && friendly(source)) value += source.id === self.id ? 0.8 : 0.5;
    return value;
  }
  function bestAttack(user, newRange = range(user), wine = 0, newWeapon) {
    const source = newWeapon ? { ...user, equipment: { ...user.equipment, weapon: { name: newWeapon } } } : user;
    let best = 0;
    for (const c of shaCards) for (const p of enemies) {
      if (p.id !== user.id && distance(user, p) <= newRange) best = Math.max(best, sha(p, source, c, wine));
    }
    return best;
  }
  function sourcePotential(p) {
    let best = 0;
    for (const a of actions) if (a.type === 'play' && a.user === p.id) {
      const c = cards.get(a.card);
      if (c?.name === 'sha') best = Math.max(best, a.targets.reduce((v, id) => v + sha(players.get(id), p, c), 0));
      if (c?.name === 'wuzhong' && friendly(p)) best = Math.max(best, 1);
      if (c?.name === 'tao') best = Math.max(best, heal(p));
      if ((slots[c?.name] || ranges[c?.name]) && friendly(p)) best = Math.max(best, 0.5);
      if (['juedou', 'nanman', 'wanjian', 'huogong'].includes(c?.name)) best = Math.max(best, 0.75);
    }
    return best;
  }
  function equip(c, user) {
    const slot = slots[c.name] || (ranges[c.name] ? 'weapon' : null);
    if (!slot) return -1;
    const old = user.equipment?.[slot];
    let value = friendly(user) && !old ? (slot === 'armor' ? 1 : 0.6) * (user.id === self.id ? 1.2 : 1) : 0;
    if (old?.name === 'baiyin') value += heal(user);
    if (slot === 'weapon' && shaCards.length) {
      const available = user.id === self.id ? !quotas.normalSha || c.name === 'zhuge' : !quotas.puppetSha;
      if (available) {
        const before = bestAttack(user), after = bestAttack(user, ranges[c.name], 0, c.name);
        let improvement = after - before;
        if (c.name === 'zhuge' && user.id === self.id && weapon(user) !== 'zhuge') improvement += after * Math.max(0, shaCards.length - (quotas.normalSha ? 0 : 1));
        if (weapon(user) === 'zhuge' && user.id === self.id && shaCards.length > 1 && c.name !== 'zhuge') improvement -= before * (shaCards.length - 1);
        value += improvement;
        if (improvement > 0.05) value += after + 0.15;
      }
    }
    if (slot === 'offhorse' && !old && shaCards.length) {
      const newTargets = enemies.filter(p => p.id !== user.id && distance(user, p) === range(user) + 1);
      if (newTargets.length) value += Math.max(...newTargets.flatMap(p => shaCards.map(s => sha(p, user, s)))) + 0.25;
    }
    if (!friendly(user) && value <= 0) return -0.5;
    return value - 0.03;
  }
  function play(a) {
    const c = cards.get(a.card) || (a.card === 'zhangba' ? { name: 'sha', suit: a.cards.every(id => ['club', 'spade'].includes(cards.get(id)?.suit)) ? 'spade' : 'heart' } : null);
    if (!c) return -100;
    const user = players.get(a.user), targets = a.targets.map(id => players.get(id));
    const materialCost = a.cards ? a.cards.reduce((v, id) => v + cardValue(cards.get(id)) * 0.35, 0) : 0.025;
    if (c.name === 'sha') {
      let value = targets.reduce((v, p) => v + sha(p, user, c), 0) - materialCost;
      if (a.mode === 'puppet' && user.id === self.id && !quotas.normalSha) value -= 0.08;
      return value;
    }
    if (c.name === 'wuzhong') return friendly(user) ? user.id === self.id ? 2.6 : 1 : -1;
    if (c.name === 'tao') return heal(user) - 0.04;
    if (c.name === 'jiu') {
      const possible = actions.some(b => b.type === 'play' && b.user === user.id && cards.get(b.card)?.name === 'sha');
      if (!possible) return -0.1;
      const base = bestAttack(user), improved = bestAttack(user, range(user), 1);
      return improved > base + 0.05 ? improved + 0.15 : -0.1;
    }
    if (c.name === 'taoyuan') return targets.reduce((v, p) => v + heal(p), 0) - 0.025;
    if (c.name === 'juedou') {
      const p = targets[0], theirSha = defense(p, 'sha');
      const ourSha = user.id === self.id ? Math.min(1, shaCards.length / Math.max(1, count(p) * 0.3)) : defense(user, 'sha');
      const win = 1 - theirSha * (1 - ourSha * 0.75);
      return win * damage(p, user) + (1 - win) * damage(user, p) - 0.08;
    }
    if (c.name === 'nanman' || c.name === 'wanjian') {
      let value = 0, bloodCounted = false;
      for (const p of targets) {
        if (armor(p) === 'tengjia') continue;
        let hit = damage(p, user), d = defense(p, c.name === 'nanman' ? 'sha' : 'shan');
        if (p.id === self.id && hit > 0) d = 0;
        if (bloodCounted && user.mark && unused(user)) hit -= 0.7;
        value += (1 - d) * hit + (c.name === 'wanjian' && !friendly(p) ? d * 0.6 : 0);
        if (d < 0.5) bloodCounted = true;
      }
      return value - 0.05;
    }
    if (c.name === 'huogong') {
      const p = targets[0];
      const suits = new Set(hand.filter(h => h.id !== c.id).map(h => h.suit));
      const pay = user.id === self.id ? suits.size / 4 : 1 - Math.pow(0.75, count(user));
      return pay * (damage(p, user, 1, 'fire') - 0.25) - 0.1;
    }
    if (c.name === 'shunshou' || c.name === 'guohe') {
      const p = targets[0];
      if (friendly(p)) return p.judgments?.length ? 0.15 : armor(p) === 'baiyin' ? heal(p) - 0.3 : -1;
      let value = c.name === 'shunshou' && user.id === self.id ? 0.65 : 0.16;
      if (p.equipment?.armor && shaCards.length) value += armor(p) === 'baiyin' ? -0.1 : 0.7;
      if (p.equipment?.defhorse && shaCards.length) value += 0.3;
      if (count(p) && shaCards.length) value += 0.18;
      return value;
    }
    if (c.name === 'jiedao') {
      const [attacker, target] = targets;
      return defense(attacker, 'sha') * sha(target, attacker, { name: 'sha', suit: 'spade' }) + (user.id === self.id ? 0.35 : 0) - 0.05;
    }
    if (c.name === 'wugu') return 0.55;
    if (c.name === 'tiesuo') {
      if (!targets.length) return 1.1;
      const elemental = hand.some(h => h.nature || h.name === 'huogong') || weapon(self) === 'zhuque';
      let value = 0;
      for (const p of targets) value += p.linked ? friendly(p) ? 0.65 : -0.9 : friendly(p) ? -0.9 : elemental ? 0.65 : -0.1;
      return value > 0 && elemental ? value + 0.65 : value;
    }
    if (['lebu', 'bingliang', 'shandian'].includes(c.name)) return -0.05;
    return equip(c, user);
  }
  function shisheng(a) {
    const p = players.get(a.target);
    if (a.option === 'remove') {
      const gain = heal(p), useful = sourcePotential(p);
      if (gain <= 0) return -0.1;
      if (useful > 0.15 && !(p.id === self.id && self.hp === 1)) return -0.02;
      if (!quotas.shishengDamage && p.id === self.id && self.hp < self.maxHp) return gain - 0.5;
      return gain - 0.03;
    }
    const effectiveHp = Math.min(self.maxHp, self.hp + (p.mark ? 1 : 0));
    if (effectiveHp <= 1) return -100;
    let value = damage(self, p) + 0.85;
    if (!p.mark && !quotas.puppetSha) value += bestAttack(p) * 0.6;
    if (p.mark) value -= sourcePotential(p) * 0.9;
    if (!p.mark && p.id === self.id) value += 0.18;
    return value;
  }
  function choice(a) {
    const pass = a.type === 'pass', kind = request.kind;
    const cost = (a.cards || (a.card ? [a.card] : [])).reduce((v, id) => v + cardValue(cards.get(id)), 0);
    if (kind === 'rescue') return pass ? 0 : friendly(contextTarget) ? 10 - cost * 0.1 : -10;
    if (kind === 'wuxie') {
      const p = contextTarget;
      let benefit = harmful.has(request.name) ? friendly(p) ? -1.1 : 1.1 : friendly(p) ? 1 : -0.6;
      if (p?.id === self.id && ['nanman', 'wanjian', 'juedou', 'huogong'].includes(request.name)) benefit = damage(p, contextSource, 1, request.name === 'huogong' ? 'fire' : undefined);
      if (request.name === 'tiesuo') benefit = p?.linked ? friendly(p) ? 0.4 : -0.4 : friendly(p) ? -0.4 : 0.4;
      const toggle = (request.canceled ? 1 : -1) * benefit;
      return pass ? 0 : toggle - 0.2;
    }
    if (kind === 'response') {
      const num = request.num || responseAmounts.get(responseKey) || 1;
      const hit = damage(self, contextSource, num, undefined, true);
      if (pass) return hit;
      if (a.kind === 'bagua') return 0.05;
      let value = -cost * 0.2;
      if (request.name === 'sha' && lastUse?.name === 'juedou' && contextSource && !friendly(contextSource)) value += Math.max(0, damage(contextSource, self)) * 0.7;
      return value;
    }
    if (kind === 'hanbing') return pass ? 0 : friendly(contextTarget) ? 2 : -2;
    if (kind === 'zhuque') return pass ? 0 : damage(contextTarget, contextSource, 1 + contextWine, 'fire') - damage(contextTarget, contextSource, 1 + contextWine) + (armor(contextTarget) === 'tengjia' ? 1 : 0);
    if (kind === 'axe') return pass ? 0 : damage(contextTarget, contextSource, 1 + contextWine, contextCard.nature) - cost * 0.4;
    if (kind === 'qinglong') return pass ? 0 : sha(contextTarget, contextSource, cards.get(a.cards?.[0]) || contextCard) - cost * 0.3;
    if (kind === 'cixiong') return pass ? 0 : !friendly(contextTarget) || !count(contextTarget) ? 1 : -0.3;
    if (kind === 'cixiongDiscard') return pass ? friendly(contextSource) ? 0.8 : 0 : -cost * 0.3;
    if (kind === 'qilin') return pass ? 0 : friendly(contextTarget) ? -1 : contextTarget?.equipment?.defhorse?.id === a.card ? 0.5 : 0.3;
    if (kind === 'firePay') return pass ? 0 : damage(contextTarget, contextSource || self, 1, 'fire') - cost * 0.45;
    if (kind === 'fireReveal') {
      const c = cards.get(a.card), duplicates = hand.filter(h => h.suit === c?.suit).length;
      return contextSource?.id === self.id ? duplicates > 1 ? 2 : -1 : -duplicates * 0.01;
    }
    if (kind === 'wugu') return cardValue(request.pool?.find(c => c.id === a.card));
    if (kind === 'zone') {
      const p = players.get(a.target || request.target), good = friendly(p);
      if (a.zone === 'judgment') return good ? 3 : -2;
      if (a.zone === 'hand') return good ? -1 : 0.5;
      const c = cards.get(a.card);
      if (c?.name === 'baiyin') return good ? heal(p) - 0.3 : 0.2 + heal(p);
      return (good ? -1 : 1) * (a.zone === 'armor' ? 1.4 : a.zone === 'defhorse' ? 1 : 0.7);
    }
    return pass ? 0 : 0.1 - cost * 0.1;
  }
  let best = actions[0], bestValue = -Infinity; const ranked = [];
  if (!selected || ranking) for (const a of actions) {
    const value = a.type === 'play' ? play(a) : a.type === 'shisheng' ? shisheng(a)
      : a.type === 'endPlay' ? 0 : a.type === 'discard' ? -a.cards.reduce((v, id) => v + cardValue(cards.get(id)), 0) : choice(a);
    if (ranking) ranked.push({action:a, value}); if (Number.isFinite(value) && value > bestValue) { best = a; bestValue = value; }
  }
  if (ranking) return ranked.sort((a,b) => b.value-a.value); if (selected) best = selected;
  if (best.type === 'play' && (cards.get(best.card)?.name === 'sha' || best.card === 'zhangba')) {
    attackContext = { card: best.card, source: best.user, wine: players.get(best.user).wine || 0 };
  }
  return best;
};

return decide;
}
const livePolicy = tacticalFactory();
const SEARCH_BUDGET = {candidates:6, worlds:4, horizon:18, rolloutChoices:1000};
let originalPlayers;
const sampleRecipe = balancedDeck();
const hiddenPrior = ['sha','sha','sha','shan','shan','shan','tao','jiu','wuxie','guohe','juedou','tiesuo'];

function rememberInitial(view) {
  if (originalPlayers) return;
  originalPlayers = view.players.map(p => {
    const equipment = {...p.equipment};
    for (const e of view.events || []) if (e.type === 'equip' && e.target === p.id && e.initiallyEmpty) delete equipment[e.slot];
    return {...p, equipment};
  });
}

function imaginedFixture(view, seed) {
  const random = rng(seed);
  return {
    owner: view.owner,
    players: view.players.map(p => ({
      ...p, hp: Math.max(1,p.hp),
      hand: p.id === view.owner ? view.ownerHand : Array.from({length:p.handCount}, (_,i) => {
        const c = random() < 0.55 ? {name:hiddenPrior[Math.floor(random()*hiddenPrior.length)], suit:['spade','heart','club','diamond'][Math.floor(random()*4)],rank:7} : sampleRecipe[Math.floor(random()*sampleRecipe.length)];
        return {...c,id:`imagined-${p.id}-${i}`};
      }),
    })),
    start: {phase:'play',...view.quotas},
    deck: {cards:shuffle(sampleRecipe,random).map((c,i)=>({...c,id:`imagined-deck-${i}`})),shuffle:false},
  };
}

function imaginedMatch(view, fixture, seed) {
  const match = create(fixture,{seed});
  const state = get(match);
  state.events = view.events.slice();
  state.actor = view.actor;
  state.turn = view.turn;
  state.useId = Math.max(0,...view.events.map(e=>e.useId || 0));
  state.choiceId = view.request.id || 0;
  for (const p of state.players) {
    const visible = view.players.find(v=>v.id===p.id);
    p.hp = visible.hp; p.alive = visible.alive; p.wine = visible.wine || 0;
    const initial = originalPlayers.find(v=>v.id===p.id);
    p.initialEmptySlots = ['weapon','armor','offhorse','defhorse'].filter(slot=>!initial.equipment[slot]);
  }
  state.request = {...view.request};
  state.legalActions = view.legalActions;
  return match;
}

function forkImaginedMatch(base) {
  const state = {
    ...base,
    players: base.players.map(p => ({
      ...p, hand: p.hand.slice(), equipment: {...p.equipment}, judgments: p.judgments.slice(),
      policy: {...p.policy}, initialEmptySlots: p.initialEmptySlots.slice(),
    })),
    deck: base.deck.slice(), discard: base.discard.slice(), random: rng(base.seed),
    events: base.events.slice(), actions: base.actions.slice(), queue: base.queue.slice(),
    request: {...base.request}, legalActions: base.legalActions.slice(), continuation: {...base.continuation},
    usedSources: base.usedSources.slice(), quotas: {...base.quotas},
    skippedPlay: new Set(base.skippedPlay), skippedDraw: new Set(base.skippedDraw),
  };
  const token = Object.freeze({}); matches.set(token, state); return token;
}

function fastStep(match, action) {
  const state = get(match);
  const continuation = state.continuation, actor = state.request.actor, kind = state.request.kind;
  state.request = null; state.legalActions = []; state.continuation = null;
  applyChoice(state, action, continuation, actor, kind);
  drain(state);
}

function rolloutView(state) {
  return {
    status:state.status, owner:state.owner, actor:state.actor, turn:state.turn, phase:state.phase,
    request:state.request,legalActions:state.legalActions,ownerHand:owner(state).hand,
    players:state.players.map(p=>({...p,handCount:p.hand.length})),
    quotas:{...state.quotas,normalSha:owner(state).normalSha,normalJiu:owner(state).normalJiu,usedSources:state.usedSources},
    events:state.events,
  };
}

function rollout(view, world, action) {
  if (!world.base) world.base = get(imaginedMatch(view,world.fixture,world.seed));
  const match = forkImaginedMatch(world.base), policy = tacticalFactory();
  policy(view,false,action);
  fastStep(match,action);
  let steps = 0, choices = 0;
  while (get(match).status === 'choice' && steps++ < SEARCH_BUDGET.horizon) {
    const next = rolloutView(get(match));
    choices += next.legalActions.length;
    if (choices > SEARCH_BUDGET.rolloutChoices) break;
    fastStep(match,policy(next));
  }
  const state = get(match);
  const report = {players:state.players,events:state.events,status:state.status};
  const scored = scoreEpisode({owner:view.owner,players:originalPlayers},report);
  if (!scored.ownerAlive) return scored.total-60;
  const self = owner(state);
  return scored.total + Math.min(self.hp,2)*0.025 - (state.status==='choice' ? 0.2 : 0);
}

function shortlist(view, ranked) {
  const cards = new Map(view.ownerHand.map(c=>[c.id,c]));
  const seen = new Set(), candidates=[];
  const width=view.legalActions.length;
  const limit=width>500?2:width>300?4:width>120?6:10;
  for (const entry of ranked) {
    const a=entry.action,c=cards.get(a.card);
    if (a.type==='play' && ['lebu','bingliang','shandian'].includes(c?.name)) continue;
    const key = a.type==='play' ? JSON.stringify([a.type,a.mode,a.user,a.targets,c?.name,c?.suit,c?.nature,a.cards]) : JSON.stringify(a);
    if (seen.has(key)) continue;
    seen.add(key); candidates.push(entry);
    if(candidates.length>=limit) break;
  }
  return candidates;
}

module.exports.decide = function(view) {
  rememberInitial(view);
  if (view.request?.kind !== 'play' || view.legalActions.length < 3) return livePolicy(view);
  const ranked = livePolicy(view,true), candidates = shortlist(view,ranked);
  if (candidates.length<2) return livePolicy(view);
  if (view.legalActions.length > 192) return livePolicy(view,false,ranked[0].action);
  const worldCount = view.legalActions.length <= 64 ? SEARCH_BUDGET.worlds : 2;
  const worlds = [1709,7919,15427,23209,32117,43753].slice(0,worldCount).map(seed=>({seed,fixture:imaginedFixture(view,seed)}));
  let best = ranked[0].action, bestValue = -Infinity;
  for (const entry of candidates) {
    let total=0;
    try {
      for (const world of worlds) total += rollout(view,world,entry.action);
    } catch { continue; }
    const value=total/worlds.length + entry.value*0.025;
    if(value>bestValue) {bestValue=value;best=entry.action;}
  }
  return livePolicy(view,false,best);
};
