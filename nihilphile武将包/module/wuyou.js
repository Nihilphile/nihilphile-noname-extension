(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "Nihilphile";
    var MEMORY = "nihil_liulian";
    var SUITS = ["spade", "heart", "club", "diamond"];
    var SUIT_NAMES = { spade: "♠黑桃", heart: "♥红桃", club: "♣梅花", diamond: "♦方块" };

    function memories(player) {
        if (!player.storage[MEMORY] || Array.isArray(player.storage[MEMORY])) {
            player.storage[MEMORY] = { spade: 0, heart: 0, club: 0, diamond: 0 };
        }
        return player.storage[MEMORY];
    }
    function refreshMemories(player) {
        player.syncStorage(MEMORY);
        // syncStorage records replay data; helper marks broadcast their own
        // storage, so send the shared memory object before refreshing them.
        game.broadcast(function (owner, key, counts) {
            owner.storage[key] = counts;
        }, player, MEMORY, memories(player));
        SUITS.forEach(function (suit) { player.markSkill(MEMORY + "_" + suit); });
    }
    function memoryTotal(player) {
        var counts = memories(player);
        return SUITS.reduce(function (sum, suit) { return sum + (counts[suit] || 0); }, 0);
    }
    function heldLossCards(loss) {
        // Observe each actual lose event once, including getlx=false children of
        // gain/equip/loseAsync. Wrapper getl() would hide some of these children.
        return (loss.hs || []).concat(loss.es || [], loss.js || [], loss.ss || [], loss.xs || []).filter(function (card, index, cards) {
            return cards.indexOf(card) === index;
        });
    }
    function usedMaterialLoss(loss) {
        if (loss.type !== "use") return false;
        // Native respond also labels material loss as "use". Its direct
        // action/relatedEvent distinguishes it from actually using a card.
        var action = loss.relatedEvent || loss.getParent();
        return !action || action.name !== "respond";
    }
    function singleHandMaterial(use, player) {
        if (!use.cards || use.cards.length !== 1) return false;
        return player.getHistory("lose", function (loss) {
            return loss.type === "use" &&
                (loss.getParent() === use || loss.relatedEvent === use) &&
                (loss.hs || []).includes(use.cards[0]);
        }).length > 0;
    }
    function extraTargets(use, player) {
        var info = get.info(use.card, false);
        if (!use.targets || !use.targets.length || info.allowMultiple === false || info.multitarget) return [];
        return game.filterPlayer(function (target) {
            return !use.targets.includes(target) &&
                lib.filter.targetEnabled2(use.card, player, target) &&
                lib.filter.targetInRange(use.card, player, target);
        });
    }
    function effectHandTargets(effect) {
        var targets = effect.multitarget ? (effect.targets || []) : [effect.target];
        var excluded = effect.multitarget ? (effect.getParent().excluded || []) : [];
        return targets.filter(function (target, index) {
            return target && targets.indexOf(target) === index &&
                !excluded.includes(target) && target.isIn() && target.countCards("h") > 0;
        });
    }

    // AI reads public state into plain data. These functions never pay memories,
    // simulate native effects, inspect another hand, or inspect the draw pile.
    var WY_VALUES = { tao: 9, shan: 7, wuxie: 6, jiu: 5, sha: 4, wuzhong: 8 };
    var WY_PROB = [[], [0.75, 0.25], [0.25, 0.625, 0.125],
        [0.015625, 0.328125, 0.5625, 0.09375], [0, 0.015625, 0.328125, 0.5625, 0.09375]];
    function wyAction(action, reason, score) {
        return { action: action, reason: reason, score: score || 0, spendSuits: [], extraTarget: null, gain: false, directHit: false, repeat: false };
    }
    function wyPlanKeep(snapshot) {
        var hand = snapshot.ownHand, critical = [];
        function first(names) {
            var card = hand.find(function (c) { return names.includes(c.name) && c.defenseLegal; });
            if (card) critical.push(card.id);
            return card;
        }
        if (!first(["tao"]) && snapshot.hp <= 1) first(["jiu"]);
        if (!first(["shan"])) first(["wuxie"]);
        var scores = {};
        hand.forEach(function (c) {
            scores[c.id] = (critical.includes(c.id) ? 30 : c.positive ? 15 : 5) + (WY_VALUES[c.name] || 3) / 10;
        });
        var ordered = hand.slice().sort(function (a, b) { return scores[b.id] - scores[a.id] || a.id.localeCompare(b.id); });
        var kept = ordered.slice(0, snapshot.handLimit).map(function (c) { return c.id; });
        return { criticalCards: critical, kept: kept, discarded: ordered.slice(snapshot.handLimit).map(function (c) { return c.id; }), scores: scores };
    }
    function wyDanger(snapshot) {
        return snapshot.hp <= 1 || snapshot.hp <= 2 && !snapshot.ownHand.some(function (c) {
            return ["tao", "shan", "wuxie"].includes(c.name) && c.defenseLegal;
        });
    }
    function wyDecideHuanghu(snapshot, incoming) {
        if ((snapshot.memory[incoming.suit] || 0) < 2 || incoming.excluded || !incoming.damageCard) return wyAction("DECLINE", "NO_CANCEL_VALUE");
        if (!incoming.harmful) return wyAction("DECLINE", "NON_HARMFUL_EFFECT");
        if (incoming.reliable && incoming.cheap) return wyAction("DECLINE", "CHEAP_RESPONSE");
        if (!incoming.reliable && incoming.damage >= snapshot.hp) return wyAction("CANCEL", "PREVENT_DYING");
        if (wyDanger(snapshot) || incoming.damage >= 2 || !incoming.reliable) return wyAction("CANCEL", "PREVENT_DAMAGE");
        return wyAction("DECLINE", "KEEP_MEMORY_USE_RESPONSE");
    }
    function wyArmorCancels(player, target, card) {
        if (!card || !target.getEquip) return false;
        var name = get.name ? get.name(card, player) : card.name;
        if (!["sha", "nanman", "wanjian"].includes(name)) return false;
        var renwang = target.getEquip("renwang"), tengjia = target.getEquip("tengjia");
        if (!renwang && !tengjia) return false;
        var armorName = renwang ? "renwang_skill" : name === "sha" ? "tengjia3" : "tengjia1";
        if (target.hasSkill && !target.hasSkill(armorName, null)) return false;
        if (target.hasSkillTag && target.hasSkillTag("unequip2", null)) return false;
        var args = { name: name, target: target, card: card };
        if (player.hasSkillTag && player.hasSkillTag("unequip", false, args)) return false;
        if (name === "sha" && player.getEquip && player.getEquip("qinggang") &&
            (!player.hasSkill || player.hasSkill("qinggang_skill", null))) return false;
        if (renwang && name === "sha") {
            var color = typeof get.color === "function" ? get.color(card, player) :
                ["spade", "club"].includes(get.suit(card, player)) ? "black" : "red";
            return color === "black";
        }
        return !!tengjia && (["nanman", "wanjian"].includes(name) ||
            name === "sha" && !(game.hasNature ? game.hasNature(card) : card.nature));
    }
    function wyTengjiaFireBonus(player, target, card) {
        if (!card || !target.getEquip || !target.getEquip("tengjia") ||
            target.hasSkill && !target.hasSkill("tengjia2", null)) return 0;
        var fire = card.name === "huogong" || (game.hasNature ? game.hasNature(card, "fire") : String(card.nature || "").includes("fire"));
        if (!fire || target.hasSkillTag && target.hasSkillTag("unequip2", null)) return 0;
        var name = get.name ? get.name(card, player) : card.name;
        if (player.hasSkillTag && player.hasSkillTag("unequip", false, { name: name, target: target, card: card })) return 0;
        if (name === "sha" && player.getEquip && player.getEquip("qinggang") &&
            (!player.hasSkill || player.hasSkill("qinggang_skill", null))) return 0;
        return 1;
    }
    function wyBaiyinDamageCap(player, target, card) {
        if (!card || !target.getEquip || !target.getEquip("baiyin") ||
            target.hasSkill && !target.hasSkill("baiyin_skill", null)) return null;
        if (target.hasSkillTag && target.hasSkillTag("unequip2", null)) return null;
        var name = get.name ? get.name(card, player) : card.name;
        if (player.hasSkillTag && player.hasSkillTag("unequip", false, { name: name, target: target, card: card })) return null;
        if (name === "sha" && player.getEquip && player.getEquip("qinggang") &&
            (!player.hasSkill || player.hasSkill("qinggang_skill", null))) return null;
        return 1;
    }
    function wyPublicMoveZones(player, target, name) {
        if (!["guohe", "shunshou"].includes(name) || !target.getCards) return [];
        var movable = name === "guohe" ? lib.filter.canBeDiscarded : lib.filter.canBeGained;
        var single = !!(get.is && get.is.single && get.is.single());
        return ["e", "j"].filter(function (zone) { return !single || zone === "e"; }).flatMap(function (zone) {
            return target.getCards(zone).filter(function (card) {
                return !movable || movable(card, player, target);
            }).map(function (card, index) {
                var cardName = card.viewAs && (typeof card.viewAs === "string" ? card.viewAs : card.viewAs.name) ||
                    (get.name ? get.name(card, target) : card.name);
                var positiveEquip = zone === "e" && ["renwang", "tengjia", "qinggang", "zhuque", "bagua",
                    "hualiu", "dilu", "jueying", "zhuahuang", "chitu", "dawan", "zixin"].includes(cardName);
                var badJudge = zone === "j" && ["lebu", "bingliang"].includes(cardName);
                return { id: String(card.cardid || zone + "_" + index), zone: zone, name: cardName,
                    suit: get.suit(card, player), recastable: !lib.filter.cardRecastable || lib.filter.cardRecastable(card, player),
                    bonus: positiveEquip ? 1.6 : badJudge ? -2 : 0,
                    healOnLose: cardName === "baiyin" && target.hp < target.maxHp &&
                        (!target.hasSkillTag || !target.hasSkillTag("unequip2", null)) &&
                        (!target.hasSkill || target.hasSkill("baiyin_skill", null)) };
            });
        });
    }
    function wyPublicResponses(target) {
        var skills = target.getSkills ? target.getSkills() : target.skills || [];
        return { redSha: skills.includes("wusheng"), blackShan: skills.includes("qingguo"),
            swap: skills.includes("longdan"), redRescue: skills.includes("jijiu") && (typeof _status === "undefined" || _status.currentPhase !== target),
            shanRequired: skills.includes("wushuang") ? 2 : 1,
            shaRequired: skills.includes("wushuang") ? 2 : 1,
            strongHit: skills.some(function (name) { return name !== "wushuang" && lib.skill && lib.skill[name] && lib.skill[name].ai && lib.skill[name].ai.directHit_ai; }),
            damageGap: skills.some(function (name) { return lib.skill && lib.skill[name] && lib.skill[name].ai && lib.skill[name].ai.damageImmune; }),
            shaPrior: skills.some(function (name) { return lib.skill && lib.skill[name] && lib.skill[name].ai && lib.skill[name].ai.respondSha; }),
            shanPrior: skills.some(function (name) { return lib.skill && lib.skill[name] && lib.skill[name].ai && lib.skill[name].ai.respondShan; }) };
    }
    function wyPublicAttitude(player, target) {
        if (!target.getHistory || target === player) return 0;
        var evidence = 0;
        target.getHistory("useCard").slice(-8).forEach(function (event) {
            var name = event.card && event.card.name;
            var sign = ["sha", "juedou", "huogong", "guohe", "shunshou"].includes(name) ? -1 : ["tao", "wuzhong"].includes(name) ? 1 : 0;
            (event.targets || []).forEach(function (recipient) {
                var role = recipient === player ? player.identity : recipient.isZhu ? "zhu" : recipient.identityShown ? recipient.identity : null;
                var side = recipient === player || player.identity === "fan" && role === "fan" || ["zhu", "zhong"].includes(player.identity) && ["zhu", "zhong"].includes(role) ? 1 :
                    player.identity === "fan" && ["zhu", "zhong"].includes(role) || ["zhu", "zhong"].includes(player.identity) && role === "fan" ? -1 : 0;
                evidence += sign * side;
            });
        });
        return Math.max(-0.8, Math.min(0.8, evidence * 0.35));
    }
    function wyPublicTarget(player, target, card, use) {
        var mode = typeof get.mode === "function" ? get.mode() : "";
        var cardName = card && (get.name ? get.name(card, player) : card.name);
        var zhuquePossible = !use && cardName === "sha" && !(game.hasNature ? game.hasNature(card) : card.nature) &&
            player.getEquip && player.getEquip("zhuque") && (!player.hasSkill || player.hasSkill("zhuque_skill", null));
        var team = "unknown";
        var publicRole = target === player ? player.identity : target.isZhu ? "zhu" : target.identityShown ? target.identity : undefined;
        if (target === player) team = "ally";
        else if (mode === "versus" && player.side !== undefined && target.side !== undefined)
            team = target.side === player.side ? "ally" : "enemy";
        else if (mode === "identity" && publicRole) {
            if (["zhu", "zhong"].includes(player.identity) && ["zhu", "zhong"].includes(publicRole) ||
                player.identity === "fan" && publicRole === "fan") team = "ally";
            else if (["zhu", "zhong"].includes(player.identity) && publicRole === "fan" ||
                player.identity === "fan" && ["zhu", "zhong"].includes(publicRole)) team = "enemy";
        }
        var drawCount = 2;
        if (card && card.name === "wuzhong" && mode === "versus" && target.side !== undefined) {
            var alive = game.filterPlayer(function () { return true; });
            var same = alive.filter(function (current) { return current.side === target.side; }).length;
            if (same < alive.length - same) drawCount = 3;
        }
        var moveZones = wyPublicMoveZones(player, target, cardName);
        return { id: target.playerid, self: target === player, attitude: team === "ally" ? 1 : team === "enemy" ? -1 : mode === "identity" ? wyPublicAttitude(player, target) : 0, team: team,
            responses: wyPublicResponses(target),
            recentThreats: target !== player && target.getHistory ? target.getHistory("useCard").slice(-4).filter(function (event) {
                return (event.targets || []).includes(player) && event.card && ["sha", "nanman", "wanjian", "juedou", "huogong"].includes(event.card.name);
            }).map(function (event) { return { name: event.card.name, nature: event.card.nature }; }) : [],
            responseEquips: target.getCards ? target.getCards("e").map(function (equip, index) {
                return { id: String(equip.cardid || "equip_" + index), name: equip.name, suit: get.suit(equip, target), value: 0.8 };
            }) : [],
            hp: Number.isFinite(target.hp) ? target.hp : 3, maxHp: Number.isFinite(target.maxHp) ? target.maxHp : 3,
            hand: target.countCards ? target.countCards("h") : 0, totalCards: target.countCards ? target.countCards("he") : 0,
            moveZones: moveZones,
            moveUnknown: ["guohe", "shunshou"].includes(cardName) && !(target.countCards && target.countCards("h")) && !moveZones.length,
            singleMove: !!(get.is && get.is.single && get.is.single()),
            armor: Number.isFinite(target.hujia) ? target.hujia : 0, dead: !!(target.isIn && !target.isIn()),
            drawCount: drawCount,
            weapons: target.getEquips ? target.getEquips(1).filter(function (weapon) {
                return !lib.filter.canBeGained || lib.filter.canBeGained(weapon, player, target);
            }).map(function (weapon, index) {
                return { id: String(weapon.cardid || "weapon_" + index), name: weapon.name,
                    suit: get.suit(weapon, target), bonus: Math.max(0, (typeof get.value === "function" ? get.value(weapon, target) : 5) / 5) };
            }) : [],
            publicRole: publicRole, linked: !!(target.isLinked && target.isLinked()),
            effectCancelled: wyArmorCancels(player, target, card),
            blackSlashCancelled: wyArmorCancels(player, target, { name: "sha", suit: "spade", nature: "fire" }),
            plainSlashCancelled: wyArmorCancels(player, target, { name: "sha", suit: "heart" }),
            fireSlashBonus: wyTengjiaFireBonus(player, target, { name: "sha", nature: "fire" }),
            fireDamageBonus: wyTengjiaFireBonus(player, target, card),
            damageCap: wyBaiyinDamageCap(player, target, card),
            chainUnknown: !!(card && target.isLinked && target.isLinked() &&
                ((game.hasNature ? game.hasNature(card, "linked") : ["fire", "thunder"].includes(card.nature)) || zhuquePossible)),
            directHit: !!(use && use.directHit && use.directHit.includes(target)),
            excluded: !!(use && use.excluded && use.excluded.includes(target)),
            effectUnknown: false };
    }
    function wyUseSnapshot(player, use) {
        var suit = use._nihilMenglong && use._nihilMenglong.owner === player.playerid ? use._nihilMenglong.suit : null;
        var order = game.filterPlayer(function () { return true; });
        if (order.sortBySeat) order.sortBySeat(_status.currentPhase || player);
        var recast = suit && player.getCards ? player.getCards("h").filter(function (card) {
            return get.suit(card, player) === suit && lib.filter.cardRecastable(card, player);
        }) : [];
        var pairByHolder = {}, info = get.info(use.card, false) || {};
        if (use.card.name === "jiedao") (use.targets || []).forEach(function (holder, index) {
            var victim = use._nihilWuyouPairs && use._nihilWuyouPairs[holder.playerid] || use.addedTargets && use.addedTargets[index] || index === 0 && use.addedTarget;
            if (victim) pairByHolder[holder.playerid] = victim.playerid;
        });
        function fact(target) {
            var value = wyPublicTarget(player, target, use.card, use);
            if (use.card.name === "jiedao" && info.filterAddedTarget) {
                value.victims = game.filterPlayer(function (victim) { return info.filterAddedTarget(use.card, player, victim, target); }).map(function (victim) { return victim.playerid; });
                value.victimId = pairByHolder[target.playerid] || value.victims[0];
                value.victimFacts = {};
                game.filterPlayer(function (victim) { return value.victims.includes(victim.playerid); }).forEach(function (victim) {
                    value.victimFacts[victim.playerid] = wyPublicTarget(target, victim, { name: "sha", type: "basic" });
                    value.victimFacts[victim.playerid].team = wyPublicTarget(player, victim).team;
                });
            }
            return value;
        }
        return { name: use.card.name, suit: get.suit(use.card, player), type: get.type(use.card), nature: use.card.nature,
            sequenceModel: true, pairByHolder: pairByHolder,
            directHitIds: (use.directHit || []).map(function (target) { return target.playerid; }),
            damage: Math.max(1, (use.baseDamage || 1) + (use.extraDamage || 0)), effectCount: use.effectCount || 1,
            targets: (use.targets || []).map(fact),
            extraTargets: extraTargets(use, player).map(fact),
            orderIds: order.map(function (target) { return target.playerid; }),
            recastSuit: suit, recastKnown: recast.length, recastFlow: -recast.length * 0.8 + recast.length * 0.8,
            bidirectional: ["nanman", "wanjian", "wugu"].includes(use.card.name) && typeof get.mode === "function" && get.mode() === "versus",
            direction: use._nihilWuyouDirection || null };
    }
    function wyBuildSnapshot(player, phaseEvent) {
        var memory = {}, stored = player.storage[MEMORY] || {};
        SUITS.forEach(function (s) { memory[s] = Math.max(0, Number(stored[s]) || 0); });
        var snapshot = { hp: Number.isFinite(player.hp) ? player.hp : 3, maxHp: player.maxHp || 3, memory: memory,
            handLimit: Math.max(0, player.getHandcardLimit ? player.getHandcardLimit() : player.hp || 3),
            selfId: player.playerid, selfRole: player.identity,
            mode: typeof get.mode === "function" && get.mode() === "versus" && _status && _status.mode === "two" ? "versus_two" :
                typeof get.mode === "function" && get.mode() === "identity" ? "identity" : "unknown",
            players: [], publicTargets: [], currentUse: null, sequenceModel: true, nullifyPrior: true };
        snapshot.players = game.filterPlayer(function () { return true; }).map(function (target) { return wyPublicTarget(player, target); });
        var seatOrder = game.filterPlayer(function () { return true; });
        if (seatOrder.sortBySeat) seatOrder.sortBySeat(_status.currentPhase || player);
        snapshot.orderIds = seatOrder.map(function (target) { return target.playerid; });
        if (!snapshot.players.some(function (target) { return target.id === player.playerid; })) snapshot.players.push(wyPublicTarget(player, player));
        var ownRescue = player.getCards("h").some(function (card) {
            return ["tao", "jiu"].includes(get.name ? get.name(card, player) : card.name) &&
                (!lib.filter.cardEnabled2 || lib.filter.cardEnabled2(card, player) !== false);
        });
        snapshot.players.forEach(function (target) {
            target.rescueUnknown = snapshot.players.some(function (other) {
                return other.team === target.team && !other.dead && other.id !== target.id &&
                    (other.self ? ownRescue : other.hand > 0);
            }) || (target.self ? ownRescue : target.hand > 0);
        });
        snapshot.ownHand = player.getCards("h").map(function (card, index) {
            var name = get.name ? get.name(card, player) : card.name;
            var legal = !!phaseEvent && !(phaseEvent._aiexclude || []).includes(card) &&
                (!phaseEvent.filterCard || phaseEvent.filterCard(card, player, phaseEvent)) &&
                !!player.hasUseTarget && player.hasUseTarget(card, undefined, phaseEvent);
            var nativeTargets = legal ? game.filterPlayer(function (t) { return player.canUse(card, t, undefined, phaseEvent) && (!phaseEvent || !phaseEvent.filterTarget || phaseEvent.filterTarget(card, player, t)); }) : [];
            if (nativeTargets.sortBySeat) nativeTargets.sortBySeat(_status.currentPhase || player);
            var targets = nativeTargets.map(function (t) { return wyPublicTarget(player, t, card); });
            var info = get.info(card, false) || {};
            var suit = get.suit(card, player), id = String(card.cardid || "hand_" + index), candidates = [];
            var forced = info.selectTarget === -1;
            if (legal && WY_V3_NAMES.includes(name)) {
                var groups = forced ? [targets] : targets.map(function (t) { return [t]; });
                if (name === "tiesuo") targets.forEach(function (target, index) {
                    targets.slice(index + 1).forEach(function (other) { groups.push([target, other]); });
                });
                if (name === "jiedao" && info.filterAddedTarget) {
                    groups = [];
                    nativeTargets.forEach(function (holder) {
                        game.filterPlayer(function (victim) { return info.filterAddedTarget(card, player, victim, holder); }).forEach(function (victim) {
                            var holderFact = wyPublicTarget(player, holder, card);
                            holderFact.victimId = victim.playerid;
                            holderFact.victimFacts = {};
                            holderFact.victimFacts[victim.playerid] = Object.assign(wyPublicTarget(holder, victim, { name: "sha", type: "basic" }), { team: wyPublicTarget(player, victim).team });
                            groups.push([holderFact]);
                        });
                    });
                }
                groups.forEach(function (group) {
                    if (!group.length) return;
                    var ownPhase = typeof _status !== "undefined" && _status.currentPhase === player;
                    var recast = ownPhase ? player.getCards("h").filter(function (other) {
                        return other !== card && get.suit(other, player) === suit && lib.filter.cardRecastable(other, player);
                    }) : [];
                    var extra = game.filterPlayer(function (t) {
                        return !group.some(function (g) { return g.id === t.playerid; }) &&
                            lib.filter.targetEnabled2(card, player, t) && lib.filter.targetInRange(card, player, t);
                    }).map(function (t) { return wyPublicTarget(player, t, card); });
                    if (name === "jiedao" && info.filterAddedTarget) extra.forEach(function (holderFact) {
                        var holder = game.filterPlayer(function (target) { return target.playerid === holderFact.id; })[0];
                        holderFact.victims = game.filterPlayer(function (victim) { return info.filterAddedTarget(card, player, victim, holder); }).map(function (victim) { return victim.playerid; });
                        holderFact.victimId = holderFact.victims[0];
                    });
                    candidates.push({ name: name, type: get.type(card), suit: suit, nature: card.nature, sequenceModel: true, materialId: id, materialCost: 0.8,
                        pairByHolder: group.reduce(function (pairs, target) { if (target.victimId) pairs[target.id] = target.victimId; return pairs; }, {}),
                        damage: 1, effectCount: 1, targets: group, extraTargets: extra, forcedTargets: forced,
                        orderIds: snapshot.orderIds,
                        recastSuit: ownPhase && SUITS.includes(suit) ? suit : null, recastKnown: recast.length,
                        recastFlow: recast.reduce(function (sum, other) {
                            return sum - (["tao", "shan", "wuxie"].includes(get.name(other, player)) && player.hp <= 2 ? 2.2 : 0.8) + 0.8;
                        }, 0),
                        bidirectional: ["nanman", "wanjian", "wugu"].includes(name) && typeof get.mode === "function" && get.mode() === "versus" });
                });
            }
            return { id: id, name: name, suit: suit, legal: legal, candidates: candidates,
                value: ["tao", "shan", "wuxie"].includes(name) && player.hp <= 2 ? 2.2 : 0.8,
                positive: true, effectScore: 0, targetIds: targets.map(function (t) { return t.id; }),
                defenseLegal: !lib.filter.cardEnabled2 || lib.filter.cardEnabled2(card, player) !== false,
                respondLegal: !lib.filter.cardRespondable || lib.filter.cardRespondable(card, player),
                useLegal: !lib.filter.cardEnabled || lib.filter.cardEnabled(card, player, "forceEnable"),
                discardLegal: !lib.filter.cardDiscardable || lib.filter.cardDiscardable(card, player), nature: card.nature,
                recastable: lib.filter.cardRecastable(card, player), recastEligible: true };
        });
        var keep = wyPlanKeep(snapshot);
        snapshot.criticalCards = keep.criticalCards; snapshot.kept = keep.kept; snapshot.discarded = keep.discarded;
        return snapshot;
    }
    function wyPhaseEvent(player) {
        var event = get.event();
        if (!event || event.name !== "chooseToUse" || event.type !== "phase" || event.player !== player || event.skill) return null;
        return event;
    }
    function wyRefreshUsePlan(player, event) {
        var signature = wyV3Signature(player, event);
        if (event._nihilWuyouPlan && event._nihilWuyouSignature === signature) return;
        var started = Date.now(), fault = null;
        try {
            event._nihilWuyouPlan = wyV3PlanUse(wyBuildSnapshot(player, event));
        } catch (error) {
            event._nihilWuyouPlan = {}; fault = String(error && error.message || error);
        }
        event._nihilWuyouSignature = signature;
        var counts = {}, cards = player.getCards("h").map(function (card, index) {
            var id = String(card.cardid || "hand_" + index), decision = event._nihilWuyouPlan[id];
            var action = decision ? decision.action : "NATIVE", reason = decision ? decision.reason : fault ? "RUNTIME_FALLBACK" :
                event._nihilWuyouPlan.fallbacks && event._nihilWuyouPlan.fallbacks[id] || "NATIVE_FALLBACK";
            counts[action + "/" + reason] = (counts[action + "/" + reason] || 0) + 1;
            return { id: id, name: get.name ? get.name(card, player) : card.name, action: action, reason: reason };
        });
        var nativeLegal = fault ? null : cards.some(function (entry, index) {
            var card = player.getCards("h")[index];
            return entry.action === "NATIVE" && !(event._aiexclude || []).includes(card) &&
                (!event.filterCard || event.filterCard(card, player, event)) && player.hasUseTarget && player.hasUseTarget(card, undefined, event);
        });
        wyV3Audit("usePlan", player, null, null, { counts: counts, cards: cards,
            nativeFallback: cards.some(function (card) { return card.action === "NATIVE"; }),
            legalNativeFallback: nativeLegal,
            nativeCallbacks: !!event._nihilWuyouOriginalAi1 && !!event._nihilWuyouOriginalAi2,
            elapsedMs: Date.now() - started, fault: fault });
    }
    function wyPreparedCard(player, card) {
        var event = wyPhaseEvent(player);
        if (!event || !event._nihilWuyouPlan) return null;
        var hand = player.getCards("h"), material = hand.includes(card) ? card : card.cards && card.cards.length === 1 && hand.includes(card.cards[0]) && card.name === get.name(card.cards[0], player) ? card.cards[0] : null;
        if (!material) return null;
        return event._nihilWuyouPlan[String(material.cardid || "hand_" + hand.indexOf(material))];
    }
    function wyIncoming(player, trigger, snapshot) {
        var use = trigger.getParent(), name = trigger.card.name;
        var args = Object.assign({}, use.customArgs && use.customArgs.default, use.customArgs && use.customArgs[player.playerid]);
        var response = name === "sha" || name === "wanjian" ? "shan" : name === "nanman" ? "sha" : null;
        var required = Math.max(1, args.shanRequired || args.shaRequired || 1);
        var blocked = !!(use.directHit && use.directHit.includes(player)) || trigger.directHit === true || args.directHit === true || args.directHit2 === true;
        var responses = snapshot.ownHand.filter(function (c) { return c.name === response && c.defenseLegal; });
        var legalResponses = player.getCards("h").filter(function (c) {
            if ((get.name ? get.name(c, player) : c.name) !== response) return false;
            var filter = name === "sha" ? lib.filter.cardEnabled : lib.filter.cardRespondable;
            return !filter || filter(c, player, name === "sha" ? "forceEnable" : undefined);
        });
        return { suit: get.suit(trigger.card), damageCard: !!get.tag(trigger.card, "damage"), excluded: !!(use.excluded && use.excluded.includes(player)),
            damage: Math.max(1, (use.baseDamage || 1) + (use.extraDamage || 0) + (args.extraDamage || 0)),
            harmful: !trigger.player || typeof get.effect !== "function" || get.effect(player, trigger.card, trigger.player, player) < 0,
            reliable: !!response && !blocked && legalResponses.length >= required && responses.length >= required,
            cheap: required === 1 && responses.some(function (c) { return !snapshot.criticalCards.includes(c.id); }) };
    }
    function wyBoolAI() { return !!get.event().nihilWuyouDecision; }
    function wyPaymentAI(button) { return (get.event().nihilWuyouSpend || []).includes(button.link.split(":")[0]) ? 1 : -1; }
    function wyTargetAI(target) { return target.playerid === get.event().nihilWuyouExtra ? 1 : -1; }
    function wyVictimAI(target) { return target.playerid === get.event().nihilWuyouVictim ? 1 : -1; }
    function wyFireDiscardAI(card) {
        var event = get.event(), id = String(card.cardid || "hand_" + event.player.getCards("h").indexOf(card));
        return event.nihilWuyouFireScores[id] || -1;
    }
    function wyCapturePairs(use) {
        if (use._nihilWuyouPairs) return;
        var pairs = use._nihilWuyouPairs = {};
        (use.targets || []).forEach(function (holder, index) {
            pairs[holder.playerid] = use.addedTargets && use.addedTargets[index] || index === 0 && use.addedTarget || false;
        });
    }
    function wySyncPairs(use) {
        use.addedTargets = use.targets.map(function (holder) { return use._nihilWuyouPairs[holder.playerid] || false; });
    }
    function wyInstallPairSort(use) {
        if (!use._nihilWuyouPairs) return;
        wySyncPairs(use);
        if (use._nihilWuyouPairSortInstalled || !use.sortTarget) return;
        var original = use.sortTarget;
        use.sortTarget = function () {
            var result = original.apply(this, arguments);
            wySyncPairs(use);
            return result;
        };
        use._nihilWuyouPairSortInstalled = true;
    }

    var WY_V3_NAMES = ["sha", "tao", "wuzhong", "taoyuan", "nanman", "wanjian", "guohe", "shunshou", "juedou", "huogong", "tiesuo", "wugu", "jiedao"];
    function wyV4Enabled(snapshot, use) {
        return WY_V3_NAMES.includes(use.name) && (!!snapshot.sequenceModel || ["juedou", "huogong", "tiesuo", "wugu", "jiedao"].includes(use.name));
    }
    function wyV4Token(card) {
        return { id: card.id, name: card.name, suit: card.suit, value: card.value || 0.8,
            respondLegal: card.respondLegal !== false && card.defenseLegal !== false,
            useLegal: card.useLegal !== false, nature: card.nature,
            discardLegal: card.discardLegal !== false, recastable: card.recastable !== false };
    }
    function wyV4Sample(seed, axis) {
        var value = Math.imul((seed + 1) ^ Math.imul(axis + 1, 0x9e3779b9), 0x85ebca6b);
        value ^= value >>> 16; value = Math.imul(value, 0xc2b2ae35); value ^= value >>> 13;
        return (value >>> 0) / 4294967296;
    }
    function wyV4Worlds(snapshot, use, option) {
        var worlds = [], players = snapshot.players || [];
        for (var sample = 0; sample < 32; sample++) {
            var hands = {}, pools = [];
            players.forEach(function (person, index) {
                if (person.id === snapshot.selfId) {
                    hands[person.id] = (snapshot.ownHand || []).filter(function (card) { return card.id !== use.materialId; }).map(wyV4Token);
                    return;
                }
                var known = (person.knownHand || []).map(wyV4Token), hand = Math.max(0, person.hand || 0);
                hands[person.id] = known;
                for (var k = known.length; k < hand; k++) {
                    var rank = wyV4Sample(sample, 1 + index * 17 + k * 3);
                    var profile = person.responses || {};
                    var shaRate = profile.shaPrior && !profile.redSha && !profile.swap ? 0.4 : 0.25;
                    var shanRate = profile.shanPrior && !profile.blackShan && !profile.swap ? 0.4 : 0.25;
                    var name = rank < shaRate ? "sha" : rank < shaRate + shanRate ? "shan" : rank < shaRate + shanRate + 0.06 ? "wuxie" : rank < shaRate + shanRate + 0.12 ? "tao" : "other";
                    known.push(wyV4Token({ id: person.id + ":" + k, name: name,
                        suit: SUITS[Math.floor(wyV4Sample(sample, 2 + index * 11 + k * 7) * 4)] }));
                }
            });
            var loops = use.name === "wugu" ? Math.min(64, Math.max(1, use.effectCount || 1) + 1) : 0;
            for (var round = 0; round < loops; round++) {
                pools.push(Array.from({ length: (use.targets || []).length }, function (_, index) {
                    var rank = wyV4Sample(sample, 103 + round * 19 + index * 7);
                    return wyV4Token({ id: "pool:" + round + ":" + index,
                        name: rank < 0.25 ? "sha" : rank < 0.5 ? "shan" : rank < 0.56 ? "wuxie" : rank < 0.64 ? "tao" : "other",
                        suit: SUITS[Math.floor(wyV4Sample(sample, 107 + round * 13 + index * 5) * 4)] });
                }));
            }
            worlds.push({ p: 1 / 32, hands: hands, pools: pools, seed: sample,
                sampled: use.name === "wugu" || players.some(function (person) { return person.id !== snapshot.selfId && person.hand > (person.knownHand || []).length; }),
                response: {}, steal: {} });
        }
        return { key: wyV3OptionKey(option || wyV3Blank()), worlds: worlds, unknownMass: 0, sampled: true };
    }
    function wyV4Consume(state, person, token, reason, snapshot) {
        if (person.inventory.includes(token)) person.inventory.splice(person.inventory.indexOf(token), 1);
        else wyV4RemoveEquip(person, token.id);
        person.hand = person.inventory.length;
        state.c += person.team === "enemy" ? token.value : person.team === "ally" ? -token.value : 0;
        if (person.id === snapshot.selfId && reason !== "use" && SUITS.includes(token.suit)) state.memory[token.suit]++;
        state.trace.push({ kind: reason, actor: person.id, card: token.name, suit: token.suit });
    }
    function wyV4RemoveEquip(person, id) {
        ["weapons", "responseEquips", "moveZones"].forEach(function (key) {
            person[key] = (person[key] || []).filter(function (card) { return card.id !== id; });
        });
    }
    function wyV4CopyState(state) {
        var copy = Object.assign({}, state, { people: {}, memory: wyV3CopyMemory(state.memory),
            deadAlly: state.deadAlly.slice(), deadEnemy: state.deadEnemy.slice(), trace: state.trace.slice(), defenseCoverage: null });
        Object.keys(state.people).forEach(function (id) {
            var person = state.people[id];
            copy.people[id] = Object.assign({}, person);
            ["inventory", "responseEquips", "weapons", "moveZones"].forEach(function (key) {
                copy.people[id][key] = (person[key] || []).map(function (card) { return Object.assign({}, card); });
            });
        });
        return copy;
    }
    function wyV4LocalUtility(state, snapshot, use) {
        var recast = use.recastSuit ? state.people[snapshot.selfId].inventory.filter(function (card) {
            return card.suit === use.recastSuit && card.recastable;
        }) : [];
        state.knownOwnRecast = recast.length;
        state.utility = wyV3Utility(state, snapshot, Object.assign({}, use, { recastKnown: 0,
            recastFlow: recast.reduce(function (sum, card) { return sum + 0.8 - card.value; }, 0) }));
    }
    function wyV4Transfer(state, from, to, token, snapshot) {
        if (from === to) return;
        from.inventory.splice(from.inventory.indexOf(token), 1); to.inventory.push(token);
        from.hand = from.inventory.length; to.hand = to.inventory.length;
        var critical = ["tao", "shan", "wuxie"].includes(token.name) && from.hp <= 2 && from.inventory.length <= 1;
        var earlier = (snapshot.orderIds || []).indexOf(to.id) <= (snapshot.orderIds || []).indexOf(from.id);
        state.c += from.team === "enemy" ? 1.6 : from.team === "ally" ? critical ? -1.1 : from.inventory.length >= from.hp || earlier ? 0.08 : -0.2 : 0;
        if (from.id === snapshot.selfId && SUITS.includes(token.suit)) state.memory[token.suit]++;
        state.trace.push({ kind: "gain", from: from.id, to: to.id, card: token.name, suit: token.suit });
    }
    function wyV4Damage(state, victim, fact, amount, nature, snapshot, propagate) {
        if (!victim || victim.dead || state.terminal !== "NONE") return;
        amount += nature === "fire" ? fact.fireDamageBonus || 0 : 0;
        if (fact.damageCap) amount = Math.min(amount, fact.damageCap);
        var blocked = Math.min(victim.armor, amount), lost = Math.min(Math.max(0, victim.hp), amount - blocked);
        victim.armor -= blocked; victim.hp -= amount - blocked;
        state.h += (victim.team === "enemy" ? 2 : victim.team === "ally" ? -2.6 : 0) * (blocked + lost);
        if (victim.team === "ally") { state.armorAllyLoss += blocked; state.damageAlly += lost; }
        state.trace.push({ kind: "damage", target: victim.id, hp: victim.hp, armor: victim.armor, nature: nature });
        if (victim.hp <= 0) {
            var rescuers = Object.keys(state.people).map(function (id) { return state.people[id]; });
            for (var rescuer of rescuers) {
                if (rescuer.dead || rescuer.team !== victim.team) continue;
                var rescue;
                while (victim.hp <= 0 && (rescue = wyV4Response(rescuer, "tao", true) || rescuer === victim && wyV4Response(rescuer, "jiu", true))) {
                    wyV4Consume(state, rescuer, rescue, "use", snapshot); victim.hp++;
                    state.trace.push({ kind: "rescue", actor: rescuer.id, target: victim.id });
                }
            }
            if (victim.hp <= 0) {
                victim.dead = true;
                if (victim.team === "enemy") { state.h += 4.5; if (victim.publicTeam !== "unknown") state.deadEnemy.push(victim.id); }
                if (victim.team === "ally") { state.h -= 6; state.deadAlly.push(victim.id); }
                wyV3Terminal(state, snapshot);
            }
        }
        if (propagate && nature && victim.linked && lost > 0) {
            victim.linked = false;
            Object.keys(state.people).forEach(function (id) {
                var other = state.people[id];
                if (other !== victim && other.linked && !other.dead && state.terminal === "NONE") {
                    other.linked = false;
                    wyV4Damage(state, other, state.facts[id] || {}, amount, nature, snapshot, false);
                }
            });
        }
    }
    function wyV4Response(person, name, using) {
        var profile = person.responses || {};
        return person.inventory.concat(name === "sha" && profile.redSha || name === "tao" && profile.redRescue ? person.responseEquips || [] : []).find(function (card) {
            if (!(using ? card.useLegal !== false : card.respondLegal !== false)) return false;
            return card.name === name || name === "sha" && (profile.redSha && ["heart", "diamond"].includes(card.suit) || profile.swap && card.name === "shan") ||
                name === "shan" && (profile.blackShan && ["spade", "club"].includes(card.suit) || profile.swap && card.name === "sha") ||
                name === "tao" && profile.redRescue && ["heart", "diamond"].includes(card.suit);
        });
    }
    function wyV4Slash(state, source, target, fact, direct, use, snapshot) {
        if (!target || target.dead || fact.effectCancelled) return false;
        if (target.effectUnknown) {
            state.unknown = true;
            if (target.team === "enemy") state.winUnknown = true;
            else { state.riskUnknown = true; state.terminal = "UNKNOWN"; }
            return false;
        }
        if (target.id === snapshot.selfId && SUITS.includes(use.suit) && state.memory[use.suit] >= 2) {
            state.memory[use.suit] = 0; return false;
        }
        var response = wyV4Response(target, "shan");
        if (!direct && response) wyV4Consume(state, target, response, "respond", snapshot);
        else wyV4Damage(state, target, fact, use.damage || 1, use.nature || "", snapshot, true);
        return true;
    }
    function wyV4EffectSign(state, use, target, fact) {
        if (["tao", "taoyuan"].includes(use.name)) return target.hp < target.maxHp ? 1 : 0;
        if (["wuzhong", "wugu"].includes(use.name)) return 1;
        if (use.name === "tiesuo") return target.linked ? 1 : -1;
        if (["guohe", "shunshou"].includes(use.name) && fact.moveZones && fact.moveZones.some(function (zone) { return zone.zone === "j" && zone.bonus < 0; })) return 1;
        return -1;
    }
    function wyV4Neutralized(state, use, target, fact, option, snapshot) {
        if (use.type !== "trick" || option.directHit || !snapshot.nullifyPrior) return false;
        var sign = wyV4EffectSign(state, use, target, fact), cancelled = false, used = {};
        if (!sign || target.team === "unknown") return false;
        for (var turn = 0; turn < Object.keys(state.people).length; turn++) {
            var actor = Object.keys(state.people).map(function (id) { return state.people[id]; }).find(function (person) {
                var same = person.team === target.team;
                return !person.dead && !used[person.id] && !(use.directHitIds || []).includes(person.id) &&
                    (cancelled ? same === (sign > 0) : same === (sign < 0)) && wyV4Response(person, "wuxie", true);
            });
            if (!actor) break;
            used[actor.id] = true;
            wyV4Consume(state, actor, wyV4Response(actor, "wuxie", true), "use", snapshot);
            cancelled = !cancelled;
        }
        if (cancelled) state.trace.push({ kind: "neutralize", target: target.id });
        return cancelled;
    }
    function wyV4Draw(state, target, token, snapshot) {
        target.inventory.push(Object.assign({}, token)); target.hand = target.inventory.length;
        state.c += target.team === "enemy" ? -token.value : target.team === "ally" ? token.value : 0;
        state.trace.push({ kind: "draw", target: target.id, card: token.name, id: token.id });
    }
    var WY_V4_EFFECTS = {
        sha: function (env) { return wyV4Slash(env.state, env.owner, env.target, env.fact, env.direct, env.use, env.snapshot); },
        nanman: function (env) {
            if (env.target === env.owner && SUITS.includes(env.use.suit) && env.state.memory[env.use.suit] >= 2) {
                env.state.memory[env.use.suit] = 0; return false;
            }
            var response = wyV4Response(env.target, "sha");
            if (!env.direct && response) wyV4Consume(env.state, env.target, response, "respond", env.snapshot);
            else wyV4Damage(env.state, env.target, env.fact, env.use.damage || 1, "", env.snapshot, false);
            return true;
        },
        wanjian: function (env) { return WY_V4_EFFECTS.sha(env); },
        tao: function (env) {
            if (env.target.hp < env.target.maxHp) {
                env.target.hp++; env.state.h += env.target.team === "enemy" ? -2 : env.target.team === "ally" ? 2 : 0;
            }
            return true;
        },
        taoyuan: function (env) { return env.target.hp < env.target.maxHp && WY_V4_EFFECTS.tao(env); },
        wuzhong: function (env) {
            for (var k = 0; k < (env.fact.drawCount || 2); k++) {
                wyV4Draw(env.state, env.target, wyV4Token({ id: "draw:" + env.pass + ":" + env.target.id + ":" + k,
                    name: "other", suit: SUITS[Math.floor(wyV4Sample(env.world.seed || 0, 211 + env.pass * 7 + k) * 4)] }), env.snapshot);
            }
            return true;
        },
        guohe: function (env) {
            var target = env.target, choices = target.inventory.map(function (card) { return { token: card, zone: "h", bonus: 0 }; }).concat(target.moveZones);
            if (!choices.length) return true;
            function value(choice) {
                var base = choice.zone === "j" ? 0 : target.team === "enemy" ? 0.8 : -2.2;
                base += (target.team === "enemy" ? 1 : -1) * (choice.bonus || 0);
                if (choice.healOnLose && target.hp < target.maxHp) base += target.team === "enemy" ? -2 : 2;
                return base;
            }
            choices.sort(function (a, b) { return value(b) - value(a); });
            var chosen = choices[0];
            if (chosen.token) {
                if (env.use.name === "shunshou") wyV4Transfer(env.state, target, env.owner, chosen.token, env.snapshot);
                else wyV4Consume(env.state, target, chosen.token, "discard", env.snapshot);
            } else {
                if (chosen.zone === "e") wyV4RemoveEquip(target, chosen.id);
                else target.moveZones.splice(target.moveZones.indexOf(chosen), 1);
                env.state.c += value(chosen) + (env.use.name === "shunshou" ? 0.8 : 0);
                if (env.use.name === "shunshou") { env.owner.inventory.push(wyV4Token(chosen)); env.owner.hand = env.owner.inventory.length; }
                if (chosen.healOnLose && target.hp < target.maxHp) target.hp++;
            }
            return true;
        },
        shunshou: function (env) { return WY_V4_EFFECTS.guohe(env); },
        juedou: function (env) {
            var current = env.target, other = env.owner;
            while (env.state.terminal === "NONE") {
                var response = current === env.target && env.direct ? null : wyV4Response(current, "sha");
                if (!response) {
                    wyV4Damage(env.state, current, env.state.facts[current.id] || {}, env.use.damage || 1, "", env.snapshot, false);
                    return true;
                }
                wyV4Consume(env.state, current, response, "respond", env.snapshot);
                var swap = current; current = other; other = swap;
            }
            return true;
        },
        huogong: function (env) {
            if (!env.target.inventory.length) return true;
            var axis = env.target.id.split("").reduce(function (sum, letter) { return sum + letter.charCodeAt(0); }, 401) + env.pass * 31;
            var shownCard = wyV4Sample(env.world.seed || 0, axis) < 0.5 ?
                env.target.inventory[Math.floor(wyV4Sample(env.world.seed || 0, axis + 1) * env.target.inventory.length)] :
                env.target.inventory.slice().sort(function (a, b) { return b.value - a.value; })[0];
            var shown = shownCard.suit;
            env.state.trace.push({ kind: "show", target: env.target.id, suit: shown });
            var root = wyV4CopyState(env.state), matching = null, best = 0;
            wyV4LocalUtility(root, env.snapshot, env.use);
            env.owner.inventory.filter(function (card) { return card.suit === shown && card.discardLegal; }).forEach(function (material) {
                var candidate = wyV4CopyState(env.state), owner = candidate.people[env.owner.id];
                var discarded = owner.inventory.find(function (card) { return card.id === material.id; });
                wyV4Consume(candidate, owner, discarded, "discard", env.snapshot);
                wyV4Damage(candidate, candidate.people[env.target.id], env.fact, env.use.damage || 1, "fire", env.snapshot, true);
                wyV4LocalUtility(candidate, env.snapshot, env.use);
                var judged = wyV3Summarize({ unknownMass: 0, budget: { count: 1, exceeded: false },
                    paths: [{ p: 1, root: root, candidate: candidate }] }, true);
                if (judged.ok && judged.score > best) { matching = material; best = judged.score; }
            });
            if (matching) {
                wyV4Consume(env.state, env.owner, matching, "discard", env.snapshot);
                wyV4Damage(env.state, env.target, env.fact, env.use.damage || 1, "fire", env.snapshot, true);
            }
            return true;
        },
        tiesuo: function (env) {
            env.target.linked = !env.target.linked;
            env.state.trace.push({ kind: "link", target: env.target.id, linked: env.target.linked });
            return true;
        },
        wugu: function (env) {
            if (!env.state.pool.length) return true;
            function value(token) { return token.name === "tao" && env.target.hp < env.target.maxHp ? 2.2 : token.name === "shan" && !env.target.inventory.some(function (card) { return card.name === "shan"; }) ? 1.3 : token.value; }
            env.state.pool.sort(function (a, b) { return value(b) - value(a); });
            var token = env.state.pool.shift();
            wyV4Draw(env.state, env.target, token, env.snapshot); return true;
        },
        jiedao: function (env) {
            var victimId = env.use.pairByHolder && env.use.pairByHolder[env.target.id] || env.fact.victimId;
            var victim = env.state.people[victimId], slash = wyV4Response(env.target, "sha", true);
            var weapon = env.target.weapons || [];
            var willing = victim && victim.team !== env.target.team && !victim.dead;
            if (!env.direct && slash && victim && (willing || !weapon.length)) {
                wyV4Consume(env.state, env.target, slash, "use", env.snapshot);
                var childFact = Object.assign({}, env.fact.victimFacts && env.fact.victimFacts[victimId] || env.state.facts[victimId] || {});
                childFact.effectCancelled = !!(childFact.blackSlashCancelled && ["spade", "club"].includes(slash.suit) || childFact.plainSlashCancelled && !slash.nature);
                childFact.fireDamageBonus = childFact.fireSlashBonus || 0;
                wyV4Slash(env.state, env.target, victim, childFact, false,
                    { name: "sha", suit: slash.suit, nature: slash.nature, damage: 1 }, env.snapshot);
            } else {
                weapon.forEach(function (card) {
                    env.owner.inventory.push(wyV4Token(card));
                    wyV4RemoveEquip(env.target, card.id);
                    env.state.c += env.target.team === "enemy" ? 1.6 + (card.bonus || 0) : -1.4 - (card.bonus || 0);
                    env.state.trace.push({ kind: "weapon", from: env.target.id, id: card.id });
                });
                env.owner.hand = env.owner.inventory.length;
            }
            return true;
        }
    };
    function wyV4State(snapshot, use, paid, world) {
        var state = wyV3State(snapshot, world, paid);
        state.trace = []; state.facts = {}; state.sampled = !!world.sampled;
        (snapshot.players || []).concat(use.targets || [], use.extraTargets || []).forEach(function (fact) { state.facts[fact.id] = fact; });
        Object.keys(state.people).forEach(function (id) {
            var person = state.people[id], fact = state.facts[id];
            person.inventory = (world.hands && world.hands[id] || (id === snapshot.selfId ? snapshot.ownHand || [] : [])).filter(function (card) { return card.id !== use.materialId; }).map(wyV4Token);
            person.hand = person.inventory.length; person.linked = !!fact.linked;
            person.weapons = (fact.weapons || []).map(function (card) { return Object.assign({}, card); });
            person.responses = fact.responses || {};
            person.responseEquips = (fact.responseEquips || []).map(wyV4Token);
        });
        return state;
    }
    function wyV4FireDiscardPlan(snapshot, use, shownSuit) {
        var target = use.targets[0];
        if ((snapshot.players || []).some(function (person) {
            return (person.id === target.id || target.linked && person.linked) && person.responses && person.responses.damageGap;
        })) return null;
        var scores = {}, worlds = wyV4Worlds(snapshot, use).worlds;
        (snapshot.ownHand || []).filter(function (card) { return card.suit === shownSuit && card.discardLegal !== false; }).forEach(function (material) {
            var paths = worlds.map(function (world) {
                var root = wyV4State(snapshot, use, [], world), candidate = wyV4CopyState(root), owner = candidate.people[snapshot.selfId];
                var discarded = owner.inventory.find(function (card) { return card.id === material.id; });
                wyV4LocalUtility(root, snapshot, use);
                wyV4Consume(candidate, owner, discarded, "discard", snapshot);
                var fact = candidate.facts[use.targets[0].id];
                wyV4Damage(candidate, candidate.people[fact.id], fact, use.damage || 1, "fire", snapshot, true);
                wyV4LocalUtility(candidate, snapshot, use);
                return { p: world.p, root: root, candidate: candidate };
            });
            var judged = wyV3Summarize({ paths: paths, unknownMass: 0, budget: { count: worlds.length, exceeded: false } }, true);
            scores[material.id] = judged.ok ? judged.score : -1;
        });
        return scores;
    }
    function wyV4Run(snapshot, use, option, paid, world, budget, direction) {
        var state = wyV4State(snapshot, use, paid, world), owner = state.people[snapshot.selfId];
        if (!owner) { state.terminal = "UNKNOWN"; return state; }
        if (use.materialCost) state.c -= use.materialCost;
        var ids = (use.targets || []).map(function (fact) { return fact.id; });
        if (option.extraTarget && !ids.includes(option.extraTarget)) ids.push(option.extraTarget);
        if (use.orderIds) ids.sort(function (a, b) { return use.orderIds.indexOf(a) - use.orderIds.indexOf(b); });
        if (direction === "reverse") ids.reverse();
        var loops = Math.max(1, use.effectCount || 1) + (option.repeat ? 1 : 0);
        for (var pass = 0; pass < loops && state.terminal === "NONE"; pass++) {
            state.pool = (world.pools && world.pools[pass] || []).map(wyV4Token);
            if (use.name === "wugu") state.trace.push({ kind: "pool", pass: pass, ids: state.pool.map(function (card) { return card.id; }) });
            for (var i = 0; i < ids.length && state.terminal === "NONE"; i++) {
                if (budget.count >= (budget.limit || WY_V3_LIMIT)) { budget.exceeded = true; return state; }
                budget.count++;
                var target = state.people[ids[i]], fact = state.facts[ids[i]];
                if (!target || target.dead || !fact || fact.excluded || fact.effectCancelled || use.name === "taoyuan" && target.hp >= target.maxHp) continue;
                if (fact.responses && fact.responses.damageGap && ["sha", "nanman", "wanjian", "juedou", "huogong", "jiedao"].includes(use.name)) state.modelGap = true;
                if (wyV4Neutralized(state, use, target, fact, option, snapshot)) continue;
                if (target.effectUnknown && ["sha", "nanman", "wanjian", "juedou", "huogong"].includes(use.name)) {
                    state.unknown = true;
                    if (target.team === "enemy") state.winUnknown = true;
                    else { state.riskUnknown = true; state.terminal = "UNKNOWN"; }
                    continue;
                }
                var optionUse = option.extraVictim ? Object.assign({}, use, { pairByHolder: Object.assign({}, use.pairByHolder,
                    { [option.extraTarget]: option.extraVictim }) }) : use;
                var env = { state: state, owner: owner, target: target, fact: fact, use: optionUse, snapshot: snapshot,
                    world: world, pass: pass, direct: option.directHit || fact.directHit };
                var reachedEnd = WY_V4_EFFECTS[use.name](env);
                if (state.terminal !== "NONE") break;
                if (reachedEnd) state.trace.push({ kind: "end", target: target.id, pass: pass });
                if (reachedEnd && option.gain && target !== owner && !target.dead && target.inventory.length) {
                    var roll = wyV4Sample(world.seed || 0, 307 + pass * 29 + i * 11);
                    wyV4Transfer(state, target, owner, target.inventory[Math.floor(roll * target.inventory.length)], snapshot);
                }
            }
        }
        if (use.name === "tiesuo") {
            var opportunity = (snapshot.ownHand || []).some(function (card) { return card.name === "huogong" || card.name === "sha" && card.nature; }) ? 0.65 : 0;
            Object.keys(state.people).forEach(function (id) {
                var target = state.people[id], initial = state.facts[id];
                state.h += (target.team === "enemy" ? 1 : -1) * opportunity * (+target.linked - +!!initial.linked);
            });
        }
        if (use.recastSuit && SUITS.includes(use.recastSuit)) {
            state.knownOwnRecast = owner.inventory.filter(function (card) { return card.suit === use.recastSuit && card.recastable; }).length;
        }
        var recastFlow = use.recastSuit ? owner.inventory.filter(function (card) {
            return card.suit === use.recastSuit && card.recastable;
        }).reduce(function (sum, card) { return sum + 0.8 - card.value; }, 0) : 0;
        state.utility = wyV3Utility(state, snapshot, Object.assign({}, use, { recastKnown: 0, recastFlow: recastFlow }));
        return state;
    }
    function wyV4DefenseCoverage(state, snapshot, use) {
        var owner = state.people[snapshot.selfId], inventory = (owner.inventory || []).filter(function (card) {
            return !(use.recastSuit === card.suit && card.recastable);
        });
        var selfFact = (snapshot.players || []).find(function (person) { return person.id === snapshot.selfId; }) || {};
        var armor = (owner.responseEquips || selfFact.responseEquips || []).map(function (card) { return card.name; });
        var opportunities = [], demand = 0, protectedByArmor = owner.armor || 0;
        (snapshot.players || []).forEach(function (source) {
            var current = state.people[source.id];
            if (!current || current.dead || current.team !== "enemy") return;
            var threats = source.recentThreats && source.recentThreats.length ? source.recentThreats.slice(-2) : [{ name: "sha" }];
            var profile = source.responses || {}, bypass = (current.weapons || source.weapons || []).some(function (card) { return card.name === "qinggang"; });
            threats.forEach(function (threat) {
                var weight = 0.6 / threats.length, response = ["nanman", "juedou"].includes(threat.name) ? "sha" : ["sha", "wanjian"].includes(threat.name) ? "shan" : null;
                demand += weight;
                var required = threat.name === "sha" ? profile.shanRequired || 1 : threat.name === "juedou" ? profile.shaRequired || 1 : 1;
                opportunities.push({ response: profile.strongHit ? null : response, required: Math.max(1, required),
                    weight: weight, trick: threat.name !== "sha", covered: false });
                if (!bypass && armor.includes("tengjia") && (["nanman", "wanjian"].includes(threat.name) || threat.name === "sha" && !threat.nature)) protectedByArmor += weight * 0.8;
                else if (!bypass && threat.name === "sha" && armor.includes("renwang")) protectedByArmor += weight * 0.5;
                else if (!bypass && response === "shan" && !profile.strongHit && armor.includes("bagua")) protectedByArmor += weight * 0.5;
            });
        });
        if (!demand) return 1;
        var stock = {
            shan: inventory.filter(function (card) { return card.name === "shan" && card.useLegal && card.respondLegal; }).length,
            sha: inventory.filter(function (card) { return card.name === "sha" && card.respondLegal; }).length };
        var wuxie = inventory.filter(function (card) { return card.name === "wuxie" && card.useLegal; }).length;
        var recovery = inventory.some(function (card) { return card.name === "tao" && card.useLegal && owner.hp < owner.maxHp; }) ? 0.25 : 0;
        var covered = protectedByArmor + recovery;
        opportunities.sort(function (a, b) { return b.weight / b.required - a.weight / a.required; });
        opportunities.forEach(function (opportunity) {
            if (opportunity.response && stock[opportunity.response] >= opportunity.required) {
                stock[opportunity.response] -= opportunity.required;
                opportunity.covered = true; covered += opportunity.weight;
            }
        });
        opportunities.sort(function (a, b) { return b.weight - a.weight; });
        opportunities.forEach(function (opportunity) {
            if (wuxie > 0 && opportunity.trick && !opportunity.covered) { wuxie--; covered += opportunity.weight; }
        });
        return Math.min(1, covered / demand);
    }
    function wyV4MemoryValue(memory, state, snapshot, use) {
        var owner = state.people[snapshot.selfId], active = SUITS.filter(function (suit) { return memory[suit] > 0; }).length;
        if (!state.defenseCoverage || state.defenseCoverage.suit !== use.recastSuit) state.defenseCoverage = {
            suit: use.recastSuit, value: wyV4DefenseCoverage(state, snapshot, use) };
        var coverage = state.defenseCoverage.value;
        var reserve = owner.hp >= 3 ? 0.20 - 0.12 * coverage : owner.hp === 2 ? 0.65 - 0.40 * coverage : 0.90;
        var value = SUITS.reduce(function (sum, suit) {
            var n = Math.max(0, memory[suit] || 0);
            return sum + (n ? (active === 1 ? 0.55 : 0.40) + Math.max(0, n - 1) * 0.25 + (n >= 2 ? reserve : 0) : 0);
        }, 0);
        return value + [0, 0, 0.15, 0.35, 0.60][active];
    }
    var WY_V3_LIMIT = 32768;
    function wyV3MemoryValue(memory) {
        var active = 0, value = 0;
        SUITS.forEach(function (suit) {
            var n = Math.max(0, memory[suit] || 0);
            if (n) active++;
            value += n === 0 ? 0 : n === 1 ? 0.55 : n === 2 ? 1.65 : 1.90 + Math.max(0, n - 3) * 0.20;
        });
        return value + [0, 0, 0.15, 0.35, 0.60][active];
    }
    function wyV3CopyMemory(memory) {
        var result = {};
        SUITS.forEach(function (suit) { result[suit] = Math.max(0, memory && memory[suit] || 0); });
        return result;
    }
    function wyV3Blank() { return { extraTarget: null, gain: false, directHit: false, repeat: false }; }
    function wyV3OptionKey(option) {
        return [option.extraTarget || "", +option.gain, +option.directHit, +option.repeat].join("|") + (option.extraVictim ? "|" + option.extraVictim : "");
    }
    function wyV3Worlds(snapshot, use, option) {
        if (wyV4Enabled(snapshot, use)) return wyV4Worlds(snapshot, use, option);
        option = option || wyV3Blank();
        var active = (use.targets || []).map(function (target) { return target.id; });
        if (option.extraTarget) active.push(option.extraTarget);
        var facts = {};
        (use.targets || []).concat(use.extraTargets || []).forEach(function (target) { facts[target.id] = target; });
        var targets = (snapshot.players || []).filter(function (target) {
            return !target.dead && active.includes(target.id) && !facts[target.id].effectCancelled && !facts[target.id].excluded;
        });
        var damaging = ["sha", "nanman", "wanjian"].includes(use.name);
        var worlds = [{ p: 1, response: {}, randomChoiceKey: "" }];
        targets.forEach(function (target) {
            if (!damaging) return;
            var response = use.name === "nanman" ? "sha" : "shan";
            var h = Math.max(0, target.hand || 0), exact = target.self && snapshot.ownHand;
            var known = exact ? snapshot.ownHand.filter(function (card) {
                return card.id !== use.materialId && card.name === response && card.defenseLegal !== false;
            }).length : null;
            var dist = known !== null ? [[Math.min(2, known), 1]] : [];
            if (known === null) {
                var p0 = Math.pow(0.75, h), p1 = h * 0.25 * Math.pow(0.75, Math.max(0, h - 1));
                dist = [[0, p0], [1, p1], [2, Math.max(0, 1 - p0 - p1)]].filter(function (item) { return item[1] > 1e-12; });
            }
            var next = [];
            worlds.forEach(function (world) { dist.forEach(function (item) {
                var responseMap = Object.assign({}, world.response); responseMap[target.id] = item[0];
                next.push({ p: world.p * item[1], response: responseMap, steal: world.steal || {},
                    randomChoiceKey: world.randomChoiceKey });
            }); });
            next.sort(function (a, b) { return b.p - a.p; });
            worlds = next.slice(0, 64);
        });
        var moveAdversarial = false, moveTruncated = false;
        if (["guohe", "shunshou"].includes(use.name)) targets.forEach(function (target) {
            var fact = facts[target.id];
            var choices = (target.hand > 0 ? [{ id: "h", zone: "h" }] : []).concat(
                (fact.moveZones || []).filter(function (zone) { return !fact.singleMove || zone.zone !== "j"; })
                    .map(function (zone) { return { id: zone.id, zone: zone.zone }; }));
            if (choices.length < 2) return;
            var randomRegion = use.name === "guohe" && fact.singleMove && target.hand > 0 &&
                choices.some(function (choice) { return choice.zone === "e"; });
            if (!randomRegion || choices.length > 2) moveAdversarial = true;
            var loops = Math.max(1, use.effectCount || 1) + (option.repeat ? 1 : 0);
            for (var pass = 0; pass < loops; pass++) {
                var branches = [];
                worlds.forEach(function (world) { choices.forEach(function (choice) {
                    var chosen = Object.assign({}, world.moveChoice);
                    chosen[target.id] = (chosen[target.id] || []).concat(choice.id);
                    var weight = randomRegion ? choice.zone === "h" ? 0.5 :
                        0.5 / choices.filter(function (item) { return item.zone === "e"; }).length : 1 / choices.length;
                    branches.push({ p: world.p * weight, response: world.response, steal: world.steal,
                        moveChoice: chosen, randomChoiceKey: world.randomChoiceKey +
                            (randomRegion ? target.id + ":" + pass + ":" + choice.zone + ";" : "") });
                }); });
                branches.sort(function (a, b) { return b.p - a.p; });
                if (moveAdversarial && branches.length > 64) moveTruncated = true;
                worlds = branches.slice(0, 64);
            }
        });
        if (option.gain && damaging) targets.forEach(function (target) {
            if (target.self || target.hand <= 1 || facts[target.id].excluded) return;
            var expanded = [];
            worlds.forEach(function (world) {
                var pending = [{ p: world.p, hand: target.hand, response: world.response[target.id] || 0, rolls: [] }];
                var loops = Math.max(1, use.effectCount || 1) + (option.repeat ? 1 : 0);
                for (var pass = 0; pass < loops; pass++) {
                    var next = [];
                    pending.forEach(function (path) {
                        var hand = path.hand, response = path.response;
                        if (!(option.directHit || facts[target.id].directHit) && response > 0 && hand > 0) { response--; hand--; }
                        if (!hand) { next.push({ p: path.p, hand: hand, response: response, rolls: path.rolls }); return; }
                        var chance = response / hand;
                        if (chance > 0 && chance < 1) {
                            next.push({ p: path.p * chance, hand: hand - 1, response: response - 1,
                                rolls: path.rolls.concat(chance / 2) });
                            next.push({ p: path.p * (1 - chance), hand: hand - 1, response: response,
                                rolls: path.rolls.concat((1 + chance) / 2) });
                        } else next.push({ p: path.p, hand: hand - 1, response: response - (chance === 1 ? 1 : 0),
                            rolls: path.rolls.concat(chance === 1 ? 0 : 0.5) });
                    });
                    pending = next;
                }
                pending.forEach(function (path) {
                    var steal = Object.assign({}, world.steal); steal[target.id] = path.rolls;
                    expanded.push({ p: path.p, response: world.response, steal: steal,
                        moveChoice: world.moveChoice, randomChoiceKey: world.randomChoiceKey });
                });
            });
            expanded.sort(function (a, b) { return b.p - a.p; });
            worlds = expanded.slice(0, 64);
        });
        return { key: wyV3OptionKey(option), worlds: worlds, moveAdversarial: moveAdversarial,
            unknownMass: moveTruncated ? 1 : Math.max(0, 1 - worlds.reduce(function (sum, world) { return sum + world.p; }, 0)) };
    }
    function wyV3Terminal(state, snapshot) {
        if (state.terminal !== "NONE") return;
        var players = Object.keys(state.people).map(function (id) { return state.people[id]; });
        if (snapshot.mode === "versus_two") {
            if (players.some(function (p) { return (p.publicTeam || p.team) === "unknown"; })) return;
            var ours = players.some(function (p) { return p.team === "ally" && !p.dead; });
            var theirs = players.some(function (p) { return p.team === "enemy" && !p.dead; });
            if (!ours) state.terminal = "LOSS";
            else if (!theirs) state.terminal = "WIN";
        } else if (snapshot.mode === "identity") {
            var lord = players.find(function (p) { return p.publicRole === "zhu"; });
            if (lord && lord.dead) {
                if (snapshot.selfRole === "fan" && !state.people[snapshot.selfId].dead) state.terminal = "WIN";
                else if (snapshot.selfRole === "zhu" || snapshot.selfRole === "zhong") state.terminal = "LOSS";
                else state.terminal = "UNKNOWN";
            }
        }
    }
    function wyV3State(snapshot, world, paid) {
        var people = {};
        (snapshot.players || []).forEach(function (p) {
            people[p.id] = { id: p.id, publicTeam: p.team, team: p.team === "unknown" ? p.attitude > 0 ? "ally" : p.attitude < 0 ? "enemy" : "unknown" : p.team, publicRole: p.publicRole, hp: p.hp, maxHp: p.maxHp,
                hand: p.hand, armor: p.armor || 0, dead: !!p.dead, response: world.response[p.id] || 0,
                rescueUnknown: !!p.rescueUnknown, effectUnknown: !!p.effectUnknown,
                moveZones: (p.moveZones || []).map(function (zone) { return Object.assign({}, zone); }) };
        });
        var memory = wyV3CopyMemory(snapshot.memory);
        (paid || []).forEach(function (suit) { memory[suit]--; });
        return { people: people, memory: memory, h: 0, c: 0, terminal: "NONE", unknown: false,
            riskUnknown: false, winUnknown: false,
            deadAlly: [], deadEnemy: [], unknownOwnCards: 0, knownOwnRecast: 0,
            damageAlly: 0, armorAllyLoss: 0,
            stealCounts: {}, moveCounts: {} };
    }
    function wyV3MoveCard(state, owner, target, fact, use, world) {
        var zones = target.moveZones || [], choices = [];
        if (target.hand > 0) choices.push({ zone: "h" });
        zones.forEach(function (zone) { if (!fact.singleMove || zone.zone !== "j") choices.push(zone); });
        if (!choices.length) return;
        var gain = use.name === "shunshou";
        function value(choice) {
            var base = choice.zone === "j" ? 0 : target.team === "enemy" ? 0.8 : target.team === "ally" ? -2.2 : 0;
            var bonus = choice.bonus || 0;
            if (choice.zone !== "h") base += target.team === "enemy" ? bonus : target.team === "ally" ? -bonus : 0;
            if (choice.healOnLose && target.hp < target.maxHp) base += target.team === "enemy" ? -2 : 2;
            return base + (gain ? 0.8 : 0);
        }
        var index = state.moveCounts[target.id] || 0;
        var latent = world.moveChoice && world.moveChoice[target.id];
        var choiceId = latent && latent[index];
        var chosen = choices.find(function (item) { return item.zone === "h" ? choiceId === "h" : item.id === choiceId; }) ||
            choices.sort(function (a, b) { return value(b) - value(a); })[0];
        state.moveCounts[target.id] = (state.moveCounts[target.id] || 0) + 1;
        if (!chosen) return;
        state.c += value(chosen);
        if (chosen.zone === "h") target.hand--;
        else target.moveZones.splice(target.moveZones.indexOf(chosen), 1);
        if (chosen.healOnLose && target.hp < target.maxHp) target.hp++;
        if (gain) {
            owner.hand++;
            if (chosen.zone === "h") state.unknownOwnCards++;
            else if (chosen.suit === use.recastSuit && chosen.recastable) state.knownOwnRecast++;
        }
    }
    function wyV3RecastValue(state, snapshot, use) {
        var suit = use.recastSuit;
        var fixed = suit && SUITS.includes(suit) ? Math.max(0, use.recastKnown || 0) + state.knownOwnRecast : 0;
        var memory = wyV3CopyMemory(state.memory);
        if (fixed) {
            memory[suit] += fixed;
        }
        var unknown = suit && SUITS.includes(suit) ? Math.max(0, state.unknownOwnCards || 0) : 0;
        var distribution = [1];
        for (var i = 0; i < unknown; i++) {
            var next = Array(distribution.length + 1).fill(0);
            distribution.forEach(function (p, n) { next[n] += p * 0.75; next[n + 1] += p * 0.25; });
            distribution = next;
        }
        return distribution.reduce(function (sum, p, n) {
            var end = wyV3CopyMemory(memory); end[suit] = (end[suit] || 0) + n;
            return sum + p * (wyV4Enabled(snapshot, use) ? wyV4MemoryValue(end, state, snapshot, use) : wyV3MemoryValue(end));
        }, 0);
    }
    function wyV3Utility(state, snapshot, use) {
        if (state.terminal === "WIN") { state.endPotential = 0; return 100; }
        if (state.terminal === "LOSS") { state.endPotential = 0; return -100; }
        state.endPotential = wyV3RecastValue(state, snapshot, use);
        return state.h + state.c + (use.recastFlow || 0) + state.endPotential;
    }
    function wyV3Run(snapshot, use, option, paid, world, budget, direction) {
        if (wyV4Enabled(snapshot, use)) return wyV4Run(snapshot, use, option, paid, world, budget, direction);
        var state = wyV3State(snapshot, world, paid), owner = state.people[snapshot.selfId];
        if (!owner) { state.terminal = "UNKNOWN"; return state; }
        var responseName = use.name === "nanman" ? "sha" : "shan";
        state.ownResponseSuits = (snapshot.ownHand || []).filter(function (card) {
            return card.id !== use.materialId && card.name === responseName && card.defenseLegal !== false;
        }).map(function (card) { return card.suit; });
        if (use.materialCost) state.c -= use.materialCost;
        var ids = (use.targets || []).map(function (t) { return t.id; });
        if (option.extraTarget) ids.push(option.extraTarget);
        if (use.orderIds) ids.sort(function (a, b) { return use.orderIds.indexOf(a) - use.orderIds.indexOf(b); });
        if (direction === "reverse") ids.reverse();
        var byId = {};
        (use.targets || []).concat(use.extraTargets || []).forEach(function (t) { byId[t.id] = t; });
        Object.keys(byId).forEach(function (id) {
            if (state.people[id]) state.people[id].moveZones = (byId[id].moveZones || []).map(function (zone) {
                return Object.assign({}, zone);
            });
        });
        var loops = Math.max(1, use.effectCount || 1) + (option.repeat ? 1 : 0);
        for (var pass = 0; pass < loops && state.terminal === "NONE"; pass++) {
            for (var i = 0; i < ids.length && state.terminal === "NONE"; i++) {
                if (budget.count >= (budget.limit || WY_V3_LIMIT)) { budget.exceeded = true; return state; }
                budget.count++;
                var target = state.people[ids[i]], fact = byId[ids[i]];
                if (!target || target.dead || !fact || fact.excluded || fact.effectCancelled) continue;
                if (use.name === "taoyuan" && target.hp >= target.maxHp) continue;
                if (target.effectUnknown && ["sha", "nanman", "wanjian"].includes(use.name)) {
                    state.unknown = true;
                    if (["sha", "nanman", "wanjian"].includes(use.name)) {
                        if (target.team === "enemy") state.winUnknown = true;
                        else { state.riskUnknown = true; state.terminal = "UNKNOWN"; }
                    }
                    continue;
                }
                var damaging = ["sha", "nanman", "wanjian"].includes(use.name);
                if (["guohe", "shunshou"].includes(use.name) && fact.moveUnknown) {
                    state.unknown = true; state.riskUnknown = true; state.terminal = "UNKNOWN"; continue;
                }
                if (damaging && target.team === "unknown") {
                    state.unknown = true; state.riskUnknown = true; state.terminal = "UNKNOWN"; continue;
                }
                var hit = damaging;
                if (damaging) {
                    if (target.id === snapshot.selfId && SUITS.includes(use.suit) && state.memory[use.suit] >= 2) {
                        state.memory[use.suit] = 0; hit = false;
                    } else if (!(option.directHit || fact.directHit) && target.response > 0 && target.hand > 0) {
                        target.response--; target.hand--; state.c += target.team === "enemy" ? 0.8 : -0.8;
                        if (target.id === snapshot.selfId) {
                            var responseSuit = state.ownResponseSuits.shift();
                            if (SUITS.includes(responseSuit)) state.memory[responseSuit]++;
                        }
                        hit = false;
                    }
                }
                if (hit) {
                    var amount = Math.max(1, use.damage || 1) + (fact.fireDamageBonus || 0);
                    if (fact.damageCap) amount = Math.min(amount, fact.damageCap);
                    var blocked = Math.min(target.armor, amount);
                    target.armor -= blocked; amount -= blocked;
                    state.h += (target.team === "enemy" ? 2 : target.team === "ally" ? -3.5 : 0) * blocked;
                    if (target.team === "ally") state.armorAllyLoss += blocked;
                    var lost = Math.min(Math.max(0, target.hp), amount);
                    target.hp -= amount;
                    var enemyMayRecover = target.team === "enemy" && target.hp <= 0 && target.rescueUnknown;
                    if (!enemyMayRecover) state.h += (target.team === "enemy" ? 2 : target.team === "ally" ? -3.5 : 0) * lost;
                    if (target.team === "ally") state.damageAlly += lost;
                    if (target.hp <= 0) {
                        if (target.rescueUnknown) {
                            state.unknown = true;
                            if (target.team === "enemy") {
                                state.winUnknown = true;
                                target.hp = 1; target.effectUnknown = true;
                            } else {
                                state.riskUnknown = true;
                                state.terminal = "UNKNOWN";
                            }
                        } else {
                            target.dead = true;
                            if (target.team === "enemy") { state.h += 4.5; state.deadEnemy.push(target.id); }
                            if (target.team === "ally") { state.h -= 6; state.deadAlly.push(target.id); }
                            wyV3Terminal(state, snapshot);
                        }
                    }
                    if (lost > 0 && fact.chainUnknown && (snapshot.players || []).some(function (other) {
                        return other.id !== target.id && other.linked && !state.people[other.id].dead && other.team !== "enemy";
                    })) {
                        state.unknown = true; state.riskUnknown = true;
                        if (state.terminal !== "LOSS") state.terminal = "UNKNOWN";
                    }
                } else if (use.name === "tao" || use.name === "taoyuan") {
                    if (target.hp < target.maxHp) {
                        target.hp++;
                        state.h += target.team === "enemy" ? -2 : target.team === "ally" ? 2 : 0;
                    }
                } else if (use.name === "wuzhong") {
                    var draw = fact.drawCount || 2;
                    target.hand += draw;
                    state.c += (target.team === "enemy" ? -0.8 : target.team === "ally" ? 0.8 : 0) * draw;
                    if (target.id === snapshot.selfId) state.unknownOwnCards += draw;
                } else if (["guohe", "shunshou"].includes(use.name)) {
                    wyV3MoveCard(state, owner, target, fact, use, world);
                }
                if (state.terminal !== "NONE") break;
                // useCardToEnd is reached after a responded slash too.
                if (option.gain && target.id !== snapshot.selfId && !target.dead && target.hand > 0) {
                    var stolenIndex = state.stealCounts[target.id] || 0;
                    state.stealCounts[target.id] = stolenIndex + 1;
                    var latent = world.steal && world.steal[target.id];
                    var roll = latent ? latent[Math.min(stolenIndex, latent.length - 1)] : 0.5;
                    if (roll < target.response / target.hand) target.response--;
                    target.hand--; owner.hand++;
                    target.response = Math.min(target.response, target.hand);
                    state.c += target.team === "enemy" ? 1.6 : target.team === "ally" ? -1.4 : 0;
                    state.unknownOwnCards++;
                }
            }
        }
        if (state.terminal === "NONE") state.utility = wyV3Utility(state, snapshot, use);
        else state.utility = wyV3Utility(state, snapshot, use);
        return state;
    }
    function wyV3Context(snapshot, use) {
        var latent = wyV3Worlds(snapshot, use);
        return { snapshot: snapshot, use: use, latent: latent, latents: { [latent.key]: latent },
            budget: { count: 0, exceeded: false }, cache: {} };
    }
    function wyV3Arm(context, paid, option, direction, latent) {
        var sequence = wyV4Enabled(context.snapshot, context.use);
        var selfTarget = option.extraTarget === context.snapshot.selfId || (context.use.targets || []).some(function (target) {
            return target.id === context.snapshot.selfId || context.use.name === "jiedao" && target.victimId === context.snapshot.selfId;
        }) || option.extraVictim === context.snapshot.selfId;
        var paymentIndependent = sequence && (!selfTarget || !["sha", "nanman", "wanjian", "jiedao"].includes(context.use.name));
        var simulatedPaid = paymentIndependent ? [] : paid;
        var key = (sequence ? "sequence" : latent.key) + "/" + simulatedPaid.join(",") + "/" + wyV3OptionKey(option) + "/" + direction;
        if (!context.cache[key]) {
            var localBudget = { count: 0, exceeded: false, limit: context.snapshot.simulationLimit || 2048 };
            var states = latent.worlds.map(function (world) {
                return wyV3Run(context.snapshot, context.use, option, simulatedPaid, world, localBudget, direction);
            });
            context.budget.count += localBudget.count;
            states.valid = !localBudget.exceeded;
            context.cache[key] = states;
        }
        if (!paymentIndependent || !paid.length) return context.cache[key];
        var adjusted = context.cache[key].map(function (state) {
            var copy = Object.assign({}, state, { memory: wyV3CopyMemory(state.memory) });
            paid.forEach(function (suit) { copy.memory[suit]--; });
            if (!["WIN", "LOSS"].includes(copy.terminal)) {
                copy.endPotential = wyV3RecastValue(copy, context.snapshot, Object.assign({}, context.use, { recastKnown: 0 }));
                copy.utility += copy.endPotential - state.endPotential;
            }
            return copy;
        });
        adjusted.valid = context.cache[key].valid;
        return adjusted;
    }
    function wyV3Compare(context, rootPaid, rootOption, paid, option, direction, againstStop) {
        var key = wyV3OptionKey(option);
        var latent = context.latents[key] || (context.latents[key] = wyV4Enabled(context.snapshot, context.use) ?
            Object.assign({}, context.latent, { key: key }) : wyV3Worlds(context.snapshot, context.use, option));
        var root = againstStop ? null : wyV3Arm(context, rootPaid, rootOption, direction, latent);
        var candidate = wyV3Arm(context, paid, option, direction, latent);
        var stopPotential = wyV3MemoryValue(context.snapshot.memory);
        if (againstStop && wyV4Enabled(context.snapshot, context.use)) {
            var stop = wyV3State(context.snapshot, { response: {} }, []);
            stop.people[context.snapshot.selfId].inventory = (context.snapshot.ownHand || []).map(wyV4Token);
            stopPotential = wyV4MemoryValue(context.snapshot.memory, stop, context.snapshot, {});
        }
        var paths = latent.worlds.map(function (world, i) {
            var baseline = root ? root[i] : { utility: stopPotential,
                endPotential: stopPotential, h: 0, c: 0,
                terminal: "NONE", deadAlly: [], deadEnemy: [], damageAlly: 0, armorAllyLoss: 0,
                unknown: false, people: {} };
            return { p: world.p, root: baseline, candidate: candidate[i], randomChoiceKey: world.randomChoiceKey || "" };
        });
        if (latent.moveAdversarial) {
            // Supported strip/steal choices only transfer cards or heal from
            // losing Silver Lion. If another effect changes combat risk, the
            // card-choice lower bound cannot stand in for the risk gates.
            var outsideMoveDomain = paths.some(function (path) {
                return [path.root, path.candidate].some(function (state) {
                    return state.terminal !== "NONE" || state.unknown || state.riskUnknown || state.winUnknown ||
                        state.h !== 0 || state.damageAlly !== 0 || state.armorAllyLoss !== 0 ||
                        state.deadAlly.length || state.deadEnemy.length;
                });
            });
            if (outsideMoveDomain) latent.unknownMass = 1;
            var groups = {};
            paths.forEach(function (path) {
                var group = groups[path.randomChoiceKey] || (groups[path.randomChoiceKey] = { p: 0, worst: null });
                group.p += path.p;
                var delta = (path.candidate.utility || 0) - (path.root.utility || 0);
                if (!group.worst || delta < group.worstDelta) { group.worst = path; group.worstDelta = delta; }
            });
            paths = Object.keys(groups).map(function (key) {
                return { p: groups[key].p, root: groups[key].worst.root, candidate: groups[key].worst.candidate };
            });
        }
        return { paths: paths, unknownMass: latent.unknownMass,
            budget: { count: context.budget.count, exceeded: !candidate.valid || !!root && !root.valid } };
    }
    function wyV3Summarize(compared, requirePositive) {
        var score = 0, h = 0, costFuture = 0, newLoss = compared.unknownMass, win = 0, allyDeath = 0, qualified = 0;
        var friendLosses = [], unknown = compared.unknownMass, winUnknown = compared.unknownMass, modelGap = false;
        compared.paths.forEach(function (path) {
            var a = path.root, b = path.candidate, p = path.p;
            modelGap = modelGap || !!b.modelGap;
            if (b.unknown || b.terminal === "UNKNOWN") unknown += p;
            if (b.winUnknown) winUnknown += p;
            if (b.terminal === "LOSS" && a.terminal !== "LOSS" ||
                (b.riskUnknown || b.terminal === "UNKNOWN") && !a.riskUnknown && a.terminal !== "UNKNOWN" && a.terminal !== "LOSS") newLoss += p;
            if (b.terminal === "WIN") win += p;
            score += p * ((b.utility || 0) - (a.utility || 0));
            h += p * (b.h - a.h);
            costFuture += p * ((a.endPotential || 0) - (b.endPotential || 0));
            var newFriends = b.deadAlly.filter(function (id) { return !a.deadAlly.includes(id); });
            var newEnemies = b.deadEnemy.filter(function (id) { return !a.deadEnemy.includes(id); });
            if (newFriends.length && b.terminal !== "WIN") {
                allyDeath += p;
                if (!b.unknown && newEnemies.length >= 2 * newFriends.length) qualified += p;
            }
            var damage = Math.max(0, b.damageAlly - a.damageAlly);
            var armorLoss = Math.max(0, (b.armorAllyLoss || 0) - (a.armorAllyLoss || 0));
            var loss = b.terminal === "WIN" ? 0 : 2.6 * (damage + armorLoss) + 6 * newFriends.length;
            if (loss > 0) friendLosses.push({ p: p, loss: loss });
        });
        friendLosses.sort(function (a, b) { return b.loss - a.loss; });
        var remaining = 0.10, tail = 0;
        friendLosses.forEach(function (item) { var take = Math.min(remaining, item.p); tail += take * item.loss; remaining -= take; });
        tail = 0.10 * tail / 0.10;
        var reliableWin = win >= 0.90 - 1e-9 && newLoss <= 0.10 + 1e-9 && winUnknown <= 0.02 + 1e-9 && !modelGap;
        var reason = "GLOBAL_GAIN_POSITIVE";
        if (compared.budget.exceeded) reason = "BUDGET_FALLBACK";
        else if (newLoss > 0.02 + 1e-9 && !reliableWin) reason = "EARLY_TERMINAL_LOSS";
        else if (allyDeath > 0.05 && qualified + 1e-9 < 0.8 * (allyDeath + unknown) && !reliableWin) reason = "ALLY_DEATH_BAD_TRADE";
        else if (requirePositive && score - tail <= 1e-9) reason = "NO_POSITIVE_DELTA";
        else if (reliableWin) reason = "TERMINAL_WIN";
        return { ok: !["BUDGET_FALLBACK", "EARLY_TERMINAL_LOSS", "ALLY_DEATH_BAD_TRADE", "ALLY_DAMAGE_EXCHANGE", "NO_POSITIVE_DELTA"].includes(reason),
            reason: reason, score: score - tail, rawDelta: score, h: h, costFuture: costFuture,
            assessment: compared.budget.exceeded ? "technical_failure" : unknown > 0 || modelGap ? "model_gap" : "estimated_value",
            tail: tail, winLower: win,
            lossUpper: Math.min(1, newLoss), allyDeathQualified: allyDeath ? qualified / (allyDeath + unknown) : 1,
            unknownMass: unknown, budget: compared.budget.count, paths: compared.paths };
    }
    function wyV3Options(use, matched, fixed) {
        fixed = fixed || {};
        var extras = Object.prototype.hasOwnProperty.call(fixed, "extraTarget") ? [fixed.extraTarget] :
            [null].concat(matched >= 1 ? (use.extraTargets || []).filter(function (t) {
                return !t.moveUnknown && (t.team !== "unknown" || !!t.attitude);
            })
                .map(function (t) { return t.id; }) : []);
        function bools(key, level) { return Object.prototype.hasOwnProperty.call(fixed, key) ? [fixed[key]] : matched >= level ? [false, true] : [false]; }
        var result = [];
        extras.forEach(function (extraTarget) { bools("gain", 2).forEach(function (gain) {
            bools("directHit", 3).forEach(function (directHit) { bools("repeat", 4).forEach(function (repeat) {
                if (directHit && use.name === "tao") return;
                if (directHit && !wyV4Enabled({ sequenceModel: use.sequenceModel }, use) && !["sha", "nanman", "wanjian"].includes(use.name)) return;
                var target = (use.extraTargets || []).find(function (fact) { return fact.id === extraTarget; });
                var victims = use.name === "jiedao" && target ? target.victims || [target.victimId] : [null];
                if (fixed.extraVictim) victims = [fixed.extraVictim];
                victims.forEach(function (victim) {
                    var option = { extraTarget: extraTarget, gain: gain, directHit: directHit, repeat: repeat };
                    if (victim) option.extraVictim = victim;
                    result.push(option);
                });
            }); });
        }); });
        return result;
    }
    function wyV3Evaluate(context, rootPaid, paid, option, againstStop) {
        var cache = context.judgments || (context.judgments = {});
        var key = rootPaid.join(",") + "/" + paid.join(",") + "/" + wyV3OptionKey(option) + "/" + +againstStop;
        if (cache[key]) return Object.assign({}, cache[key]);
        var directions = context.use.direction ? [context.use.direction] : context.use.bidirectional ? ["forward", "reverse"] : ["forward"];
        var results = directions.map(function (direction) {
            return wyV3Summarize(wyV3Compare(context, rootPaid, wyV3Blank(), paid, option, direction, againstStop), true);
        });
        results.sort(function (a, b) { return +a.ok - +b.ok || a.score - b.score; });
        var result = results[0];
        if (directions.length > 1) {
            result.directionUncertain = true;
            if (!result.ok && results.some(function (candidate) { return candidate.ok; })) result.reason = "ORDER_UNCERTAIN";
        }
        cache[key] = result;
        return Object.assign({}, result);
    }
    function wyV3Suffix(context, paid, matched, fixed) {
        var best = null, options = wyV3Options(context.use, matched, fixed);
        options.forEach(function (option) {
            var result = wyV3Evaluate(context, paid, paid, option, false);
            result.option = option;
            if (!best || result.ok && !best.ok || result.ok === best.ok &&
                (result.lossUpper < best.lossUpper - 1e-9 || Math.abs(result.lossUpper - best.lossUpper) < 1e-9 && result.score > best.score + 1e-9)) best = result;
        });
        if (best && !best.ok) best.option = Object.assign(wyV3Blank(), fixed || {});
        return best || Object.assign({ option: wyV3Blank() }, wyV3Evaluate(context, paid, paid, wyV3Blank(), false));
    }
    function wyV3Aggregate(context, paid, policies, againstStop) {
        var paths = [], unknownMass = 0, invalid = false, probs = WY_PROB[paid.length] || [];
        probs.forEach(function (prob, matched) {
            if (!prob) return;
            var option = policies[matched] ? policies[matched].option : wyV3Blank();
            var directions = context.use.direction ? [context.use.direction] : context.use.bidirectional ? ["forward", "reverse"] : ["forward"];
            var candidates = directions.map(function (direction) {
                var comparison = wyV3Compare(context, [], wyV3Blank(), paid, option, direction, againstStop);
                if (comparison.budget.exceeded) invalid = true;
                return wyV3Summarize(comparison, true);
            });
            candidates.sort(function (a, b) { return +a.ok - +b.ok || a.score - b.score; });
            paths.push.apply(paths, candidates[0].paths.map(function (path) { return { p: path.p * prob, root: path.root, candidate: path.candidate }; }));
            unknownMass += (context.latents[wyV3OptionKey(option)] || context.latent).unknownMass * prob;
        });
        return wyV3Summarize({ paths: paths, unknownMass: unknownMass,
            budget: { count: context.budget.count, exceeded: invalid } }, true);
    }
    function wyV3Payment(snapshot, use, context) {
        var result = wyAction("DECLINE", "NO_POSITIVE_DELTA"), memory = snapshot.memory || {};
        if (["jiu", "shan", "wuxie"].includes(use.name)) { result.reason = "NOT_APPLICABLE"; return result; }
        if (!WY_V3_NAMES.includes(use.name) || !["basic", "trick"].includes(use.type)) {
            result.reason = "MODEL_UNKNOWN"; return result;
        }
        if ((use.targets || []).some(function (target) { return target.moveUnknown ||
            ["guohe", "shunshou"].includes(use.name) && target.team === "unknown" && !target.attitude; })) {
            result.reason = "MODEL_UNKNOWN"; return result;
        }
        context = context || wyV3Context(snapshot, use);
        var rejected = [];
        var masks = Array.from({ length: 15 }, function (_, i) { return i + 1; });
        masks.sort(function (a, b) {
            return SUITS.filter(function (_, i) { return b & (1 << i); }).length -
                SUITS.filter(function (_, i) { return a & (1 << i); }).length || a - b;
        });
        for (var mask of masks) {
            var paid = SUITS.filter(function (suit, i) { return mask & (1 << i); });
            if (paid.some(function (suit) { return !memory[suit]; })) continue;
            var policies = [];
            (WY_PROB[paid.length] || []).forEach(function (prob, matched) {
                if (prob) policies[matched] = wyV3Suffix(context, paid, matched, {});
            });
            var judged = wyV3Aggregate(context, paid, policies, false);
            if (judged.assessment === "model_gap") { judged.ok = false; judged.reason = "MODEL_GAP"; }
            rejected.push({ suits: paid, reason: judged.reason, score: judged.score });
            if (!judged.ok) continue;
            var remaining = Object.assign(wyV3CopyMemory(memory), paid.reduce(function (obj, suit) { obj[suit] = memory[suit] - 1; return obj; }, {}));
            var instantCost = wyV3MemoryValue(memory) - wyV3MemoryValue(remaining);
            if (wyV4Enabled(snapshot, use)) {
                var current = wyV3State(snapshot, { response: {} }, []);
                current.people[snapshot.selfId].inventory = (snapshot.ownHand || []).filter(function (card) { return card.id !== use.materialId; }).map(wyV4Token);
                instantCost = wyV4MemoryValue(memory, current, snapshot, {}) - wyV4MemoryValue(remaining, current, snapshot, {});
            }
            var cost = judged.costFuture;
            if (judged.score > result.score + 1e-9 || Math.abs(judged.score - result.score) < 1e-9 &&
                (cost < (result.cost === undefined ? Infinity : result.cost) || cost === result.cost && paid.length < result.spendSuits.length)) {
                result = Object.assign(wyAction("SPEND", memory[paid[0]] >= 3 ? "SURPLUS_POSITIVE" : judged.reason, judged.score),
                    { spendSuits: paid, cost: cost, instantCost: instantCost, rawDelta: judged.rawDelta, h: judged.h, tail: judged.tail,
                        winLower: judged.winLower, lossUpper: judged.lossUpper, budget: judged.budget, policies: policies });
            }
        }
        result.rejected = rejected.slice(0, 15);
        result.context = context;
        return result;
    }
    function wyV3PlanOutcome(snapshot, use, matched, fixed, paid, context) {
        if (["jiu", "shan", "wuxie"].includes(use.name)) return wyAction("DECLINE", "NOT_APPLICABLE");
        context = context || wyV3Context(snapshot, use);
        var judged = wyV3Suffix(context, paid || [], matched, fixed || {}), option = judged.option;
        return Object.assign(wyAction(judged.ok ? "UPGRADE" : "DECLINE", judged.reason, judged.score), option,
            { h: judged.h, tail: judged.tail, winLower: judged.winLower, lossUpper: judged.lossUpper,
                budget: judged.budget, unknownMass: judged.unknownMass });
    }
    function wyV3PlanUse(snapshot) {
        var plans = {}, winnerBySuit = {}, fallbacks = {};
        Object.defineProperty(plans, "fallbacks", { value: fallbacks });
        (snapshot.ownHand || []).forEach(function (card) {
            var best = wyAction("HOLD", card.legal ? "NO_POSITIVE_DELTA" : "ILLEGAL_USE");
            if (!WY_V3_NAMES.includes(card.name)) { plans[card.id] = null; return; }
            if (!card.legal) { plans[card.id] = best; return; }
            var modeled = 0, unsupported = false;
            (card.candidates || []).forEach(function (use) {
                if (!WY_V3_NAMES.includes(use.name) || (use.targets || []).some(function (target) {
                    return target.team === "unknown" && !target.attitude || target.moveUnknown;
                })) { unsupported = true; fallbacks[card.id] = "MODEL_GAP"; return; }
                modeled++;
                var context = wyV3Context(snapshot, use), payment = wyV3Payment(snapshot, use, context);
                var base = wyV3Evaluate(context, [], [], wyV3Blank(), true);
                var policies = payment.action === "SPEND" ? payment.policies : [Object.assign({ option: wyV3Blank() }, base)];
                var judged = payment.action === "SPEND" ? wyV3Aggregate(context, payment.spendSuits, policies, true) :
                    wyV3Evaluate(context, [], [], wyV3Blank(), true);
                if (base.ok && (!judged.ok || base.score > judged.score)) judged = base;
                if (judged.reason === "BUDGET_FALLBACK" || judged.assessment === "model_gap") {
                    fallbacks[card.id] = judged.reason === "BUDGET_FALLBACK" ? "BUDGET_FALLBACK" : "MODEL_GAP";
                    unsupported = true; return;
                }
                if (!judged.ok || judged.score <= best.score + 1e-9) return;
                best = Object.assign(wyAction("USE", judged.reason, judged.score), { targetIds: use.targets.map(function (t) { return t.id; }),
                    anchor: use.targets.length ? use.targets[0].id : null, forcedTargets: !!use.forcedTargets,
                    pairByHolder: use.pairByHolder,
                    order: 10 + Math.min(30, judged.score), payment: payment,
                    base: base.score, budget: context.budget.count });
            });
            plans[card.id] = best.action === "USE" ? best : unsupported ? null : modeled ? best :
                null;
            if (best.action === "USE" && SUITS.includes(card.suit)) {
                var previous = winnerBySuit[card.suit];
                if (!previous || best.score > plans[previous].score) winnerBySuit[card.suit] = card.id;
            }
        });
        Object.keys(winnerBySuit).forEach(function (suit) {
            (snapshot.ownHand || []).filter(function (card) { return card.suit === suit && card.id !== winnerBySuit[suit]; }).forEach(function (card) {
                if (plans[card.id] && plans[card.id].action === "USE") plans[card.id] = wyAction("HOLD", "DOMINATED_SUIT_ACTION");
            });
        });
        return plans;
    }
    function wyV3Signature(player, event) {
        var hand = player.getCards("h"), publicPlayers = game.filterPlayer(function () { return true; });
        return JSON.stringify({
            hand: hand.map(function (card, i) { return [card.cardid || i, get.name ? get.name(card, player) : card.name,
                get.suit(card, player), get.color && get.color(card, player), game.hasNature && game.hasNature(card)]; }),
            memory: player.storage[MEMORY], exclude: (event._aiexclude || []).map(function (card) { return hand.indexOf(card); }),
            single: !!(get.is && get.is.single && get.is.single()),
            public: publicPlayers.map(function (target) {
                var equip = target.getEquip && target.getEquip("equip2");
                var weapon = target.getEquip && target.getEquip("equip1");
                var visible = target.getCards ? ["e", "j"].flatMap(function (zone) {
                    return target.getCards(zone).map(function (card, index) {
                        return [zone, card.cardid || index, card.viewAs || (get.name ? get.name(card, target) : card.name),
                            get.suit(card, player)];
                    });
                }) : [];
                return [target.playerid, target.hp, target.maxHp, target.hujia, target.countCards && target.countCards("h"),
                    visible,
                    typeof get.mode === "function" && get.mode() === "versus" ? target.side : null,
                    target.isZhu ? "zhu" : target.identityShown ? target.identity : null,
                    equip && [equip.cardid, equip.name], weapon && [weapon.cardid, weapon.name],
                    target.hasSkillTag && target.hasSkillTag("unequip2", null),
                    target.hasSkill && [target.hasSkill("renwang_skill", null), target.hasSkill("tengjia1", null),
                        target.hasSkill("tengjia2", null), target.hasSkill("tengjia3", null), target.hasSkill("baiyin_skill", null),
                        target.hasSkill("qinggang_skill", null)],
                    target.isLinked && target.isLinked(), wyPublicResponses(target),
                    target !== player && target.getHistory ? target.getHistory("useCard").slice(-4).map(function (use) { return [use.card && use.card.name, use.card && use.card.nature, (use.targets || []).map(function (recipient) { return recipient.playerid; })]; }) : [],
                    typeof get.mode === "function" && get.mode() === "identity" && !target.identityShown ? wyPublicAttitude(player, target) : 0];
            }),
            cancelled: hand.filter(function (card) { return ["sha", "nanman", "wanjian"].includes(get.name ? get.name(card, player) : card.name); }).map(function (card) {
                return publicPlayers.map(function (target) { return wyArmorCancels(player, target, card); });
            })
        });
    }
    function wyV3Ai1(card) {
        var event = get.event(), api = window.nihilModules.wuyou.skill.nihil_menglong.wuyouAI;
        var decision = api.preparedCard(event.player, card);
        if (!decision) return (event._nihilWuyouOriginalAi1 || get.cacheOrder)(card);
        return decision.action === "USE" ? decision.order : -1;
    }
    function wyV3Ai2(target) {
        var event = get.event(), api = window.nihilModules.wuyou.skill.nihil_menglong.wuyouAI;
        var decision = api.preparedCard(event.player, get.card());
        if (!decision || !target) return (event._nihilWuyouOriginalAi2 || get.cacheEffectUse)(target);
        if (decision.action !== "USE") return -1;
        if (decision.pairByHolder && Object.keys(decision.pairByHolder).length && ui.selected.targets.length) {
            var holder = ui.selected.targets[0];
            return decision.pairByHolder[holder.playerid] === target.playerid ? 1 : -1;
        }
        if (decision.forcedTargets) return target.playerid === decision.anchor ? 1 : 0;
        return decision.targetIds.includes(target.playerid) ? 1 : -1;
    }
    function wyV3Audit(phase, player, use, decision, details) {
        var audit = game._nihilWuyouAudit;
        if (!Array.isArray(audit)) audit = game._nihilWuyouAudit = [];
        var seq = game._nihilWuyouAuditSeq = (game._nihilWuyouAuditSeq || 0) + 1;
        var memory = player.storage[MEMORY] || {};
        audit.push(Object.assign({ seq: seq, phase: phase, card: use && use.card && use.card.name,
            targets: use && use.targets ? use.targets.map(function (target) { return target.playerid; }) : [],
            reason: decision && decision.reason, action: decision && decision.action,
            paidSuits: decision && decision.spendSuits ? decision.spendSuits.slice() : [],
            expectedDelta: decision && decision.rawDelta, score: decision && decision.score,
            cost: decision && decision.cost, instantCost: decision && decision.instantCost,
            memory: wyV3CopyMemory(memory),
            winLower: decision && decision.winLower, lossUpper: decision && decision.lossUpper,
            budget: decision && decision.budget }, details || {}));
        if (audit.length > 256) audit.splice(0, audit.length - 256);
    }

    var skills = {
        nihil_menglong: {
            wuyouAI: { buildSnapshot: wyBuildSnapshot, planKeep: wyPlanKeep, planUse: wyV3PlanUse, decideHuanghu: wyDecideHuanghu,
                planOutcome: wyV3PlanOutcome, planZhuihuan: wyV3Payment, useSnapshot: wyUseSnapshot,
                preparedCard: wyPreparedCard, incoming: wyIncoming, probabilities: WY_PROB,
                memoryValue: wyV3MemoryValue, context: wyV3Context, summarize: wyV3Summarize,
                compare: wyV3Compare, run: wyV3Run, worlds: wyV3Worlds, ai1: wyV3Ai1, ai2: wyV3Ai2,
                fireDiscardPlan: wyV4FireDiscardPlan,
                capturePairs: wyCapturePairs, syncPairs: wySyncPairs, installPairSort: wyInstallPairSort },
            onChooseToUse: function (event) {
                if (event.type !== "phase" || !event.player) return;
                if (event.ai1 !== wyV3Ai1) { event._nihilWuyouOriginalAi1 = event.ai1; event.ai1 = wyV3Ai1; }
                if (event.ai2 !== wyV3Ai2) { event._nihilWuyouOriginalAi2 = event.ai2; event.ai2 = wyV3Ai2; }
                wyRefreshUsePlan(event.player, event);
            },
            mod: {
                aiOrder: function (player, card, num) {
                    var event = wyPhaseEvent(player);
                    if (event) wyRefreshUsePlan(player, event);
                    var decision = wyPreparedCard(player, card); if (decision) return decision.order || 0;
                },
                aiUseful: function (player, card) {
                    var event = get.event(), parent = event && event.getParent && event.getParent();
                    if (!event || event.name !== "chooseToDiscard" || event.player !== player || !parent || parent.name !== "phaseDiscard" || parent.player !== player) return;
                    var snapshot = wyBuildSnapshot(player), index = player.getCards("h").indexOf(card);
                    return wyPlanKeep(snapshot).scores[String(card.cardid || "hand_" + index)];
                },
            },
            ai: { effect: { player_use: function (card, player, target) {
                var decision = wyPreparedCard(player, card);
                if (decision && decision.action === "HOLD") return "zeroplayertarget";
            } } },
            locked: true,
            forced: true,
            trigger: { player: "useCardAfter" },
            group: ["nihil_menglong_prepare", "nihil_menglong_record", "nihil_menglong_fireDiscard", "nihil_liulian"],
            init: function (player) {
                memories(player);
                refreshMemories(player);
            },
            onremove: function (player) {
                SUITS.forEach(function (suit) { player.unmarkSkill(MEMORY + "_" + suit); });
                delete player.storage[MEMORY];
                game.broadcast(function (owner, key) {
                    delete owner.storage[key];
                }, player, MEMORY);
            },
            filter: function (event, player) {
                return event._nihilMenglong && event._nihilMenglong.owner === player.playerid;
            },
            async content(event, trigger, player) {
                var suit = trigger._nihilMenglong.suit;
                var cards = player.getCards("h", function (card) {
                    return get.suit(card, player) === suit &&
                        lib.filter.cardRecastable(card, player);
                });
                if (!cards.length) return;
                await player.recast(cards);
            },
            subSkill: {
                fireDiscard: {
                    charlotte: true, forced: true, popup: false,
                    trigger: { player: "chooseToDiscardBegin" },
                    filter: function (event, player) {
                        var effect = event.getParent();
                        return effect && effect.name === "huogong" && effect.player === player && effect.target && effect.cards2 && effect.cards2.length > 0;
                    },
                    async content(event, trigger, player) {
                        var effect = trigger.getParent(), nativeUse = effect.getParent("useCard"), snapshot = wyBuildSnapshot(player);
                        var hand = player.getCards("h"), filter = typeof trigger.filterCard === "function" ? trigger.filterCard : get.filter(trigger.filterCard);
                        snapshot.ownHand.forEach(function (card, index) {
                            card.discardLegal = card.discardLegal && filter.call(trigger, hand[index], player) &&
                                (!lib.filter.cardDiscardable || lib.filter.cardDiscardable(hand[index], player, trigger));
                        });
                        var use = wyUseSnapshot(player, nativeUse);
                        use.targets = [wyPublicTarget(player, effect.target, effect.card || nativeUse.card, nativeUse)];
                        var shown = effect.cards2.map(function (card, index) {
                            return { id: String(card.cardid || "shown_" + index), name: get.name ? get.name(card, effect.target) : card.name,
                                suit: get.suit(card), value: 0.8 };
                        });
                        use.targets[0].knownHand = shown;
                        snapshot.players = snapshot.players.map(function (person) { return person.id === effect.target.playerid ? use.targets[0] : person; });
                        use.extraTargets = []; use.materialCost = 0; use.materialId = null;
                        var scores = wyV4FireDiscardPlan(snapshot, use, get.suit(effect.cards2[0]));
                        if (!scores) return;
                        trigger.set("nihilWuyouFireScores", scores).set("ai", wyFireDiscardAI);
                        wyV3Audit("fireDiscard", player, nativeUse, null, { scores: scores, shownSuit: get.suit(effect.cards2[0]) });
                    },
                },
                prepare: {
                    charlotte: true,
                    silent: true,
                    forced: true,
                    popup: false,
                    trigger: { player: "useCardBefore" },
                    filter: function (event, player) {
                        var phase = event.getParent("phaseUse");
                        return phase && phase.player === player && event.cards && event.cards.length === 1 &&
                            player.getCards("h").includes(event.cards[0]);
                    },
                    async content(event, trigger, player) {
                        // This native window precedes material loss, including
                        // equipment use: preserve actual hand ownership early.
                        trigger._nihilMenglongHand = { owner: player.playerid, material: trigger.cards[0] };
                    },
                },
                record: {
                    charlotte: true,
                    silent: true,
                    forced: true,
                    popup: false,
                    trigger: { player: "useCard1" },
                    filter: function (event, player) {
                        var phase = event.getParent("phaseUse");
                        var early = event._nihilMenglongHand;
                        var recorded = early && early.owner === player.playerid && event.cards &&
                            event.cards.length === 1 && early.material === event.cards[0];
                        return phase && phase.player === player && (recorded || singleHandMaterial(event, player));
                    },
                    async content(event, trigger, player) {
                        // Capture suit/material evidence before the card settles.
                        trigger._nihilMenglong = { owner: player.playerid, suit: get.suit(trigger.card, player) };
                    },
                },
            },
        },
        nihil_liulian: {
            locked: true,
            forced: true,
            charlotte: true,
            popup: false,
            silent: true,
            intro: {
                name: "忆",
                content: function (storage) {
                    return SUITS.map(function (suit) {
                        return SUIT_NAMES[suit] + "：" + (storage && storage[suit] || 0);
                    }).join("<br>");
                },
                markcount: function (storage) {
                    return SUITS.reduce(function (sum, suit) { return sum + (storage && storage[suit] || 0); }, 0);
                },
            },
            trigger: { player: "loseAfter" },
            filter: function (event, player) {
                return !usedMaterialLoss(event) && heldLossCards(event).some(function (card) {
                    return SUITS.includes(get.suit(card, player));
                });
            },
            async content(event, trigger, player) {
                var counts = memories(player);
                heldLossCards(trigger).forEach(function (card) {
                    var suit = get.suit(card, player);
                    if (SUITS.includes(suit)) counts[suit] = (counts[suit] || 0) + 1;
                });
                refreshMemories(player);
            },
        },
        nihil_huanghu: {
            direct: true,
            trigger: { target: "useCardToTargeted" },
            filter: function (event, player) {
                var suit = get.suit(event.card);
                var use = event.getParent();
                return get.tag(event.card, "damage") && SUITS.includes(suit) &&
                    memories(player)[suit] > 0 && !use.excluded.includes(player);
            },
            async content(event, trigger, player) {
                var suit = get.suit(trigger.card);
                var counts = memories(player);
                var amount = counts[suit];
                var snapshot = wyBuildSnapshot(player);
                var defense = wyDecideHuanghu(snapshot, wyIncoming(player, trigger, snapshot));
                event._nihilWuyouDecision = defense;
                if (!(await player.chooseBool("恍惚：是否移除全部" + amount + "个" + SUIT_NAMES[suit] + "忆？")
                    .set("nihilWuyouDecision", defense.action === "CANCEL").set("ai", wyBoolAI).forResult()).bool) return;
                counts[suit] = 0;
                refreshMemories(player);
                player.logSkill("nihil_huanghu");
                game.log(player, "移除了", "#y" + amount, "个" + SUIT_NAMES[suit] + "忆");
                if (amount >= 2) trigger.getParent().excluded.add(player);
            },
        },
        nihil_zhuihuan: {
            direct: true,
            trigger: { player: "useCard2" },
            group: ["nihil_zhuihuan_gain", "nihil_zhuihuan_pairs"],
            filter: function (event, player) {
                return ["basic", "trick"].includes(get.type(event.card)) && memoryTotal(player) > 0;
            },
            async content(event, trigger, player) {
                var counts = memories(player);
                var choices = [];
                SUITS.forEach(function (suit) {
                    if (counts[suit] > 0) choices.push([suit + ":1", SUIT_NAMES[suit] + "忆"]);
                });
                var responseOnly = ["jiu", "shan", "wuxie"].includes(get.name ? get.name(trigger.card, player) : trigger.card.name);
                var payment = responseOnly ? wyAction("DECLINE", "NOT_APPLICABLE") :
                    wyV3Payment(wyBuildSnapshot(player), wyUseSnapshot(player, trigger));
                event._nihilWuyouPayment = payment;
                var memoryBefore = wyV3CopyMemory(counts);
                var humanChoice = player.isOnline && player.isOnline() ||
                    player.isUnderControl && player.isUnderControl(true) && !_status.auto;
                if (payment.reason === "NOT_APPLICABLE" && !humanChoice) {
                    wyV3Audit("payment", player, trigger, payment, { actual: "SKIP", memoryBefore: memoryBefore });
                    return;
                }
                var paid = await player.chooseButton(
                    ["追还：选择移除1至4种不同花色的忆（每种一个）", [choices, "textbutton"]],
                    [1, Math.min(4, choices.length)]
                ).set("nihilWuyouSpend", payment.spendSuits).set("ai", wyPaymentAI).forResult();
                if (!paid.bool || !paid.links || !paid.links.length) {
                    wyV3Audit("payment", player, trigger, payment, { actual: "DECLINE", memoryBefore: memoryBefore,
                        rejected: payment.rejected || [] });
                    return;
                }
                var spent = { spade: 0, heart: 0, club: 0, diamond: 0 };
                var uniqueLinks = [];
                var choiceIds = choices.map(function (choice) { return choice[0]; });
                for (var link of paid.links) {
                    if (!choiceIds.includes(link) || uniqueLinks.includes(link) || spent[link.split(":")[0]]) return;
                    uniqueLinks.push(link);
                    spent[link.split(":")[0]]++;
                }
                if (uniqueLinks.length > 4 || SUITS.some(function (suit) { return spent[suit] > (counts[suit] || 0); })) return;
                SUITS.forEach(function (suit) { counts[suit] -= spent[suit]; });
                refreshMemories(player);
                var paidSuits = SUITS.filter(function (suit) { return spent[suit] > 0; });
                player.logSkill("nihil_zhuihuan");
                game.log(player, "移除了", "#y" + uniqueLinks.length, "个忆");

                var revealed = get.cards(uniqueLinks.length);
                await game.cardsGotoOrdering(revealed);
                await player.showCards(revealed, "追还");
                game.log(player, "#g追还", "翻开的牌为", revealed);
                var matched = SUITS.filter(function (suit) {
                    return spent[suit] > 0 && revealed.some(function (card) { return get.suit(card, false) === suit; });
                }).length;
                wyV3Audit("payment", player, trigger, payment, { actual: "SPEND", memoryBefore: memoryBefore,
                    memoryAfter: wyV3CopyMemory(counts), actualPaidSuits: paidSuits, matched: matched,
                    rejected: payment.rejected || [] });
                game.log("#g追还", "匹配了", "#y" + matched, "种花色");
                // Explicit cleanup also leaves the orderingDiscard hook harmless.
                var remaining = revealed.filter(function (card) { return get.position(card, true) === "o"; });
                if (remaining.length) await game.cardsDiscard(remaining);

                var fixed = {}, suffixSnapshot = wyBuildSnapshot(player), suffixUse = wyUseSnapshot(player, trigger);
                var decisionRoot = { snapshot: suffixSnapshot, use: suffixUse, context: wyV3Context(suffixSnapshot, suffixUse),
                    signature: wyV3Signature(player, { _aiexclude: [] }) };
                event._nihilWuyouDecisionRoot = decisionRoot;
                function suffixPlan() {
                    var changed = wyV3Signature(player, { _aiexclude: [] }) !== decisionRoot.signature;
                    if (changed) {
                        var fresh = wyBuildSnapshot(player);
                        function updateTarget(old) {
                            var current = fresh.players.find(function (target) { return target.id === old.id; });
                            return current ? Object.assign({}, current, { directHit: old.directHit, excluded: old.excluded,
                                drawCount: old.drawCount }) : old;
                        }
                        decisionRoot.use = Object.assign({}, decisionRoot.use, {
                            targets: decisionRoot.use.targets.map(updateTarget),
                            extraTargets: decisionRoot.use.extraTargets.map(updateTarget)
                        });
                        decisionRoot.snapshot = fresh;
                        decisionRoot.context = wyV3Context(fresh, decisionRoot.use);
                        decisionRoot.signature = wyV3Signature(player, { _aiexclude: [] });
                    }
                    var result = wyV3PlanOutcome(decisionRoot.snapshot, decisionRoot.use, matched, fixed, [], decisionRoot.context);
                    if (changed) result.reason = "MODEL_CHANGED";
                    return result;
                }
                if (matched >= 1) {
                    var candidates = extraTargets(trigger, player);
                    if (candidates.length) {
                        var outcome = suffixPlan();
                        var added = await player.chooseTarget("追还：是否为此牌额外指定一名目标？", function (card, player, target) {
                            return get.event().nihilWuyouTargets.includes(target);
                        }).set("nihilWuyouTargets", candidates).set("nihilWuyouExtra", outcome.extraTarget).set("ai", wyTargetAI).forResult();
                        if (added.bool && added.targets && candidates.includes(added.targets[0]) && extraTargets(trigger, player).includes(added.targets[0])) {
                            if (trigger.card.name === "jiedao") {
                                wyCapturePairs(trigger);
                                var holder = added.targets[0], info = get.info(trigger.card, false);
                                var victims = game.filterPlayer(function (victim) { return info.filterAddedTarget(trigger.card, player, victim, holder); });
                                var chosenVictim = victims.length ? await player.chooseTarget("追还：为新增持刀者选择出杀目标", true, function (card, player, target) {
                                    return get.event().nihilWuyouVictims.includes(target);
                                }).set("nihilWuyouVictims", victims).set("nihilWuyouVictim", outcome.extraVictim).set("ai", wyVictimAI).forResult() : { bool: false };
                                var victim = chosenVictim.bool && chosenVictim.targets && victims.includes(chosenVictim.targets[0]) ? chosenVictim.targets[0] : false;
                                trigger._nihilWuyouPairs[holder.playerid] = victim;
                                fixed.extraVictim = victim && victim.playerid;
                            }
                            trigger.targets.add(added.targets[0]);
                            if (trigger._nihilWuyouPairs) wySyncPairs(trigger);
                            fixed.extraTarget = added.targets[0].playerid;
                            player.line(added.targets[0], "green");
                            game.log(added.targets[0], "成为了", trigger.card, "的额外目标");
                        } else fixed.extraTarget = null;
                        wyV3Audit("suffix_target", player, trigger, outcome, { matched: matched,
                            actual: fixed.extraTarget, predicted: outcome.extraTarget, fixed: Object.assign({}, fixed) });
                    }
                }
                if (!Object.prototype.hasOwnProperty.call(fixed, "extraTarget")) fixed.extraTarget = null;
                if (matched >= 2) {
                    var gainPlan = suffixPlan();
                    fixed.gain = (await player.chooseBool("追还：是否在此牌对每名目标的每次效果结算后，自动随机获得其一张手牌？")
                        .set("nihilWuyouDecision", gainPlan.gain).set("ai", wyBoolAI).forResult()).bool;
                    if (fixed.gain) trigger._nihilZhuihuanGainOwner = player.playerid;
                    wyV3Audit("suffix_gain", player, trigger, gainPlan, { matched: matched,
                        actual: fixed.gain, predicted: gainPlan.gain, fixed: Object.assign({}, fixed) });
                }
                if (matched >= 3) {
                    var directPlan = suffixPlan();
                    fixed.directHit = (await player.chooseBool("追还：是否令此牌无法被响应？")
                        .set("nihilWuyouDecision", directPlan.directHit).set("ai", wyBoolAI).forResult()).bool;
                    if (fixed.directHit) trigger.directHit.addArray(game.players);
                    wyV3Audit("suffix_direct", player, trigger, directPlan, { matched: matched,
                        actual: fixed.directHit, predicted: directPlan.directHit, fixed: Object.assign({}, fixed) });
                }
                if (matched >= 4) {
                    var repeatPlan = suffixPlan();
                    fixed.repeat = (await player.chooseBool("追还：是否令此牌额外结算一次？")
                        .set("nihilWuyouDecision", repeatPlan.repeat).set("ai", wyBoolAI).forResult()).bool;
                    if (fixed.repeat) trigger.effectCount++;
                    wyV3Audit("suffix_repeat", player, trigger, repeatPlan, { matched: matched,
                        actual: fixed.repeat, predicted: repeatPlan.repeat, fixed: Object.assign({}, fixed) });
                }
            },
            subSkill: {
                pairs: {
                    charlotte: true, forced: true, popup: false, firstDo: true,
                    trigger: { player: "useCardToPlayer" },
                    filter: function (event) {
                        var use = event.getParent();
                        return use && use.card.name === "jiedao" && !!use._nihilWuyouPairs;
                    },
                    async content(event, trigger) { wyInstallPairSort(trigger.getParent()); }
                },
                gain: {
                    charlotte: true,
                    forced: true,
                    popup: false,
                    trigger: { player: "useCardToEnd" },
                    filter: function (event, player) {
                        var use = event.getParent();
                        return event.type === "card" && use &&
                            use._nihilZhuihuanGainOwner === player.playerid &&
                            !event._nihilZhuihuanGainDone && effectHandTargets(event).length > 0;
                    },
                    async content(event, trigger, player) {
                        // Every native effectCount pass creates a fresh card
                        // effect event; the same actual effect may pay only once.
                        if (trigger._nihilZhuihuanGainDone) return;
                        trigger._nihilZhuihuanGainDone = true;
                        for (var target of effectHandTargets(trigger)) {
                            if (!target.isIn()) continue;
                            var card = target.getCards("h").randomGet();
                            if (card) await player.gain(card, target, "giveAuto");
                        }
                    },
                },
            },
        },
    };

    SUITS.forEach(function (suit) {
        skills[MEMORY + "_" + suit] = {
            charlotte: true,
            mark: true,
            marktext: SUIT_NAMES[suit].charAt(0),
            intro: {
                name: SUIT_NAMES[suit] + "忆",
                content: function (storage, player) {
                    return SUIT_NAMES[suit] + "忆：" + (player.storage[MEMORY] && player.storage[MEMORY][suit] || 0);
                },
                markcount: function (storage, player) {
                    // Native mark rendering hides numeric zero, but shows "0".
                    return "" + (player.storage[MEMORY] && player.storage[MEMORY][suit] || 0);
                },
            },
        };
    });

    window.nihilModules.wuyou = {
        character: {
            nihil_wuyou: {
                sex: "female", group: "zhong", hp: 3, maxHp: 3,
                img: "extension/" + EXT_NAME + "/image/character/nihil_wuyou.png",
                skills: ["nihil_menglong", "nihil_huanghu", "nihil_zhuihuan"],
            },
        },
        skill: skills,
        translate: {
            nihil_wuyou: "无忧",
            nihil_menglong: "朦胧",
            nihil_menglong_info: "<b>锁定技</b>，出牌阶段，当你使用一张手牌后，重铸所有同花色手牌。每当你因使用外的方式失去一张牌，获得一个同花色的<b>“忆”</b>",
            nihil_liulian: "朦胧",
            nihil_huanghu: "恍惚",
            nihil_huanghu_info: "当你成为伤害牌的目标时，你可以移除与其同花色的所有“忆”，若数量不小于2，则取消之。",
            nihil_liulian_spade: "黑桃忆",
            nihil_liulian_heart: "红桃忆",
            nihil_liulian_club: "梅花忆",
            nihil_liulian_diamond: "方块忆",
            nihil_zhuihuan: "追还",
            nihil_zhuihuan_info: "当你使用一张基本牌或普通锦囊牌时，你可以移除1至4个花色各不相同的“忆”，翻开牌堆顶等量牌并弃置。按翻牌与移除忆共有的不同花色种数，若至少有1/2/3/4种，你可依次选择：额外指定一名合法目标；此牌对每名目标的每次效果结算后，自动随机获得其一张手牌（空手或死亡跳过）；令此牌无法被响应；令此牌额外结算一次。各项可分别取消。",
        },
        sort: ["nihil_wuyou"],
    };
})();
