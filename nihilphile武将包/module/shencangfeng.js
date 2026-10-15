(function () {
    window.nihilModules = window.nihilModules || {};

    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "Nihilphile";
    var SHI = "nihil_xushi";
    var shanEvidenceExcluded = new WeakSet();

    function shanObservation(trigger, name) {
        var resolution, target, response = false;
        if (name === "shaHit") {
            resolution = trigger;
            target = trigger.target;
        } else {
            if (typeof trigger.getParent !== "function" || !trigger.result) return null;
            resolution = trigger.getParent();
            if (!resolution) return null;
            if (name === "chooseToUseAfter") {
                if (resolution.name !== "sha" || trigger.type !== "respondShan") return null;
                if (!trigger.result.bool && trigger.toUse !== false) return null;
                if (trigger.result.bool && trigger.result.result !== "shaned") return null;
            } else if (name === "chooseToRespondAfter") {
                if (resolution.name !== "wanjian" || !trigger.respondTo ||
                    !trigger.respondTo[1] || get.name(trigger.respondTo[1]) !== "wanjian" ||
                    typeof trigger.result.bool !== "boolean") return null;
                response = true;
            } else return null;
            target = trigger.player;
            if (target !== resolution.target) return null;
            if (trigger.result.bool) return { resolution: resolution, target: target, success: true };
            if (trigger.toUse === false || trigger.toRespond === false) {
                return { resolution: resolution, target: target, declined: true };
            }
        }
        if (!target || resolution.directHit || resolution.directHit2 || shanEvidenceExcluded.has(resolution) ||
            target.countCards("hs") <= 0 || !lib.element || typeof lib.element.VCard !== "function") return null;
        if (typeof resolution.baseDamage === "number" && resolution.baseDamage + (resolution.extraDamage || 0) <= 0) return null;
        if (resolution.player && nativeAI(target) && get.attitude(target, resolution.player._trueMe || resolution.player) > 0 &&
            target.isLinked() && get.nature(resolution.card, resolution.player)) return null;
        var shan = new lib.element.VCard({ name: "shan" });
        if (response ? !lib.filter.cardRespondable(shan, target, trigger) :
            !lib.filter.cardEnabled(shan, target, "forceEnable")) return null;
        return { resolution: resolution, target: target, success: false };
    }

    function damagedWithShaThisTurn(player) {
        return player.getHistory("sourceDamage", function (damage) {
            return damage.num > 0 && damage.card &&
                get.name(damage.card, player) === "sha";
        }).length > 0;
    }

    function markedBadaoUse(event, player) {
        if (!event || event.name !== "useCard" || !event.card ||
            get.name(event.card, player) !== "sha" ||
            event._nihilBadaoOwnerId !== player.playerid) return null;
        return event;
    }

    function badaoUseFromDamage(event, player) {
        if (!event || event.num <= 0 || !event.card ||
            get.name(event.card, player) !== "sha" ||
            (event.source && event.source !== player) ||
            typeof event.getParent !== "function") return null;
        return markedBadaoUse(event.getParent("useCard"), player);
    }

    function canTie(player, target, card) {
        return !!target && target.isIn() &&
            lib.filter.targetEnabled2(card, player, target);
    }

    function analyzeSlash(state, card, target) {
        var nature = state.shi >= 3 ? "fire" : card.nature;
        var legal = target.id !== state.selfId &&
            (state.future ? card.futureTargets : card.legalTargets).includes(target.id) &&
            target.distance <= state.baseRange + state.shi;
        var result = { cardId: card.id, targetId: target.id, legal: legal,
            hitTier: "NORMAL", damage: 0, E: 0, F: 0, net: 0, enemyCount: 0,
            allyDying: 0, killSignal: false, largeChain: false, unsafe: false,
            unknown: !!state.sourceUnknown, base: card.effects[target.id] || 0, hp: target.hp,
            cost: card.value || 0, victims: [], victorySignal: false };
        if (state.future && card.futureEffects && card.futureEffects[nature || "normal"]) {
            result.base = card.futureEffects[nature || "normal"][target.id] || 0;
        }
        if (!legal) return result;
        function damageTo(victim, amount, direct) {
            var armor = direct && state.qinggang ? "" : victim.armor;
            if (direct && ((armor === "renwang" && card.color !== "red") ||
                (armor === "tengjia" && !nature))) return 0;
            if (armor === "tengjia" && nature === "fire") amount++;
            if (armor === "baiyin") amount = Math.min(1, amount);
            return amount;
        }
        var initial = damageTo(target, 1 + state.shi + (state.wine || 0), true);
        result.damage = Math.max(0, initial - target.hujia);
        var cooperative = target.nativeAI && target.friendlySource && !!nature && target.linked &&
            state.targets.some(function (other) { return other.id !== target.id && other.linked; });
        result.vulnerable = (target.handCount <= 1 || !!target.noShanRecord) && !target.knownShan &&
            (target.armor !== "bagua" || state.qinggang);
        result.hitTier = initial === 0 ? "BLOCKED" : state.sourceUnknown ? "UNKNOWN" :
            cooperative || result.vulnerable ? "HIGH" : "NORMAL";
        var chain = !!nature && target.linked && initial > 0;
        var victims = chain ? [target].concat(state.targets.filter(function (other) {
            return other.id !== target.id && other.linked;
        })) : [target];
        victims.forEach(function (victim) {
            var damage = Math.max(0, (victim === target ? initial :
                damageTo(victim, initial, false)) - victim.hujia);
            var dying = damage > 0 && damage >= victim.hp;
            var kill = result.hitTier === "HIGH" && !state.sourceUnknown && damage > 0 && damage > victim.hp;
            var hurt = Math.min(damage, Math.max(0, victim.hp));
            result.victims.push({ id: victim.id, damage: damage, killSignal: kill });
            if ((victim.id === state.selfId || victim.critical) && dying) result.unsafe = true;
            if (victim.relation < 0) {
                result.E += hurt + (kill ? 4 : 0);
                if (damage > 0) result.enemyCount++;
                result.killSignal = result.killSignal || kill;
            } else {
                result.F += hurt + (dying ? 6 : 0);
                if (dying) result.allyDying++;
                if ((victim.id === state.selfId || victim.critical || state.isLord) && dying) result.unsafe = true;
            }
        });
        // Unknown damage can pass through armor that absorbs the predicted amount.
        if (chain && result.unknown && victims.some(function (victim) { return victim.relation >= 0; })) result.unsafe = true;
        result.net = result.E - result.F;
        // This is a public-team prediction, never the settlement's actual-death flag.
        var enemies = state.targets.filter(function (victim) { return victim.relation < 0; });
        result.victorySignal = !!state.publicTeams && state.shi >= 3 && chain && !result.unsafe &&
            !result.unknown && result.hitTier === "HIGH" && enemies.length > 0 &&
            enemies.every(function (enemy) {
                return result.victims.some(function (victim) { return victim.id === enemy.id && victim.killSignal; });
            });
        result.largeChain = chain && result.hitTier === "HIGH" && !result.unknown &&
            !result.unsafe && result.enemyCount >= 2 && (result.victorySignal ||
                result.net >= 4 && (!result.F || result.E >= 2 * result.F));
        result.normal = target.relation < 0 && !result.F && !result.unsafe &&
            result.hitTier === "HIGH" && result.base > 0;
        return result;
    }

    function slashCandidates(state) {
        var candidates = [];
        state.cards.filter(function (card) { return card.name === "sha"; }).forEach(function (card) {
            state.targets.forEach(function (target) {
                var candidate = analyzeSlash(state, card, target);
                if (candidate.legal) candidates.push(candidate);
            });
        });
        return candidates;
    }

    function decideSlash(state, candidates) {
        candidates = candidates || slashCandidates(state);
        function pick(action, list, reason) {
            list.sort(function (a, b) {
                if (action === "ATTACK_CHAIN") return b.net - a.net || a.allyDying - b.allyDying ||
                    a.F - b.F || a.cost - b.cost;
                return Number(b.killSignal) - Number(a.killSignal) ||
                    Number(b.hitTier === "HIGH") - Number(a.hitTier === "HIGH") ||
                    b.net - a.net || b.base - a.base || a.hp - b.hp || a.cost - b.cost;
            });
            return { action: action, reason: reason, candidate: list[0] };
        }
        var chain = candidates.filter(function (c) { return c.largeChain; });
        if (chain.length) return pick("ATTACK_CHAIN", chain, "LARGE_CHAIN");
        var kills = candidates.filter(function (c) { return c.normal && c.killSignal && !c.unknown; });
        if (kills.length) return pick("ATTACK_KILL", kills, "KILL_SIGNAL");
        var normal = candidates.filter(function (c) { return c.normal; });
        var cash = candidates.filter(function (c) {
            return !c.unknown && !c.unsafe && !c.F && (c.normal ||
                state.hp === 1 && c.hitTier === "BLOCKED" && c.vulnerable && c.base >= 0);
        });
        if (state.window !== "USE_OUTSIDE" && state.shi >= 2 && state.defenseGap &&
            !state.betterRecovery && state.cashSlots >= (state.hp <= 1 ? 1 : 2) && cash.length) {
            return pick("ATTACK_CASH", cash, "CASH_FOR_DEFENSE");
        }
        if (state.canBank && state.shi < 3) return { action: "HOLD_BANK", reason: "BANK_SHI_AND_REFILL" };
        if (!state.canBank && normal.length && (state.window !== "USE_OUTSIDE" || !state.shi)) {
            return pick("ATTACK_NORMAL", normal, "POSITIVE_DAMAGE");
        }
        var press = normal.filter(function (c) {
            return !c.unknown && c.hitTier === "HIGH" && c.damage >= 2;
        });
        if (state.window !== "USE_OUTSIDE" && state.shi >= 3 && !state.growthUseful && press.length) {
            return pick("ATTACK_PRESS", press, "HIGH_HIT_PRESSURE");
        }
        return { action: "HOLD", reason: "NO_SAFE_TARGET" };
    }

    function growthUseful(state) {
        if (!state.canBank) return false;
        var current = slashCandidates(state);
        return slashCandidates(Object.assign({}, state, { shi: state.shi + 1, future: true })).some(function (next) {
            var before = current.find(function (c) { return c.cardId === next.cardId && c.targetId === next.targetId; });
            return (!before && next.normal) || next.killSignal && (!before || !before.killSignal) ||
                state.shi === 2 && next.largeChain && (!before || !before.largeChain);
        });
    }

    function futureState(state, shi, refill) {
        var next = Object.assign({}, state, { shi: shi, future: true, wine: 0 });
        var recast = chooseRecastCards(Object.assign({}, state, { shi: shi - (state.canBank ? 1 : 0) }));
        next.cards = state.cards.filter(function (card) {
            return card.name === "sha" && !recast.cardIds.includes(card.id);
        });
        if (refill) next.cards = next.cards.concat([{ id: "refill", name: "sha", nature: "",
            color: "unknown", value: 0, effects: state.refillEffects, futureEffects: state.refillFutureEffects,
            legalTargets: [], futureTargets: state.refillTargets }]);
        return next;
    }

    function chooseBadaoCost(state, use) {
        if (use.killed) return { action: "NO_PAYMENT", reason: "ACTUAL_DEATH" };
        var clear = { action: "CLEAR_SHI", reason: "CLEAR_FOR_SAFETY" };
        var hp = state.hp - 1;
        if (!state.shi || use.nested || state.unknownCost || hp < 2 || state.shan < 1 ||
            hp < 3 && state.shan < 2 && state.rescue < 1) return clear;
        function opportunity(snapshot, nextTurn) {
            return slashCandidates(snapshot).some(function (c) {
                var target = snapshot.targets.find(function (t) { return t.id === c.targetId; });
                return !c.unknown && (c.largeChain && (!nextTurn ? c.killSignal : true) ||
                    c.normal && c.killSignal && (!nextTurn || target.hp <= 2 && target.handCount <= 1));
            });
        }
        var immediateKeep = Object.assign({}, state, { hp: hp, targets: state.targets.map(function (target) {
            return target.id === state.selfId ? Object.assign({}, target, { hp: hp }) : target;
        }) });
        var immediateClear = Object.assign({}, state, { shi: 0 });
        if (opportunity(immediateKeep, false) && !opportunity(immediateClear, false)) {
            return { action: "LOSE_HP", reason: "KEEP_FOR_IMMEDIATE_LETHAL" };
        }
        if (state.nextTurnBlocked) return clear;
        var gain = state.canBank ? 1 : 0;
        var keep = futureState(immediateKeep, state.shi + gain, state.canRefill);
        var reset = futureState(state, gain, state.canRefill);
        if (opportunity(keep, true) && !opportunity(reset, true)) {
            return { action: "LOSE_HP", reason: "KEEP_FOR_NEXT_TURN" };
        }
        return clear;
    }

    function chooseRecastCards(state) {
        var cards = state.cards.filter(function (card) { return card.name === "sha"; });
        var refill = state.canBank && (state.canRefill || state.recastRecoverable && cards.length > 0);
        var keep = null;
        var reason = "RECAST_ALL_BEFORE_FIRE";
        if (!state.defenseGap) {
            var options = !refill ? cards : state.shi < 2 ? cards.filter(function (card) {
                return !!card.nature;
            }) : [];
            options = options.slice().sort(function (a, b) { return (b.value || 0) - (a.value || 0); });
            keep = options[0];
            if (keep) reason = refill ? "KEEP_NATIVE_ELEMENTAL" : "KEEP_ONE_WITHOUT_REFILL";
        }
        if (cards.length === 1 && state.mustUnlink) keep = null;
        return { cardIds: cards.filter(function (card) { return card !== keep; }).map(function (card) {
            return card.id;
        }), reason: reason };
    }

    function chooseLinkTargets(state, limit) {
        var end = state.shi + (state.canBank ? 1 : 0);
        var future = Object.assign({}, state, { future: true, shi: end, wine: 0,
            cards: state.cards.filter(function (c) { return c.name === "sha"; }) });
        if (state.canRefill && end >= 3) future.cards = future.cards.concat([{
            id: "refill", name: "sha", nature: "", color: "unknown", value: 0,
            legalTargets: [], futureTargets: state.refillTargets, effects: state.refillEffects,
            futureEffects: state.refillFutureEffects,
        }]);
        limit = Math.max(0, limit || 0);
        var canAttack = !state.nextTurnBlocked && !state.enemyElementalThreat;
        var enemies = state.targets.filter(function (t) {
            return t.relation < 0 && !t.linked && t.id !== state.selfId && t.tieLegal;
        });
        var friends = state.targets.filter(function (t) { return t.linked && t.relation >= 0; });
        function linkedState(ids) {
            return Object.assign({}, future, { targets: future.targets.map(function (t) {
                return ids.includes(t.id) ? Object.assign({}, t, { linked: true }) : t;
            }) });
        }
        function chainScore(snapshot) {
            if (!canAttack) return 0;
            return slashCandidates(snapshot).reduce(function (score, c) {
                return c.largeChain ? Math.max(score, c.net + 4 + (c.victorySignal ? 20 : 0)) : score;
            }, 0);
        }
        // Enemy links are useful layout even before there is a reliable attack.
        var chosen = enemies.slice(0, limit).map(function (t) { return t.id; });
        var score = chainScore(linkedState(chosen));
        var existingScore = friends.length ? chainScore(future) : 0;
        if (existingScore && !score) { chosen = []; score = existingScore; }
        var allyChosen = false;
        if (limit && canAttack) {
            var enemyIds = enemies.slice(0, limit).map(function (t) { return t.id; });
            var allyLayouts = enemyIds.length < limit ? [enemyIds] : enemyIds.map(function (_, index) {
                return enemyIds.filter(function (_, otherIndex) { return index !== otherIndex; });
            });
            state.targets.forEach(function (t) {
                if (t.linked || t.id === state.selfId || !t.tieLegal || t.relation <= 0 ||
                    !t.nativeAI || !t.friendlySource) return;
                allyLayouts.forEach(function (layout) {
                    var trial = layout.concat(t.id);
                    // Assess the completed combination, including every already-linked victim.
                    var value = chainScore(linkedState(trial));
                    if (value > score) { score = value; chosen = trial; allyChosen = true; }
                });
            });
        }
        if (friends.length && !score) {
            var unlink = friends.filter(function (t) { return t.tieLegal; });
            unlink.sort(function (a, b) {
                return Number(b.id === state.selfId || b.critical) - Number(a.id === state.selfId || a.critical) || a.hp - b.hp;
            });
            return { targetIds: unlink.slice(0, limit).map(function (t) { return t.id; }),
                reason: unlink.length && limit ? "UNLINK_FRIENDS" : "NO_SAFE_CHAIN" };
        }
        return { targetIds: chosen, reason: allyChosen ? "LINK_ALLY_CHAIN" : chosen.length ? "LINK_ENEMIES" : "NO_LINK_GAIN" };
    }

    function choosePreparation(state, attack) {
        attack = attack || decideSlash(state);
        if (state.window !== "PLAY" || ["ATTACK_KILL", "ATTACK_CHAIN", "ATTACK_CASH"].includes(attack.action)) return null;
        var best = null;
        state.cards.filter(function (card) { return ["guohe", "shunshou"].includes(card.name); }).forEach(function (strip) {
            state.targets.forEach(function (target) {
                if (target.relation >= 0 || target.handCount !== 2 || target.ejCount ||
                    !(strip.handTargets || []).includes(target.id)) return;
                var after = Object.assign({}, state, { targets: state.targets.map(function (other) {
                    return other.id === target.id ? Object.assign({}, other, { handCount: 1 }) : other;
                }) });
                after.growthUseful = growthUseful(after);
                var next = decideSlash(after);
                if (next.action === "ATTACK_NORMAL" && state.shi >= 3 && !next.candidate.unknown &&
                    next.candidate.hitTier === "HIGH" && next.candidate.damage >= 2) {
                    next = Object.assign({}, next, { action: "ATTACK_PRESS" });
                }
                if (!["ATTACK_KILL", "ATTACK_CHAIN", "ATTACK_PRESS"].includes(next.action) ||
                    next.action === "ATTACK_PRESS" && next.candidate.net < 2) return;
                var before = slashCandidates(state).find(function (c) {
                    return c.cardId === next.candidate.cardId && c.targetId === next.candidate.targetId;
                });
                if (!before || before.hitTier === "HIGH" || next.candidate.hitTier !== "HIGH") return;
                var rank = next.action === "ATTACK_CHAIN" ? 3 : next.action === "ATTACK_KILL" ? 2 : 1;
                if (!best || rank > best.rank || rank === best.rank && next.candidate.net > best.candidate.net) {
                    best = { action: "PREPARE_STRIP", reason: "STRIP_TWO_TO_ONE", cardId: strip.id,
                        targetId: target.id, candidate: next.candidate, rank: rank };
                }
            });
        });
        return best;
    }

    function chooseKeepCards(state) {
        var plan = chooseRecastCards(Object.assign({}, state, { recastRecoverable: false }));
        var seen = {}, scores = {}, keptStrip = false;
        state.cards.forEach(function (card) {
            var first = !seen[card.name];
            seen[card.name] = true;
            var score = 40;
            if (card.name === "tao") score = first ? 100 : 65;
            else if (card.name === "shan") score = first ? 90 : 45;
            else if (card.name === "jiu" && state.hp <= 1 && first) score = 95;
            else if (card.name === "wuxie") score = first ? 80 : 50;
            else if (card.name === "wuzhong") score = 65;
            else if (["guohe", "shunshou"].includes(card.name) && !keptStrip) { score = 70; keptStrip = true; }
            else if (card.name === "sha") score = plan.cardIds.includes(card.id) ? 10 : state.defenseGap ? 40 : 65;
            else if (card.defenseUpgrade && first) score = 75;
            else if (card.redundantEquip) score = 10;
            scores[card.id] = score + Math.min(9, Math.max(0, card.value || 0)) / 10;
        });
        return { cardIds: state.cards.slice().sort(function (a, b) {
            return scores[b.id] - scores[a.id];
        }).slice(0, Math.max(0, state.handLimit)).map(function (card) { return card.id; }),
        scores: scores, reason: "DEFENSE_BEFORE_ATTACK" };
    }

    var aiHelpers = Object.freeze({ analyzeSlash: analyzeSlash, decideSlash: decideSlash,
        chooseBadaoCost: chooseBadaoCost, chooseRecastCards: chooseRecastCards,
        chooseLinkTargets: chooseLinkTargets, chooseKeepCards: chooseKeepCards,
        choosePreparation: choosePreparation });

    function publicSkills(player) {
        var names = typeof player.getSkills === "function" ? player.getSkills() : [];
        if (typeof game.expandSkills === "function") game.expandSkills(names);
        return names;
    }

    function unknownInteraction(player, expression) {
        return publicSkills(player).some(function (name) {
            if (["renwang_skill", "tengjia1", "tengjia2", "tengjia3", "baiyin_skill",
                "bagua_skill", "qinggang2", "nihil_badao", "nihil_badao_kill",
                "nihil_badao_settle"].includes(name)) return false;
            var skill = lib.skill[name];
            if (!skill) return false;
            var triggers = skill.trigger || {};
            return Object.keys(triggers).some(function (key) {
                return [].concat(triggers[key]).some(function (trigger) { return expression.test(trigger); });
            });
        });
    }

    function nativeAI(player) {
        if (typeof player.isMine !== "function" || typeof player.isOnline !== "function" ||
            typeof player.isUnderControl !== "function" || player.isMine() || player.isOnline()) return false;
        if (game.online && player !== game.me) return false;
        if (player === game.me && !_status.auto) return false;
        return !player.isUnderControl(true) || !!player.isAuto || !!_status.auto;
    }

    function aiSnapshot(player, windowName, request) {
        var hand = player.getCards("h");
        var players = game.filterPlayer(function (target) { return target.isIn(); });
        var shi = player.countMark(SHI);
        var canBank = _status.currentPhase === player && !damagedWithShaThisTurn(player) &&
            !(player.skipList || []).includes("phaseJieshu");
        var knownCards = players.map(function (target) {
            return target === player ? hand : typeof target.getShownCards === "function" ? target.getShownCards() : [];
        });
        var relation = players.map(function (target) {
            if (target === player) return 1;
            if (typeof player.isFriendOf === "function" && get.mode && ["versus", "boss"].includes(get.mode())) {
                return player.isFriendOf(target) ? 1 : -1;
            }
            return Math.sign(get.attitude(player, target));
        });
        var state = { window: windowName, selfId: player.playerid, shi: shi, hp: player.hp,
            canBank: canBank, canRefill: canBank && !!get.discardPile("sha"),
            recastRecoverable: !unknownInteraction(player, /loseBefore|cardsDiscardBefore/),
            isLord: player === game.zhu, publicTeams: get.mode && get.mode() === "versus" &&
                typeof player.isFriendOf === "function", baseRange: player.getAttackRange() - shi,
            qinggang: !!player.getEquip("qinggang"), wine: Number(player.storage.jiu) || 0,
            handLimit: player.getHandcardLimit(), targets: [], cards: [],
            sourceUnknown: unknownInteraction(player, /^(damage(Before|Begin[1-4]?))$/),
            shan: 0, rescue: 0, unknownCost: unknownInteraction(player, /loseHp|changeHpBefore/),
            nextTurnBlocked: player.isTurnedOver() || player.hasJudge("lebu"),
            enemyElementalThreat: false, refillEffects: {}, refillFutureEffects: { fire: {} }, refillTargets: [] };
        state.targets = players.map(function (target, index) {
            var shown = knownCards[index];
            var equip = target.getEquip(2);
            var armor = equip ? get.name(equip, target) : "";
            var knownShan = shown.some(function (card) { return get.name(card, target) === "shan"; });
            if (relation[index] < 0 && shown.some(function (card) {
                return get.name(card, target) === "huogong" || get.name(card, target) === "sha" && get.nature(card, target);
            })) state.enemyElementalThreat = true;
            return { id: target.playerid, hp: target.hp, hujia: target.hujia || 0,
                relation: relation[index], handCount: target.countCards("h"), linked: target.isLinked(),
                ejCount: target.countCards("ej"), nativeAI: nativeAI(target),
                friendlySource: get.attitude(target, player._trueMe || player) > 0,
                armor: armor, knownShan: knownShan, noShanRecord: !!target._nihilShenNoShanVulnerable,
                critical: target === player || target === game.zhu && ["zhong", "nei"].includes(player.identity),
                distance: target === player ? 0 : get.distance(player, target, "attack"),
                tieLegal: canTie(player, target, { name: "tiesuo", isCard: true }) };
        });
        hand.forEach(function (card, index) {
            var name = get.name(card, player), info = get.info(card) || {};
            var useful = info.ai && info.ai.basic && info.ai.basic.useful;
            var value = typeof useful === "number" ? useful : Array.isArray(useful) ? useful[0] : 5;
            var item = { id: card.cardid || "hand" + index, name: name,
                nature: card.nature || "", color: get.color(card, player), value: value,
                effects: {}, futureEffects: { fire: {} }, legalTargets: [], futureTargets: [],
                handTargets: [], emergencyTargets: [] };
            if (name === "shan" && lib.filter.cardEnabled(card, player, "forceEnable")) state.shan++;
            if (["tao", "jiu"].includes(name) && lib.filter.cardSavable(card, player, player)) state.rescue++;
            var subtype = get.subtype(card);
            item.defenseUpgrade = ["equip2", "equip3"].includes(subtype) && !player.getEquip(subtype);
            item.redundantEquip = !!subtype && !!player.getEquip(subtype);
            if (name === "sha") {
                players.forEach(function (target, targetIndex) {
                    if (target === player) return;
                    item.effects[target.playerid] = -2 * relation[targetIndex] || 0;
                    item.futureEffects.fire[target.playerid] = item.effects[target.playerid];
                    if (lib.filter.targetEnabled2(card, player, target)) item.futureTargets.push(target.playerid);
                    if (request && (request._aiexclude || []).includes(card)) return;
                    if (!player.canUse(card, target, undefined, true)) return;
                    if (windowName === "PAY" && (!player.isPhaseUsing || !player.isPhaseUsing())) return;
                    if (request && typeof request.filterCard === "function" && !request.filterCard(card, player, request)) return;
                    if (request && typeof request.filterTarget === "function" && !request.filterTarget(card, player, target)) return;
                    item.legalTargets.push(target.playerid);
                });
            }
            if (["guohe", "shunshou"].includes(name)) {
                players.forEach(function (target) {
                    if (target === player || request && (request._aiexclude || []).includes(card) ||
                        !player.canUse(card, target, undefined, true) ||
                        request && typeof request.filterCard === "function" && !request.filterCard(card, player, request) ||
                        request && typeof request.filterTarget === "function" && !request.filterTarget(card, player, target)) return;
                    if (target.countCards("ej") && get.effect(target, card, player, player) > 0) item.emergencyTargets.push(target.playerid);
                    var count = name === "guohe" ? target.countDiscardableCards : target.countGainableCards;
                    if (!target.countCards("ej") && typeof count === "function" && count.call(target, player, "h") > 0) {
                        item.handTargets.push(target.playerid);
                    }
                });
            }
            state.cards.push(item);
        });
        players.forEach(function (target, targetIndex) {
            if (target === player) return;
            var refill = { name: "sha", isCard: true };
            if (lib.filter.targetEnabled2(refill, player, target)) state.refillTargets.push(target.playerid);
            state.refillEffects[target.playerid] = -2 * relation[targetIndex] || 0;
            state.refillFutureEffects.fire[target.playerid] = state.refillEffects[target.playerid];
        });
        state.defenseGap = state.hp <= 2 && !state.shan || state.hp <= 1 && !state.rescue;
        var protectedCount = Math.min(1, state.shan) + Math.min(1, state.cards.filter(function (c) {
            return c.name === "tao" || state.hp === 1 && c.name === "jiu";
        }).length);
        state.cashSlots = Math.min(shi, Math.max(0, state.handLimit - protectedCount));
        state.betterRecovery = hand.some(function (card) {
            return ["tao", "wuzhong"].includes(get.name(card, player)) &&
                player.hasUseTarget(card) && get.effect(player, card, player, player) > 0;
        });
        state.growthUseful = growthUseful(state);
        var linkedFriends = state.targets.filter(function (target) { return target.linked && target.relation >= 0; });
        state.mustUnlink = linkedFriends.length > 0 && chooseLinkTargets(state, 1).reason === "UNLINK_FRIENDS";
        return state;
    }

    function traceDecision(player, decision) {
        var trace = player.storage.nihil_shencangfeng_ai_trace;
        if (!Array.isArray(trace)) trace = player.storage.nihil_shencangfeng_ai_trace = [];
        trace.push({ round: game.roundNumber || 0, action: decision.action || decision.reason,
            reason: decision.reason, shi: player.countMark(SHI), hp: player.hp,
            target: decision.candidate && decision.candidate.targetId,
            cards: decision.cardIds, targets: decision.targetIds });
        if (trace.length > 40) trace.shift();
    }

    var aiRuntime = {
        snapshot: aiSnapshot,
        trace: traceDecision,
        attackPlan: function (request) {
            var excludes = request._aiexclude || [];
            var signature = excludes.map(function (item) {
                return typeof item === "string" ? item : aiRuntime.cardId(item, request.player);
            }).join("|") + ":" + request.player.countMark(SHI) + ":" +
                request.player.getCards("h").map(function (card) { return aiRuntime.cardId(card, request.player); }).join(",") +
                ":" + game.filterPlayer(function (target) { return target.isIn(); }).map(function (target) {
                    return [target.playerid, target.hp, target.hujia, target.countCards("h"),
                        target.countCards("ej"), target.isLinked(), !!target._nihilShenNoShanVulnerable,
                        typeof target.getShownCards === "function" && target.getShownCards().some(function (card) {
                            return get.name(card, target) === "shan";
                        })].join(",");
                }).join("|");
            if (!request._nihilShenAttackPlan || request._nihilShenExcludeSignature !== signature) {
                var windowName = _status.currentPhase === request.player ? "PLAY" : "USE_OUTSIDE";
                var snapshot = aiSnapshot(request.player, windowName, request);
                var attack = decideSlash(snapshot);
                request._nihilShenAttackPlan = choosePreparation(snapshot, attack) || attack;
                request._nihilShenStripReserve = snapshot.canBank && snapshot.shi < 3 ?
                    snapshot.cards.find(function (card) { return ["guohe", "shunshou"].includes(card.name); }) : null;
                request._nihilShenExcludeSignature = signature;
            }
            return request._nihilShenAttackPlan;
        },
        recastPlan: function (request) {
            if (!request._nihilShenRecastPlan) request._nihilShenRecastPlan =
                chooseRecastCards(aiSnapshot(request.player, "RECAST"));
            return request._nihilShenRecastPlan;
        },
        linkPlan: function (request) {
            if (!request._nihilShenLinkPlan) request._nihilShenLinkPlan =
                chooseLinkTargets(aiSnapshot(request.player, "LINK"), request._nihilShenLinkLimit);
            return request._nihilShenLinkPlan;
        },
        cost: function (request) {
            var use = request._nihilShenUse;
            var parent = use && typeof use.getParent === "function" ? use.getParent("useCard") : null;
            var decision = chooseBadaoCost(aiSnapshot(request.player, "PAY"), {
                killed: !!(use && use._nihilBadaoKilled), nested: !!(parent && parent !== use && parent.name === "useCard") });
            request._nihilShenCostPlan = decision;
            return decision.action === "LOSE_HP" ? 1 : 0;
        },
        cardId: function (card, player) { return card.cardid || "hand" + player.getCards("h").indexOf(card); },
    };

    var skills = {
        nihil_xushi: {
            locked: true,
            forced: true,
            mark: true,
            marktext: "势",
            intro: {
                name: "势",
                name2: "势",
                content: "mark",
            },
            trigger: { player: "phaseJieshuBegin" },
            filter: function (event, player) {
                return !damagedWithShaThisTurn(player);
            },
            async content(event, trigger, player) {
                player.addMark(SHI, 1);
                var card = get.discardPile("sha");
                if (card) await player.gain(card, "gain2");
            },
            mod: {
                cardnature: function (card, player) {
                    if (card && get.name(card, player) === "sha" &&
                        player.countMark(SHI) >= 3) return "fire";
                },
            },
            group: "nihil_xushi_init",
            subSkill: {
                init: {
                    charlotte: true,
                    trigger: { global: "gameStart", player: "enterGame" },
                    forced: true,
                    silent: true,
                    popup: false,
                    firstDo: true,
                    filter: function (event, player) {
                        return !player.storage.nihil_xushi_initialized;
                    },
                    async content(event, trigger, player) {
                        player.storage.nihil_xushi_initialized = true;
                        player.addMark(SHI, 1);
                    },
                },
            },
        },

        nihil_badao: {
            locked: true,
            forced: true,
            aiHelpers: aiHelpers,
            aiRuntime: aiRuntime,
            onChooseToUse: function (event) {
                if (!event || event._nihilShenWrapped || !event.player) return;
                var parent = typeof event.getParent === "function" ? event.getParent() : null;
                if (event.type !== "phase" && (!parent || parent.name !== "jiedao")) return;
                event._nihilShenWrapped = true;
                event._nihilShenOriginalAi1 = event.ai1;
                event._nihilShenOriginalAi2 = event.ai2;
                event.ai1 = function (card) {
                    var request = _status.event;
                    var name = card && typeof card === "object" ? get.name(card, request.player) : "";
                    if (!["sha", "guohe", "shunshou"].includes(name)) {
                        return request._nihilShenOriginalAi1.apply(this, arguments);
                    }
                    var runtime = lib.skill.nihil_badao.aiRuntime;
                    var plan = runtime.attackPlan(request);
                    var id = runtime.cardId(card, request.player);
                    if (name !== "sha") {
                        if (plan.action === "PREPARE_STRIP") return plan.cardId === id ?
                            Math.max(6, request._nihilShenOriginalAi1.apply(this, arguments)) : -1;
                        var reserve = request._nihilShenStripReserve;
                        if (reserve && reserve.id === id && !reserve.emergencyTargets.length) return -1;
                        return request._nihilShenOriginalAi1.apply(this, arguments);
                    }
                    return plan.action !== "PREPARE_STRIP" && plan.candidate && plan.candidate.cardId === id ? 0.0001 : -1;
                };
                event.ai2 = function (target) {
                    var request = _status.event, card = get.card();
                    var name = card && get.name(card, request.player);
                    if (!["sha", "guohe", "shunshou"].includes(name)) {
                        return request._nihilShenOriginalAi2.apply(this, arguments);
                    }
                    var runtime = lib.skill.nihil_badao.aiRuntime;
                    var plan = runtime.attackPlan(request);
                    var selected = ui.selected.cards;
                    if (name !== "sha") {
                        if (plan.action === "PREPARE_STRIP") return selected.length === 1 &&
                            plan.cardId === runtime.cardId(selected[0], request.player) &&
                            plan.targetId === target.playerid ? 10 : -1;
                        var reserve = request._nihilShenStripReserve;
                        if (reserve && reserve.id === runtime.cardId(card, request.player) &&
                            !reserve.emergencyTargets.includes(target.playerid)) return -1;
                        return request._nihilShenOriginalAi2.apply(this, arguments);
                    }
                    return plan.action !== "PREPARE_STRIP" && selected.length === 1 && plan.candidate &&
                        plan.candidate.cardId === runtime.cardId(selected[0], request.player) &&
                        plan.candidate.targetId === target.playerid ? 10 : -1;
                };
            },
            trigger: { player: "useCard1" },
            priority: 20,
            filter: function (event, player) {
                return !!event.card && get.name(event.card, player) === "sha" &&
                    !event._nihilBadaoOwnerId;
            },
            async content(event, trigger, player) {
                var snapshot = player.countMark(SHI);
                trigger._nihilBadaoOwnerId = player.playerid;
                trigger._nihilBadaoSnapshot = snapshot;
                trigger._nihilBadaoKilled = false;
                trigger._nihilBadaoSettled = false;
                if (typeof trigger.baseDamage !== "number") trigger.baseDamage = 1;
                trigger.baseDamage += snapshot;
                var request = typeof trigger.getParent === "function" ? trigger.getParent("chooseToUse") : null;
                traceDecision(player, request && request._nihilShenAttackPlan || {
                    action: "USED_SHA", reason: "ACTUAL_USE" });
            },
            mod: {
                attackRange: function (player, num) {
                    return num + player.countMark(SHI);
                },
                aiUseful: function (player, card) {
                    var request = _status.event;
                    if (!request || request.name !== "chooseToDiscard" || request.player !== player ||
                        typeof request.getParent !== "function" || request.getParent().name !== "phaseDiscard") return;
                    if (!request._nihilShenKeepPlan) request._nihilShenKeepPlan = chooseKeepCards(aiSnapshot(player, "DISCARD"));
                    return request._nihilShenKeepPlan.scores[aiRuntime.cardId(card, player)];
                },
            },
            group: ["nihil_badao_kill", "nihil_badao_settle", "nihil_badao_ai_vulnerable",
                "nihil_badao_ai_vulnerable_clear"],
            subSkill: {
                ai_vulnerable: {
                    charlotte: true,
                    trigger: { global: ["shaHit", "chooseToUseAfter", "chooseToRespondAfter"] },
                    forced: true,
                    silent: true,
                    popup: false,
                    filter: function (event, player, name) {
                        return !!shanObservation(event, name);
                    },
                    async content(event, trigger) {
                        var observation = shanObservation(trigger, event.triggername);
                        if (!observation) return;
                        if (observation.success || observation.declined) {
                            shanEvidenceExcluded.add(observation.resolution);
                            if (observation.success) delete observation.target._nihilShenNoShanVulnerable;
                        } else observation.target._nihilShenNoShanVulnerable = true;
                    },
                },
                ai_vulnerable_clear: {
                    charlotte: true,
                    trigger: { global: ["gainAfter", "loseAsyncAfter"] },
                    forced: true,
                    silent: true,
                    popup: false,
                    filter: function (event) {
                        return typeof event.getg === "function" && game.filterPlayer(function (target) {
                            return target._nihilShenNoShanVulnerable && (event.getg(target) || []).length > 0;
                        }).length > 0;
                    },
                    async content(event, trigger) {
                        game.filterPlayer(function (target) { return target._nihilShenNoShanVulnerable; })
                            .forEach(function (target) {
                                if ((trigger.getg(target) || []).length) delete target._nihilShenNoShanVulnerable;
                            });
                    },
                },
                kill: {
                    charlotte: true,
                    trigger: { global: "dieAfter" },
                    forced: true,
                    silent: true,
                    popup: false,
                    filter: function (event, player) {
                        return !!event.reason &&
                            !!badaoUseFromDamage(event.reason, player);
                    },
                    async content(event, trigger, player) {
                        var use = badaoUseFromDamage(trigger.reason, player);
                        if (use) use._nihilBadaoKilled = true;
                    },
                },
                settle: {
                    charlotte: true,
                    trigger: { player: "useCardAfter" },
                    forced: true,
                    silent: true,
                    popup: false,
                    filter: function (event, player) {
                        var use = markedBadaoUse(event, player);
                        return !!use && !use._nihilBadaoSettled;
                    },
                    async content(event, trigger, player) {
                        trigger._nihilBadaoSettled = true;
                        if (trigger._nihilBadaoKilled) return;

                        var count = player.countMark(SHI);
                        var payment = player.chooseControl()
                            .set("choiceList", [
                                "移除所有“势”并摸" + count + "张牌",
                                "失去1点体力",
                            ])
                            .set("prompt", "拔刀：此【杀】未造成武将死亡，请选择一项")
                            .set("forced", true)
                            .set("_nihilShenUse", trigger)
                            .set("ai", function () { return lib.skill.nihil_badao.aiRuntime.cost(_status.event); });
                        var result = await payment.forResult();
                        traceDecision(player, payment._nihilShenCostPlan || {
                            action: result.index === 1 ? "LOSE_HP" : "CLEAR_SHI", reason: "ACTUAL_PAYMENT" });
                        if (result.index === 1) {
                            await player.loseHp();
                            return;
                        }
                        if (count > 0) {
                            player.removeMark(SHI, count);
                            await player.draw(count);
                        }
                    },
                },
            },
        },

        nihil_suoxin: {
            trigger: { player: "phaseUseEnd" },
            direct: true,
            filter: function (event, player) {
                return player.countCards("h", function (card) {
                    return get.name(card, player) === "sha";
                }) > 0;
            },
            async content(event, trigger, player) {
                var shaCount = player.countCards("h", function (card) {
                    return get.name(card, player) === "sha";
                });
                var recastRequest = player.chooseCard(
                    "h",
                    [1, shaCount],
                    "锁心：重铸任意张【杀】",
                    function (card, owner) {
                        return get.name(card, owner) === "sha";
                    },
                ).set("ai", function (card) {
                    var request = _status.event, runtime = lib.skill.nihil_badao.aiRuntime;
                    return runtime.recastPlan(request).cardIds.includes(runtime.cardId(card, request.player)) ? 10 : -1;
                });
                var choice = await recastRequest.forResult();
                if (recastRequest._nihilShenRecastPlan) traceDecision(player, recastRequest._nihilShenRecastPlan);
                if (!choice.bool || !choice.cards || !choice.cards.length) return;

                var hand = player.getCards("h");
                var cards = choice.cards.filter(function (card, index, list) {
                    return list.indexOf(card) === index && hand.includes(card) &&
                        get.name(card, player) === "sha";
                });
                if (cards.length !== choice.cards.length) return;

                player.logSkill("nihil_suoxin");
                await player.recast(cards);

                var tiesuo = {
                    name: "tiesuo",
                    isCard: true,
                    storage: { nihilSuoxin: true },
                };
                var candidates = game.filterPlayer(function (target) {
                    return canTie(player, target, tiesuo);
                });
                var max = Math.min(cards.length, candidates.length);
                if (!max) return;

                var linkRequest = player.chooseTarget(
                    [1, max],
                    "锁心：你可以选择至多" + max + "名角色，视为对其使用【铁索连环】",
                    function (card, owner, target) {
                        return _status.event._nihilSuoxinTargets.includes(target);
                    },
                ).set("_nihilSuoxinTargets", candidates)
                    .set("_nihilShenLinkLimit", max)
                    .set("ai", function (target) {
                        var request = _status.event, runtime = lib.skill.nihil_badao.aiRuntime;
                        return runtime.linkPlan(request).targetIds.includes(target.playerid) ? 10 : -1;
                    });
                var targetResult = await linkRequest.forResult();
                if (linkRequest._nihilShenLinkPlan) traceDecision(player, linkRequest._nihilShenLinkPlan);
                if (!targetResult.bool || !targetResult.targets ||
                    !targetResult.targets.length) return;

                var targets = targetResult.targets.filter(function (target, index, list) {
                    return index < max && list.indexOf(target) === index &&
                        canTie(player, target, tiesuo);
                });
                if (!targets.length) return;
                await player.useCard(tiesuo, targets, false);
            },
        },
    };

    window.nihilModules.shencangfeng = {
        character: {
            nihil_shencangfeng: {
                sex: "male",
                group: "zhong",
                hp: 4,
                maxHp: 4,
                img: "extension/" + EXT_NAME + "/image/character/nihil_shencangfeng.jpg",
                skills: ["nihil_xushi", "nihil_badao", "nihil_suoxin"],
            },
        },
        skill: skills,
        aiHelpers: aiHelpers,
        translate: {
            nihil_shencangfeng: "沈藏锋",
            nihil_xushi: "蓄势",
            nihil_xushi_info: "锁定技。游戏开始时，你获得1个“势”。结束阶段开始时，若你本回合未使用【杀】造成过伤害，你获得1个“势”，并获得弃牌堆中的一张【杀】。当“势”数不小于3时，你的【杀】改为火焰伤害。",
            nihil_badao: "拔刀",
            nihil_badao_info: "锁定技。每有1个“势”，你的【杀】的伤害和攻击范围便+1。你使用【杀】结算结束后，若此【杀】未造成武将死亡，你选择一项：1.移去所有“势”并摸等量的牌；2.失去1点体力。",
            nihil_suoxin: "锁心",
            nihil_suoxin_info: "出牌阶段结束时，你可以重铸任意张手牌中的【杀】，然后选择至多等量名角色，视为对这些角色使用一张【铁索连环】。",
        },
        title: { nihil_shencangfeng: "一刃破势" },
        sort: ["nihil_shencangfeng"],
    };
})();
