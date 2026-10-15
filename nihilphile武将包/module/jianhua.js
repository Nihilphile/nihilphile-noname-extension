(() => {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "Nihilphile";
    var USED = "nihil_jianhua_skill_used";
    // v1.4：标记「凝」挂在心流技能 ID 下（无名杀的 player.storage[标记名] 约定），
    // nihil_xinliu_turn 记本回合已消耗次数，nihil_xinliu_cost 是纯显示的「下次换装费」标志。
    var FLOW_MARK = "nihil_xinliu";
    var FLOW_TURN = "nihil_xinliu_turn";
    var COST_MARK = "nihil_xinliu_cost";
    var COST_BASE = 6;
    var FLOW_PER_POINT = 3;

    function alive(player) {
        return !!player && player.isIn();
    }

    function weaponName(card, player) {
        if (
            !card ||
            get.type(card, player) !== "equip" ||
            get.subtype(card, player) !== "equip1"
        )
            return null;
        return get.name(card, player);
    }

    function usedWeapon(player, name) {
        return !!name && player.getStorage(USED).includes(name);
    }

    function equippedByUse(event, player) {
        var use = event.getParent("useCard", true);
        var name = weaponName(event.card, player);
        if (
            !use ||
            use.player !== player ||
            get.name(use.card, player) !== name ||
            !name
        )
            return null;
        var materials = event.cards || use.cards || [];
        return (
            player.getVEquips(name).find((vcard) => {
                if (!materials.length) return vcard === event.card;
                var equipped = vcard.cards || [];
                return materials.every((card) => equipped.includes(card));
            }) || null
        );
    }

    function legalShaTargets(player, card) {
        return game.filterPlayer(
            (target) =>
                target !== player &&
                target.isIn() &&
                lib.filter.targetEnabled2(card, player, target) &&
                lib.filter.targetInRange(card, player, target),
        );
    }

    // 本次替换武器的凝消耗：本回合每成功保护一次，费用 -1，最低 0；新回合恢复 COST_BASE。
    function flowCost(player) {
        return Math.max(0, COST_BASE - (player.storage[FLOW_TURN] || 0));
    }

    // 「费X」标志的数字由 intro.markcount 现算，这里只负责建出/刷新那个标记节点。
    // 返回 0 时转成字符串，避免引擎 `if (num)` 把「免费」这一档显示成无数字。
    function syncCostGauge(player) {
        if (alive(player) && typeof player.markSkill === "function")
            player.markSkill(COST_MARK);
    }

    function weaponRange(card) {
        var info = get.info(card) || {};
        var attackFrom = info.distance && info.distance.attackFrom;
        return Math.max(
            1,
            1 - (typeof attackFrom === "number" ? attackFrom : 0),
        );
    }

    function currentWeapon(player) {
        var cards = player.getVEquips(1);
        return cards.length ? cards[0] : null;
    }

    function detachVirtuals(player, virtuals) {
        virtuals = (virtuals || []).slice();
        var cards = [];
        virtuals.forEach((virtual) => {
            (virtual.cards || []).forEach((card) => {
                if (!cards.includes(card)) cards.push(card);
            });
            player.removeVirtualEquip(virtual);
        });
        return { virtuals: virtuals, cards: cards };
    }

    function detachWeapons(player) {
        return detachVirtuals(player, player.getVEquips(1));
    }

    function weaponDetached(player, detached) {
        var equipped = player.getVEquips(1);
        return detached.virtuals.every(
            (virtual) => !equipped.includes(virtual),
        );
    }

    function restoreWeapons(player, detached) {
        detached.virtuals.forEach((virtual) => {
            if (!player.getVEquips(1).includes(virtual)) {
                player.addVirtualEquip(virtual, virtual.cards || []);
            }
        });
    }

    async function gainDetachedWeapons(owner, receiver, detached, gainArgs) {
        if (!detached.cards.length) {
            restoreWeapons(owner, detached);
            return false;
        }
        await receiver.gain.apply(
            receiver,
            [detached.cards].concat(gainArgs || []),
        );
        var hand = receiver.getCards("h");
        var success =
            weaponDetached(owner, detached) &&
            detached.cards.every((card) => hand.includes(card));
        if (!success) restoreWeapons(owner, detached);
        return success;
    }

    function weaponReplacement(event, player) {
        if (
            !event ||
            !event.result ||
            !event.result.vcards ||
            !event.result.cards ||
            !event.result.vcards.length ||
            !event.result.cards.length ||
            !weaponName(event.card, player)
        )
            return null;
        var equip = event.getParent("equip", true);
        var use = event.getParent("useCard", true);
        if (
            !equip ||
            !use ||
            equip.player !== player ||
            use.player !== player ||
            get.name(use.card, player) !== get.name(event.card, player)
        )
            return null;
        var virtuals = event.result.vcards.filter(
            (card) => !!weaponName(card, player),
        );
        if (!virtuals.length) return null;
        return { virtuals: virtuals, cards: event.result.cards.slice() };
    }

    var aiReading = 0;
    var aiPhases = new WeakMap();
    var aiIds = new WeakMap();
    var aiIdSequence = 0;
    var aiNoShan = new WeakMap();
    var aiPendingNoShan = new WeakMap();
    var AI_FORMS = ["nihil_zhuofeng", "nihil_hengsha"];

    function aiId(item) {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (item.cardid || item.playerid || item.id) return String(item.cardid || item.playerid || item.id);
        if (!aiIds.has(item)) aiIds.set(item, "jianhua_" + ++aiIdSequence);
        return aiIds.get(item);
    }

    function aiRead(callback) {
        aiReading++;
        try { return callback(); } finally { aiReading--; }
    }

    function aiNoShanSignal(target) {
        var record = aiNoShan.get(target);
        return !!record && target.getAllHistory && target.getAllHistory("gain").length === record.gainCount;
    }

    function aiObserveShaHit(trigger) {
        var target = trigger.target;
        if (!target || !target.getAllHistory || trigger.directHit || trigger.directHit2 || trigger.skipShan ||
            lib.filter.cardEnabled({ name: "shan" }, target, "forceEnable") === false) return;
        if (target.getAllHistory("useCard", (use) => use.respondTo && use.respondTo[1] === trigger.card &&
            get.name(use.card) === "shan").length) return;
        var use = trigger.getParent && trigger.getParent("useCard", true);
        if (!use) return;
        var records = aiPendingNoShan.get(use) || [];
        records.push({ target: target, gainCount: target.getAllHistory("gain").length });
        aiPendingNoShan.set(use, records);
    }

    function aiRoot(event, player) {
        // A response nested inside a phase action is still a response window.
        if (event && event.name === "chooseButton") {
            var parent = event.getParent && event.getParent();
            event = parent && parent.name === "chooseToUse" ? parent : null;
        }
        return event && event.name === "chooseToUse" && event.type === "phase" && event.player === player ? event : null;
    }

    function aiPhase(event) {
        return event.getParent && event.getParent("phaseUse", true) || event;
    }

    function aiMemory(root) {
        var phase = aiPhase(root);
        if (!aiPhases.has(phase)) aiPhases.set(phase, {
            tidy: 0, failed: new Set(), reached: new Map(), resolved: new WeakSet(), last: null,
        });
        return aiPhases.get(phase);
    }

    function aiClone(state) {
        return JSON.parse(JSON.stringify(state));
    }

    function aiStateKey(state) {
        var normalized = aiClone(state);
        normalized.hand.sort((a, b) => a.id.localeCompare(b.id));
        normalized.people.forEach((person) => person.equips.sort((a, b) =>
            (a.subtype + a.name + a.materials.map((card) => card.id).join(",")).localeCompare(b.subtype + b.name + b.materials.map((card) => card.id).join(","))));
        function ordered(value) {
            if (Array.isArray(value)) return value.map(ordered);
            if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
            return value;
        }
        return JSON.stringify(ordered(normalized));
    }

    function aiCardValue(card, peachValue) {
        return card.name === "sha" ? 1.5 : card.name === "shan" ? 2 : card.name === "tao" ? peachValue : 1;
    }

    function chooseJianhuaKeepCards(state) {
        var entries = state.cards.filter((card) => !card.weapon).map((card) => Object.assign({}, card, {
            keep: aiCardValue(card, state.hp <= 2 ? 5 : 3),
        }));
        entries.sort((a, b) => b.keep - a.keep || (b.useful || 0) - (a.useful || 0) || a.id.localeCompare(b.id));
        return { entries: entries, keepIds: entries.slice(0, Math.max(0, state.limit)).map((card) => card.id) };
    }

    function aiKeepState(player) {
        return aiRead(() => ({ hp: player.hp, limit: player.getHandcardLimit ? player.getHandcardLimit() : player.hp,
            cards: player.getCards("h").map((card) => ({ id: aiId(card), name: get.name(card, player),
                weapon: !!weaponName(card, player), useful: get.useful ? get.useful(card, player) : get.value(card, player) })) }));
    }

    function aiEquips(player) {
        return player.getVCards ? player.getVCards("e") : player.getVEquips(1).concat(player.getVEquips(2));
    }

    function aiDescriptor(card, owner, env) {
        var id = aiId(card);
        env.cards[id] = card;
        var info = get.info(card) || {};
        return { id: id, name: get.name(card, owner), suit: get.suit ? get.suit(card, owner) : card.suit || "none",
            color: get.color ? get.color(card, owner) : card.color || "none", nature: get.nature(card, false) || "",
            subtype: get.subtype(card, owner) || "", range: weaponName(card, owner) ? owner.getEquipRange ? owner.getEquipRange([card]) : weaponRange(card) : 0,
            distance: info.distance ? Object.fromEntries(Object.entries(info.distance).filter((entry) => typeof entry[1] === "number")) : {} };
    }

    function aiVirtual(card, owner, env) {
        var info = get.info(card) || {};
        return { name: get.name(card, owner), materials: (card.cards || [card]).map((material) => aiDescriptor(material, owner, env)),
            subtype: get.subtype(card, owner) || "", range: owner.getEquipRange ? owner.getEquipRange([card]) : weaponRange(card),
            distance: info.distance ? Object.fromEntries(Object.entries(info.distance).filter((entry) => typeof entry[1] === "number")) : {} };
    }

    function aiCapture(player, root) {
        var env = { player: player, root: root, players: {}, cards: {}, skills: {}, gaps: [], now: Date.now(), nativeOrder: 3 };
        var state = { self: aiId(player), hand: player.getCards("h").map((card) => aiDescriptor(card, player, env)),
            flow: player.countMark(FLOW_MARK), cost: flowCost(player), usedNames: player.getStorage(USED).slice().sort(),
            normalUsed: player.countUsed ? player.countUsed("sha") : 0,
            wine: player.storage.jiu || 0, wineUsed: player.countUsed ? player.countUsed("jiu") : 0,
            damaged: !!(player.getHistory && player.getHistory("sourceDamage", (damage) => damage.num > 0).length),
            discardSha: !!(get.discardPile && get.discardPile("sha")), unknownCards: 0, paused: false, people: [] };
        var seats = [], cursor = player;
        while (cursor && !seats.includes(cursor) && seats.length <= game.players.length) {
            seats.push(cursor); cursor = cursor.nextSeat;
        }
        if (seats.length !== game.players.length) {
            var start = game.players.indexOf(player);
            seats = game.players.slice(start).concat(game.players.slice(0, start));
        }
        seats.filter((target) => target.isIn()).forEach((target) => {
            var id = aiId(target);
            env.players[id] = target;
            var equips = aiEquips(target).map((card) => aiVirtual(card, target, env));
            var names = target.getSkills ? target.getSkills().slice() : [];
            var equipSkills = aiEquips(target).flatMap((card) => (get.info(card) || {}).skills || []);
            env.skills[id] = names.filter((name) => !equipSkills.includes(name));
            state.people.push({ id: id, hp: target.hp, maxHp: target.maxHp, hujia: target.hujia || 0,
                team: target === player || get.attitude(player, target) > 0 ? 1 : get.attitude(player, target) < 0 ? -1 : 0,
                hands: target === player ? state.hand.length : target.countCards("h"),
                noShan: aiNoShanSignal(target), linked: !!(target.isLinked && target.isLinked()),
                sex: target.sex || "unknown", equips: equips,
                distance: target === player ? 0 : get.distance(player, target),
                directHit: false, canShan: lib.filter.cardEnabled({ name: "shan" }, target, "forceEnable") !== false });
        });
        // Reading the native order under aiReading prevents our own mod from recursively planning.
        if (get.order) env.nativeOrder = aiRead(() => get.order({ name: "sha" }, player)) || 3;
        return { state: state, env: env, key: aiStateKey(state), layout: aiStateKey(state), unknown: env.gaps };
    }

    function aiSelf(state) { return state.people.find((person) => person.id === state.self); }
    function aiWeapon(state) { return aiSelf(state).equips.find((equip) => equip.subtype === "equip1") || null; }
    function aiResource(state, peachValue) {
        var cards = new Map(state.hand.map((card) => [card.id, card]));
        aiSelf(state).equips.forEach((equip) => equip.materials.forEach((card) => cards.set(card.id, card)));
        return Array.from(cards.values()).reduce((sum, card) => sum + aiCardValue(card, peachValue), 0) +
            state.unknownCards + 0.1 * Math.min(12, state.flow);
    }
    function aiFallbackValue(state) { return !state.damaged && state.discardSha ? 1.5 : 0; }

    function aiSkillsFor(state, id, env) {
        var person = state.people.find((target) => target.id === id);
        var skills = (env.skills[id] || []).concat(person.equips.flatMap((equip) => (lib.card[equip.name] || {}).skills || []), lib.skill.global || []);
        if (game.expandSkills) game.expandSkills(skills);
        return skills.filter((name) => lib.skill[name] && lib.skill[name].mod)
            .sort((a, b) => get.priority ? get.priority(a) - get.priority(b) : a.localeCompare(b));
    }

    function aiMod(state, id, env, name, args) {
        return game.checkMod ? game.checkMod.apply(game, args.concat([name, aiSkillsFor(state, id, env)])) : args[args.length - 1];
    }

    function aiRange(state, env) {
        var player = env.player, weapon = aiWeapon(state);
        var range = weapon ? weapon.range : 1;
        var base = aiMod(state, state.self, env, "attackRangeBase", [player, "unchanged"]);
        if (base !== "unchanged") range = base;
        range = aiMod(state, state.self, env, "attackRange", [player, range]);
        return aiMod(state, state.self, env, "attackRangeFinal", [player, range]);
    }

    function aiDistance(state, target, env) {
        var original = env.initial.people.find((person) => person.id === target.id);
        var beforeSelf = aiSelf(env.initial), afterSelf = aiSelf(state);
        var sum = (equips, key) => equips.reduce((total, equip) => total + (equip.distance[key] || 0), 0);
        return Math.max(1, original.distance + sum(afterSelf.equips, "globalFrom") - sum(beforeSelf.equips, "globalFrom") +
            sum(target.equips, "globalTo") - sum(original.equips, "globalTo"));
    }

    function aiEnabled(state, card, env, rootCheck) {
        var actual = card.id && env.cards[card.id] || get.autoViewAs(card, (card.materials || []).map((id) => env.cards[id]));
        if (lib.filter.cardEnabled(actual, env.player) === false) return false;
        if (card.id && lib.filter.cardEnabled2 && lib.filter.cardEnabled2(actual, env.player) === false) return false;
        if (rootCheck) {
            var filter = env.root._nihilJianhuaOriginalFilter || env.root.filterCard;
            if (filter && !filter(actual, env.player, env.root)) return false;
        }
        return true;
    }

    function aiQuota(state, env) {
        var player = env.player, weapon = aiWeapon(state), limit = (lib.card.sha || {}).usable;
        limit = typeof limit === "number" ? limit : 1;
        if (weapon && weapon.name === "zhuge") {
            // Native versus/changban crossbow allows four normal slashes, not infinity.
            limit = get.is && (get.is.versus && get.is.versus() || get.is.changban && get.is.changban()) ? limit + 3 : Infinity;
        }
        var mods = aiSkillsFor(state, state.self, env).filter((name) => name !== "zhuge_skill");
        if (game.checkMod) limit = game.checkMod({ name: "sha" }, player, limit, "cardUsable", mods);
        return typeof limit === "number" ? Math.max(0, limit - state.normalUsed) : Infinity;
    }

    function aiTargets(state, sha, env, normal) {
        if (!aiEnabled(state, sha, env, false)) return [];
        return state.people.filter((target) => {
            var actual = env.players[target.id];
            if (target.id === state.self || !lib.filter.targetEnabled2(sha, env.player, actual)) return false;
            if (env.player.hasSkill && env.player.hasSkill("undist") || actual.hasSkill && actual.hasSkill("undist")) return false;
            var mod = aiMod(state, state.self, env, "targetInRange", [sha, env.player, actual, "unchanged"]);
            if (typeof mod === "boolean") return mod;
            if (aiDistance(state, target, env) + (typeof mod === "number" ? mod : 0) > aiRange(state, env)) return false;
            if (normal && lib.filter.cardUsableTarget && aiStateKey(state) === aiStateKey(env.initial) &&
                !lib.filter.cardUsableTarget(sha, env.player, actual)) return false;
            return true;
        }).map((target) => target.id);
    }

    function aiSelection(kind, card, player, form, target) {
        return { skillId: kind === "LINGREN" ? "nihil_lingren" : undefined,
            physicalCardId: kind === "LINGREN" ? undefined : aiId(card), form: form,
            materialIds: [aiId(card)], useTargetIds: [aiId(target || player)] };
    }

    function aiExcluded(root, selection) {
        return (root._aiexclude || []).some((item) => item === selection.skillId || item === selection.skillId + "_backup" ||
            aiId(item) === selection.physicalCardId || selection.materialIds.includes(aiId(item)));
    }

    function aiSets(state, sha, env, normal) {
        var legal = aiTargets(state, sha, env, normal), weapon = aiWeapon(state);
        if (weapon && weapon.name === "nihil_hengsha") return legal.length ? [legal] : [];
        var sets = legal.map((id) => [id]);
        if (weapon && weapon.name === "fangtian" && normal && sha.materials && sha.materials.length === state.hand.length) {
            // Fangtian's last-hand-card bonus is optional; evaluate all legal 1..3 target sets.
            for (var i = 0; i < legal.length; i++) for (var j = i + 1; j < legal.length; j++) {
                sets.push([legal[i], legal[j]]);
                for (var k = j + 1; k < legal.length; k++) sets.push([legal[i], legal[j], legal[k]]);
            }
        }
        return sets;
    }

    function aiCandidates(state, env, atRoot) {
        if (state.paused || aiSelf(state).hp <= 0) return [];
        var candidates = [], player = env.player, weapon = aiWeapon(state);
        function add(kind, material, form, targets, sha, extra) {
            var selection = aiSelection(kind, env.cards[material.id] || material, player, form);
            if (targets && kind === "NORMAL_SHA") selection.useTargetIds = targets.slice();
            var action = Object.assign({ kind: kind, form: form || "", materials: [material.id], targets: targets || [],
                sha: sha || null, selection: selection, weaponAction: kind === "LINGREN" || kind === "EQUIP_WEAPON" }, extra || {});
            action.id = [kind, action.materials.join(","), action.form, action.targets.join(","), action.controlId || ""].join(":");
            if (atRoot && aiExcluded(env.root, selection)) return;
            candidates.push(action);
            return action;
        }
        state.hand.forEach((card) => {
            if (card.name === "sha" && aiQuota(state, env) > 0 && aiEnabled(state, card, env, atRoot)) {
                var sha = { name: "sha", nature: card.nature, color: card.color, suit: card.suit, materials: [card.id] };
                aiSets(state, sha, env, true).forEach((targets) => add("NORMAL_SHA", card, "", targets, sha));
            }
            var forms = card.subtype === "equip1" ? [card.name] : card.name === "sha" && player.hasSkill("nihil_lingren") ? AI_FORMS : [];
            forms.forEach((name) => {
                var modeledEffects = ["nihil_zhuofeng_skill", "nihil_hengsha_skill", "zhuge_skill", "qinggang_skill",
                    "cixiong_skill", "qinglong_skill", "zhangba_skill", "guanshi_skill", "fangtian_skill", "qilin_skill", "hanbing_skill",
                    "guding_skill", "zhuque_skill"];
                ((lib.card[name] || {}).skills || []).filter((skill) => !modeledEffects.includes(skill)).forEach((skill) => {
                    var gap = "WEAPON_EFFECT_NOT_MODELED:" + name + ":" + skill;
                    if (!env.gaps.includes(gap)) env.gaps.push(gap);
                });
                var kind = card.subtype === "equip1" ? "EQUIP_WEAPON" : "LINGREN";
                var virtual = { name: name, materials: [card.id] };
                if (!aiEnabled(state, kind === "LINGREN" ? virtual : card, env, atRoot)) return;
                var next = aiClone(state), self = aiSelf(next);
                self.equips = self.equips.filter((equip) => equip.subtype !== "equip1");
                self.equips.push(aiNewWeapon(card, name));
                var sha = { name: "sha", nature: card.nature, color: "none", suit: "none",
                    storage: { nihilJianhuaEquipSha: true, nihilJianhuaWeapon: name }, materials: [] };
                var sets = state.usedNames.includes(name) ? [] : aiSets(next, sha, env, false);
                if (!sets.length) add(kind, card, name, [], null);
                else sets.forEach((targets) => add(kind, card, name, targets, sha));
            });
            if (card.name === "jiu" && !state.wine && state.wineUsed <
                aiMod(state, state.self, env, "cardUsable", [env.cards[card.id], player, 1]) && aiEnabled(state, card, env, atRoot)) add("WINE", card);
            if (card.name === "tao" && aiSelf(state).hp < aiSelf(state).maxHp && aiEnabled(state, card, env, atRoot)) add("HEAL", card);
            if (["equip2", "equip3", "equip4", "equip6"].includes(card.subtype) && aiEnabled(state, card, env, atRoot)) add("PREP_EQUIP", card, card.name);
            if (["guohe", "shunshou"].includes(card.name) && aiEnabled(state, card, env, atRoot)) state.people.forEach((target) => {
                if (target.id === state.self) return;
                var actual = env.players[target.id], actualCard = env.cards[card.id];
                if (!lib.filter.targetEnabled2(actualCard, player, actual) || !lib.filter.targetInRange(actualCard, player, actual)) return;
                target.equips.forEach((equip) => equip.materials.forEach((material) => {
                    var legal = card.name === "guohe" ? lib.filter.canBeDiscarded : lib.filter.canBeGained;
                    if (legal && !legal(env.cards[material.id], player, actual)) return;
                    var action = add("CONTROL", card, "", [target.id], null, { controlId: material.id, controlEquip: equip.name });
                    if (action) action.selection.useTargetIds = [target.id];
                }));
            });
            if (card.name === "tiesuo" && aiEnabled(state, card, env, atRoot)) state.people.forEach((target) => {
                if (target.linked && lib.filter.targetEnabled2(env.cards[card.id], player, env.players[target.id])) {
                    var action = add("UNLINK", card, "", [target.id]);
                    if (action) action.selection.useTargetIds = [target.id];
                }
            });
        });
        if (weapon && weapon.name === "zhangba" && state.hand.length >= 2 && aiQuota(state, env) > 0) {
            for (var i = 0; i < state.hand.length; i++) for (var j = i + 1; j < state.hand.length; j++) {
                var cards = [state.hand[i], state.hand[j]];
                if (!cards.every((card) => !lib.filter.cardEnabled2 || lib.filter.cardEnabled2(env.cards[card.id], player) !== false)) continue;
                var sha = { name: "sha", color: cards[0].color === cards[1].color ? cards[0].color : "none", materials: cards.map((card) => card.id) };
                if (!aiEnabled(state, sha, env, atRoot)) continue;
                aiSets(state, sha, env, true).forEach((targets) => {
                    var action = add("NORMAL_SHA", cards[0], "", targets, sha, { materials: sha.materials.slice() });
                    if (action) action.selection = { skillId: "zhangba_skill", materialIds: sha.materials.slice(), useTargetIds: targets.slice() };
                });
            }
        }
        var fireChoices = candidates.filter((action) => action.sha && !action.sha.nature &&
            (action.weaponAction ? action.form : weapon && weapon.name) === "zhuque").map((action) => {
                var fire = aiClone(action);
                fire.sha.nature = "fire"; fire.fireFan = true; fire.id += ":fire";
                return fire;
            });
        return candidates.concat(fireChoices).sort((a, b) => a.id.localeCompare(b.id));
    }

    function aiNewWeapon(card, name) {
        var info = lib.card[name] || {};
        return { name: name, subtype: "equip1", range: card.name === name && card.range ? card.range : Math.max(1, 1 - (info.distance && info.distance.attackFrom || 0)),
            materials: [aiClone(card)], distance: info.distance ? Object.fromEntries(Object.entries(info.distance).filter((entry) => typeof entry[1] === "number")) : {} };
    }

    function aiDiscard(state, cards) {
        if (cards.some((card) => card.name === "sha")) state.discardSha = true;
    }

    function aiRemoveHand(state, ids, discard) {
        var removed = state.hand.filter((card) => ids.includes(card.id));
        state.hand = state.hand.filter((card) => !ids.includes(card.id));
        aiSelf(state).hands = state.hand.length;
        if (discard) aiDiscard(state, removed);
        return removed;
    }

    function aiDamageNumber(state, target, sha, amount, linked) {
        var weapon = aiWeapon(state), pierce = weapon && weapon.name === "qinggang" && !linked;
        var armors = pierce ? [] : target.equips.filter((equip) => equip.subtype === "equip2").map((equip) => equip.name);
        if (!linked && (armors.includes("renwang") && sha.color === "black" || armors.includes("tengjia") && !sha.nature)) return 0;
        if (weapon && weapon.name === "guding" && !linked && target.hands === 0) amount++;
        if (armors.includes("tengjia") && String(sha.nature).includes("fire")) amount++;
        if (armors.includes("baiyin")) amount = Math.min(1, amount);
        return amount;
    }

    function aiLosePublic(state, target, equip, gain, outcome) {
        target.equips = target.equips.filter((item) => item !== equip);
        if (target.id !== state.self) outcome.combat += target.team < 0 ? equip.materials.length : -equip.materials.length;
        if (gain) state.hand.push(...equip.materials);
        else aiDiscard(state, equip.materials);
        if (equip.name === "baiyin" && target.hp > 0 && target.hp < target.maxHp) {
            target.hp++;
            outcome.combat += target.team < 0 ? -4 : 4;
        }
        aiSelf(state).hands = state.hand.length;
    }

    function aiDamageEvent(outcome, targetId, sha, amount, linked) {
        var state = outcome.state, target = state.people.find((person) => person.id === targetId);
        var damage = aiDamageNumber(state, target, sha, amount, linked);
        if (!(damage > 0)) return;
        var hpBefore = target.hp, armorLoss = Math.min(target.hujia, damage), hpLoss = damage - armorLoss;
        target.hujia -= armorLoss;
        target.hp -= hpLoss;
        state.flow += damage * FLOW_PER_POINT;
        state.damaged = true;
        if (target.team < 0) {
            outcome.combat += 4 * Math.min(Math.max(0, hpBefore), hpLoss) + 2 * armorLoss;
            if (hpBefore > 0 && target.hp <= 0) { outcome.combat += 6; state.paused = true; }
        } else {
            outcome.combat -= 6 * hpLoss + 3 * armorLoss;
            outcome.friendLoss += hpLoss;
            if (hpBefore >= 2 && target.hp === 1) outcome.combat -= 4;
            if (target.hp <= 0) outcome.unsafe = true;
        }
        outcome.events.push({ kind: "damage", target: targetId, num: damage, hpLoss: hpLoss, armorLoss: armorLoss, linked: !!linked });
        // changeHp unlinks before source damageEnd; zhuofeng then gains even its own material.
        var spread = !!sha.nature && target.linked;
        if (spread) target.linked = false;
        var weapon = aiWeapon(state);
        if (weapon && weapon.name === "nihil_zhuofeng") {
            var stolen = target.equips.filter((equip) => equip.subtype === "equip1");
            stolen.forEach((equip) => aiLosePublic(state, target, equip, true, outcome));
            if (stolen.length) outcome.events.push({ kind: "gainWeapon", target: targetId, materials: stolen.flatMap((equip) => equip.materials.map((card) => card.id)) });
        }
        if (spread && !linked) {
            state.people.filter((person) => person.id !== targetId && person.linked).map((person) => person.id)
                .forEach((id) => aiDamageEvent(outcome, id, sha, damage, true));
        }
    }

    function aiHitWeight(target) {
        return !target.canShan || target.directHit || target.hands === 0 ? 1 : target.noShan ? 0.85 : target.hands === 1 ? 0.75 : 0.55;
    }

    function aiOutcomeClone(outcome) {
        return { state: aiClone(outcome.state), p: outcome.p, combat: outcome.combat, friendLoss: outcome.friendLoss,
            lost: outcome.lost, unsafe: outcome.unsafe, events: outcome.events.slice() };
    }

    function aiRespondBranches(outcome, targetId, sha) {
        var state = outcome.state, target = state.people.find((person) => person.id === targetId), weapon = aiWeapon(state);
        var p = aiHitWeight(target), bagua = target.canShan && !target.directHit &&
            !(weapon && weapon.name === "qinggang") && target.equips.some((equip) => equip.name === "bagua");
        var branches = [];
        function branch(weight, response) {
            if (!(weight > 0)) return;
            var result = aiOutcomeClone(outcome), nextTarget = result.state.people.find((person) => person.id === targetId);
            result.p *= weight;
            if (response === "hand") {
                nextTarget.hands = Math.max(0, nextTarget.hands - 1);
                nextTarget.noShan = false;
                result.combat += nextTarget.team < 0 ? 1 : -1;
            } else if (response === "hit" && nextTarget.canShan && !nextTarget.directHit) nextTarget.noShan = true;
            result.events.push({ kind: "response", target: targetId, source: response });
            branches.push({ outcome: result, hit: response === "hit" });
        }
        branch((bagua ? 0.5 : 1) * p, "hit");
        branch((bagua ? 0.5 : 1) * (1 - p), "hand");
        if (bagua) branch(0.5, "bagua");
        return branches;
    }

    function aiRisk(outcomes, value) {
        var values = outcomes.map((outcome) => ({ p: outcome.p, value: value(outcome) }));
        var mass = values.reduce((sum, entry) => sum + entry.p, 0);
        return mass ? 0.8 * values.reduce((sum, entry) => sum + entry.p * entry.value, 0) / mass +
            0.2 * Math.min(...values.map((entry) => entry.value)) : 0;
    }

    function aiImmediate(before, outcome, env) {
        return outcome.combat + aiResource(outcome.state, env.peachValue) - aiResource(before, env.peachValue) +
            aiFallbackValue(outcome.state) - aiFallbackValue(before);
    }

    function aiMissOptions(outcome, targetId, sha, amount, env, nested) {
        var weapon = aiWeapon(outcome.state), options = [[outcome]];
        if (!weapon) return options;
        if (weapon.name === "guanshi") {
            var pool = outcome.state.hand.concat(aiSelf(outcome.state).equips.filter((equip) => equip !== weapon).flatMap((equip) => equip.materials));
            for (var i = 0; i < pool.length; i++) for (var j = i + 1; j < pool.length; j++) {
                var result = aiOutcomeClone(outcome), ids = [pool[i].id, pool[j].id];
                if (lib.filter.cardDiscardable && ids.some((id) => !lib.filter.cardDiscardable(env.cards[id], env.player, "guanshi_skill"))) continue;
                aiRemoveHand(result.state, ids, true);
                var self = aiSelf(result.state);
                self.equips.filter((equip) => equip.materials.some((card) => ids.includes(card.id)))
                    .forEach((equip) => aiLosePublic(result.state, self, equip, false, result));
                result.events.push({ kind: "axe", materials: ids });
                aiDamageEvent(result, targetId, sha, amount, false);
                options.push([result]);
            }
        }
        if (weapon.name === "qinglong") outcome.state.hand.filter((card) => card.name === "sha").forEach((card) => {
            var result = aiOutcomeClone(outcome);
            if (!aiEnabled(result.state, card, env, false)) return;
            aiRemoveHand(result.state, [card.id], true);
            var follow = { name: "sha", color: card.color, nature: card.nature, materials: [card.id] };
            result.events.push({ kind: "qinglong", materials: [card.id], target: targetId });
            options.push(aiAttack(result, [targetId], follow, 1, env, true));
        });
        return options;
    }

    function aiAttack(outcome, targets, sha, amount, env, nested) {
        var results = [outcome];
        targets.forEach((targetId) => {
            var expanded = [];
            results.forEach((start) => {
                var target = start.state.people.find((person) => person.id === targetId), weapon = aiWeapon(start.state);
                var starts = [start];
                if (weapon && weapon.name === "cixiong" && aiSelf(start.state).sex !== "unknown" && target.sex !== "unknown" &&
                    aiSelf(start.state).sex !== target.sex) {
                    var draw = aiOutcomeClone(start); draw.state.unknownCards++;
                    starts = [draw];
                    if (target.hands) {
                        var discard = aiOutcomeClone(start), person = discard.state.people.find((person) => person.id === targetId);
                        person.hands--; discard.combat += person.team < 0 ? 1 : -1;
                        starts.push(discard);
                    }
                    starts.sort((a, b) => aiImmediate(start.state, a, env) - aiImmediate(start.state, b, env));
                    starts = [starts[0]];
                }
                starts.forEach((prepared) => aiRespondBranches(prepared, targetId, sha).forEach((branch) => {
                    if (branch.hit) {
                        var result = branch.outcome;
                        var active = aiWeapon(result.state);
                        if (active && active.name === "qilin") {
                            var victim = result.state.people.find((person) => person.id === targetId);
                            var horse = victim.equips.find((equip) => ["equip3", "equip4", "equip6"].includes(equip.subtype));
                            if (horse && victim.team < 0) aiLosePublic(result.state, victim, horse, false, result);
                        }
                        var damage = aiOutcomeClone(result);
                        aiDamageEvent(damage, targetId, sha, amount, false);
                        var choices = [damage];
                        if (active && active.name === "hanbing") {
                            var cancel = aiOutcomeClone(result), victim = cancel.state.people.find((person) => person.id === targetId);
                            for (var n = 0; n < 2; n++) {
                                var equip = victim.equips[0];
                                if (equip) aiLosePublic(cancel.state, victim, equip, false, cancel);
                                else if (victim.hands) { victim.hands--; cancel.combat += victim.team < 0 ? 1 : -1; }
                            }
                            cancel.events.push({ kind: "hanbing", target: targetId });
                            choices.push(cancel);
                        }
                        choices.sort((a, b) => Number(a.unsafe) - Number(b.unsafe) || aiImmediate(start.state, b, env) - aiImmediate(start.state, a, env));
                        expanded.push(choices[0]);
                    } else {
                        var options = aiMissOptions(branch.outcome, targetId, sha, amount, env, nested);
                        options = options.filter((option) => option.every((result) => !result.unsafe));
                        options.sort((a, b) => aiRisk(b, (result) => aiImmediate(start.state, result, env)) -
                            aiRisk(a, (result) => aiImmediate(start.state, result, env)));
                        expanded.push(...(options[0] || [branch.outcome]));
                    }
                }));
            });
            results = expanded;
        });
        return results;
    }

    function aiTransition(state, action, env) {
        var outcome = { state: aiClone(state), p: 1, combat: 0, friendLoss: 0, lost: 0, unsafe: false, events: [] };
        var next = outcome.state, materials = aiRemoveHand(next, action.materials,
            !["LINGREN", "EQUIP_WEAPON", "PREP_EQUIP"].includes(action.kind));
        if (materials.length !== action.materials.length) return [];
        if (action.weaponAction) {
            var self = aiSelf(next), old = self.equips.filter((equip) => equip.subtype === "equip1");
            var oldMaterials = old.flatMap((equip) => equip.materials);
            if (old.length) {
                self.equips = self.equips.filter((equip) => !old.includes(equip));
                if (oldMaterials.length && next.flow >= next.cost) {
                    next.flow -= next.cost; next.cost = Math.max(0, next.cost - 1);
                    next.hand.push(...oldMaterials);
                    outcome.events.push({ kind: "recover", materials: oldMaterials.map((card) => card.id), pay: state.cost });
                } else { aiDiscard(next, oldMaterials); outcome.lost += oldMaterials.length; }
            }
            self.equips.push(aiNewWeapon(materials[0], action.form));
            self.hands = next.hand.length;
            if (!next.usedNames.includes(action.form)) { next.usedNames.push(action.form); next.usedNames.sort(); }
        } else if (action.kind === "NORMAL_SHA") next.normalUsed++;
        else if (action.kind === "WINE") { next.wine++; next.wineUsed++; }
        else if (action.kind === "HEAL") { aiSelf(next).hp++; outcome.combat += 4; }
        else if (action.kind === "PREP_EQUIP") {
            var self = aiSelf(next), card = materials[0], old = self.equips.find((equip) => equip.subtype === card.subtype);
            if (old) { aiLosePublic(next, self, old, false, outcome); outcome.lost += old.materials.length; }
            self.equips.push({ name: card.name, subtype: card.subtype, materials: materials, range: card.range, distance: card.distance });
        } else if (action.kind === "CONTROL") {
            var target = next.people.find((person) => person.id === action.targets[0]);
            var equip = target.equips.find((item) => item.materials.some((card) => card.id === action.controlId));
            if (!equip) return [];
            aiLosePublic(next, target, equip, materials[0].name === "shunshou", outcome);
        } else if (action.kind === "UNLINK") next.people.find((person) => person.id === action.targets[0]).linked = false;
        if (!action.sha || !action.targets.length) return [outcome];
        var amount = 1 + next.wine;
        next.wine = 0;
        return aiAttack(outcome, action.targets, action.sha, amount, env, false);
    }

    function aiCompare(a, b) {
        return b.score - a.score || a.friendLoss - b.friendLoss || a.lost - b.lost ||
            a.steps - b.steps || a.id.localeCompare(b.id);
    }

    function aiSafety(state, action, env) {
        if (!action.sha) return true;
        var next = aiClone(state);
        if (action.weaponAction) {
            aiSelf(next).equips = aiSelf(next).equips.filter((equip) => equip.subtype !== "equip1");
            aiSelf(next).equips.push(aiNewWeapon(state.hand.find((card) => card.id === action.materials[0]), action.form));
        }
        var result = { state: next, p: 1, combat: 0, friendLoss: 0, lost: 0, unsafe: false, events: [] };
        action.targets.forEach((id) => aiDamageEvent(result, id, action.sha, 1 + state.wine, false));
        return !result.unsafe;
    }

    function aiEvaluate(state, action, env) {
        if (!aiSafety(state, action, env)) return { action: action, outcomes: [], invalid: "FRIEND_DYING_UPPER_BOUND" };
        var outcomes = aiTransition(state, action, env);
        if (!outcomes.length || outcomes.some((outcome) => outcome.unsafe)) return { action: action, outcomes: [], invalid: "UNSAFE_OR_MATERIAL_LOST" };
        var merged = new Map();
        outcomes.forEach((outcome) => {
            var key = aiStateKey(outcome.state) + "|" + outcome.combat + "|" + outcome.friendLoss + "|" + outcome.lost;
            var previous = merged.get(key);
            if (previous) previous.p += outcome.p;
            else merged.set(key, outcome);
        });
        outcomes = Array.from(merged.values());
        return { action: action, outcomes: outcomes, direct: aiRisk(outcomes, (outcome) => aiImmediate(state, outcome, env)) };
    }

    function aiWitness(state, evaluation, env, seen, depth) {
        if (evaluation.invalid || !depth) return null;
        var outcomes = evaluation.outcomes.slice().sort((a, b) => {
            var damageA = a.events.filter((event) => event.kind === "damage").length;
            var damageB = b.events.filter((event) => event.kind === "damage").length;
            return damageB - damageA || b.state.flow - a.state.flow;
        });
        var outcome = outcomes[0], key = aiStateKey(outcome.state);
        if (seen.has(key) || outcome.state.paused) return { evaluation: evaluation, outcome: outcome, next: null };
        var path = new Set(seen); path.add(key);
        var actions = aiCandidates(outcome.state, env, false), next = null;
        var evaluated = actions.map((action) => aiEvaluate(outcome.state, action, env)).filter((item) => !item.invalid);
        evaluated.sort((a, b) => b.direct - a.direct || Number(b.outcomes.some((o) => o.events.some((e) => e.kind === "recover"))) -
            Number(a.outcomes.some((o) => o.events.some((e) => e.kind === "recover"))) || a.action.id.localeCompare(b.action.id));
        for (var candidate of evaluated) {
            if (candidate.direct > 0 || candidate.outcomes.some((o) => o.events.some((e) => e.kind === "recover"))) {
                next = aiWitness(outcome.state, candidate, env, path, depth - 1);
                if (next) break;
            }
        }
        return { evaluation: evaluation, outcome: outcome, next: next };
    }

    function aiPlan(snapshot, memory) {
        var state = snapshot.state, env = snapshot.env, start = Date.now();
        env.initial = state; env.peachValue = aiSelf(state).hp <= 2 ? 5 : 3;
        memory = memory || { tidy: 0, failed: new Set(), reached: new Map() };
        var actions = aiCandidates(state, env, true), trace = { version: 2, depth: 6, candidates: [],
            directResults: 0, witnessStates: 0, expanded: 0, perRootLimit: 256, globalLimit: 8192, milliseconds: 0, gaps: env.gaps };
        snapshot.candidates = actions;
        var roots = actions.map((action) => {
            var evaluation = aiEvaluate(state, action, env);
            trace.directResults += evaluation.outcomes.length;
            if (memory.failed.has(snapshot.key + "|" + action.id)) evaluation.invalid = "FAILED_IN_THIS_STATE";
            if (memory.reached.has(snapshot.key + "|" + action.id)) evaluation.invalid = "REPEATED_PHASE_ACTION";
            var node = { state: state, evaluation: evaluation, depth: 6, seen: new Set([snapshot.key]), children: null };
            return { action: action, evaluation: evaluation, node: node, count: 0, queue: [], witness: null };
        });
        roots.filter((root) => !root.evaluation.invalid).forEach((root) => {
            root.witness = aiWitness(state, root.evaluation, env, new Set([snapshot.key]), 6);
            var witness = root.witness;
            while (witness) { trace.witnessStates++; witness = witness.next; }
            root.queue.push(root.node);
        });
        function expand(root, node) {
            if (node.depth <= 1 || node.evaluation.invalid) return;
            node.expanded = true;
            if (!node.children) node.children = [];
            for (var outcome of node.evaluation.outcomes) {
                var key = aiStateKey(outcome.state), child = node.children.find((item) => item.outcome === outcome);
                if (!child) { child = { outcome: outcome, actions: [] }; node.children.push(child); }
                child.actions.forEach((action) => root.queue.push(action));
                if (outcome.state.paused || node.seen.has(key)) continue;
                var path = new Set(node.seen); path.add(key);
                for (var action of aiCandidates(outcome.state, env, false)) {
                    if (child.actions.some((node) => node.evaluation.action.id === action.id)) continue;
                    var evaluation = aiEvaluate(outcome.state, action, env), needed = 1 + evaluation.outcomes.length;
                    if (root.count + needed > 256 || trace.expanded + needed > 8192) break;
                    root.count += needed; trace.expanded += needed;
                    if (!evaluation.invalid) {
                        var next = { state: outcome.state, evaluation: evaluation, depth: node.depth - 1, seen: path, children: null };
                        child.actions.push(next); root.queue.push(next);
                    }
                }
            }
        }
        function graft(root, node, witness) {
            if (!witness || !witness.next || node.depth <= 1) return;
            var wanted = aiStateKey(witness.outcome.state), nextWitness = witness.next;
            if (!node.children) node.children = node.evaluation.outcomes.map((outcome) => ({ outcome: outcome, actions: [] }));
            var child = node.children.find((item) => aiStateKey(item.outcome.state) === wanted);
            if (!child) return;
            var next = { state: child.outcome.state, evaluation: nextWitness.evaluation, depth: node.depth - 1,
                seen: new Set([...node.seen, wanted]), children: null };
            child.actions.push(next); graft(root, next, nextWitness);
        }
        roots.forEach((root) => graft(root, root.node, root.witness));
        var progress = true;
        while (progress && trace.expanded < 8192 && Date.now() - start < 180) {
            progress = false;
            roots.forEach((root) => {
                if (root.count >= 256 || !root.queue.length) return;
                var node = root.queue.shift();
                progress = true;
                if (node.expanded) return;
                expand(root, node);
            });
        }
        function score(node) {
            if (node.evaluation.invalid) return -Infinity;
            return aiRisk(node.evaluation.outcomes, (outcome) => {
                var child = node.children && node.children.find((entry) => entry.outcome === outcome);
                var follow = child ? Math.max(0, ...child.actions.map(score)) : 0;
                return aiImmediate(node.state, outcome, env) + 0.9 * follow;
            });
        }
        var scored = roots.map((root) => {
            var outcomes = root.evaluation.outcomes;
            var result = Object.assign({}, root.action, { score: score(root.node), directScore: root.evaluation.direct || 0,
                friendLoss: outcomes.length ? Math.max(...outcomes.map((o) => o.friendLoss)) : 0,
                lost: outcomes.length ? Math.max(...outcomes.map((o) => o.lost)) : 0, steps: 1,
                reason: root.evaluation.invalid || "CONDITIONAL_Q", snapshotKey: snapshot.key });
            var witness = [], link = root.witness;
            while (link) {
                witness.push({ action: link.evaluation.action.id, materials: link.evaluation.action.materials,
                    targets: link.evaluation.action.targets, flow: link.outcome.state.flow, cost: link.outcome.state.cost,
                    weapon: aiWeapon(link.outcome.state) && aiWeapon(link.outcome.state).name,
                    events: link.outcome.events }); link = link.next;
            }
            result.witness = witness;
            trace.candidates.push({ id: result.id, kind: result.kind, form: result.form, materials: result.materials,
                targets: result.targets, score: Number.isFinite(result.score) ? result.score : null,
                directScore: result.directScore, reason: result.reason, results: outcomes.length, expanded: root.count, witness: witness });
            return result;
        }).sort(aiCompare);
        var heal = scored.find((action) => action.kind === "HEAL");
        var selected = aiSelf(state).hp <= 2 && heal ? Object.assign({}, heal, { reason: "SELF_RECOVERY" }) : scored.find((action) => action.score > 0);
        var decisive = selected && selected.sha && !selected.friendLoss && roots.find((root) => root.action.id === selected.id).evaluation.outcomes.every((outcome) =>
            outcome.events.some((event) => event.kind === "damage" && outcome.state.people.find((person) => person.id === event.target).team < 0 &&
                outcome.state.people.find((person) => person.id === event.target).hp <= 0));
        var information = state.hand.find((card) => card.name === "wuzhong" && aiEnabled(state, card, env, true) &&
            !aiExcluded(env.root, aiSelection("INFORMATION", env.cards[card.id], env.player)) && aiRead(() => get.effect(env.player, env.cards[card.id], env.player, env.player)) > 0);
        if (information && !decisive && !(aiSelf(state).hp <= 2 && heal)) selected = {
            kind: "INFORMATION", id: "INFORMATION:" + information.id, reason: "GET_NEW_INFORMATION",
            selection: aiSelection("INFORMATION", env.cards[information.id], env.player), score: 0, materials: [information.id], targets: [],
        };
        if (!selected && !memory.tidy) {
            var old = aiWeapon(state), oldValue = old && get.equipValue ? aiRead(() => get.equipValue({ name: old.name }, env.player)) : 0;
            var tidy = scored.filter((action) => action.weaponAction && !action.targets.length && !action.lost &&
                (!old || state.cost === 0) && action.reason === "CONDITIONAL_Q").map((action) => ({ action: action,
                    value: get.equipValue ? aiRead(() => get.equipValue({ name: action.form }, env.player)) : (lib.card[action.form] || {}).ai?.basic?.equipValue || 0 }))
                .filter((item) => item.value > oldValue).sort((a, b) => b.value - a.value || a.action.id.localeCompare(b.action.id))[0];
            if (tidy) selected = Object.assign({}, tidy.action, { tidy: true, reason: "COST_FREE_EQUIPMENT_IMPROVEMENT" });
        }
        trace.milliseconds = Date.now() - start;
        trace.selected = selected ? selected.id : "NATIVE";
        var attackBefore = selected && selected.weaponAction && selected.sha ? aiTransition(state, Object.assign({}, selected, { sha: null }), env)[0] : null;
        return selected ? Object.assign({}, selected, { snapshotKey: snapshot.key, trace: trace,
            attackBeforeKey: attackBefore && aiStateKey(attackBefore.state) }) :
            { kind: "NATIVE", reason: "NO_POSITIVE_COMPLETE_Q", snapshotKey: snapshot.key, trace: trace };
    }

    function buildJianhuaSnapshot(player, root) {
        var snapshot = aiRead(() => aiCapture(player, root));
        snapshot.env.initial = snapshot.state;
        snapshot.env.peachValue = aiSelf(snapshot.state).hp <= 2 ? 5 : 3;
        snapshot.candidates = aiRead(() => aiCandidates(snapshot.state, snapshot.env, true));
        return snapshot;
    }

    function decideJianhuaAction(snapshot, memory) { return aiRead(() => aiPlan(snapshot, memory)); }

    function currentJianhuaDecision(player, root) {
        if (aiReading) return null;
        root = root || aiRoot(_status.event, player);
        if (!root) return null;
        if (root.skill === "nihil_lingren_backup" && root._nihilJianhuaBoundDecision) return root._nihilJianhuaBoundDecision;
        var snapshot = buildJianhuaSnapshot(player, root);
        var key = snapshot.key + "|" + (root._aiexclude || []).map(aiId).join(",");
        if (root._nihilJianhuaSnapshotKey !== key) {
            var previous = root._nihilJianhuaDecision, memory = aiMemory(root);
            if (previous && previous.selection && aiExcluded(root, previous.selection)) memory.failed.add(previous.snapshotKey + "|" + previous.id);
            root._nihilJianhuaDecision = decideJianhuaAction(snapshot, memory);
            root._nihilJianhuaSnapshotKey = key;
            root._nihilJianhuaBoundDecision = null;
        }
        return root._nihilJianhuaDecision;
    }

    function aiManaged(card, player) {
        return typeof card === "string" ? card.startsWith("nihil_lingren") || card === "zhangba_skill" :
            !!weaponName(card, player) || ["equip2", "equip3", "equip4", "equip6"].includes(get.subtype(card, player)) ||
            ["sha", "jiu", "guohe", "shunshou", "tiesuo"].includes(get.name(card, player));
    }

    function aiMatches(decision, item) {
        if (!decision || !decision.selection) return false;
        var selection = decision.selection;
        return typeof item === "string" ? item === selection.skillId || item === selection.skillId + "_backup" : aiId(item) === selection.physicalCardId;
    }

    function aiNativeOrder(player) { return aiRead(() => get.order ? get.order({ name: "sha" }, player) || 3 : 3); }

    function aiNativeBlocked(decision, item, player) {
        if (!decision || decision.selection) return false;
        if (typeof item === "string") return item.startsWith("nihil_lingren") || item === "zhangba_skill";
        var name = get.name(item, player);
        if (name === "sha" || name === "jiu") return true;
        if (weaponName(item, player)) {
            var roots = decision.trace.candidates.filter((candidate) => candidate.materials.includes(aiId(item)));
            return roots.length > 0 && roots.every((candidate) => /DYING|UNSAFE|FAILED|REPEATED/.test(candidate.reason));
        }
        return false;
    }

    function aiOrder(player, card) {
        if (aiReading || !aiRoot(_status.event, player)) return;
        var decision = currentJianhuaDecision(player);
        if (!decision || !decision.selection) return aiNativeBlocked(decision, card, player) ? 0 : undefined;
        if (aiMatches(decision, card)) return decision.reason === "SELF_RECOVERY" || decision.kind === "INFORMATION" ? 20 : aiNativeOrder(player);
        if (aiManaged(card, player)) return 0;
    }

    function prepareJianhuaChoose(event) {
        var player = event.player;
        if (!aiRoot(event, player) || !player.isPhaseUsing()) {
            aiPrepareQinglong(event, player);
            return;
        }
        if (!event._nihilJianhuaWrapped) {
            event._nihilJianhuaWrapped = true;
            event._nihilJianhuaOriginalFilter = event.filterCard;
            event._nihilJianhuaNativeAi1 = event.ai1;
            event._nihilJianhuaNativeAi2 = event.ai2;
            event.ai1 = function (item, cards) {
                var decision = currentJianhuaDecision(player, event);
                if (decision && decision.selection) {
                    if (event.skill === "nihil_lingren_backup" || event.skill === "zhangba_skill")
                        return decision.selection.materialIds.includes(aiId(item)) ? 10 : 0;
                    if (aiMatches(decision, item)) return aiOrder(player, item);
                    if (aiManaged(item, player)) return 0;
                }
                if (aiNativeBlocked(decision, item, player)) return 0;
                return event._nihilJianhuaNativeAi1 ? aiRead(() => event._nihilJianhuaNativeAi1(item, cards)) :
                    aiRead(() => get.order(item, player));
            };
            event.ai2 = function (target) {
                var decision = currentJianhuaDecision(player, event);
                if (decision && decision.selection &&
                    (!event.skill || event.skill === decision.selection.skillId || event.skill === decision.selection.skillId + "_backup")) {
                    if (target === undefined && event.filterTarget === undefined && event.skill === "nihil_lingren" && decision.selection.skillId === event.skill) return 10;
                    var chosen = ui.selected.cards || [];
                    if (event.skill || chosen.some((card) => aiMatches(decision, card)))
                        return decision.selection.useTargetIds.includes(aiId(target)) ? 10 : -10;
                }
                return event._nihilJianhuaNativeAi2 ? aiRead(() => event._nihilJianhuaNativeAi2(target)) : 0;
            };
        }
        currentJianhuaDecision(player, event);
    }

    function recordJianhuaResolution(use, player) {
        (aiPendingNoShan.get(use) || []).forEach((record) => aiNoShan.set(record.target, { gainCount: record.gainCount }));
        aiPendingNoShan.delete(use);
        var phase = use.getParent && use.getParent("phaseUse", true);
        if (!phase || !aiPhases.has(phase)) return;
        var memory = aiPhases.get(phase);
        if (memory.resolved.has(use)) return;
        memory.resolved.add(use);
        var root = use.getParent && use.getParent("chooseToUse", true);
        var decision = root && (root._nihilJianhuaBoundDecision || root._nihilJianhuaDecision);
        if (decision && decision.selection && decision.selection.materialIds.every((id) => (use.cards || []).some((card) => aiId(card) === id))) {
            memory.reached.set(decision.snapshotKey + "|" + decision.id, true);
            if (decision.tidy) memory.tidy++;
            memory.last = { before: decision.snapshotKey, action: decision.id };
        }
        if (root) root._nihilJianhuaSnapshotKey = null;
    }

    function aiActualTarget(player, sha, target) {
        var event = _status.event;
        if (event && event._nihilJianhuaActualScores) return event._nihilJianhuaActualScores[aiId(target)] || -10;
        var root = { player: player, filterCard: () => true, _aiexclude: [] }, snapshot = buildJianhuaSnapshot(player, root);
        var phaseRoot = event && event.getParent && event.getParent("chooseToUse", true);
        var approved = phaseRoot && (phaseRoot._nihilJianhuaBoundDecision || phaseRoot._nihilJianhuaDecision);
        if (approved && approved.attackBeforeKey === snapshot.key && approved.targets.every((id) =>
            legalShaTargets(player, sha).some((actual) => aiId(actual) === id))) {
            var bound = approved.targets[0];
            if (event) {
                event._nihilJianhuaActualScores = Object.fromEntries(legalShaTargets(player, sha).map((actual) => [aiId(actual), aiId(actual) === bound ? 10 : -10]));
                event._nihilJianhuaActualDecision = { id: bound, reason: "BOUND_CONDITIONAL_Q_TARGET" };
            }
            return aiId(target) === bound ? 10 : -10;
        }
        var choices = legalShaTargets(player, sha).map((actual) => {
            var action = { kind: "NORMAL_SHA", materials: [], targets: [aiId(actual)], sha: sha, id: "ACTUAL:" + aiId(actual) };
            var outcome = { state: aiClone(snapshot.state), p: 1, combat: 0, friendLoss: 0, lost: 0, unsafe: false, events: [] };
            var results = aiRead(() => aiAttack(outcome, action.targets, sha, 1 + snapshot.state.wine, snapshot.env, false));
            return { id: aiId(actual), score: aiRisk(results, (result) => aiImmediate(snapshot.state, result, snapshot.env)),
                friendLoss: Math.max(...results.map((result) => result.friendLoss)), unsafe: results.some((result) => result.unsafe) };
        }).sort((a, b) => Number(a.unsafe) - Number(b.unsafe) ||
            (a.unsafe && b.unsafe ? a.friendLoss - b.friendLoss : b.score - a.score) || a.friendLoss - b.friendLoss || a.id.localeCompare(b.id));
        var scores = Object.fromEntries(choices.map((choice, index) => [choice.id, index === 0 ? 10 : -10]));
        if (event) { event._nihilJianhuaActualScores = scores; event._nihilJianhuaActualDecision = choices[0]; }
        return scores[aiId(target)] || -10;
    }

    function aiWindowSnapshot(player) {
        var snapshot = buildJianhuaSnapshot(player, { player: player, filterCard: () => true, _aiexclude: [] });
        return snapshot;
    }

    function aiWindowTrigger(event) {
        var parent = event.getParent && event.getParent();
        var skill = event.logSkill || parent && (parent.skill || parent.name) || "";
        if (Array.isArray(skill)) skill = skill[0];
        var trigger = parent && (parent._trigger || parent.getTrigger && parent.getTrigger());
        return { skill: skill, trigger: trigger };
    }

    function aiPrepareWindow(event, player) {
        var window = aiWindowTrigger(event), trigger = window.trigger;
        if (!trigger && !["guohe", "shunshou", "hanbing_skill"].includes(window.skill)) return;
        if (window.skill === "zhuque_skill" && event.name === "chooseBool" && trigger) {
            var snapshot = aiWindowSnapshot(player), state = snapshot.state;
            var targets = trigger.targets.map(aiId), options = ["", "fire"].map((nature) => {
                var start = { state: aiClone(state), p: 1, combat: 0, friendLoss: 0, lost: 0, unsafe: false, events: [] };
                var sha = { name: "sha", color: get.color(trigger.card, player), nature: nature };
                var outcomes = aiRead(() => aiAttack(start, targets, sha, (trigger.baseDamage || 1) + state.wine, snapshot.env, false));
                return { nature: nature, unsafe: outcomes.some((outcome) => outcome.unsafe),
                    score: aiRisk(outcomes, (outcome) => aiImmediate(state, outcome, snapshot.env)) };
            });
            event.ai = () => !options[1].unsafe && (options[0].unsafe || options[1].score > options[0].score);
            event._nihilJianhuaWindowDecision = { skill: "zhuque_skill", options: options };
        }
        if (window.skill === "hanbing_skill" && event.name === "chooseBool" && trigger) {
            var snapshot = aiWindowSnapshot(player), state = snapshot.state, target = aiId(trigger.player);
            var damage = { state: aiClone(state), p: 1, combat: 0, friendLoss: 0, lost: 0, unsafe: false, events: [] };
            var sha = Object.assign({}, trigger.card, { nature: trigger.nature || get.nature(trigger.card, false) });
            aiDamageEvent(damage, target, sha, trigger.num || 1, false);
            var cancel = { state: aiClone(state), p: 1, combat: 0, friendLoss: 0, lost: 0, unsafe: false, events: [] };
            var victim = cancel.state.people.find((person) => person.id === target);
            for (var n = 0; n < 2; n++) {
                var equip = victim.equips[0];
                if (equip) aiLosePublic(cancel.state, victim, equip, false, cancel);
                else if (victim.hands) { victim.hands--; cancel.combat += victim.team < 0 ? 1 : -1; }
            }
            var preferCancel = damage.unsafe || aiImmediate(state, cancel, snapshot.env) > aiImmediate(state, damage, snapshot.env);
            event.ai = () => preferCancel;
            event._nihilJianhuaWindowDecision = { skill: window.skill, cancel: preferCancel,
                normal: aiImmediate(state, damage, snapshot.env), discard: aiImmediate(state, cancel, snapshot.env) };
        }
        if (window.skill === "guanshi_skill" && event.name === "chooseToDiscard") {
            var snapshot = aiWindowSnapshot(player), state = snapshot.state;
            var outcome = { state: aiClone(state), p: 1, combat: 0, friendLoss: 0, lost: 0, unsafe: false, events: [] };
            var sha = Object.assign({}, trigger.card, { nature: trigger.nature || get.nature(trigger.card, false) });
            var options = aiRead(() => aiMissOptions(outcome, aiId(trigger.target), sha,
                (trigger.baseDamage || 1) + (trigger.extraDamage || 0), snapshot.env, true));
            var profitable = options.filter((option) => option.every((result) => !result.unsafe))
                .map((option) => ({ option: option, score: aiRisk(option, (result) => aiImmediate(state, result, snapshot.env)) }))
                .sort((a, b) => b.score - a.score)[0];
            var ids = profitable && profitable.score > 0 ? profitable.option[0].events.find((item) => item.kind === "axe")?.materials || [] : [];
            event.ai = (card) => ids.includes(aiId(card)) ? 10 : -10;
            event._nihilJianhuaWindowDecision = { skill: window.skill, materials: ids, score: profitable && profitable.score || 0 };
        }
        if (["choosePlayerCard", "discardPlayerCard", "gainPlayerCard"].includes(event.name) && ["guohe", "shunshou", "hanbing_skill"].includes(window.skill)) {
            var parent = event.getParent && event.getParent("chooseToUse", true);
            var decision = parent && parent._nihilJianhuaDecision;
            var original = event.ai;
            event.ai = (button) => {
                var card = button.link;
                if (decision && decision.controlId === aiId(card) && get.position(card) === "e") return 20;
                if (get.position(card) === "h" && event.target !== player) return 1;
                return original ? aiRead(() => original(button)) : get.buttonValue ? get.buttonValue(button) : 1;
            };
        }
    }

    function aiPrepareQinglong(event, player) {
        var window = aiWindowTrigger(event);
        if (event.type === "phase" || window.skill !== "qinglong_skill" || !window.trigger) return;
        var target = window.trigger.target, snapshot = aiWindowSnapshot(player), state = snapshot.state;
        var results = state.hand.filter((card) => card.name === "sha").map((card) => {
            var actual = snapshot.env.cards[card.id];
            if (!event.filterCard(actual, player, event)) return null;
            var start = { state: aiClone(state), p: 1, combat: 0, friendLoss: 0, lost: 0, unsafe: false, events: [] };
            aiRemoveHand(start.state, [card.id], true);
            var outcomes = aiRead(() => aiAttack(start, [aiId(target)], { name: "sha", nature: card.nature, color: card.color }, 1,
                snapshot.env, true));
            if (outcomes.some((outcome) => outcome.unsafe)) return null;
            return { id: card.id, score: aiRisk(outcomes, (outcome) => aiImmediate(state, outcome, snapshot.env)) };
        }).filter(Boolean).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
        var selected = results.find((result) => result.score > 0);
        event.ai1 = (card) => selected && selected.id === aiId(card) ? 10 : -10;
        event.ai2 = (actual) => actual === target ? 10 : -10;
        event._nihilJianhuaWindowDecision = { skill: "qinglong_skill", materials: selected ? [selected.id] : [], results: results };
    }


    var skills = {
        nihil_jianhua_skill: {
            locked: true,
            forced: true,
            onChooseToUse: prepareJianhuaChoose,
            group: [
                "nihil_jianhua_skill_equip",
                "nihil_jianhua_skill_fallback",
                "nihil_jianhua_skill_ai_record",
                "nihil_jianhua_skill_ai_observe",
                "nihil_jianhua_skill_ai_window",
            ],
            mod: {
                ignoredHandcard: (card, player) => {
                    if (weaponName(card, player)) return true;
                },
                aiOrder: aiOrder,
                aiUseful: (player, card) => {
                    if (aiReading || get.position(card) !== "h") return;
                    var event = _status.event, parent = event && event.getParent && event.getParent();
                    if (!event || event.name !== "chooseToDiscard" || event.player !== player ||
                        !parent || parent.name !== "phaseDiscard" || parent.player !== player) return;
                    var entry = chooseJianhuaKeepCards(aiKeepState(player)).entries.find((item) => item.id === aiId(card));
                    if (entry) return entry.keep / 10;
                },
            },
            subSkill: {
                ai_window: {
                    charlotte: true,
                    trigger: { player: ["chooseBoolBegin", "chooseToDiscardBegin", "choosePlayerCardBegin", "discardPlayerCardBegin", "gainPlayerCardBegin"] },
                    forced: true,
                    silent: true,
                    popup: false,
                    async content(event, trigger, player) {
                        aiPrepareWindow(trigger, player);
                    },
                },
                ai_observe: {
                    charlotte: true,
                    trigger: { player: "shaHit" },
                    forced: true,
                    silent: true,
                    popup: false,
                    async content(event, trigger) {
                        aiObserveShaHit(trigger);
                    },
                },
                ai_record: {
                    charlotte: true,
                    trigger: { player: "useCardAfter" },
                    forced: true,
                    silent: true,
                    popup: false,
                    async content(event, trigger, player) {
                        recordJianhuaResolution(trigger, player);
                    },
                },
                equip: {
                    trigger: { player: "equipAfter" },
                    forced: true,
                    popup: false,
                    filter: (event, player) => {
                        if (!alive(player) || !player.isPhaseUsing())
                            return false;
                        var equipped = equippedByUse(event, player);
                        // 装备次数不再受限，但每种武器在本回合只有第一次装备会产生虚拟【杀】。
                        return (
                            !!equipped &&
                            !usedWeapon(player, get.name(equipped, player))
                        );
                    },
                    async content(event, trigger, player) {
                        var equipped = equippedByUse(trigger, player);
                        if (!equipped) return;
                        var name = get.name(equipped, player);
                        player.addTempSkill(USED, { global: "phaseAfter" });
                        player.markAuto(USED, [name]);

                        var sha = {
                            name: "sha",
                            isCard: true,
                            storage: {
                                nihilJianhuaEquipSha: true,
                                nihilJianhuaWeapon: name,
                            },
                        };
                        var materials = equipped.cards || [];
                        if (materials.length) {
                            var nature = get.nature(materials[0], false);
                            if (nature) sha.nature = nature;
                        }
                        if (lib.filter.cardEnabled(sha, player) === false)
                            return;
                        var candidates = legalShaTargets(player, sha);
                        if (!candidates.length || !alive(player)) return;
                        if (player.getVEquips("nihil_hengsha").length) {
                            await player.useCard(sha, candidates, false);
                            return;
                        }
                        var result = await player
                            .chooseTarget(
                                true,
                                "剑华：视为使用一张不计次数的【杀】",
                                (card, owner, target) =>
                                    _status.event._nihilJianhuaTargets.includes(
                                        target,
                                    ),
                            )
                            .set("_nihilJianhuaTargets", candidates)
                            .set("ai", (target) => {
                                var request = _status.event;
                                return aiActualTarget(request.player, sha, target);
                            })
                            .forResult();
                        if (
                            !result.targets ||
                            result.targets.length !== 1 ||
                            !alive(player)
                        )
                            return;
                        var target = result.targets[0];
                        if (!legalShaTargets(player, sha).includes(target))
                            return;
                        await player.useCard(sha, target, false);
                    },
                },
                fallback: {
                    trigger: { player: "phaseJieshuBegin" },
                    forced: true,
                    filter: (event, player) =>
                        !player.getHistory(
                            "sourceDamage",
                            (damage) => damage.num > 0,
                        ).length && !!get.discardPile("sha"),
                    async content(event, trigger, player) {
                        var card = get.discardPile("sha");
                        if (card) await player.gain(card, "gain2");
                    },
                },
            },
        },
        nihil_jianhua_skill_used: {
            charlotte: true,
            mark: true,
            marktext: "锻",
            intro: {
                content: (storage) =>
                    "本回合已触发过虚拟【杀】的武器：" +
                    (storage || [])
                        .map((name) => get.translation(name))
                        .join("、"),
            },
            onremove: true,
        },
        nihil_lingren: {
            enable: "phaseUse",
            filter: (event, player) => {
                // v1.4 起同名武器不再限装一次，两种形态各自只要手里还有【杀】就能再转。
                return ["nihil_zhuofeng", "nihil_hengsha"].some((name) =>
                    player
                        .getCards("h")
                        .some(
                            (card) =>
                                get.name(card, player) === "sha" &&
                                event.filterCard(
                                    get.autoViewAs({ name: name }, [card]),
                                    player,
                                    event,
                                ),
                        ),
                );
            },
            chooseButton: {
                dialog: () =>
                    ui.create.dialog("灵刃", [
                        [
                            ["equip", "", "nihil_zhuofeng"],
                            ["equip", "", "nihil_hengsha"],
                        ],
                        "vcard",
                    ]),
                filter: (button, player) => {
                    var event = get.event().getParent();
                    var name = button.link[2];
                    return player
                        .getCards("h")
                        .some(
                            (card) =>
                                get.name(card, player) === "sha" &&
                                event.filterCard(
                                    get.autoViewAs({ name: name }, [card]),
                                    player,
                                    event,
                                ),
                        );
                },
                check: (button) => {
                    var player = get.player();
                    var decision = currentJianhuaDecision(player);
                    return decision && decision.selection && decision.selection.form === button.link[2] ? 10 : 0;
                },
                backup: (links, player) => {
                    player = player || get.player();
                    var root = aiRoot(_status.event, player);
                    var decision = currentJianhuaDecision(player, root);
                    if (root && decision && decision.selection && decision.selection.form === links[0][2])
                        root._nihilJianhuaBoundDecision = decision;
                    return {
                    audio: "nihil_lingren",
                    filterCard: (card, player) =>
                        get.position(card) === "h" &&
                        get.name(card, player) === "sha",
                    position: "h",
                    selectCard: 1,
                    popname: true,
                    viewAs: { name: links[0][2] },
                    check: (card) => {
                        var plan = currentJianhuaDecision(get.player());
                        return plan && plan.selection && plan.selection.form === links[0][2] &&
                            plan.selection.materialIds.includes(aiId(card)) ? 10 : -10;
                    },
                };
                },
                prompt: (links) =>
                    "###灵刃###将一张【杀】当作【" +
                    get.translation(links[0][2]) +
                    "】使用",
            },
            ai: {
                order: (item, player) => {
                    if (aiReading) return 0;
                    var decision = currentJianhuaDecision(player);
                    return decision && decision.selection && decision.selection.skillId === "nihil_lingren" ? aiNativeOrder(player) : 0;
                },
                result: {
                    player: (player) => {
                        var decision = currentJianhuaDecision(player);
                        return decision && decision.selection && decision.selection.skillId === "nihil_lingren" ? 1 : 0;
                    },
                },
            },
        },
        nihil_xinliu: {
            locked: true,
            forced: true,
            mark: true,
            marktext: "凝",
            intro: {
                name: "凝",
                name2: "凝",
                content: (storage, player) =>
                    "共有" +
                    player.countMark(FLOW_MARK) +
                    "个“凝”；下次用武器牌替换武器需消耗" +
                    flowCost(player) +
                    "个。",
            },
            group: [
                "nihil_xinliu_flow",
                "nihil_xinliu_preserve",
                "nihil_xinliu_gauge",
            ],
            subSkill: {
                flow: {
                    trigger: { source: "damageEnd" },
                    forced: true,
                    popup: false,
                    filter: (event) => event.num > 0,
                    async content(event, trigger, player) {
                        player.addMark(FLOW_MARK, trigger.num * FLOW_PER_POINT);
                    },
                },
                gauge: {
                    trigger: { player: "phaseBegin" },
                    forced: true,
                    popup: false,
                    async content(event, trigger, player) {
                        syncCostGauge(player);
                    },
                },
                preserve: {
                    trigger: { player: "replaceEquipEnd" },
                    forced: true,
                    popup: false,
                    filter: (event, player) =>
                        !!weaponReplacement(event, player) &&
                        player.countMark(FLOW_MARK) >= flowCost(player),
                    async content(event, trigger, player) {
                        var replacement = weaponReplacement(trigger, player);
                        var cost = flowCost(player);
                        if (!replacement || player.countMark(FLOW_MARK) < cost)
                            return;
                        var expected = [];
                        replacement.virtuals.forEach((virtual) => {
                            (virtual.cards || []).forEach((card) => {
                                if (!expected.includes(card))
                                    expected.push(card);
                            });
                        });
                        if (!expected.length) return;
                        var wrappers = replacement.cards.some(
                            (card) =>
                                card.isViewAsCard && Array.isArray(card.cards),
                        );
                        var removedVirtuals;
                        if (wrappers) {
                            var represented = [];
                            replacement.cards.forEach((card) => {
                                var cards =
                                    card.isViewAsCard &&
                                    Array.isArray(card.cards)
                                        ? card.cards
                                        : [card];
                                cards.forEach((material) => {
                                    if (!represented.includes(material))
                                        represented.push(material);
                                });
                            });
                            if (
                                expected.some(
                                    (card) => !represented.includes(card),
                                ) ||
                                represented.some(
                                    (card) => !expected.includes(card),
                                )
                            )
                                return;
                            await player.gain(replacement.cards, "gain2");
                            var hand = player.getCards("h");
                            if (
                                replacement.virtuals.some((virtual) =>
                                    player.getVEquips(1).includes(virtual),
                                ) ||
                                expected.some((card) => !hand.includes(card))
                            )
                                return;
                            removedVirtuals = replacement.virtuals;
                        } else {
                            if (
                                expected.some(
                                    (card) => !replacement.cards.includes(card),
                                ) ||
                                replacement.cards.some(
                                    (card) => !expected.includes(card),
                                )
                            )
                                return;
                            var detached = detachVirtuals(
                                player,
                                replacement.virtuals,
                            );
                            if (
                                !(await gainDetachedWeapons(
                                    player,
                                    player,
                                    detached,
                                    ["gain2"],
                                ))
                            )
                                return;
                            removedVirtuals = detached.virtuals;
                        }
                        if (cost > 0) player.removeMark(FLOW_MARK, cost);
                        trigger.result.cards = trigger.result.cards.filter(
                            (card) => !replacement.cards.includes(card),
                        );
                        trigger.result.vcards = trigger.result.vcards.filter(
                            (card) => !removedVirtuals.includes(card),
                        );
                        player.addTempSkill(FLOW_TURN, {
                            global: "phaseAfter",
                        });
                        player.storage[FLOW_TURN] =
                            (player.storage[FLOW_TURN] || 0) + 1;
                        syncCostGauge(player);
                    },
                },
            },
        },
        nihil_xinliu_turn: {
            charlotte: true,
            onremove: true,
        },
        nihil_xinliu_cost: {
            charlotte: true,
            mark: true,
            marktext: "费",
            intro: {
                name: "换装费",
                content: (storage, player) =>
                    "下次用武器牌替换武器需消耗" +
                    flowCost(player) +
                    "个“凝”（当前有" +
                    player.countMark(FLOW_MARK) +
                    "个）；本回合每成功保护一次旧武器此费用-1，最低0，新回合恢复为" +
                    COST_BASE +
                    "。",
                markcount: (storage, player) => "" + flowCost(player),
            },
        },
        nihil_zhuofeng_skill: {
            equipSkill: true,
            trigger: { source: "damageEnd" },
            forced: true,
            filter: (event) =>
                event.num > 0 &&
                event.card &&
                get.name(event.card) === "sha" &&
                event.player &&
                event.player.getEquips(1).length > 0,
            async content(event, trigger, player) {
                var detached = detachWeapons(trigger.player);
                await gainDetachedWeapons(trigger.player, player, detached, [
                    trigger.player,
                    "giveAuto",
                    "bySelf",
                ]);
            },
        },
        nihil_hengsha_skill: {
            equipSkill: true,
            trigger: { player: "useCard1" },
            forced: true,
            firstDo: true,
            filter: (event, player) => {
                if (get.name(event.card) !== "sha") return false;
                return game.hasPlayer(
                    (target) =>
                        target !== player &&
                        !event.targets.includes(target) &&
                        target.isIn() &&
                        lib.filter.targetEnabled2(event.card, player, target) &&
                        lib.filter.targetInRange(event.card, player, target),
                );
            },
            async content(event, trigger, player) {
                var targets = game.filterPlayer(
                    (target) =>
                        target !== player &&
                        !trigger.targets.includes(target) &&
                        target.isIn() &&
                        lib.filter.targetEnabled2(
                            trigger.card,
                            player,
                            target,
                        ) &&
                        lib.filter.targetInRange(trigger.card, player, target),
                );
                if (targets.length) trigger.targets.addArray(targets);
            },
            mod: {
                aiOrder: aiOrder,
            },
        },
    };

    window.nihilModules.jianhua = {
        character: {
            nihil_jianhua: {
                sex: "male",
                group: "zhong",
                hp: 4,
                maxHp: 4,
                skills: [
                    "nihil_jianhua_skill",
                    "nihil_lingren",
                    "nihil_xinliu",
                ],
                img:
                    "extension/" +
                    EXT_NAME +
                    "/image/character/nihil_jianhua.png",
            },
        },
        init: (lib, game) => {
            if (!lib.group.includes("zhong"))
                game.addGroup("zhong", "中", "中", {});
            lib.groupnature.zhong = "qun";
            Object.assign(lib.translate, {
                zhong: "中",
                zhong2: "中",
                zhong_short: "中",
                zhong_config: "中势力",
            });
        },
        card: {
            nihil_zhuofeng: {
                type: "equip",
                subtype: "equip1",
                distance: { attackFrom: -1 },
                skills: ["nihil_zhuofeng_skill"],
                ai: {
                    basic: {
                        equipValue: 5,
                    },
                },
            },
            nihil_hengsha: {
                type: "equip",
                subtype: "equip1",
                distance: { attackFrom: 0 },
                skills: ["nihil_hengsha_skill"],
                ai: {
                    basic: {
                        equipValue: 4,
                    },
                },
            },
        },
        skill: skills,
        aiDecision: {
            decide: decideJianhuaAction,
            chooseKeepCards: chooseJianhuaKeepCards,
            buildSnapshot: buildJianhuaSnapshot,
            current: currentJianhuaDecision,
            prepare: prepareJianhuaChoose,
            recordResolution: recordJianhuaResolution,
            memory: aiMemory,
            capture: aiCapture,
            candidates: aiCandidates,
            transition: aiTransition,
            evaluate: aiEvaluate,
            stateKey: aiStateKey,
            resource: aiResource,
            fallbackValue: aiFallbackValue,
            legalTargets: aiTargets,
            damageNumber: aiDamageNumber,
            observeShaHit: aiObserveShaHit,
            scoreActualTarget: aiActualTarget,
            prepareWindow: aiPrepareWindow,
            prepareQinglong: aiPrepareQinglong,
        },
        translate: {
            nihil_jianhua: "剑华",
            nihil_jianhua_skill: "剑华",
            nihil_jianhua_skill_used: "剑华",
            nihil_jianhua_skill_equip: "剑华",
            nihil_jianhua_skill_fallback: "剑华",
            nihil_jianhua_skill_info:
                "锁定技。武器牌不占用手牌上限。出牌阶段，每种武器牌首次装备后，你视为使用一张不计次数且无实体材料的【杀】（同一种武器此后再次装备不再产生【杀】）。若你的回合内未造成过伤害，回合结束时，你获得弃牌堆中的一张【杀】。",
            nihil_lingren: "灵刃",
            nihil_lingren_info:
                "你可以将一张手牌中的【杀】当武器牌【擢锋】（攻击范围2，你的【杀】对其目标造成伤害后获得其武器）或【横刹】（攻击范围1，你攻击范围内的所有其他角色都会成为【杀】的目标）装备。<b>“剑华”</b>以此法使用的【杀】附带原【杀】的属性。",
            nihil_xinliu: "心流",
            nihil_xinliu_flow: "心流",
            nihil_xinliu_preserve: "心流",
            nihil_xinliu_gauge: "心流",
            nihil_xinliu_turn: "心流",
            nihil_xinliu_cost: "心流",
            nihil_xinliu_info:
                "锁定技。当你造成伤害时，你获得3个<b>“凝”</b>（每1点伤害得3个）。当你使用武器牌替换武器时，若“凝”不小于X，你消耗X个“凝”，将被替换的武器牌改为移动至手牌（X初始为6；本回合每消耗一次则-1，最低为0，新回合恢复为6）。",
            nihil_zhuofeng: "擢锋",
            nihil_zhuofeng_info:
                "装备牌·武器，攻击范围2。你的【杀】对目标造成伤害后，若其装备区有武器牌，你获得之。",
            nihil_zhuofeng_skill: "擢锋",
            nihil_hengsha: "横刹",
            nihil_hengsha_info:
                "装备牌·武器，攻击范围1。当你使用【杀】时，所有在你攻击范围内且满足其余目标条件的其他角色均成为此【杀】的目标。",
            nihil_hengsha_skill: "横刹",
        },
        title: { nihil_jianhua: "刃随心流" },
        sort: ["nihil_jianhua"],
    };
})();
