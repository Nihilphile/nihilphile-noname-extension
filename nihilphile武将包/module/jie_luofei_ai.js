(function () {
    "use strict";

    /** @typedef {{owner:string,players:Object[],hand:Object[],quota:Object,distances:Object,roots:RootAction[],ending?:Object,chainOrder?:string[],ended?:boolean,terminal?:number}} VisiblePosition */
    /** @typedef {{kind:string,card:string|null,user:string,targets:string[]}} RootAction */
    /** @typedef {{probability:number,state:VisiblePosition}} Outcome */
    /** @typedef {{selfEmergency:boolean,allyEmergency:string[],reserve:number}} PolicyContext */
    /** @typedef {{selfAlive:boolean,selfRescue:number,allyRescue:number,allyRescues:Object<string,number>,allyAlive:Object<string,boolean>,reserveSafe:boolean,ownDanger:boolean}} RouteEvidence */
    /** @typedef {{firstAction:RootAction,score:number,continuation:RootAction[],coverage:Object}} Decision */
    var MARK = "nihil_jie_xueou", EPS = 0.000001;
    var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
    var transitionScopes = new WeakMap(), WORK_EXHAUSTED = {};
    function charge(s) {
        var scope = transitionScopes.get(s), account = scope && scope.account;
        if (!account) return;
        if (account.remaining <= 0) throw WORK_EXHAUSTED;
        account.remaining--; account.spent++;
    }
    function copyState(s) {
        charge(s);
        var copy = { owner: s.owner, reserveUnsafe: s.reserveUnsafe, selfDanger: s.selfDanger, chainOrder: s.chainOrder, ending: s.ending, ended: s.ended, terminal: s.terminal, hand: s.hand, quota: Object.assign({}, s.quota), distances: s.distances, initialEquips: s.initialEquips, shaLimit: s.shaLimit, bonus: s.bonus, events: s.events.slice(), freshMarks: (s.freshMarks || []).slice(), damageSources: (s.damageSources || []).slice(), players: s.players.map(function (p) {
            return { id: p.id, hp: p.hp, maxHp: p.maxHp, alive: p.alive, armor: p.armor, mark: p.mark, used: p.used, drunk: p.drunk, linked: p.linked, attitude: p.attitude, unknown: p.unknown, known: p.known, equips: p.equips, judges: p.judges, baseRange: p.baseRange, range: p.range, limitExtra: p.limitExtra, equipDisabled: p.equipDisabled, noResponse: p.noResponse };
        }) };
        var scope = transitionScopes.get(s); if (scope) transitionScopes.set(copy, scope);
        return copy;
    }
    var clamp = function (x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; };
    var BASE_VALUES = { tao: 7, jiu: 5, wuxie: 8, sha: 5, wuzhong: 9, guohe: 6, shunshou: 6 };
    var valuations = new WeakMap();
    function actor(s, id) { return s.players.find(function (p) { return p.id === id; }); }
    function cardOf(s, id) { return s.hand.find(function (c) { return c.id === id; }); }
    function actionKey(a) { return [a.kind, a.card || "", a.user, a.targets.join(",")].join("|"); }
    function action(kind, card, user, targets) { return { kind: kind, card: card, user: user, targets: targets }; }
    function hpValue(hp) { return hp <= 0 ? -30 : hp === 1 ? 0 : hp === 2 ? 2.5 : hp === 3 ? 4 : 4 + (hp - 3) * 1.2; }
    function keep(c, p, index) {
        var v = c.name === "shan" ? (index > 1 ? 2 : index === 1 ? 5.1 : 7) : BASE_VALUES[c.name];
        if (p.hp <= 1 && (c.name === "tao" || c.name === "jiu")) v = 9;
        return clamp((v || (c.type === "basic" ? 4 : 5)) / 5, 0.2, 2);
    }
    function utility(s) {
        if (s.ended) return (s.terminal || 0) * 1000000;
        if (valuations.has(s)) return valuations.get(s);
        var total = s.bonus || 0;
        s.players.forEach(function (p) {
            var weight = p.id === s.owner ? 1 : p.attitude;
            if (!p.alive) { total -= 30 * weight; return; }
            var cards = p.id === s.owner ? s.hand : p.known;
            var shan = 0, values = cards.map(function (c) { return keep(c, p, c.name === "shan" ? shan++ : 0); });
            for (var i = 0; i < p.unknown; i++) values.push(1);
            if (p.id === s.owner) {
                var limit = Math.max(0, p.hp + (p.limitExtra || 0));
                var protectedValues = [], discardableValues = [];
                cards.forEach(function (c, i) { (c.discardable === false ? protectedValues : discardableValues).push(values[i]); });
                discardableValues = discardableValues.concat(values.slice(cards.length)).sort(function (a, b) { return b - a; });
                values = protectedValues.concat(discardableValues.slice(0, Math.max(0, limit - protectedValues.length)));
            }
            total += weight * (hpValue(p.hp) + p.armor * 0.8 + values.reduce(function (a, b) { return a + b; }, 0) + p.equips.reduce(function (value, c) { return value + equipmentValue(s, p, c); }, 0));
            if (p.mark) total += markOpportunity(s, p);
            p.judges.forEach(function (c) { total -= weight * (c.name === "lebu" ? 1.4 : c.name === "bingliang" ? 1.2 : 0.3); });
        });
        valuations.set(s, total); return total;
    }
    function equipmentValue(s, p, c) {
        if (c.subtype !== "equip2") return 1;
        var threats = s.players.filter(function (q) { return q.alive && q.attitude * p.attitude < 0; });
        var fire = threats.some(function (q) { return equipped(q, "zhuque") || q.known.some(function (v) { return v.nature === "fire" || v.name === "huogong"; }); });
        var amplified = threats.some(function (q) { return q.drunk > 0; });
        var defense = c.name === "bagua" ? 0.8 : c.name === "baiyin" ? (amplified ? 1.2 : 0.6) : c.name === "tengjia" ? (fire ? -0.5 : 0.9) : 0.5;
        return 1 + defense;
    }
    function selfSaveCard(s, c) {
        return (c.name === "tao" || c.name === "jiu") && (c.rescueEnabled !== undefined ? c.rescueEnabled : !c.enabled || c.enabled[s.owner] !== false);
    }
    function reliableReserves(s) {
        return s.hand.filter(function (c) { return selfSaveCard(s, c); }).length;
    }
    function markOpportunity(s, p) {
        var useful = s.hand.some(function (c) {
            if (c.enabled && c.enabled[p.id] === false) return false;
            if (c.name === "tao") return p.attitude > 0 && p.hp < p.maxHp && (p.id === s.owner || reliableReserves(s) > 1);
            if (c.type === "equip") return p.attitude > 0 && !p.equips.some(function (e) { return e.subtype === c.subtype; });
            if (!["sha", "juedou", "huogong", "shunshou", "guohe"].includes(c.name)) return false;
            return predictedTargets(s, c, p).some(function (targets) { return targets.some(function (id) { return actor(s, id).attitude < 0; }); });
        });
        return useful ? (p.used ? 0.08 : 0.18) : 0.03;
    }
    function normalize(input) {
        var s = clone(input);
        s.selfDanger = !!s.selfDanger;
        s.reserveUnsafe = !!s.reserveUnsafe;
        s.quota = Object.assign({ damage: false, remove: false, puppetSha: false, normalSha: 0, normalJiu: 0 }, s.quota);
        s.players.forEach(function (p) {
            Object.assign(p, Object.assign({ alive: true, armor: 0, mark: false, used: false, drunk: 0, linked: false, known: [], unknown: 0, equips: [], judges: [], attitude: 0, range: 1, limitExtra: 0, noResponse: {} }, p));
        });
        s.hand = s.hand || [];
        s.chainOrder = s.chainOrder || s.players.map(function (p) { return p.id; });
        s.distances = s.distances || {};
        s.initialEquips = s.initialEquips || Object.fromEntries(s.players.map(function (p) { return [p.id, clone(p.equips)]; }));
        s.bonus = s.bonus || 0;
        s.events = [];
        return s;
    }
    function finishDeath(s) {
        var rules = s.ending;
        if (!rules || s.ended) return;
        var living = s.players.filter(function (p) { return p.alive; }), result;
        if (rules.kind === "two") {
            if (!living.some(function (p) { return rules.sides[p.id] === rules.side; })) result = -1;
            else if (!living.some(function (p) { return rules.sides[p.id] !== rules.side; })) result = 1;
        } else if (rules.kind === "identity") {
            var leader = actor(s, rules.leader), roles = rules.roles, known = living.every(function (p) { return !!roles[p.id]; });
            var loyal = ["zhu", "zhong", "mingzhong"].includes(rules.role);
            if (leader && !leader.alive) {
                result = 0;
                if (loyal) result = -1;
                else if (rules.role === "commoner") result = 1;
                else if (rules.role === "fan" && living.some(function (p) { return ["fan", "zhong", "mingzhong"].includes(roles[p.id]); })) result = 1;
                else if (rules.role === "fan" && living.filter(function (p) { return roles[p.id] === "nei"; }).length > 1) result = 1;
                else if (rules.role === "nei") {
                    if (!actor(s, s.owner).alive || living.some(function (p) { return p.id !== s.owner && roles[p.id] && roles[p.id] !== "commoner"; })) result = -1;
                    else if (known) result = 1;
                } else if (known) result = -1;
            } else if (leader && known && !living.some(function (p) { return roles[p.id] === "fan" || roles[p.id] === "nei"; })) result = loyal || rules.role === "commoner" ? 1 : -1;
        }
        if (result !== undefined) { s.ended = true; s.terminal = result; s.events.push({ type: "terminal", result: result }); }
    }
    function equipped(p, name) { return p.equips.some(function (c) { return c.name === name; }); }
    var equipmentStats = new WeakMap();
    function stats(cards) {
        var result = equipmentStats.get(cards);
        if (result) return result;
        result = { from: 0, to: 0, range: -Infinity };
        cards.forEach(function (c) { result.from += c.globalFrom || 0; result.to += c.globalTo || 0; result.range = Math.max(result.range, c.range || 1); });
        equipmentStats.set(cards, result); return result;
    }
    function distance(s, u, t) {
        var old = s.initialEquips && s.initialEquips[u.id], oldTarget = s.initialEquips && s.initialEquips[t.id];
        return Math.max(1, (s.distances[u.id + ':' + t.id] || 1) + stats(u.equips).from - (old ? stats(old).from : 0) + stats(t.equips).to - (oldTarget ? stats(oldTarget).to : 0));
    }
    function range(p) { return Math.max(p.baseRange || 1, stats(p.equips).range); }
    function canHit(s, c, u, t) {
        if (!u.alive || !t.alive || u === t) return false;
        if (c.denied && c.denied[u.id + ":" + t.id]) return false;
        return distance(s, u, t) <= range(u) + (c.rangeExtra || 0);
    }
    function predictedTargets(s, c, u) {
        var others = s.players.filter(function (p) { return p.alive && p.id !== u.id; });
        if (c.type === "equip") return u.equipDisabled && u.equipDisabled.includes(c.subtype) ? [] : [[u.id]];
        if (["tao", "jiu", "wuzhong"].includes(c.name)) return c.name !== "tao" || u.hp < u.maxHp ? [[u.id]] : [];
        if (c.name === "sha") return others.filter(function (t) { return canHit(s, c, u, t); }).map(function (t) { return [t.id]; });
        if (c.name === "jiedao") {
            var groups = [];
            others.filter(function (p) { return p.equips.some(function (e) { return e.subtype === "equip1"; }); }).forEach(function (p) {
                s.players.filter(function (t) { return canHit(s, { name: "sha" }, p, t); }).forEach(function (t) { groups.push([p.id, t.id]); });
            });
            return groups;
        }
        if (["nanman", "wanjian"].includes(c.name)) return [others.map(function (p) { return p.id; })];
        if (["taoyuan", "wugu"].includes(c.name)) return [s.players.filter(function (p) { return p.alive && (c.name !== "taoyuan" || p.hp < p.maxHp); }).map(function (p) { return p.id; })];
        if (c.name === "tiesuo") {
            var all = s.players.filter(function (p) { return p.alive; }), result = [];
            all.forEach(function (p, i) { result.push([p.id]); all.slice(i + 1).forEach(function (q) { result.push([p.id, q.id]); }); });
            return result;
        }
        if (c.name === "huogong") return s.players.filter(function (p) { return p.alive && handCount(s, p) > 0; }).map(function (p) { return [p.id]; });
        if (c.name === "juedou") return others.map(function (p) { return [p.id]; });
        if (["guohe", "shunshou", "lebu", "bingliang"].includes(c.name)) return others.filter(function (p) {
            if (c.name === "shunshou" && distance(s, u, p) > 1 || c.name === "bingliang" && distance(s, u, p) > 1) return false;
            return c.type === "delay" ? !p.judges.some(function (j) { return j.name === c.name; }) : handCount(s, p) + p.equips.length + p.judges.length > 0;
        }).map(function (p) { return [p.id]; });
        return (c.groups && c.groups[u.id] || []).filter(function (group) { return group.every(function (id) { return actor(s, id).alive; }); });
    }
    function enumerate(s, root, cardFilter) {
        if (!actor(s, s.owner).alive) return [];
        if (root && s.roots) return s.roots.slice();
        var result = [];
        s.players.filter(function (p) { return p.alive; }).forEach(function (p) {
            if (!s.quota.damage) result.push(action("damage", null, p.id, [s.owner]));
            if (!s.quota.remove && p.mark) result.push(action("remove", null, s.owner, [p.id]));
        });
        s.hand.forEach(function (c) {
            if (cardFilter && !cardFilter(c)) return;
            s.players.forEach(function (u) {
                if (!u.alive || c.enabled && c.enabled[u.id] === false) return;
                ["normal", "puppet"].forEach(function (kind) {
                    if (kind === "normal" && u.id !== s.owner || kind === "puppet" && !u.mark) return;
                    if (c.name === "sha" && (kind === "puppet" ? s.quota.puppetSha : s.quota.normalSha >= (equipped(u, "zhuge") ? 100 : s.shaLimit || 1))) return;
                    if (c.name === "jiu" && kind === "normal" && s.quota.normalJiu >= 1) return;
                    predictedTargets(s, c, u).forEach(function (targets) { result.push(action(kind, c.id, u.id, targets)); });
                });
            });
        });
        return result;
    }
    function handCount(s, p) { return (p.id === s.owner ? s.hand : p.known).length + p.unknown; }
    function consume(s, p, c, selfHealing) {
        var cards = p.id === s.owner ? s.hand : p.known;
        var index = cards.findIndex(function (v) { return v.id === c.id; });
        if (index >= 0 && p.id === s.owner && selfSaveCard(s, cards[index]) && reliableReserves(s) === 1 && !selfHealing) s.reserveUnsafe = true;
        if (index >= 0) { var remaining = cards.slice(0, index).concat(cards.slice(index + 1)); if (p.id === s.owner) s.hand = remaining; else p.known = remaining; }
        else p.unknown = Math.max(0, p.unknown - 1);
    }
    function draw(s, p, n) { if (!s.ended && p.alive) { p.unknown += n; p.noResponse = {}; } }
    function recover(p, n) { if (p.alive) p.hp = Math.min(p.maxHp, p.hp + n); }
    function rescue(s, target) {
        var rescuers = [target].concat(s.players.filter(function (p) { return p !== target && p.alive && p.attitude * target.attitude > 0; }));
        rescuers.forEach(function (p) {
            var cards = p.id === s.owner ? s.hand : p.known;
            cards.slice().forEach(function (c) {
                if (target.hp <= 0 && (c.name === "tao" || p === target && c.name === "jiu") && (p.id !== s.owner || p !== target || selfSaveCard(s, c))) { consume(s, p, c, p === target); target.hp++; }
            });
        });
        if (target.hp > 0) return one(s);
        var states = one(s);
        rescuers.forEach(function (rescuer) {
            states = bind(states, function (next) {
                var dying = actor(next, target.id), p = actor(next, rescuer.id);
                if (dying.hp > 0 || !p.unknown) return one(next);
                var count = p.unknown, rate = p.id === dying.id ? 0.09 : 0.045, branches = [], probabilities = {};
                var chance = Math.pow(1 - rate, count);
                for (var n = 0; n <= count; n++) {
                    if (n > 0) chance *= (count - n + 1) / n * rate / (1 - rate);
                    if (chance <= 0) continue;
                    var paid = Math.min(n, 1 - dying.hp); probabilities[paid] = (probabilities[paid] || 0) + chance;
                }
                Object.keys(probabilities).forEach(function (amount) { var branch = copyState(next), paid = Number(amount); actor(branch, target.id).hp += paid; actor(branch, rescuer.id).unknown -= paid; branches.push({ probability: probabilities[amount], state: branch }); });
                return branches;
            });
        });
        states.forEach(function (o) { if (actor(o.state, target.id).hp <= 0) { actor(o.state, target.id).alive = false; finishDeath(o.state); } });
        return states;
    }
    function damage(s, sourceId, targetId, amount, nature, chain, ignoreArmor) {
        var source = actor(s, sourceId), target = actor(s, targetId);
        if (s.ended || !target.alive) return one(s);
        var n = amount;
        if (nature === "fire" && equipped(target, "tengjia") && !ignoreArmor) n++;
        if (equipped(target, "baiyin") && !ignoreArmor) n = Math.min(n, 1);
        if (target.id === s.owner && source.alive) {
            if (source.mark) { source.mark = false; recover(target, 1); }
            else { source.mark = true; s.freshMarks.push(source.id); }
        }
        var armor = Math.min(target.armor, n);
        target.armor -= armor;
        target.hp -= n - armor;
        if (target.id === s.owner && target.hp <= 0) s.selfDanger = true;
        var outcomes = target.hp <= 0 ? rescue(s, target) : one(s);
        return bind(outcomes, function (next) {
            var victim = actor(next, targetId), attacker = actor(next, sourceId);
            next.events.push({ type: "damage", source: sourceId, target: targetId, num: n, armor: armor });
            if (!next.damageSources.includes(sourceId)) next.damageSources.push(sourceId);
            if (attacker.mark && !attacker.used) {
                attacker.used = true;
                if (victim.alive) { if (!victim.mark) next.freshMarks.push(victim.id); victim.mark = true; }
                var owner = actor(next, next.owner); draw(next, owner, n);
                next.events.push({ type: "blood", source: sourceId, num: owner.alive ? n : 0 });
            }
            var branches = one(next);
            if (nature && victim.linked && !chain) {
                victim.linked = false;
                next.chainOrder.map(function (id) { return actor(next, id); }).filter(function (p) { return p && p.alive && p.linked && p !== victim; }).forEach(function (p) {
                    branches = bind(branches, function (state) { actor(state, p.id).linked = false; return damage(state, sourceId, p.id, n, nature, true); });
                });
            }
            return branches;
        });
    }
    function response(s, id, name) {
        var p = actor(s, id), cards = p.id === s.owner ? s.hand : p.known;
        var known = cards.find(function (c) { return c.name === name; });
        var chance = known ? 1 : p.unknown ? 1 - Math.pow(1 - (name === "sha" ? 0.27 : 0.16) * (p.noResponse[name] ? 0.25 : 1), p.unknown) : 0;
        if (!chance) return [{ probability: 1, state: copyState(s), answered: false }];
        var yes = copyState(s), yp = actor(yes, id);
        consume(yes, yp, known || { id: "unknown" });
        var no = copyState(s), noPlayer = actor(no, id); noPlayer.noResponse = Object.assign({}, noPlayer.noResponse); noPlayer.noResponse[name] = true;
        var result = [{ probability: chance, state: yes, answered: true }];
        if (chance < 1) result.push({ probability: 1 - chance, state: no, answered: false });
        return result;
    }
    function stateKey(s) { return JSON.stringify([s.ended, s.terminal, s.selfDanger, s.reserveUnsafe, s.players.map(function (p) { return [p.id, p.hp, p.armor, p.alive, p.mark, p.used, p.drunk, p.linked, p.unknown, p.known.map(function (c) { return c.id; }), p.equips.map(function (c) { return c.id; }), p.judges.map(function (c) { return c.id; }), p.noResponse]; }), s.hand.map(function (c) { return c.id; }), s.quota, s.bonus, s.freshMarks, s.damageSources]); }
    function earlierPath(a, b) {
        for (var i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] !== b[i]) return a[i] < b[i]; }
        return a.length < b.length;
    }
    function mergeOutcomes(outcomes, scope) {
        if (!scope || outcomes.length <= 64) return outcomes;
        var grouped = new Map();
        outcomes.forEach(function (o, index) {
            var key = stateKey(o.state), entry = grouped.get(key);
            var peak = o.peak === undefined ? o.probability : o.peak, order = o.pathOrder || [index];
            if (!entry) grouped.set(key, { probability: o.probability, state: o.state, peak: peak, pathOrder: order, paths: o.paths || 1 });
            else {
                entry.probability += o.probability; entry.paths += o.paths || 1;
                if (peak > entry.peak || peak === entry.peak && earlierPath(order, entry.pathOrder)) { entry.peak = peak; entry.pathOrder = order; }
            }
        });
        scope.coverage.mergedOutcomes += outcomes.length - grouped.size;
        return Array.from(grouped.values());
    }
    function bind(outcomes, fn) {
        var result = [];
        outcomes.forEach(function (o, i) {
            charge(o.state);
            (o.state.ended ? one(o.state) : fn(o.state)).forEach(function (v, j) {
                charge(v.state);
                var next = { probability: o.probability * v.probability, state: v.state };
                if (transitionScopes.has(o.state)) {
                    next.peak = (o.peak === undefined ? o.probability : o.peak) * v.probability;
                    next.pathOrder = (o.pathOrder || [i]).concat([j]);
                    next.paths = (o.paths || 1) * (v.paths || 1);
                }
                result.push(next);
            });
        });
        return result;
    }
    function one(s) { return [{ probability: 1, state: s }]; }
    function expected(outcomes) { return outcomes.reduce(function (v, o) { return v + o.probability * utility(o.state); }, 0); }
    function optional(s, user, baseline, candidate) {
        var direction = actor(s, user).attitude < 0 ? -1 : 1;
        if (user === s.owner) {
            var wins = function (outcomes) { return outcomes.every(function (o) { return o.state.terminal === 1; }); };
            if (wins(candidate) !== wins(baseline)) return wins(candidate) ? candidate : baseline;
            var safe = function (outcomes) { return outcomes.every(function (o) { return actor(o.state, s.owner).alive && !o.state.selfDanger && !o.state.reserveUnsafe; }); };
            if (safe(candidate) !== safe(baseline)) return safe(candidate) ? candidate : baseline;
        }
        return direction * (expected(candidate) - expected(baseline)) > EPS ? candidate : baseline;
    }
    function strikeDamage(s, c, user, target, amount, ignoreArmor) {
        var victim = actor(s, target), materials = (target === s.owner ? s.hand : victim.known).concat(victim.equips).filter(function (v) { return v.discardable !== false; });
        for (var i = 0; i < Math.min(2, victim.unknown); i++) materials.push({ id: "unknown-" + i });
        var result = damage(copyState(s), user, target, amount, c.nature, false, ignoreArmor);
        if (c.name !== "sha" || !equipped(actor(s, user), "hanbing") || !materials.length) return result;
        for (var i = 0; i < materials.length; i++) for (var j = materials.length === 1 ? i : i + 1; j < materials.length; j++) {
            var next = copyState(s), p = actor(next, target);
            (i === j ? [materials[i]] : [materials[i], materials[j]]).forEach(function (v) {
                if (p.equips.some(function (e) { return e.id === v.id; })) {
                    p.equips = p.equips.filter(function (e) { return e.id !== v.id; });
                    if (v.name === "baiyin") recover(p, 1);
                } else consume(next, p, v);
            });
            next.events.push({ type: "hanbing", source: user, target: target });
            result = optional(s, user, result, one(next));
        }
        return result;
    }
    function strike(s, c, user, target, amount, responseName, converted) {
        var p = actor(s, target), u = actor(s, user);
        if (!converted && c.name === "sha" && !c.nature && equipped(u, "zhuque")) {
            return optional(s, user, strike(s, c, user, target, amount, responseName, true), strike(copyState(s), Object.assign({}, c, { nature: "fire" }), user, target, amount, responseName, true));
        }
        var ignoreArmor = c.name === "sha" && equipped(u, "qinggang");
        if (!p.alive || equipped(p, "tengjia") && !c.nature && !ignoreArmor || equipped(p, "renwang") && c.color === "black" && c.name === "sha" && !ignoreArmor) return one(s);
        var replies = response(s, target, responseName || "shan");
        if (equipped(p, "bagua") && !ignoreArmor && (responseName || "shan") === "shan") {
            replies = [{ probability: 0.5, state: copyState(s), answered: true }].concat(replies.map(function (r) { r.probability *= 0.5; return r; }));
        }
        var results = [];
        replies.forEach(function (o) {
            var branches = one(o.state);
            if (!o.answered) {
                branches = strikeDamage(o.state, c, user, target, amount + (c.name === "sha" && equipped(u, "guding") && handCount(o.state, actor(o.state, target)) === 0 ? 1 : 0), ignoreArmor);
            } else if (c.name === "sha" && equipped(u, "qinglong")) {
                var current = actor(o.state, user), materials = (user === s.owner ? o.state.hand : current.known).filter(function (v) { return v.name === "sha" && (!v.responseDenied || !v.responseDenied[user + ":" + target]); });
                materials.forEach(function (v) {
                    var next = copyState(o.state); consume(next, actor(next, user), v);
                    branches = optional(o.state, user, branches, strike(next, v, user, target, 1));
                });
                if (!materials.length && current.unknown) {
                    var probability = 1 - Math.pow(0.73, current.unknown), next = copyState(o.state);
                    actor(next, user).unknown--;
                    var follow = strike(next, { name: "sha" }, user, target, 1).map(function (v) { v.probability *= probability; return v; });
                    follow.push({ probability: 1 - probability, state: copyState(o.state) });
                    branches = optional(o.state, user, branches, follow);
                }
            } else if (c.name === "sha" && equipped(u, "guanshi")) {
                var current = actor(o.state, user), costs = (user === s.owner ? o.state.hand : current.known).concat(current.equips.filter(function (e) { return e.name !== "guanshi"; })).filter(function (v) { return v.discardable !== false; });
                for (var i = 0; i < Math.min(2, current.unknown); i++) costs.push({ id: "unknown-" + i, unknown: true });
                for (var i = 0; i < costs.length; i++) for (var j = i + 1; j < costs.length; j++) {
                    var next = copyState(o.state), payer = actor(next, user);
                    [costs[i], costs[j]].forEach(function (v) {
                        if (payer.equips.some(function (e) { return e.id === v.id; })) { payer.equips = payer.equips.filter(function (e) { return e.id !== v.id; }); if (v.name === "baiyin") recover(payer, 1); }
                        else consume(next, payer, v);
                    });
                    branches = optional(o.state, user, branches, damage(next, user, target, amount, c.nature, false, ignoreArmor));
                }
            }
            branches.forEach(function (v) { results.push({ probability: o.probability * v.probability, state: v.state }); });
        });
        return results;
    }
    function duel(s, first, second, limit, amount) {
        if (limit <= 0) return damage(s, second, first, amount);
        var result = [];
        response(s, first, "sha").forEach(function (o) {
            var branches = o.answered ? duel(o.state, second, first, limit - 1, amount) : damage(o.state, second, first, amount);
            branches.forEach(function (v) { result.push({ probability: o.probability * v.probability, state: v.state }); });
        });
        return result;
    }
    function equip(s, p, c) {
        var replaced = p.equips.filter(function (e) { return e.subtype === c.subtype; });
        p.equips = p.equips.filter(function (e) { return e.subtype !== c.subtype; });
        if (replaced.some(function (e) { return e.name === "baiyin"; })) recover(p, 1);
        p.equips.push(c);
    }
    function fireAttack(s, c, user, target) {
        var u = actor(s, user), t = actor(s, target);
        var cards = u.id === s.owner ? s.hand : u.known;
        var targetCards = t.id === s.owner ? s.hand : t.known;
        if (!handCount(s, t)) return one(s);
        var suits = ["spade", "heart", "club", "diamond"];
        var visible = targetCards.map(function (v) { return v.suit; });
        var possible = t.unknown ? suits : Array.from(new Set(visible));
        var outcomes = [];
        possible.forEach(function (suit) {
            var match = cards.find(function (v) { return v.suit === suit; });
            var p = match ? 1 : 1 - Math.pow(0.75, u.unknown);
            var hit = copyState(s);
            if (p > 0) {
                consume(hit, actor(hit, user), match || { id: "unknown" });
                damage(hit, user, target, 1, "fire").forEach(function (o) { outcomes.push({ probability: p / possible.length * o.probability, state: o.state }); });
            }
            if (p < 1) outcomes.push({ probability: (1 - p) / possible.length, state: copyState(s) });
        });
        return outcomes.length ? outcomes : one(s);
    }
    function weaponTransfer(s, from, to) {
        var p = actor(s, from), u = actor(s, to), weapons = p.equips.filter(function (e) { return e.subtype === "equip1"; });
        p.equips = p.equips.filter(function (e) { return e.subtype !== "equip1"; });
        weapons.forEach(function (e) { if (u.id === s.owner) s.hand = s.hand.concat(e); else u.known = u.known.concat(e); });
        return one(s);
    }
    function borrowedSword(s, a, c) {
        var attacker = actor(s, a.targets[0]), target = actor(s, a.targets[1]);
        var materials = (attacker.id === s.owner ? s.hand : attacker.known).filter(function (v) {
            return v.name === "sha" && canHit(s, v, attacker, target) && (!v.responseDenied || !v.responseDenied[attacker.id + ":" + target.id]);
        });
        if (attacker.id === s.owner) {
            var choices = [weaponTransfer(copyState(s), attacker.id, a.user)];
            materials.forEach(function (v) {
                var next = copyState(s), user = actor(next, attacker.id), amount = 1 + user.drunk;
                consume(next, user, v); user.drunk = 0;
                choices.push(strike(next, v, user.id, target.id, amount));
            });
            choices.sort(function (x, y) { return y.reduce(function (v, o) { return v + o.probability * utility(o.state); }, 0) - x.reduce(function (v, o) { return v + o.probability * utility(o.state); }, 0); });
            return choices[0];
        }
        var willing = attacker.attitude * target.attitude <= 0 ? 1 : 0.25;
        var probability = (materials.length ? 1 : 1 - Math.pow(0.73, attacker.unknown)) * willing;
        var result = weaponTransfer(copyState(s), attacker.id, a.user).map(function (o) { o.probability *= 1 - probability; return o; });
        if (probability) {
            var next = copyState(s), u = actor(next, attacker.id), sha = materials[0] || { name: "sha" };
            consume(next, u, sha); var amount = 1 + u.drunk; u.drunk = 0;
            result = result.concat(strike(next, sha, attacker.id, target.id, amount).map(function (o) { o.probability *= probability; return o; }));
        }
        return result.filter(function (o) { return o.probability > 0; });
    }
    function counterspell(position, result) {
        var delta = expected(result) - utility(position), remaining = 1, counters = [];
        position.players.forEach(function (p) {
            if (!p.alive || p.id === position.owner || p.attitude * delta >= 0) return;
            var known = p.known.find(function (v) { return v.name === "wuxie"; });
            var probability = (known ? 1 : 1 - Math.pow(0.96, p.unknown)) * 0.7;
            if (!probability) return;
            var next = copyState(position); next.events.push({ type: "wuxie", source: p.id });
            consume(next, actor(next, p.id), known || { id: "unknown" });
            counters.push({ probability: remaining * probability, state: next }); remaining *= 1 - probability;
        });
        return result.map(function (o) { return { probability: o.probability * remaining, state: o.state }; }).concat(counters);
    }
    function transfer(position, a) {
        if (position.ended) return one(copyState(position));
        var result = resolveAction(position, a), c = cardOf(position, a.card);
        if (!c || c.type !== "trick" && c.type !== "delay" || ["wuxie", "nanman", "wanjian", "tiesuo", "taoyuan", "wugu"].includes(c.name)) return result;
        var spent = copyState(position); spent.events = []; spent.freshMarks = []; spent.damageSources = [];
        consume(spent, actor(spent, spent.owner), c);
        return counterspell(spent, result);
    }
    function resolveAction(position, a) {
        var s = copyState(position); s.events = []; s.freshMarks = []; s.damageSources = [];
        var owner = actor(s, s.owner), user = actor(s, a.user);
        if (a.kind === "stop") return one(s);
        if (a.kind === "damage") {
            s.quota.damage = true;
            return bind(damage(s, a.user, s.owner, 1), function (next) { draw(next, actor(next, next.owner), 1); return one(next); });
        }
        if (a.kind === "remove") {
            s.quota.remove = true;
            var target = actor(s, a.targets[0]); target.mark = false; recover(target, 1);
            return one(s);
        }
        var c = cardOf(s, a.card);
        if (!c) throw new Error("Missing planned material " + a.card);
        consume(s, owner, c, c.name === "tao" && user.id === s.owner && owner.hp < owner.maxHp);
        if (c.name === "sha") {
            if (a.kind === "puppet") s.quota.puppetSha = true;
            else s.quota.normalSha++;
            var amount = 1 + user.drunk; user.drunk = 0;
            var hits = one(s);
            a.targets.forEach(function (id) { hits = bind(hits, function (next) { return strike(next, c, user.id, id, amount); }); });
            return hits;
        }
        if (c.name === "juedou") return duel(s, a.targets[0], user.id, handCount(s, user) + handCount(s, actor(s, a.targets[0])) + 1, c.baseDamage || 1);
        if (c.name === "jiedao") return borrowedSword(s, a, c);
        if (c.name === "huogong") return fireAttack(s, c, user.id, a.targets[0]);
        if (c.type === "equip") { equip(s, user, c); return one(s); }
        if (c.name === "jiu") { user.drunk++; if (a.kind === "normal") s.quota.normalJiu++; return one(s); }
        if (["nanman", "wanjian"].includes(c.name)) {
            var outcomes = one(s);
            a.targets.forEach(function (id) { outcomes = mergeOutcomes(bind(outcomes, function (next) { return counterspell(next, strike(next, c, user.id, id, 1, c.name === "nanman" ? "sha" : "shan")); }), transitionScopes.get(s)); });
            return outcomes;
        }
        if (["tiesuo", "taoyuan", "wugu"].includes(c.name)) {
            var outcomes = one(s);
            a.targets.forEach(function (id) { outcomes = bind(outcomes, function (before) {
                var next = copyState(before), target = actor(next, id);
                if (c.name === "tiesuo") target.linked = !target.linked;
                else if (c.name === "taoyuan") recover(target, 1);
                else draw(next, target, 1);
                return counterspell(before, one(next));
            }); });
            return outcomes;
        }
        if (c.damage) {
            var generic = one(s);
            a.targets.forEach(function (id) { generic = bind(generic, function (next) { return damage(next, user.id, id, c.damage, c.nature); }); });
            return generic;
        }
        a.targets.forEach(function (id) {
            var t = actor(s, id);
            if (c.name === "tao" || c.name === "taoyuan") recover(t, 1);
            else if (c.name === "wuzhong") draw(s, t, 2);
            else if (c.name === "wugu") draw(s, t, 1);
            else if (c.name === "tiesuo") t.linked = !t.linked;
            else if (c.type === "delay") t.judges = t.judges.concat(c);
            else if (c.name === "guohe" || c.name === "shunshou") {
                var removed;
                if (t.attitude > 0 && t.judges.length) { removed = t.judges[0]; t.judges = t.judges.slice(1); }
                else if (t.equips.length) { removed = t.equips[t.equips.length - 1]; t.equips = t.equips.slice(0, -1); if (removed.name === "baiyin") recover(t, 1); }
                else if (t.id === s.owner && s.hand.length) { removed = s.hand[s.hand.length - 1]; consume(s, t, removed); }
                else if (t.known.length) { removed = t.known[t.known.length - 1]; t.known = t.known.slice(0, -1); }
                else if (t.unknown) { t.unknown--; removed = { unknown: true }; }
                if (c.name === "shunshou" && removed) {
                    if (removed.unknown) draw(s, user, 1);
                    else if (user.id === s.owner) s.hand = s.hand.concat(removed);
                    else user.known = user.known.concat(removed);
                }
            } else {
                if (c.recover) recover(t, c.recover);
                if (c.draw) draw(s, t, c.draw);
                s.bonus += (c.targetValue || 0) * t.attitude;
            }
        });
        if (!a.targets.length) s.bonus += (c.playerValue || 0) * user.attitude;
        return one(s);
    }
    function distinct(s, actions) {
        var seen = new Set();
        return actions.filter(function (a) {
            var c = cardOf(s, a.card);
            var key = [a.kind, c ? [c.name, c.nature, c.suit, c.subtype, c.range, c.discardable, c.rescueEnabled].join(":") : "", a.user, a.targets.join(",")].join("|");
            if (seen.has(key)) return false;
            seen.add(key); return true;
        });
    }
    function opportunities(s, previous, initialCard, stage, closed) {
        if (closed) return enumerate(s, false, function () { return false; }).filter(function (a) { return a.kind === "remove"; });
        var name = initialCard && initialCard.name;
        var all = distinct(s, enumerate(s, false, function (c) {
            if (previous.kind === "damage") return c.name === "tao" || c.type === "equip";
            if (name === "jiu") return c.name === "jiu" || c.name === "sha";
            if (name === "jiedao") return c.name === "sha";
            if (name === "tiesuo" || name === "tengjia") return c.name === "sha" || c.name === "huogong" || name === "tengjia" && c.name === "wuzhong";
            if (initialCard && initialCard.type === "equip") return c.type === "equip" || c.name === "sha" || c.name === "jiu" || c.name === "huogong";
            if (name === "tao") return c.name === "tao";
            if (["sha", "juedou", "nanman", "wanjian"].includes(name)) return true;
            return false;
        }));
        return all.filter(function (a) {
            var c = cardOf(s, a.card);
            if (a.kind === "remove") return true;
            if (closed) return false;
            if (previous.kind === "remove" && a.kind === "damage") return !initialCard;
            if ((name === "sha" || name === "juedou" || name === "nanman" || name === "wanjian") && a.kind === "damage") return s.damageSources.includes(a.user);
            if (!c) return false;
            if (name === "jiu") return a.user === initialCard.preparedUser && (c.name === "jiu" || c.name === "sha");
            if (name === "jiedao") return c.name === "sha" && a.targets.includes(initialCard.focus);
            if (name === "tiesuo" || name === "tengjia") return (name === "tiesuo" ? !!c.nature : c.nature === "fire") && c.name === "sha" || c.name === "huogong" || name === "tengjia" && stage < 2 && c.name === "wuzhong";
            if (initialCard && initialCard.type === "equip") return c.type === "equip" || a.user === initialCard.preparedUser && (c.name === "sha" || c.name === "jiu" || c.name === "huogong");
            if (name === "tao") return c.name === "tao";
            if (previous.kind === "damage") return (c.name === "tao" || c.type === "equip") && (a.kind === "normal" && a.user === s.owner || a.kind === "puppet" && s.freshMarks.includes(a.user));
            if (name === "sha" || name === "juedou" || name === "nanman" || name === "wanjian") return c.name === "sha" || a.kind === "puppet" && s.freshMarks.includes(a.user);
            return false;
        });
    }
    function risk(s) {
        var p = actor(s, s.owner);
        return [p.alive ? 0 : 1, p.alive && p.hp <= 1 ? 1 : 0, -s.hand.filter(function (c) { return c.name === "tao" || c.name === "jiu"; }).length, Number(s.quota.puppetSha) + Number(s.quota.remove) + Number(s.quota.damage) + s.quota.normalSha + s.quota.normalJiu];
    }
    function better(a, b) {
        if (a === b) return false;
        if ((a.terminal || 0) !== (b.terminal || 0)) return (a.terminal || 0) > (b.terminal || 0);
        if (a.value > b.value + EPS) return true;
        if (a.value < b.value - EPS) return false;
        for (var i = 0; i < a.risk.length; i++) { if (Math.abs(a.risk[i] - b.risk[i]) > EPS) return a.risk[i] < b.risk[i]; }
        if (!a.line.length && !b.line.length) return false;
        return actionKey(a.line[0] || action("stop", null, "", [])) < actionKey(b.line[0] || action("stop", null, "", []));
    }
    function plan(input, options) {
        options = options || {};
        var start = normalize(input), baseline = utility(start), budget = options.budget === undefined ? 512 : Math.max(0, options.budget);
        var coverage = { roots: 0, ordinaryNodes: 0, coreNodes: 0, ordinaryWork: 0, coreWork: 0, refusedTransitions: 0, mergedOutcomes: 0, rootRawOutcomes: 0, rootUniqueOutcomes: 0, coreTruncated: false, rootsComplete: true, truncated: false, model: "visible-whiteboard-v2" };
        var evidenceCache = new WeakMap();

        /** @type {PolicyContext} */
        var policy = { selfEmergency: actor(start, start.owner).hp <= 1, allyEmergency: start.players.filter(function (p) { return p.id !== start.owner && p.attitude > 0 && p.hp <= 1; }).map(function (p) { return p.id; }), reserve: Math.min(1, reliableReserves(start)) };
        var intents = ["win", "self", "ally", "value"];
        function evidence(s) {
            if (evidenceCache.has(s)) return evidenceCache.get(s);
            var owner = actor(s, s.owner), allyRescues = {}, allyAlive = {};
            policy.allyEmergency.forEach(function (id) { var p = actor(s, id); allyAlive[id] = p.alive; allyRescues[id] = p.alive && p.hp > 1 ? 0 : Infinity; });
            var result = { allyRescues: allyRescues, allyAlive: allyAlive, selfAlive: owner.alive, selfRescue: owner.alive && owner.hp > 1 ? 0 : Infinity,
                allyRescue: Math.min.apply(Math, Object.values(allyRescues)),
                reserveSafe: !s.reserveUnsafe, ownDanger: !owner.alive || !!s.selfDanger };
            evidenceCache.set(s, result); return result;
        }
        var leaves = new WeakMap();
        function leaf(s) { if (leaves.has(s)) return leaves.get(s); var value = { value: utility(s), terminal: s.terminal || 0, risk: risk(s), line: [], evidence: evidence(s) }; leaves.set(s, value); return value; }
        function prefer(a, b, intent) {
            if (a === b) return false;
            var x = a.evidence, y = b.evidence;
            if (intent === "win" && (a.terminal === 1) !== (b.terminal === 1)) return a.terminal === 1;
            if (x.selfAlive !== y.selfAlive) return x.selfAlive;
            if (x.ownDanger !== y.ownDanger) return !x.ownDanger;
            if (intent === "self" && policy.selfEmergency && x.selfRescue !== y.selfRescue) return x.selfRescue < y.selfRescue;
            if (x.reserveSafe !== y.reserveSafe) return x.reserveSafe;
            if (intent === "ally" && policy.allyEmergency.length && x.allyRescue !== y.allyRescue) return x.allyRescue < y.allyRescue;
            return better(a, b);
        }
        function collect(candidates) {
            if (candidates.length === 1) return [candidates[0], candidates[0], candidates[0], candidates[0]];
            return intents.map(function (intent) { return candidates.reduce(function (best, v) { return prefer(v, best, intent) ? v : best; }); });
        }
        function select(candidates) {
            var winning = candidates.filter(function (v) { return v.terminal === 1; });
            if (winning.length) return collect(winning)[0];
            return candidates.reduce(function (best, v) {
                var x = v.evidence, y = best.evidence;
                if (x.selfAlive !== y.selfAlive) return x.selfAlive ? v : best;
                if (x.ownDanger !== y.ownDanger) return x.ownDanger ? best : v;
                if (policy.selfEmergency && x.selfRescue !== y.selfRescue) return x.selfRescue < y.selfRescue ? v : best;
                if (x.reserveSafe !== y.reserveSafe) return x.reserveSafe ? v : best;
                if (policy.allyEmergency.length && x.allyRescue !== y.allyRescue) return x.allyRescue < y.allyRescue ? v : best;
                return better(v, best) ? v : best;
            });
        }
        function evaluate(s, a, tail, account, root) {
            var card = cardOf(s, a.card), area = card && ["nanman", "wanjian"].includes(card.name);
            var scope = { account: account, coverage: coverage }, prior = transitionScopes.get(s), outcomes;
            transitionScopes.set(s, scope);
            try { outcomes = transfer(s, a); if (area) outcomes = mergeOutcomes(outcomes, scope); }
            catch (error) {
                if (error !== WORK_EXHAUSTED) throw error;
                coverage.refusedTransitions++;
                if (account.kind === "ordinary") coverage.truncated = true; else coverage.coreTruncated = true;
                return collect([leaf(s)]);
            } finally { if (prior) transitionScopes.set(s, prior); else transitionScopes.delete(s); }
            if (root) { coverage.rootRawOutcomes += outcomes.reduce(function (sum, o) { return sum + (o.paths || 1); }, 0); coverage.rootUniqueOutcomes += outcomes.length; }
            var available = account && account.remaining;
            var branches = outcomes.map(function (o, index) {
                var branchWork = account && { remaining: Math.floor(available / outcomes.length) + (index < available % outcomes.length ? 1 : 0), spent: 0, kind: account.kind };
                var routes = tail(o.state, index, outcomes.length, branchWork);
                if (account) { account.remaining -= branchWork.spent; account.spent += branchWork.spent; }
                return { probability: o.probability, peak: !area || o.peak === undefined ? o.probability : o.peak, order: area && o.pathOrder || [index], state: o.state, immediate: evidence(o.state), routes: routes };
            });
            return intents.map(function (intent, index) {
                var result = { value: 0, terminal: null, risk: [0, 0, 0, 0], line: [a], evidence: { selfAlive: true, selfRescue: 0, allyRescue: Infinity, allyRescues: Object.fromEntries(policy.allyEmergency.map(function (id) { return [id, 0]; })), allyAlive: Object.fromEntries(policy.allyEmergency.map(function (id) { return [id, true]; })), reserveSafe: true, ownDanger: false }, branches: [] }, likely = -1, likelyOrder = [];
                branches.forEach(function (o) {
                    var v = o.routes[index], immediate = o.immediate, e = result.evidence;
                    result.terminal = result.terminal === null ? v.terminal : result.terminal === v.terminal ? v.terminal : 0;
                    result.value += o.probability * v.value;
                    v.risk.forEach(function (r, i) { result.risk[i] += o.probability * r; });
                    e.selfAlive = e.selfAlive && immediate.selfAlive && v.evidence.selfAlive;
                    e.ownDanger = e.ownDanger || immediate.ownDanger || v.evidence.ownDanger;
                    e.reserveSafe = e.reserveSafe && immediate.reserveSafe && v.evidence.reserveSafe;
                    e.selfRescue = Math.max(e.selfRescue, immediate.selfRescue === 0 ? 1 : 1 + v.evidence.selfRescue);
                    policy.allyEmergency.forEach(function (id) {
                        e.allyAlive[id] = e.allyAlive[id] && immediate.allyAlive[id] && v.evidence.allyAlive[id];
                        var time = immediate.allyRescues[id] === 0 ? 1 : 1 + v.evidence.allyRescues[id];
                        e.allyRescues[id] = e.allyAlive[id] ? Math.max(e.allyRescues[id], time) : Infinity;
                    });
                    result.branches.push({ probability: o.probability, terminal: v.terminal, continuation: v.line, evidence: v.evidence });
                    if (o.peak > likely || o.peak === likely && earlierPath(o.order, likelyOrder)) { likely = o.peak; likelyOrder = o.order; result.line = [a].concat(v.line); }
                });
                result.evidence.allyRescue = Math.min.apply(Math, Object.values(result.evidence.allyRescues));
                return result;
            });
        }
        function account(units, kind) { return { remaining: units, spent: 0, kind: kind }; }
        function priority(s, a) {
            var c = cardOf(s, a.card), owner = actor(s, s.owner);
            if ((a.kind === "remove" || c && c.name === "tao") && a.targets.some(function (id) { var p = actor(s, id); return p.attitude > 0 && p.hp <= 1; })) return a.targets.includes(owner.id) ? 0 : 1;
            return a.kind === "remove" || c && ["tao", "jiu", "sha"].includes(c.name) ? 2 : 3;
        }
        function ordered(s, actions) { return actions.sort(function (a, b) { return priority(s, a) - priority(s, b); }); }
        function search(s, depth, work) {
            var candidates = [leaf(s)];
            if (s.ended || !depth || !actor(s, s.owner).alive) return collect(candidates);
            if (work.remaining <= 0) { coverage.truncated = true; return collect(candidates); }
            for (var a of ordered(s, distinct(s, enumerate(s)))) {
                if (work.remaining <= 0) { coverage.truncated = true; break; }
                coverage.ordinaryNodes++;
                candidates = candidates.concat(evaluate(s, a, function (next, index, count, branchWork) { return search(next, depth - 1, branchWork); }, work));
            }
            return collect(candidates);
        }
        function core(s, previous, initialCard, stage, remaining, lastCard, work) {
            var candidates = [leaf(s)];
            if (s.ended || remaining <= 0 || !actor(s, s.owner).alive) return collect(candidates);
            if (work.remaining <= 0) { coverage.coreTruncated = true; return collect(candidates); }
            var name = initialCard && initialCard.name;
            var closed = lastCard && (lastCard.name === "sha" || lastCard.name === "huogong") && (name === "jiu" || name === "tiesuo" || initialCard && initialCard.type === "equip");
            for (var a of ordered(s, opportunities(s, previous, initialCard, stage, closed))) {
                if (work.remaining <= 0) { coverage.coreTruncated = true; break; }
                coverage.coreNodes++;
                var nextCard = cardOf(s, a.card);
                candidates = candidates.concat(evaluate(s, a, function (next, index, count, branchWork) {
                    var rootCard = initialCard;
                    if (previous.kind === "damage" || nextCard && nextCard.type === "equip") rootCard = nextCard && Object.assign({}, nextCard, { preparedUser: a.user });
                    return core(next, a, rootCard, stage + 1, remaining - 1, closed ? lastCard : nextCard, branchWork);
                }, work));
            }
            return collect(candidates);
        }
        var candidates = [leaf(start)], roots = enumerate(start, true), ranked = [];
        roots.forEach(function (a) {
            coverage.roots++;
            var c = cardOf(start, a.card);
            if (c) c = Object.assign({}, c, { preparedUser: a.user });
            if (c && c.name === "jiedao") c = Object.assign({}, c, { focus: a.targets[1] });
            var routes = evaluate(start, a, function (s, index, count) {
                if (options.horizon === "immediate") return collect([leaf(s)]);
                var ordinaryAccount = account(Math.floor(budget / Math.max(1, roots.length) / count), "ordinary");
                var coreAccount = account(Math.floor(1024 / count), "core");
                var extra = Math.max(4, start.hand.filter(function (v) { return v.name === "jiu" || v.name === "tao" || v.type === "equip"; }).length + 3);
                var required = core(s, a, c, 0, extra, c, coreAccount);
                var ordinary = search(s, 3, ordinaryAccount);
                coverage.ordinaryWork += ordinaryAccount.spent; coverage.coreWork += coreAccount.spent;
                return collect(required.concat(ordinary));
            }, null, true);
            var candidate = select(routes);
            ranked.push({ action: a, score: candidate.terminal === -1 ? Math.min(-1, candidate.value - baseline) : candidate.terminal === 1 ? Math.max(1, candidate.value - baseline) : candidate.value - baseline, terminal: candidate.terminal, continuation: candidate.line.slice(1), risk: candidate.risk, evidence: candidate.evidence, branches: candidate.branches });
            candidates = candidates.concat(routes);
        });
        var best = select(candidates);
        ranked.sort(function (a, b) { var x = Object.assign({ value: a.score, line: [a.action] }, a), y = Object.assign({ value: b.score, line: [b.action] }, b); return select([x, y]) === x ? -1 : 1; });
        return { firstAction: best.line[0] || action("stop", null, start.owner, []), score: best.terminal === 1 || best.line.length && (policy.selfEmergency && best.evidence.selfRescue < Infinity || policy.allyEmergency.length && best.evidence.allyRescue < Infinity) ? Math.max(1, best.value - baseline) : best.value - baseline, continuation: best.line.slice(1), coverage: coverage, ranked: ranked, policy: policy, evidence: best.evidence, branches: best.branches || [] };
    }

    // luofei-benchmark/design/challenge-winner.cjs SHA-256 cec479fc1c341422f5dec35aa090253642a9f3d34ade4940bd74a640aa342cb1
    function winnerFactory() {
        var module = { exports: {} };
// BEGIN EXACT BENCHMARK WINNER
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
// END EXACT BENCHMARK WINNER
        return { decide: module.exports.decide, rules: CARD_RULES };
    }

    function winnerObservation(position, rules) {
        var slots = { equip1: "weapon", equip2: "armor", equip3: "defhorse", equip4: "offhorse" };
        function visibleCard(c) {
            if (!rules[c.name]) throw new Error("unsupported-card:" + c.name);
            var value = { id: c.id, name: c.name, suit: c.suit || "spade", rank: c.rank == null ? 7 : c.rank };
            if (!["spade", "heart", "club", "diamond"].includes(value.suit) || !Number.isInteger(value.rank) || value.rank < 1 || value.rank > 13) throw new Error("unsupported-card-properties");
            if (c.nature) {
                if (c.name !== "sha" || !["fire", "thunder"].includes(c.nature)) throw new Error("unsupported-nature");
                value.nature = c.nature;
            }
            return value;
        }
        var hand = position.hand.map(visibleCard);
        var players = position.players.map(function (p) {
            if (p.alive && p.id !== position.owner && p.attitude === 0) throw new Error("unsupported-neutral-attitude");
            if (p.armor) throw new Error("unsupported-hujia");
            var equipment = {};
            p.equips.forEach(function (c) {
                var value = visibleCard(c), slot = slots[c.subtype];
                if (!slot || rules[c.name].slot !== slot) throw new Error("unsupported-equipment");
                equipment[slot] = value;
            });
            return { id: p.id, team: p.id === position.owner || p.attitude >= 0 ? "ally" : "enemy", sex: p.sex || "none", hp: p.hp, maxHp: p.maxHp, alive: p.alive,
                handCount: p.id === position.owner ? hand.length : p.known.length + p.unknown, equipment: equipment, judgments: p.judges.map(visibleCard), mark: p.mark, linked: p.linked, armor: 0, wine: p.drunk };
        });
        var legal = position.roots.map(function (a) {
            if (a.kind === "normal" || a.kind === "puppet") return { type: "play", mode: a.kind, card: a.card, user: a.user, targets: a.targets.slice() };
            return { type: "shisheng", option: a.kind, target: a.kind === "damage" ? a.user : a.targets[0] };
        });
        legal.push({ type: "endPlay" });
        return { status: "choice", owner: position.owner, actor: position.owner, turn: 1, phase: "play", request: { id: 1, kind: "play", actor: position.owner }, legalActions: legal, ownerHand: hand, players: players,
            quotas: { puppetSha: position.quota.puppetSha, shishengDamage: position.quota.damage, shishengRemove: position.quota.remove, normalSha: position.quota.normalSha, normalJiu: position.quota.normalJiu, usedSources: position.players.filter(function (p) { return p.used; }).map(function (p) { return p.id; }) }, events: [] };
    }
    function identityFriendlyElementalChain(position, chosen) {
        if (!position.ending || position.ending.kind !== "identity" || !["normal", "puppet"].includes(chosen.kind)) return false;
        var card = cardOf(position, chosen.card), user = actor(position, chosen.user);
        if (!card || !(card.name === "huogong" || card.name === "sha" && (["fire", "thunder"].includes(card.nature) || !card.nature && user && equipped(user, "zhuque")))) return false;
        var linked = position.players.filter(function (p) { return p.alive && p.linked; });
        return linked.length >= 2 && linked.some(function (p) { return chosen.targets.includes(p.id); }) && linked.some(function (p) { return p.id === position.owner || p.attitude > 0; });
    }
    function winnerPlan(position) {
        var winner = winnerFactory(), view;
        try { view = winnerObservation(position, winner.rules); }
        catch (error) { return Object.assign(plan(position), { source: "native-fallback", fallbackReason: error.message }); }
        var chosen = winner.decide(view), index = view.legalActions.findIndex(function (a) { return JSON.stringify(a) === JSON.stringify(chosen); });
        if (index < 0) throw new Error("Benchmark winner returned a non-native root");
        var first = position.roots[index] || action("stop", null, position.owner, []);
        if (identityFriendlyElementalChain(position, first)) return Object.assign(plan(position), { source: "native-fallback", fallbackReason: "identity-friendly-elemental-chain" });
        var ranked = position.roots.map(function (a) { return { action: a, recommended: a === first }; });
        ranked.sort(function (a, b) { return Number(b.recommended) - Number(a.recommended); });
        return { source: "benchmark-winner", firstAction: first, score: first.kind === "stop" ? 0 : 1, continuation: [], ranked: ranked, coverage: { roots: position.roots.length }, observation: view };
    }

    function create(env) {
        var lib = env.lib, game = env.game, get = env.get, ui = env.ui, status = env._status, rules = env.rules;
        var cache = new WeakMap(), responseCache = new WeakMap(), wrappers = new WeakMap(), attempts = new WeakMap(), failures = new WeakMap(), busy = 0, cacheEnabled = true, last;
        function id(p) { return String(p.playerid || game.players.indexOf(p)); }
        function cardId(c) { return String(c.cardid || "hand-" + game.players.flatMap(function (p) { return p.getCards("e"); }).indexOf(c)); }
        function phase(event, owner) { return rules.phaseOf(event, owner); }
        function ownPhase(event, owner) {
            return event && event.player === owner && event.name === "chooseToUse" && event.type === "phase" && phase(event, owner) && (!event.skill || event.skill === "nihil_jie_yulei_active" || event.skill === "nihil_jie_shicheng_backup");
        }
        function context(fields, fn) {
            var event = get.event(), saved = {};
            Object.keys(fields).concat(["addCount_extra"]).forEach(function (key) { saved[key] = Object.getOwnPropertyDescriptor(event, key); });
            Object.assign(event, fields);
            try { return fn(); }
            finally { Object.keys(saved).forEach(function (key) { if (saved[key]) Object.defineProperty(event, key, saved[key]); else delete event[key]; }); }
        }
        function trueIdentityAttitudes(owner) {
            if (!get.mode || get.mode() !== "identity" || status.mode !== undefined && status.mode !== "normal" || status.brawl || !game.zhu || !game.zhu.isZhu || typeof get.realAttitude !== "function") return null;
            if (owner._trueMe || owner.ai && owner.ai.modAttitudeFrom || status.ai && status.ai.customAttitude && status.ai.customAttitude.length) return null;
            var saved = new Map(), attitudes = new Map();
            for (var p of game.players) {
                var ai = p.ai;
                if (!ai || typeof ai !== "object" || ai.modAttitudeTo || p.isMad && p.isMad()) return null;
                if (saved.has(ai)) continue;
                var descriptor = Object.getOwnPropertyDescriptor(ai, "shown");
                if (descriptor ? !("value" in descriptor) || !descriptor.writable && !descriptor.configurable : !Object.isExtensible(ai)) return null;
                saved.set(ai, descriptor);
            }
            try {
                for (var entry of saved) Object.defineProperty(entry[0], "shown", entry[1] ? Object.assign({}, entry[1], { value: 1 }) : { value: 1, writable: true, enumerable: true, configurable: true });
                for (var target of game.players) attitudes.set(target, get.realAttitude(owner, target));
                return attitudes;
            } finally {
                for (var entry of Array.from(saved).reverse()) {
                    if (entry[1]) Object.defineProperty(entry[0], "shown", entry[1]);
                    else delete entry[0].shown;
                }
            }
        }
        function capture(owner, event, options) {
            var actions = !options || options.actions !== false;
            var people = game.players.filter(function (p) { return p.isIn(); }), realCards = owner.getCards("h"), turn = event.getParent("phase", true), usePhase = phase(event, owner) || {};
            var s = { owner: id(owner), hand: [], players: [], quota: { damage: (usePhase.nihilJieShichengUsed || []).includes("damage"), remove: (usePhase.nihilJieShichengUsed || []).includes("remove"), puppetSha: !!usePhase.nihilPuppetShaUsed, normalSha: owner.getStat("card").sha || 0, normalJiu: owner.getStat("card").jiu || 0 }, distances: {}, initialEquips: {}, roots: [], shaLimit: 1 };
            var mode = get.mode ? get.mode() : lib.config && lib.config.mode, attitudes = trueIdentityAttitudes(owner);
            var anchor = status.currentPhase || owner;
            s.chainOrder = people.slice().sort(function (a, b) { return get.distance(anchor, a, "absolute") - get.distance(anchor, b, "absolute") || people.indexOf(a) - people.indexOf(b); }).map(id);
            if (mode === "versus" && status.mode === "two" && !status.replacetwo && people.every(function (p) { return typeof p.side === "boolean"; })) {
                s.ending = { kind: "two", side: owner.side, sides: Object.fromEntries(people.map(function (p) { return [id(p), p.side]; })) };
            } else if (mode === "identity" && status.mode !== "purple" && !status.brawl && game.zhu && (game.zhu === owner || game.zhu.identityShown || game.zhu.isZhu)) {
                var roles = {};
                people.forEach(function (p) { if (attitudes || p === owner || p.identityShown) roles[id(p)] = p.identity; });
                roles[id(game.zhu)] = "zhu";
                s.ending = { kind: "identity", leader: id(game.zhu), role: owner === game.zhu ? "zhu" : owner.identity, roles: roles };
            }
            function cardData(c, index) {
                var info = get.info(c) || {}, d = info.distance || {}, ai = info.ai || {}, tags = ai.tag || {}, result = ai.result || {};
                return { id: c.cardid ? String(c.cardid) : "card-" + index, name: get.name(c), type: get.type(c), subtype: get.subtype ? get.subtype(c) : info.subtype, suit: get.suit ? get.suit(c) : c.suit, rank: get.number ? get.number(c) : c.number, color: get.color(c), nature: get.nature ? get.nature(c) : c.nature || "", range: 1 - (d.attackFrom || 0), globalFrom: d.globalFrom || 0, globalTo: d.globalTo || 0, damage: typeof tags.damage === "number" ? tags.damage : 0, recover: typeof tags.recover === "number" ? tags.recover : 0, draw: typeof tags.draw === "number" ? tags.draw : 0, playerValue: typeof result.player === "number" ? result.player : 0, targetValue: typeof result.target === "number" ? result.target : 0 };
            }
            people.forEach(function (p) {
                var known = p === owner ? [] : p.getKnownCards ? p.getKnownCards(owner) : p.getShownCards ? p.getShownCards() : [];
                var count = p.countCards ? p.countCards("h") : p === owner ? realCards.length : p.handCount || 0;
                var eq = p.getCards("e").map(cardData);
                var used = turn ? (turn.nihilJieXueyinUsedSources || []).includes(p) : p.getHistory("custom").some(function (h) { return h.nihilJieXueyinUsed; });
                s.players.push({ id: id(p), sex: p.sex, alive: true, hp: p.hp, maxHp: p.maxHp, armor: p.hujia || 0, mark: p.hasMark(MARK), used: used, drunk: p.storage && p.storage.jiu || p.drunk || 0, linked: p.isLinked ? p.isLinked() : !!p.linked, attitude: p === owner ? 1 : clamp((attitudes ? attitudes.get(p) : get.attitude(owner, p)) / 3, -1, 1), known: known.map(cardData), unknown: p === owner ? 0 : Math.max(0, count - known.length), equips: eq, judges: p.getCards("j").map(cardData), baseRange: 1, limitExtra: p === owner && p.getHandcardLimit ? p.getHandcardLimit() - p.hp : 0, equipDisabled: ["equip1", "equip2", "equip3", "equip4", "equip5"].filter(function (slot) { return p.hasEnabledSlot ? !p.hasEnabledSlot(parseInt(slot.slice(5))) : false; }), noResponse: {} });
                s.initialEquips[id(p)] = eq;
                people.forEach(function (t) { s.distances[id(p) + ":" + id(t)] = get.distance(p, t); });
            });
            s.hand = realCards.map(function (c, index) {
                var data = cardData(c, index); data.enabled = {}; data.groups = {}; data.denied = {}; data.responseDenied = {};
                data.rescueEnabled = (data.name === "tao" || data.name === "jiu") && context({ player: owner, _get_card: c, skill: undefined }, function () { return lib.filter.cardSavable ? !!lib.filter.cardSavable(c, owner, owner) : !!lib.filter.cardEnabled(c, owner, "forceEnable"); });
                data.discardable = !lib.filter.cardDiscardable || lib.filter.cardDiscardable(c, owner, "phaseDiscard");
                people.forEach(function (user) {
                    var plan = { card: c, user: user }, userId = id(user), groups = [];
                    data.enabled[userId] = context({ player: user, _get_card: c, skill: undefined }, function () { return !!get.info(c).enable && !!lib.filter.cardEnabled(c, user, "forceEnable"); });
                    if (actions && data.enabled[userId]) {
                        groups = rules.targetGroups(plan, people).map(function (targets) { return targets.map(id); });
                    }
                    data.groups[userId] = groups;
                    if (get.name(c) === "sha") people.forEach(function (target) {
                        var enabled = context({ player: user, _get_card: c, skill: undefined }, function () { return !!lib.filter.targetEnabled(c, user, target); });
                        data.denied[userId + ":" + id(target)] = !enabled;
                        data.responseDenied[userId + ":" + id(target)] = !data.enabled[userId] || !enabled;
                    });
                    if (!actions) return;
                    var usable = true;
                    if (user === owner && lib.filter.cardUsable) {
                        var virtual = { name: "chooseToUse", type: "phase", player: owner, getParent: function () { return usePhase; } };
                        usable = context({ player: owner, _get_card: c, skill: undefined }, function () { return lib.filter.cardUsable(c, owner, virtual); });
                    } else if (user === owner && data.name === "sha") usable = s.quota.normalSha < 1 || eqWeapon(owner, "zhuge");
                    groups.forEach(function (targets) {
                        if (user === owner && usable) s.roots.push(action("normal", data.id, userId, targets));
                        if (user.hasMark(MARK) && (data.name !== "sha" || !s.quota.puppetSha)) s.roots.push(action("puppet", data.id, userId, targets));
                    });
                });
                return data;
            });
            if (actions) people.forEach(function (p) {
                if (!s.quota.damage) s.roots.push(action("damage", null, id(p), [s.owner]));
                if (!s.quota.remove && p.hasMark(MARK)) s.roots.push(action("remove", null, s.owner, [id(p)]));
            });
            return s;
        }
        function eqWeapon(p, name) { return p.getCards("e").some(function (c) { return get.name(c) === name; }); }
        function swordResponse(event, owner) {
            return event && event.name === "chooseToUse" && event.player === owner && !event.skill && event.addCount === false && event.sourcex && event.respondTo && get.name(event.respondTo[1]) === "jiedao" && phase(event, owner);
        }
        function effectRisk(owner, roots, snapshot) {
            var severeDeterioration = 2, memo = new Map(), evidence = {}, diagnostics = [], signature = [], active = false;
            var modeled = ["nihil_jie_yulei", "nihil_jie_yulei_active", "nihil_jie_shicheng", "nihil_jie_shicheng_backup", "nihil_jie_xueou", "nihil_jie_xueyin"];
            ["zhuge", "qinggang", "qinglong", "guanshi", "hanbing", "zhuque", "guding", "bagua", "renwang", "tengjia", "baiyin", "cixiong", "qilin"].forEach(function (name) {
                modeled.push(name);
                if (lib.card[name] && lib.card[name].skills) modeled = modeled.concat(lib.card[name].skills);
            });
            game.expandSkills(modeled);
            function skills(p) {
                var list = (p && p.getSkills ? p.getSkills().slice() : []).concat(lib.skill.global || []);
                game.expandSkills(list);
                return Array.from(new Set(list)).filter(function (skill) { return !modeled.includes(skill); });
            }
            function probe(card, user, target) {
                var key = JSON.stringify([cardId(card), get.name(card), card.nature || "", id(user), target && id(target)]);
                if (memo.has(key)) return memo.get(key);
                var actorSkills = skills(user), targetSkills = target ? skills(target) : [];
                function hasEffect(skill, side) { var info = get.info(skill), effect = info && info.ai && info.ai.effect; return side === "target" && typeof effect === "function" || effect && (side === "player" ? [effect.player_use, effect.player] : [effect.target_use, effect.target]).some(function (fn) { return typeof fn === "function"; }); }
                if (!actorSkills.some(function (skill) { return hasEffect(skill, "player"); }) && !targetSkills.some(function (skill) { return hasEffect(skill, "target"); })) { memo.set(key, []); return []; }
                var reasons = [], records = [], event = get.event(), descriptors = Object.getOwnPropertyDescriptors(event);
                var selected = ui.selected, selectionDescriptors = Object.getOwnPropertyDescriptors(selected), arrays = Object.keys(selected).filter(function (k) { return Array.isArray(selected[k]); }).map(function (k) { return [selected[k], selected[k].slice()]; });
                function unknown(skill, side, reason) { diagnostics.push({ skill: skill, user: id(user), target: target && id(target), side: side, reason: reason }); records.push([skill, side, reason]); }
                try {
                    Object.assign(event, { player: user, _get_card: card, skill: undefined });
                    var result = typeof get.result === "function" ? get.result(card) : ((get.info(card) || {}).ai || {}).result || {};
                    function seed(v) { if (typeof v === "function") v = v(user, target, card, undefined); return typeof v === "number" && Number.isFinite(v) ? v : 0; }
                    result = result || {};
                    var actorSeed = seed(result.player_use || result.player), actorValue = actorSeed, targetValue = seed(result.target_use || result.target), actorAdd = 0, targetAdd = 0, zeroActor = false;
                    records.push(["seed", actorSeed, targetValue]);
                    function apply(skill, side) {
                        var info = get.info(skill), effect = info && info.ai && info.ai.effect, fn, receiver;
                        if (side === "player") { receiver = effect; fn = effect && typeof effect === "object" && (typeof effect.player_use === "function" ? effect.player_use : effect.player); }
                        else {
                            if (user.hasSkillTag && user.hasSkillTag("ignoreSkill", true, { card: card, target: target, skill: skill, isLink: undefined })) return;
                            receiver = typeof effect === "function" ? info.ai : effect;
                            fn = typeof effect === "function" ? effect : effect && (typeof effect.target_use === "function" ? effect.target_use : effect.target);
                        }
                        if (typeof fn !== "function") return;
                        var value;
                        try { value = fn.call(receiver, card, user, target, side === "player" ? actorValue : targetValue, undefined); }
                        catch (error) { unknown(skill, side, "callback-threw"); return; }
                        if (value === undefined) { records.push([skill, side, "none"]); return; }
                        if (value === "zeroplayer" || value === "zerotarget" || value === "zeroplayertarget") { records.push([skill, side, value]); if (value !== "zerotarget") zeroActor = true; return; }
                        var tuple = Array.isArray(value) && (value.length === 2 || value.length === 4) && value.every(function (v) { return typeof v === "number" && Number.isFinite(v); });
                        if (!tuple && !(typeof value === "number" && Number.isFinite(value))) { unknown(skill, side, "unsupported-return"); return; }
                        records.push([skill, side, value]);
                        var multiplier = 1, additive = 0;
                        if (side === "player") {
                            multiplier = tuple ? value[0] : value; additive = tuple ? value[1] : 0;
                            if (tuple && value.length === 4) { targetValue *= value[2]; targetAdd += value[3]; }
                        } else {
                            targetValue *= tuple ? value[0] : value; targetAdd += tuple ? value[1] : 0;
                            if (tuple && value.length === 4) { multiplier = value[2]; additive = value[3]; }
                        }
                        var before = actorValue + actorAdd, after = actorValue * multiplier + actorAdd + additive, isolated = actorSeed * multiplier + additive;
                        var deterioration = Math.max(before - after, actorSeed - isolated);
                        if (Math.min(after, isolated) < 0 && deterioration >= severeDeterioration) reasons.push({ skill: skill, user: id(user), target: target && id(target), deterioration: deterioration, reason: "severe-actor-penalty" });
                        actorValue *= multiplier; actorAdd += additive;
                    }
                    actorSkills.forEach(function (skill) { apply(skill, "player"); });
                    if (target) targetSkills.forEach(function (skill) { apply(skill, "target"); });
                    if (zeroActor) reasons.length = 0;
                } catch (error) { unknown(null, "seed", "probe-threw: " + error.message); }
                finally {
                    Reflect.ownKeys(event).forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(descriptors, key)) delete event[key]; });
                    Object.defineProperties(event, descriptors);
                    ui.selected = selected;
                    Reflect.ownKeys(selected).forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(selectionDescriptors, key)) delete selected[key]; });
                    Object.defineProperties(selected, selectionDescriptors);
                    arrays.forEach(function (pair) { pair[0].splice.apply(pair[0], [0, pair[0].length].concat(pair[1])); });
                }
                memo.set(key, reasons); signature.push([key, records]); return reasons;
            }
            var cards = owner.getCards("h");
            function followup(user, target) {
                var known = user === owner ? cards : user.getKnownCards ? user.getKnownCards(owner) : user.getShownCards ? user.getShownCards() : [];
                var attacks = known.filter(function (c) { return get.name(c) === "sha"; });
                if (!attacks.length) attacks = [{ name: "sha", cardid: "effect-risk-sha" }];
                return attacks.reduce(function (all, card) { return all.concat(probe(card, user, target)); }, []);
            }
            roots.forEach(function (a) {
                if (a.kind !== "normal" && a.kind !== "puppet") return;
                var card = cards.find(function (c) { return cardId(c) === a.card; }), user = game.players.find(function (p) { return id(p) === a.user; });
                if (!card || !user) return;
                var targets = a.targets.map(function (target) { return game.players.find(function (p) { return id(p) === target; }); }), reasons = [];
                (targets.length ? targets : [null]).forEach(function (target) { reasons = reasons.concat(probe(card, user, target)); });
                if (get.name(card) === "jiedao" && targets[0] && targets[1]) reasons = reasons.concat(followup(targets[0], targets[1]));
                if (get.name(card) === "sha" && eqWeapon(user, "qinglong")) targets.forEach(function (target) { reasons = reasons.concat(followup(user, target)); });
                evidence[actionKey(a)] = { blocked: reasons.length > 0, reasons: reasons };
                if (reasons.length) active = true;
            });
            if (snapshot) cards.filter(function (card) { return get.name(card) === "sha"; }).forEach(function (card) {
                var data = snapshot.hand.find(function (c) { return c.id === cardId(card); });
                game.players.forEach(function (user) {
                    if (user !== owner && !user.hasMark(MARK) && snapshot.quota.damage) return;
                    game.players.forEach(function (target) {
                        if (user === target || data && data.denied[id(user) + ":" + id(target)]) return;
                        var reasons = probe(card, user, target);
                        if (reasons.length) { active = true; evidence["potential|" + cardId(card) + "|" + id(user) + "|" + id(target)] = { blocked: true, reasons: reasons }; }
                    });
                });
            });
            return { active: active, evidence: evidence, diagnostics: diagnostics, signature: JSON.stringify(signature) };
        }
        function responseDecision(owner, event) {
            if (busy) return null;
            busy++;
            try {
                var selected = ui.selected.cards[0], s = normalize(capture(owner, event));
                var responseRoots = owner.getCards("h").filter(function (c) { return get.name(c) === "sha"; }).map(function (c) { return action("normal", cardId(c), id(owner), [id(event.sourcex)]); });
                var guard = effectRisk(owner, responseRoots), key = JSON.stringify(s) + ":" + (selected ? cardId(selected) : "") + guard.signature, cached = responseCache.get(event);
                if (cacheEnabled && cached && cached.key === key) return cached.value;
                var refusal = weaponTransfer(copyState(s), id(owner), id(event.respondTo[0]))[0].state;
                var best = { score: utility(refusal), card: null }, target = id(event.sourcex);
                owner.getCards("h").forEach(function (c) {
                    if (get.name(c) !== "sha" || selected && selected !== c) return;
                    var legal = context({ player: owner, _get_card: c }, function () {
                        return (!event.filterCard || event.filterCard(c, owner, event)) && (!event.filterTarget || event.filterTarget(c, owner, event.sourcex));
                    });
                    if (!legal || guard.evidence[actionKey(action("normal", cardId(c), id(owner), [id(event.sourcex)]))].blocked) return;
                    var next = copyState(s), material = cardOf(next, cardId(c)), u = actor(next, s.owner);
                    consume(next, u, material); var amount = 1 + u.drunk; u.drunk = 0;
                    var value = strike(next, material, s.owner, target, amount).reduce(function (v, o) { return v + o.probability * utility(o.state); }, 0);
                    if (value > best.score + EPS) best = { score: value, card: c };
                });
                if (cacheEnabled) responseCache.set(event, { key: key, value: best });
                return best;
            } finally { busy--; }
        }
        function decision(owner, event, receipt) {
            if (busy) return null;
            busy++;
            try {
                var snapshot = capture(owner, event), visible = JSON.stringify(snapshot), failed = failures.get(phase(event, owner));
                if (receipt) receipt.visible = visible;
                var excluded = failed && failed.fingerprint === visible ? Array.from(failed.keys) : [];
                var nativeExcluded = event._aiexclude || [];
                var nativeKeys = nativeExcluded.map(function (item) { return typeof item === "string" ? item : cardId(item); });
                
                var input = Object.assign({}, snapshot, { roots: snapshot.roots.filter(function (a) {
                    if (excluded.includes(actionKey(a))) return false;
                    if (a.kind === "normal") return !nativeKeys.includes(a.card);
                    if (a.kind === "puppet") return !nativeKeys.includes("nihil_jie_yulei_active");
                    return !nativeKeys.includes("nihil_jie_shicheng") && !nativeKeys.includes("nihil_jie_shicheng_backup");
                }) });
                var guard = effectRisk(owner, input.roots, snapshot);
                var fingerprint = visible + excluded.join(";") + JSON.stringify(nativeKeys) + guard.signature, entry = cache.get(event);
                if (cacheEnabled && entry && entry.fingerprint === fingerprint) return entry.decision;
                if (guard.active) input.roots = input.roots.filter(function (a) { return !guard.evidence[actionKey(a)] || !guard.evidence[actionKey(a)].blocked; });
                var result = guard.active ? plan(input, { horizon: "immediate" }) : winnerPlan(input);
                if (guard.active || guard.diagnostics.length) { if (guard.active) result.source = "conservative-risk"; result.guard = guard; }
                if (cacheEnabled) cache.set(event, { fingerprint: fingerprint, decision: result });
                last = { snapshot: snapshot, decision: result };
                return result;
            } finally { busy--; }
        }
        function beginAttempt(event, card, user) {
            var owner = event.player;
            if (!phase(event, owner) || event.isMine && event.isMine() || event.isOnline && event.isOnline()) return;
            var receipt = {}, d = decision(owner, event, receipt), selected = d.ranked.find(function (r) { return r.action.kind === "puppet" && r.action.card === cardId(card) && r.action.user === id(user); });
            if (!selected) return;
            attempts.set(event, { owner: owner, phase: phase(event, owner), fingerprint: receipt.visible, action: selected.action });
        }
        function observeResult(event, result, valid) {
            var attempt = attempts.get(event); attempts.delete(event);
            if (!attempt || valid || event.isMine && event.isMine() || event.isOnline && event.isOnline() || phase(event, attempt.owner) !== attempt.phase) return;
            if (JSON.stringify(capture(attempt.owner, event)) !== attempt.fingerprint) return;
            var failed = failures.get(attempt.phase);
            if (!failed || failed.fingerprint !== attempt.fingerprint) failed = { fingerprint: attempt.fingerprint, keys: new Set() };
            var tried = attempt.action;
            if (result.bool && result.targets) tried = Object.assign({}, tried, { targets: result.targets.map(id) });
            failed.keys.add(actionKey(tried)); failures.set(attempt.phase, failed);
        }
        function axeCost(owner, event, card) {
            if (event.name !== "chooseToDiscard" || event.player !== owner || event.logSkill !== "guanshi_skill" || !event.getTrigger) return undefined;
            var trigger = event.getTrigger();
            if (!trigger || trigger.player !== owner || !trigger.target || !trigger.target.isIn() || !trigger.card || get.name(trigger.card) !== "sha") return undefined;
            var selected = ui.selected.cards, remaining = owner.getCards("h").filter(function (c) {
                return !selected.includes(c) && (get.name(c) === "tao" || get.name(c) === "jiu") && context({ player: owner, _get_card: c, skill: undefined }, function () { return !lib.filter.cardSavable || lib.filter.cardSavable(c, owner, owner); });
            });
            if (!remaining.includes(card) || remaining.length > 1) return undefined;
            busy++;
            try {
                var s = normalize(capture(owner, event, { actions: false })), amount = (trigger.baseDamage || 0) + (trigger.extraDamage || 0);
                if (s.ending && amount > 0) {
                    var prefix = selected.includes(card) ? selected.slice() : selected.concat(card);
                    var payments = prefix.length === 2 ? [prefix] : owner.getCards("he").filter(function (c) { return !prefix.includes(c); }).map(function (c) { return prefix.concat(c); });
                    var wins = payments.some(function (cards) {
                        if (cards.length !== 2) return false;
                        var previous = ui.selected.cards;
                        try {
                            ui.selected.cards = [];
                            for (var material of cards) {
                                if (lib.filter.cardDiscardable && !lib.filter.cardDiscardable(material, owner, event)) return false;
                                if (event.filterCard && !event.filterCard(material, owner, event)) return false;
                                ui.selected.cards = ui.selected.cards.concat(material);
                            }
                        } finally { ui.selected.cards = previous; }
                        var next = copyState(s), payer = actor(next, next.owner);
                        cards.forEach(function (c) {
                            var equip = payer.equips.find(function (e) { return e.id === cardId(c); });
                            if (equip) { payer.equips = payer.equips.filter(function (e) { return e !== equip; }); if (equip.name === "baiyin") recover(payer, 1); }
                            else consume(next, payer, cardOf(next, cardId(c)));
                        });
                        var nature = get.nature ? get.nature(trigger.card) : trigger.card.nature;
                        return damage(next, next.owner, id(trigger.target), amount, nature, false, equipped(payer, "qinggang")).every(function (o) { return o.state.terminal === 1; });
                    });
                    if (wins) return 0;
                }
                return 100;
            } finally { busy--; }
        }
        function score(kind, owner, arg) {
            arg = arg || {};
            var event = get.event();
            if (busy || !automated(event)) return undefined;
            if (kind === "order" && swordResponse(event, owner)) {
                var response = responseDecision(owner, event);
                return response && response.card === arg.card ? 100 : 0;
            }
            if (kind === "axeCost") return axeCost(owner, event, arg.card);
            if (kind === "keep") {
                if (event.name !== "chooseToDiscard" || event.getParent().name !== "phaseDiscard" || event.player !== owner) return undefined;
                var reserves = owner.getCards("h").filter(function (c) { return (get.name(c) === "tao" || get.name(c) === "jiu") && (!lib.filter.cardSavable || lib.filter.cardSavable(c, owner, owner)); });
                var reserved = reserves.find(function (c) { return get.name(c) === "tao"; }) || reserves[0];
                if (arg.card === reserved) return 100;
                var index = owner.getCards("h").filter(function (c) { return get.name(c) === "shan"; }).indexOf(arg.card);
                return keep({ name: get.name(arg.card), type: get.type(arg.card) }, owner, Math.max(0, index)) * 5;
            }
            if (kind === "effect" || kind === "sourceEffect") {
                if (!get.tag(arg.card, "damage")) return undefined;
                var source = arg.source, turn = event.getParent("phase", true);
                if (!source || !source.isIn()) return undefined;
                var used = turn ? (turn.nihilJieXueyinUsedSources || []).includes(source) : source.getHistory("custom").some(function (h) { return h.nihilJieXueyinUsed; });
                if (kind === "sourceEffect") return source === owner && owner.hasSkill("nihil_jie_xueyin") && source.hasMark(MARK) && !used && arg.target !== owner ? [1, 0.5] : undefined;
                if (arg.target === owner) return undefined;
                return undefined;
            }
            var second = event.name === "chooseTarget" && event.nihilPuppetUser && phase(event, owner);
            var planningEvent = event;
            if (event.name === "chooseButton" && kind === "option") planningEvent = event.getParent("chooseToUse", true);
            if (!ownPhase(planningEvent, owner) && !second) return undefined;
            var d = decision(owner, planningEvent || event);
            if (!d) return undefined;
            if (kind === "order") {
                var a = d.firstAction;
                return (arg.skill === "shicheng" ? a.kind === "damage" || a.kind === "remove" : arg.skill === "puppet" ? a.kind === "puppet" : a.kind === "normal" && a.card === cardId(arg.card)) && d.score > EPS ? 100 : 0;
            }
            var selectedCard = arg.card || ui.selected.cards[0], selectedUser = arg.user;
            if (kind === "card" && ui.selected.targets.length) selectedUser = ui.selected.targets[0];
            var prefix = arg.prefix || [];
            var ranked = d.ranked.filter(function (r) {
                var a = r.action;
                if (arg.option && a.kind !== arg.option) return false;
                if (["card", "user", "target"].includes(kind) && a.kind !== "puppet") return false;
                if (kind === "normalTarget" && a.kind !== "normal") return false;
                if (selectedCard && a.card !== cardId(selectedCard)) return false;
                if (selectedUser && a.user !== id(selectedUser)) return false;
                if (arg.option && arg.target && (a.kind === "damage" ? a.user : a.targets[0]) !== id(arg.target)) return false;
                return prefix.every(function (p, i) { return a.targets[i] === id(p); });
            });
            if (!ranked.length) return -1;
            var preferred = ranked[0], first = actionKey(preferred.action) === actionKey(d.firstAction);
            var safe = d.source !== "benchmark-winner" && preferred.evidence.selfAlive && !preferred.evidence.ownDanger && preferred.evidence.reserveSafe;
            var recommendation = first && d.score > EPS ? 100 : safe && preferred.score > EPS ? 1 / (1 + d.ranked.indexOf(preferred)) : -1;
            if (kind === "target" || kind === "normalTarget") {
                var best = ranked[0], next = best.action.targets[prefix.length];
                if (!arg.target) return recommendation;
                if (prefix.length === best.action.targets.length && prefix.some(function (p) { return p === arg.target; })) return recommendation > 0 || event.forced ? Math.max(1, recommendation) : -1;
                if (next !== id(arg.target)) return -1;
                return recommendation > 0 || event.forced || prefix.length ? Math.max(1, recommendation) : -1;
            }
            return recommendation;
        }
        function automated(event) {
            return event && !status.connectMode && !game.online && !(event.isMine && event.isMine()) && !(event.isOnline && event.isOnline());
        }
        function damageResponse(event) {
            var parent = event.getParent(), card = parent && parent.card;
            var name = card && get.name(card);
            if (event.name === "chooseToUse" && event.type === "respondShan" && name === "sha") return { parent: parent, name: name, response: "shan", source: parent.player };
            if (event.name === "chooseToRespond" && ["nanman", "wanjian", "juedou"].includes(name)) return { parent: parent, name: name, response: name === "wanjian" ? "shan" : "sha", source: name === "juedou" ? parent.source : parent.customSource || parent.player };
            return null;
        }
        function sacrificeScore(event, card) {
            if (busy || !automated(event) || event.skill || typeof card === "string") return undefined;
            var request = damageResponse(event), owner = event.player;
            if (!request || owner.hp !== owner.maxHp || !owner.hasSkill("nihil_jie_xueyin")) return undefined;
            var parent = request.parent, source = request.source;
            if (!source || !source.isIn() || parent.directHit || parent.directHit2) return undefined;
            var baseAmount = (typeof parent.baseDamage === "number" ? parent.baseDamage : 1) + (parent.extraDamage || 0);
            var amount = baseAmount, ignoreArmor = request.name === "sha" && eqWeapon(source, "qinggang");
            var nature = get.nature ? get.nature(parent.card) : parent.card.nature;
            if (nature === "stab" || nature && (owner.isLinked ? owner.isLinked() : owner.linked) || (event.shanRequired || event.shaRequired || parent.shanRequired || parent.shaRequired || 1) !== 1) return undefined;
            if (nature === "fire" && eqWeapon(owner, "tengjia") && !ignoreArmor) amount++;
            if (eqWeapon(owner, "baiyin") && !ignoreArmor) amount = Math.min(amount, 1);
            if (amount !== 1 || owner.hp - Math.max(0, amount - (owner.hujia || 0)) <= 0) return undefined;
            var responses = owner.getCards("h").filter(function (c) { return get.name(c) === request.response && (!event.filterCard || event.filterCard(c, owner, event)); });
            if (!responses.length || !responses.includes(card)) return undefined;
            busy++;
            try {
                var s = normalize(capture(owner, event, { actions: false })), sourceId = id(source);
                var refusal = expected(damage(copyState(s), sourceId, s.owner, baseAmount, nature, false, ignoreArmor));
                var defense = -Infinity;
                responses.forEach(function (c) {
                    var next = copyState(s); consume(next, actor(next, s.owner), cardOf(next, cardId(c)));
                    var value = request.name === "juedou" ? expected(duel(next, sourceId, s.owner, handCount(next, actor(next, sourceId)) + handCount(next, actor(next, s.owner)) + 1, 1)) : utility(next);
                    defense = Math.max(defense, value);
                });
                return refusal > defense + EPS ? -1 : undefined;
            } finally { busy--; }
        }
        function decorateChoice(event) {
            if (wrappers.has(event)) return;
            var native = event.ai2;
            var wrapped = function (target) {
                return lib.skill.nihil_jie_yulei.aiPlanner.choiceScore(get.event(), target);
            };
            var responseField = event.name === "chooseToUse" && event.type === "respondShan" ? "ai1" : event.name === "chooseToRespond" ? (event.ai1 ? "ai1" : "ai") : null;
            wrappers.set(event, { native: native, wrapped: wrapped, responseField: responseField, responseNative: responseField && event[responseField] });
            event.ai2 = wrapped;
            if (responseField) event[responseField] = function (card) {
                return lib.skill.nihil_jie_yulei.aiPlanner.choiceScore(get.event(), card, "response");
            };
        }
        function choiceScore(event, target, kind) {
            var owner = event.player, entry = wrappers.get(event);
            if (kind === "response") {
                var result = sacrificeScore(event, target);
                if (result !== undefined) return result;
                return entry && typeof entry.responseNative === "function" ? entry.responseNative(target) : 0;
            }
            if (swordResponse(event, owner) && !(event.isMine && event.isMine())) {
                var response = responseDecision(owner, event);
                if (response && response.card && ui.selected.cards[0] === response.card) return target === event.sourcex ? 1 : -1;
            }
            if (!event.skill && ownPhase(event, owner) && !(event.isMine && event.isMine())) {
                var v = score("normalTarget", owner, { card: ui.selected.cards[0] || get.card(), target: target, prefix: ui.selected.targets });
                if (v !== undefined) return v;
            }
            return entry && typeof entry.native === "function" ? entry.native(target) : get.effect_use(target);
        }
        return {
            score: score,
            decorateChoice: decorateChoice,
            choiceScore: choiceScore,
            beginAttempt: beginAttempt,
            observeResult: observeResult,
            inspect: function (owner, options) {
                if (options && options.cache === false) cacheEnabled = false;
                if (options && options.cache === true) cacheEnabled = true;
                if (owner) decision(owner, get.event());
                return last ? clone(last) : null;
            },
            plan: plan,
            simulate: function (position, a) { return transfer(normalize(position), a); },
        };
    }
    window.nihilJieLuofeiAI = { create: create, plan: plan, winnerPlan: winnerPlan, winnerFactory: winnerFactory, simulate: function (position, a) { return transfer(normalize(position), a); } };
})();
