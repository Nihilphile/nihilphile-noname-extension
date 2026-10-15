(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";

    function image(id, ext) {
        return "extension/" + EXT_NAME + "/image/character/" + id + "." + (ext || "png");
    }

    function semanticLog() {
        if (typeof game !== "undefined" && game && typeof game.log === "function") {
            game.log.apply(game, arguments);
        }
    }

    var XY_SHA_CARD = { name: "sha", isCard: true };
    var XY_TIER_BASE = {
        "1": 1000,
        "1.5": 850,
        "2": 700,
        "3": 500,
        "4": 300,
        "5": 100,
    };
    var XY_TIE_BASE = {
        tao: 80,
        wuzhong: 70,
        wuxie: 60,
        guohe: 55,
        shunshou: 55,
        jiu: 50,
        shan: 40,
        sha: 35,
    };

    function xyIsIn(player) {
        return !!player && (typeof player.isIn !== "function" || player.isIn());
    }

    function xyHasBlood(player) {
        return xyIsIn(player) && player.hasSkill("nihil_xuechan", null, null, false);
    }

    function xyIsYinhua(player) {
        return xyIsIn(player) && player.hasSkill("nihil_yinshang", null, null, false);
    }

    function xyAttitude(player, target) {
        if (!player || !target) return 0;
        return get.attitude(player, target);
    }

    function xyCardName(card, player) {
        if (!card) return "";
        if (typeof card.name === "string") return card.name;
        if (typeof get !== "undefined" && typeof get.name === "function") {
            return get.name(card, player);
        }
        return "";
    }

    function xyCardType(card) {
        if (!card) return "";
        if (typeof card.type === "string") return card.type;
        if (typeof get !== "undefined" && typeof get.type === "function") {
            return get.type(card);
        }
        return "";
    }

    function xyCardSubtype(card) {
        if (!card) return "";
        if (typeof card.subtype === "string") return card.subtype;
        if (typeof get !== "undefined" && typeof get.subtype === "function") {
            return get.subtype(card);
        }
        return "";
    }

    function xyPlayerId(player) {
        if (!player) return "";
        return String(player.playerid || player.playerId || player.id || player.name || "");
    }

    function xyCardId(card, index) {
        if (card) {
            var id = card.cardid || card.cardId || card.id;
            if (id !== undefined && id !== null) return String(id);
        }
        return xyCardName(card) + "@" + index;
    }

    function xyGamePlayers() {
        if (typeof game.filterPlayer === "function") {
            return game.filterPlayer(function () {
                return true;
            });
        }
        return game.players ? game.players.slice(0) : [];
    }

    function xyFindPlayerById(id) {
        if (!id) return null;
        var players = xyGamePlayers();
        for (var i = 0; i < players.length; i++) {
            if (xyPlayerId(players[i]) === String(id)) return players[i];
        }
        return null;
    }

    function xyBloodCount() {
        return game.countPlayer(function (current) {
            return xyHasBlood(current);
        });
    }

    function xyShaCount(player) {
        if (!player || typeof player.countCards !== "function") return 0;
        return player.countCards("hs", function (card) {
            return xyCardName(card, player) === "sha";
        });
    }

    function xyRemainingShaUses(player, shaCount) {
        var usable = typeof player.getCardUsable === "function" ? player.getCardUsable("sha") : shaCount;
        if (usable === Infinity) usable = shaCount;
        if (typeof usable !== "number" || isNaN(usable)) usable = 0;
        return Math.max(0, Math.min(shaCount, usable));
    }

    function xyCanAttack(player, target, card) {
        if (!xyIsIn(target) || target === player || xyAttitude(player, target) >= 0) return false;
        if (typeof player.canUse !== "function") return true;
        return player.canUse(card || XY_SHA_CARD, target, null, true);
    }

    function xyLegalSlashEnemies(player, card) {
        return xyGamePlayers().filter(function (target) {
            return xyCanAttack(player, target, card || XY_SHA_CARD);
        });
    }

    function xyIsVulnerable(target) {
        if (!target || typeof target.countCards !== "function") return false;
        return target.countCards("h") <= 1 || !!target._nihilYinhuaNoShanVulnerable;
    }

    function xyGainedHandCards(event, target) {
        if (!event || !target || typeof event.getg !== "function" || typeof target.getCards !== "function") {
            return false;
        }
        var gained = event.getg(target) || [];
        if (!gained.length) return false;
        var hand = target.getCards("h");
        return gained.some(function (card) {
            return hand.indexOf(card) !== -1;
        });
    }

    function xyIsOverKill(target, effectiveSlash) {
        if (!target || effectiveSlash <= 0) return false;
        return effectiveSlash > target.hp || (effectiveSlash === target.hp && xyIsVulnerable(target));
    }

    function xyGetHandLimit(player) {
        if (player && typeof player.getHandcardLimit === "function") {
            var limit = player.getHandcardLimit();
            if (typeof limit === "number" && !isNaN(limit)) return Math.max(0, limit);
        }
        return Math.max(0, (player && player.hp) || 0) + (xyHasBlood(player) ? 2 : 0);
    }

    function xyDefenseRank(name, hp) {
        if (hp <= 1) {
            if (name === "tao") return 3;
            if (name === "jiu") return 2;
            if (name === "shan") return 1;
            return 0;
        }
        if (name === "tao") return 3;
        if (name === "shan") return 2;
        if (name === "jiu") return 1;
        return 0;
    }

    function xyNormalizeKeepCards(snapshot) {
        var hand = snapshot.handCards || [];
        var sameNameCounts = Object.create(null);
        return hand.map(function (raw, index) {
            var card = raw && raw.card ? raw.card : raw;
            var name = raw && raw.name ? raw.name : xyCardName(card);
            var type = raw && raw.type ? raw.type : xyCardType(card);
            var subtype = raw && raw.subtype ? raw.subtype : xyCardSubtype(card);
            var sameNameIndex = sameNameCounts[name] || 0;
            sameNameCounts[name] = sameNameIndex + 1;
            return {
                card: card,
                id: String((raw && raw.id) || xyCardId(card, index)),
                name: name,
                type: type,
                subtype: subtype,
                structureTier2: !!(raw && raw.structureTier2),
                ordinaryHorse: !!(raw && raw.ordinaryHorse),
                index: index,
                sameNameIndex: sameNameIndex,
            };
        });
    }

    function xyBaseTieScore(info) {
        if (XY_TIE_BASE[info.name] !== undefined) return XY_TIE_BASE[info.name];
        if (info.type === "trick" || info.type === "delay") return 48;
        if (info.type === "equip") return 45;
        if (info.type === "basic") return 30;
        return 20;
    }

    function xyAssignKeepTier(info, snapshot, tierOneIds, burstSlashIds) {
        if (tierOneIds[info.id]) {
            return { tier: 1, reason: "core_defense" };
        }
        if (info.structureTier2) {
            if (snapshot.hp <= 1 && snapshot.hasBlood &&
                (info.subtype === "equip2" || info.subtype === "equip3")) {
                return { tier: 1.5, reason: "critical_defense_structure" };
            }
            return { tier: 2, reason: "structure_change" };
        }
        if (info.name === "wuzhong") return { tier: 3, reason: "strong_draw" };
        if (info.name === "tao") return { tier: 3, reason: "extra_peach" };
        if (info.name === "jiu") {
            return info.sameNameIndex === 0 ?
                { tier: 3, reason: "first_wine" } :
                { tier: 4, reason: "extra_wine" };
        }
        if (info.name === "sha") {
            return burstSlashIds[info.id] ?
                { tier: 3, reason: "two_slash_burst" } :
                { tier: 5, reason: "ordinary_slash" };
        }
        if (info.ordinaryHorse) return { tier: 3, reason: "open_horse_slot" };
        if (info.name === "shan") return { tier: 4, reason: "extra_dodge" };
        if (info.name === "wuxie") return { tier: 4, reason: "negation" };
        if (info.name === "guohe" || info.name === "shunshou") {
            return { tier: 4, reason: "future_control" };
        }
        if (info.type === "trick" || info.type === "delay") {
            return { tier: 4, reason: "general_trick" };
        }
        if (info.type === "equip") return { tier: 4, reason: "general_equip" };
        return { tier: 5, reason: "ordinary_resource" };
    }

    function xyChooseCardsToKeep(snapshot) {
        snapshot = snapshot || {};
        var infos = xyNormalizeKeepCards(snapshot);
        var tierOneIds = Object.create(null);
        var burstSlashIds = Object.create(null);
        var defense = infos.filter(function (info) {
            return xyDefenseRank(info.name, snapshot.hp || 0) > 0;
        });
        defense.sort(function (a, b) {
            var rank = xyDefenseRank(b.name, snapshot.hp || 0) - xyDefenseRank(a.name, snapshot.hp || 0);
            return rank || a.index - b.index;
        });
        defense.slice(0, 2).forEach(function (info) {
            tierOneIds[info.id] = true;
        });

        var slashInfos = infos.filter(function (info) {
            return info.name === "sha";
        });
        if (snapshot.hasTwoHpEnemyInRange && slashInfos.length >= 2) {
            burstSlashIds[slashInfos[0].id] = true;
            burstSlashIds[slashInfos[1].id] = true;
        }

        var entries = infos.map(function (info) {
            var assigned = xyAssignKeepTier(info, snapshot, tierOneIds, burstSlashIds);
            var tieScore;
            if (assigned.tier === 1) {
                tieScore = 60 + xyDefenseRank(info.name, snapshot.hp || 0) * 10;
            } else {
                tieScore = xyBaseTieScore(info) - Math.min(info.sameNameIndex, 3) * 5;
            }
            tieScore = Math.max(0, Math.min(99, tieScore));
            return {
                card: info.card,
                id: info.id,
                name: info.name,
                tier: assigned.tier,
                reason: assigned.reason,
                tieScore: tieScore,
                keepScore: XY_TIER_BASE[String(assigned.tier)] + tieScore,
                index: info.index,
            };
        });
        var ranked = entries.slice(0).sort(function (a, b) {
            return b.keepScore - a.keepScore || a.index - b.index;
        });
        var handLimit = Math.max(0, Math.floor(Number(snapshot.handLimit) || 0));
        var keptEntries = ranked.slice(0, handLimit);
        var discardedEntries = ranked.slice(handLimit);
        var keptSlashCount = keptEntries.filter(function (entry) {
            return entry.name === "sha";
        }).length;
        var remainingUsableSlashCount = snapshot.remainingUsableSlashCount;
        if (typeof remainingUsableSlashCount !== "number" || isNaN(remainingUsableSlashCount)) {
            remainingUsableSlashCount = slashInfos.length;
        }
        remainingUsableSlashCount = Math.max(0, Math.min(slashInfos.length, remainingUsableSlashCount));
        return {
            entries: entries,
            keptCards: keptEntries.map(function (entry) {
                return entry.card;
            }),
            discardedCards: discardedEntries.map(function (entry) {
                return entry.card;
            }),
            naturalOverflow: Math.max(0, infos.length - handLimit),
            canKeepAllRemainingSlash: keptSlashCount >= remainingUsableSlashCount,
        };
    }

    function xyEquippedOfSubtype(equipped, subtype) {
        return equipped.filter(function (card) {
            return xyCardSubtype(card) === subtype;
        });
    }

    function xyCardInfo(card) {
        if (!card) return null;
        if (typeof get !== "undefined" && typeof get.info === "function") {
            return get.info(card, false);
        }
        return typeof lib !== "undefined" && lib.card ? lib.card[xyCardName(card)] : null;
    }

    function xyEquipDistance(card, key) {
        var info = xyCardInfo(card);
        var value = info && info.distance && info.distance[key];
        return typeof value === "number" && isFinite(value) ? value : 0;
    }

    function xyWeaponDirectRange(card, player) {
        if (!card) return 1;
        var info = xyCardInfo(card);
        var distance = info && info.distance;
        if (distance && typeof distance.attackRange === "function") {
            var range = distance.attackRange(card, player);
            if (typeof range === "number" && isFinite(range)) return range;
        }
        var attackFrom = distance && distance.attackFrom;
        return typeof attackFrom === "number" && isFinite(attackFrom) ? 1 - attackFrom : 1;
    }

    function xyWeaponCreatesReach(player, card, enemies, equipped) {
        var oldWeapons = xyEquippedOfSubtype(equipped, "equip1");
        if (oldWeapons.length > 1 || typeof player.getAttackRange !== "function" ||
            typeof player.inRange !== "function" || typeof get.distance !== "function") return false;
        var oldRange = xyWeaponDirectRange(oldWeapons[0], player);
        var currentRange = player.getAttackRange();
        if (currentRange !== oldRange) return false;
        var candidateRange = xyWeaponDirectRange(card, player);
        if (candidateRange <= currentRange) return false;
        return enemies.some(function (enemy) {
            if (player.inRange(enemy)) return false;
            var distance = get.distance(player, enemy, "attack");
            return typeof distance === "number" && distance <= candidateRange;
        });
    }

    function xyDefensiveHorseCreatesMiss(player, card, enemies, equipped) {
        var oldHorses = xyEquippedOfSubtype(equipped, "equip3");
        if (oldHorses.length > 1 || typeof get.distance !== "function") return false;
        var delta = xyEquipDistance(card, "globalTo") - xyEquipDistance(oldHorses[0], "globalTo");
        if (!(delta > 0)) return false;
        return enemies.some(function (enemy) {
            if (typeof enemy.inRange !== "function" || !enemy.inRange(player) ||
                typeof enemy.getAttackRange !== "function") return false;
            var distance = get.distance(enemy, player, "attack");
            var range = enemy.getAttackRange();
            return typeof distance === "number" && typeof range === "number" &&
                distance <= range && distance + delta > range;
        });
    }

    function xyOffensiveHorseCreatesReach(player, card, enemies, equipped) {
        var oldHorses = xyEquippedOfSubtype(equipped, "equip4");
        if (oldHorses.length > 1 || typeof player.inRange !== "function" ||
            typeof player.getAttackRange !== "function" || typeof get.distance !== "function") return false;
        var delta = xyEquipDistance(card, "globalFrom") - xyEquipDistance(oldHorses[0], "globalFrom");
        if (!(delta < 0)) return false;
        var range = player.getAttackRange();
        return enemies.some(function (enemy) {
            if (player.inRange(enemy)) return false;
            var distance = get.distance(player, enemy, "attack");
            return typeof distance === "number" && distance > range && distance + delta <= range;
        });
    }

    function xyRuntimeCardInfo(player, card, index, equipped, enemies) {
        var subtype = xyCardSubtype(card);
        var slotEmpty = subtype && xyEquippedOfSubtype(equipped, subtype).length === 0;
        var structureTier2 = false;
        if (subtype === "equip2") {
            structureTier2 = slotEmpty;
        } else if (subtype === "equip3") {
            structureTier2 = xyDefensiveHorseCreatesMiss(player, card, enemies, equipped);
        } else if (subtype === "equip1") {
            structureTier2 = xyWeaponCreatesReach(player, card, enemies, equipped);
        } else if (subtype === "equip4") {
            structureTier2 = xyOffensiveHorseCreatesReach(player, card, enemies, equipped);
        }
        return {
            card: card,
            id: xyCardId(card, index),
            name: xyCardName(card, player),
            type: xyCardType(card),
            subtype: subtype,
            structureTier2: structureTier2,
            ordinaryHorse: slotEmpty && (subtype === "equip3" || subtype === "equip4"),
        };
    }

    function xyBuildRuntimeKeepSnapshot(player) {
        var hand = typeof player.getCards === "function" ? player.getCards("h") : [];
        var equipped = typeof player.getCards === "function" ? player.getCards("e") : [];
        var enemies = xyGamePlayers().filter(function (current) {
            return xyIsIn(current) && current !== player && xyAttitude(player, current) < 0;
        });
        var inRange = enemies.filter(function (enemy) {
            return xyCanAttack(player, enemy, XY_SHA_CARD);
        });
        var shaCount = hand.filter(function (card) {
            return xyCardName(card, player) === "sha";
        }).length;
        return {
            hp: player.hp,
            hasBlood: xyHasBlood(player),
            handLimit: xyGetHandLimit(player),
            handCards: hand.map(function (card, index) {
                return xyRuntimeCardInfo(player, card, index, equipped, enemies);
            }),
            hasTwoHpEnemyInRange: inRange.some(function (enemy) {
                return enemy.hp === 2;
            }),
            remainingUsableSlashCount: xyRemainingShaUses(player, shaCount),
        };
    }

    function xyKeepSnapshotSignature(player, snapshot) {
        var cards = snapshot.handCards.map(function (info) {
            return info.id + ":" + info.name + ":" + (info.structureTier2 ? 1 : 0) + ":" +
                (info.ordinaryHorse ? 1 : 0);
        }).join("|");
        return [
            xyPlayerId(player),
            snapshot.hp,
            snapshot.hasBlood ? 1 : 0,
            snapshot.handLimit,
            snapshot.hasTwoHpEnemyInRange ? 1 : 0,
            snapshot.remainingUsableSlashCount,
            cards,
        ].join(";");
    }

    function xyKeepPlanForPlayer(player) {
        var snapshot = xyBuildRuntimeKeepSnapshot(player);
        var signature = xyKeepSnapshotSignature(player, snapshot);
        var currentEvent = typeof _status !== "undefined" ? _status.event : null;
        if (currentEvent) {
            var key = xyPlayerId(player) || "self";
            var cache = currentEvent._nihilYinhuaKeepPlanCache ||
                (currentEvent._nihilYinhuaKeepPlanCache = Object.create(null));
            if (cache[key] && cache[key].signature === signature) return cache[key].plan;
            var plan = xyChooseCardsToKeep(snapshot);
            cache[key] = { signature: signature, plan: plan };
            return plan;
        }
        return xyChooseCardsToKeep(snapshot);
    }

    function xyOwnedHandCard(player, card) {
        if (!player || !card || typeof player.getCards !== "function") return false;
        return player.getCards("h").indexOf(card) !== -1;
    }

    function xyKeepEntryForCard(player, card) {
        if (!xyOwnedHandCard(player, card)) return null;
        var plan = xyKeepPlanForPlayer(player);
        for (var i = 0; i < plan.entries.length; i++) {
            if (plan.entries[i].card === card) return plan.entries[i];
        }
        return null;
    }

    function xyEngineKeepValue(player, card) {
        var entry = xyKeepEntryForCard(player, card);
        if (!entry) return;
        // 保持在引擎常见0~10尺度内，同时保留文档中的大档位差和层内排序。
        return entry.keepScore / 110;
    }

    // 留牌分级只服务于手牌上限导致的正常弃牌，不能污染出牌、响应、交牌或技能代价。
    // 必须检查直接父事件；仅搜索 phaseDiscard 会误伤弃牌阶段内技能创建的额外弃牌选择。
    function xyIsNormalPhaseDiscardChoice(player) {
        var currentEvent = typeof _status !== "undefined" ? _status.event : null;
        if (!currentEvent || currentEvent.name !== "chooseToDiscard" || currentEvent.player !== player ||
            typeof currentEvent.getParent !== "function") return false;
        var parent = currentEvent.getParent();
        return !!parent && parent.name === "phaseDiscard" && parent.player === player;
    }

    function xyAction(action, reason, target) {
        var result = { action: action, reason: reason || "" };
        if (target) result.target = target;
        return result;
    }

    function xyDecideInitialRoute(state) {
        state = state || {};
        var effectiveSlash = Number(state.effectiveSlash) || 0;
        if (!state.hasLegalEnemy) {
            return state.danenBasePositive ? xyAction("DANEN", "NO_LEGAL_ENEMY") :
                xyAction("HOLD", "NO_LEGAL_ENEMY");
        }
        if (!state.hasBlood) {
            if (effectiveSlash >= 4) return xyAction("ATTACK", "FOUR_SLASH_BURST");
            if (state.hasOverKillTarget) return xyAction("ATTACK", "OVERKILL");
            return xyAction("DANEN", "SELF_GAIN_BLOOD");
        }
        if ((Number(state.hp) || 0) <= 1) {
            if (effectiveSlash >= 4) return xyAction("ATTACK", "FOUR_SLASH_BURST");
            if (state.hasOverKillTarget) return xyAction("ATTACK", "OVERKILL");
            if (state.danenBasePositive) return xyAction("DANEN", "DANEN_POSITIVE");
        }
        if (state.hp === 2) {
            if (state.hasOverKillTarget) return xyAction("ATTACK", "OVERKILL");
            if (effectiveSlash >= 4) return xyAction("ATTACK", "FOUR_SLASH_BURST");
            if (effectiveSlash === 3 && (state.hasBloodEnemy || state.hasVulnerableEnemy)) {
                return xyAction("ATTACK", "THREE_SLASH_PRESSURE");
            }
            if (state.danenBasePositive) return xyAction("DANEN", "DANEN_POSITIVE");
        }
        if (state.hasOverKillTarget) return xyAction("ATTACK", "OVERKILL");
        if (effectiveSlash >= 4) return xyAction("ATTACK", "FOUR_SLASH_BURST");
        if (effectiveSlash >= 3) return xyAction("ATTACK", "THREE_SLASH_BURST");
        if (effectiveSlash === 2 && state.hasBloodEnemy && state.teamHealthy && state.naturalOverflow > 0) {
            return xyAction("ATTACK", "HEALTHY_OVERFLOW_TWO_SLASH");
        }
        if (state.danenBasePositive) return xyAction("DANEN", "DANEN_POSITIVE");
        if (effectiveSlash === 1 && !state.canKeepAllRemainingSlash && state.hasBloodEnemy) {
            return xyAction("ATTACK", "UNKEEPABLE_BLOOD_SLASH");
        }
        return xyAction("HOLD", "KEEP_RESOURCES");
    }

    function xyTargetDescriptorScore(entry) {
        var blood = !!(entry.hasBlood || entry.blood);
        var vulnerable = !!entry.vulnerable;
        var overKill = !!(entry.overKill || entry.isOverKill);
        var tier = overKill ? 5 : blood && vulnerable ? 4 : blood ? 3 : vulnerable ? 2 : 1;
        return {
            tier: tier,
            baseEffect: Number(entry.baseEffect) || 0,
            hp: Number(entry.hp !== undefined ? entry.hp : entry.target && entry.target.hp) || 0,
            threaten: Number(entry.threaten !== undefined ? entry.threaten : entry.threat) || 0,
            seat: Number(entry.seat) || 0,
        };
    }

    function xyChooseSlashTarget(targets) {
        if (!targets || !targets.length) return null;
        var sorted = targets.slice(0).sort(function (a, b) {
            var left = xyTargetDescriptorScore(a);
            var right = xyTargetDescriptorScore(b);
            return right.tier - left.tier || right.baseEffect - left.baseEffect ||
                left.hp - right.hp || right.threaten - left.threaten || left.seat - right.seat;
        });
        return sorted[0].target || sorted[0];
    }

    function xyChooseDanenAction(state, candidates) {
        state = state || {};
        if (!candidates && Array.isArray(state.candidates)) {
            var selfEntry = state.self;
            candidates = (selfEntry ? [selfEntry] : []).concat(state.candidates);
            state = {
                hp: selfEntry ? selfEntry.hp : state.hp,
                maxHp: selfEntry ? selfEntry.maxHp : state.maxHp,
                hasBlood: selfEntry ? !!selfEntry.hasBlood : !!state.hasBlood,
            };
        }
        candidates = candidates || [];
        var friends = candidates.filter(function (entry) {
            return entry.isFriend !== false;
        });
        var self = friends.filter(function (entry) {
            return !!entry.isSelf;
        })[0];
        function gain(entry) {
            return entry && !entry.hasBlood;
        }
        function byHpSeat(a, b) {
            return a.hp - b.hp || (Number(a.seat) || 0) - (Number(b.seat) || 0);
        }
        function recoveryDonor() {
            if (!self || self.hp >= self.maxHp) return null;
            var enemy = candidates.filter(function (entry) {
                return entry.isFriend === false && entry.hasBlood;
            }).sort(byHpSeat)[0];
            if (enemy) return enemy;
            // 血缠的防伤、手牌上限和丹恩摸牌价值高于常规回复1体力；
            // AI不拆自己的缠，仅在自己残血时向至少3血的健康队友借缠。
            if (self.hp > 1) return null;
            return friends.filter(function (entry) {
                return !entry.isSelf && entry.hasBlood && entry.hp >= 3;
            }).sort(function (a, b) {
                return b.hp - a.hp || (Number(a.seat) || 0) - (Number(b.seat) || 0);
            })[0] || null;
        }
        if (!state.hasBlood && gain(self)) {
            return { action: "DANEN", reason: "SELF_GAIN_BLOOD", choice: "gain", target: self.target || self };
        }
        var donor = recoveryDonor();
        if (state.hp <= 1 && donor) {
            return { action: "DANEN", reason: "SELF_RECOVER", choice: "recover", target: donor.target || donor };
        }
        if (state.hasBlood && state.hp === 2) {
            // 血缠本身能防止一次伤害，因此低体力无缠友方比1血有缠友方更危险；
            // 同时新增血缠还会令本次丹恩多摸一张，优先级高于单纯回复。
            var unprotected = friends.filter(function (entry) {
                return !entry.isSelf && entry.hp < 3 && gain(entry);
            }).sort(byHpSeat)[0];
            if (unprotected) {
                return {
                    action: "DANEN",
                    reason: unprotected.hp <= 1 ? "PROTECT_CRITICAL_ALLY" : "PROTECT_LOW_HP_ALLY",
                    choice: "gain",
                    target: unprotected.target || unprotected,
                };
            }
            if (donor) {
                return { action: "DANEN", reason: "SELF_RECOVER", choice: "recover", target: donor.target || donor };
            }
        }
        var priorities = [
            {
                reason: "PROTECT_ONE_HP_ALLY",
                choice: "gain",
                filter: function (entry) {
                    return !entry.isSelf && entry.hp <= 1 && gain(entry);
                },
            },
            {
                reason: "GIVE_ALLY_BLOOD",
                choice: "gain",
                filter: function (entry) {
                    return !entry.isSelf && gain(entry);
                },
            },
        ];
        for (var i = 0; i < priorities.length; i++) {
            var priority = priorities[i];
            var target = friends.filter(priority.filter).sort(byHpSeat)[0];
            if (target) {
                return {
                    action: "DANEN",
                    reason: priority.reason,
                    choice: priority.choice,
                    target: target.target || target,
                };
            }
        }
        if (donor) {
            return { action: "DANEN", reason: "SELF_RECOVER", choice: "recover", target: donor.target || donor };
        }
        return xyAction("HOLD", "NO_POSITIVE_DANEN_TARGET");
    }

    function xyBurstReason(reason) {
        return reason === "OVERKILL" || reason === "FOUR_SLASH_BURST" ||
            reason === "RETARGET_BURST" || reason === "RETARGET_OVERKILL";
    }

    function xyShouldContinueLockedTarget(state) {
        state = state || {};
        if (!state.hasUsableSlash || !state.hasRemainingSlashUse) return xyAction("HOLD", "NO_SLASH_LEFT");
        if (!state.lockedTargetLegal) return xyAction("HOLD", "RETARGET_REQUIRED");
        if (xyBurstReason(state.attackReason)) return xyAction("ATTACK", "BURST_CONTINUES");
        return state.lastSlashLostHp ? xyAction("ATTACK", "HIT_CONTINUES") :
            xyAction("HOLD", "NORMAL_ROUTE_STOP");
    }

    function xyDecideRetarget(state) {
        state = state || {};
        var remaining = Number(state.remainingEffectiveSlash) || 0;
        if (!state.hasLegalEnemy || remaining <= 0) return xyAction("HOLD", "NO_RETARGET");
        if (remaining >= 3) return xyAction("ATTACK", "RETARGET_BURST", state.bestTarget);
        if (remaining === 2) {
            if (state.hasOverKillTarget) {
                return xyAction("ATTACK", "RETARGET_OVERKILL", state.bestOverKillTarget || state.bestTarget);
            }
            if (state.hasBloodEnemy) {
                return xyAction("ATTACK", "RETARGET_BLOOD", state.bestBloodTarget || state.bestTarget);
            }
            if (!state.canKeepAllRemainingSlash) {
                return xyAction("ATTACK", "RETARGET_UNKEEPABLE_TWO", state.bestTarget);
            }
            return xyAction("HOLD", "KEEP_TWO_SLASH");
        }
        if (state.hasOverKillTarget) {
            return xyAction("ATTACK", "RETARGET_OVERKILL", state.bestOverKillTarget || state.bestTarget);
        }
        if (state.canKeepAllRemainingSlash) return xyAction("HOLD", "KEEP_LAST_SLASH");
        if (state.hasBloodEnemy) {
            return xyAction("ATTACK", "RETARGET_BLOOD", state.bestBloodTarget || state.bestTarget);
        }
        return xyAction("HOLD", "DISCARD_ORDINARY_LAST_SLASH");
    }

    function xyDanenCandidates(player) {
        return xyGamePlayers().map(function (current, index) {
            return {
                target: current,
                isSelf: current === player,
                isFriend: current === player || xyAttitude(player, current) > 0,
                hasBlood: xyHasBlood(current),
                hp: current.hp,
                maxHp: current.maxHp,
                seat: index,
            };
        });
    }

    function xyBestDanenChoice(player) {
        return xyChooseDanenAction({
            hp: player.hp,
            maxHp: player.maxHp,
            hasBlood: xyHasBlood(player),
        }, xyDanenCandidates(player));
    }

    function xyTeamHealthy(player) {
        if (!xyHasBlood(player) || player.hp < player.maxHp) return false;
        return !xyGamePlayers().some(function (current) {
            return xyIsIn(current) && (current === player || xyAttitude(player, current) > 0) && current.hp <= 1;
        });
    }

    function xyBuildRouteState(player, card) {
        var enemies = xyLegalSlashEnemies(player, card || XY_SHA_CARD);
        var shaCount = xyShaCount(player);
        var effectiveSlash = xyRemainingShaUses(player, shaCount);
        var plan = xyKeepPlanForPlayer(player);
        return {
            hasLegalEnemy: enemies.length > 0,
            effectiveSlash: effectiveSlash,
            hasBlood: xyHasBlood(player),
            hp: player.hp,
            hasOverKillTarget: enemies.some(function (target) {
                return xyIsOverKill(target, effectiveSlash);
            }),
            hasBloodEnemy: enemies.some(function (target) {
                return xyHasBlood(target);
            }),
            hasVulnerableEnemy: enemies.some(xyIsVulnerable),
            teamHealthy: xyTeamHealthy(player),
            naturalOverflow: plan.naturalOverflow,
            danenBasePositive: xyBestDanenChoice(player).action === "DANEN",
            canKeepAllRemainingSlash: plan.canKeepAllRemainingSlash,
            enemies: enemies,
            keepPlan: plan,
        };
    }

    function xyPhaseUseEvent(event) {
        if (!event) return null;
        if (event.name === "phaseUse") return event;
        if (typeof event.getParent === "function") return event.getParent("phaseUse");
        return null;
    }

    function xyCurrentPhaseUseEvent() {
        return xyPhaseUseEvent(typeof _status !== "undefined" ? _status.event : null);
    }

    function xyLastMarkedShaUse(player, exclude, phaseUse) {
        if (!player || typeof player.getHistory !== "function") return null;
        var phase = phaseUse || xyCurrentPhaseUseEvent();
        var history = player.getHistory("useCard") || [];
        for (var i = history.length - 1; i >= 0; i--) {
            var event = history[i];
            if (event === exclude || !event.card || event.card.name !== "sha") continue;
            if (event._nihilYinhuaPhaseUse && (!phase || event._nihilYinhuaPhaseUse === phase)) return event;
        }
        return null;
    }

    function xyTargetRuntimeDescriptor(player, target, effectiveSlash, index) {
        return {
            target: target,
            hasBlood: xyHasBlood(target),
            vulnerable: xyIsVulnerable(target),
            overKill: xyIsOverKill(target, effectiveSlash),
            hp: target.hp,
            threaten: typeof get.threaten === "function" ? get.threaten(target, player) : 0,
            seat: index,
        };
    }

    function xyRetargetDecisionForPlayer(player, card) {
        var state = xyBuildRouteState(player, card);
        var descriptors = state.enemies.map(function (target, index) {
            return xyTargetRuntimeDescriptor(player, target, state.effectiveSlash, index);
        });
        var overKill = descriptors.filter(function (entry) {
            return entry.overKill;
        });
        var blood = descriptors.filter(function (entry) {
            return entry.hasBlood;
        });
        return xyDecideRetarget({
            hasLegalEnemy: descriptors.length > 0,
            remainingEffectiveSlash: state.effectiveSlash,
            hasOverKillTarget: overKill.length > 0,
            hasBloodEnemy: blood.length > 0,
            canKeepAllRemainingSlash: state.canKeepAllRemainingSlash,
            bestTarget: xyChooseSlashTarget(descriptors),
            bestOverKillTarget: xyChooseSlashTarget(overKill),
            bestBloodTarget: xyChooseSlashTarget(blood),
        });
    }

    function xyAttackDecisionForPlayer(player, card) {
        var phase = xyCurrentPhaseUseEvent();
        var last = xyLastMarkedShaUse(player, null, phase);
        if (!last) return xyDecideInitialRoute(xyBuildRouteState(player, card));
        var locked = xyFindPlayerById(last._nihilYinhuaLockedTargetId);
        var lockedLegal = !!locked && xyCanAttack(player, locked, card || XY_SHA_CARD);
        if (lockedLegal) {
            var remaining = xyRemainingShaUses(player, xyShaCount(player));
            return xyShouldContinueLockedTarget({
                attackReason: last._nihilYinhuaAttackReason,
                lastSlashLostHp: last._nihilYinhuaResult === "hpLoss",
                lockedTargetLegal: true,
                hasUsableSlash: xyShaCount(player) > 0,
                hasRemainingSlashUse: remaining > 0,
            });
        }
        return xyRetargetDecisionForPlayer(player, card);
    }

    function xyChooseToUseEvent(event) {
        if (!event) return null;
        if (event.name === "chooseToUse") return event;
        if (typeof event.getParent === "function") return event.getParent("chooseToUse");
        return null;
    }

    function xyPreparedAttackDecision(player, card, event) {
        var chooseEvent = xyChooseToUseEvent(event || (typeof _status !== "undefined" ? _status.event : null));
        if (chooseEvent && chooseEvent._nihilYinhuaAttackDecision) {
            return chooseEvent._nihilYinhuaAttackDecision;
        }
        var decision = xyAttackDecisionForPlayer(player, card || XY_SHA_CARD);
        if (chooseEvent) chooseEvent._nihilYinhuaAttackDecision = decision;
        return decision;
    }

    function xyHasUsablePeach(player) {
        if (!player || player.hp >= player.maxHp) return false;
        if (typeof player.hasCard === "function" && typeof player.hasUseTarget === "function") {
            return player.hasCard(function (card) {
                return xyCardName(card, player) === "tao" && player.hasUseTarget(card);
            }, "hs");
        }
        if (typeof player.countCards !== "function") return false;
        return player.countCards("hs", function (card) {
            return xyCardName(card, player) === "tao";
        }) > 0;
    }

    function xyTargetMultiplier(player, target) {
        if (!target || xyAttitude(player, target) >= 0) return 1;
        var last = xyLastMarkedShaUse(player);
        if (last) {
            var locked = xyFindPlayerById(last._nihilYinhuaLockedTargetId);
            if (locked && xyCanAttack(player, locked, XY_SHA_CARD)) {
                return target === locked ? 64 : 0.1;
            }
        }
        var effectiveSlash = xyRemainingShaUses(player, xyShaCount(player));
        if (xyIsOverKill(target, effectiveSlash)) return 32;
        if (xyHasBlood(target) && xyIsVulnerable(target)) return 12;
        if (xyHasBlood(target)) return 5;
        if (xyIsVulnerable(target)) return 2;
        return 1;
    }

    function xyMarkUseEvent(event, key, value) {
        if (!event) return;
        if (typeof event.set === "function") event.set(key, value);
        else event[key] = value;
    }

    function xyChixianAllowed(player, owner) {
        if (!xyIsIn(owner) || player.hp <= 1 || xyHasBlood(player)) return false;
        return owner === player || xyAttitude(player, owner) > 0;
    }

    function xyChixianOrder(player) {
        var canUse = game.hasPlayer(function (owner) {
            return owner.hasSkill("nihil_chixian", null, null, false) && xyChixianAllowed(player, owner);
        });
        if (!canUse) return 0;
        if (xyIsYinhua(player) && xyHasUsablePeach(player)) return 1.5;
        return xyIsYinhua(player) ? 8.2 : 7.4;
    }

    // ============================================================
    //  鲜血仪葬 殷华 — 赤献·殷殇·丹恩
    // ============================================================

    var character = {
        nihil_xianxueyinhua: {
            sex: "male",
            group: "yao",
            hp: 3,
            maxHp: 3,
            skills: [
                "nihil_chixian",
                "nihil_yinshang",
                "nihil_danen",
            ],
            img: image("nihil_xianxueyinhua"),
        },
    };

    var skills = {
        // ========== 血缠（不可叠加的状态技能） ==========
        nihil_xuechan: {
            charlotte: true,
            locked: true,
            forced: true,
            mark: true,
            marktext: "缠",
            intro: {
                name: "血缠",
                content: "手牌上限+2；防止下次受到的伤害，然后移去“血缠”",
            },
            trigger: { player: "damageBegin4" },
            filter: function (event, player) {
                return event.num > 0;
            },
            async content(event, trigger, player) {
                player.removeSkill("nihil_xuechan");
                trigger.cancel();
                semanticLog(
                    "#g血缠",
                    "：防止了",
                    player,
                    "受到的",
                    get.cnNumber(trigger.num),
                    "点伤害并移去状态",
                );
            },
            mod: {
                maxHandcard: function (player, num) {
                    return num + 2;
                },
            },
            ai: {
                filterDamage: true,
                skillTagFilter: function (player, tag, arg) {
                    if (tag !== "filterDamage") return;
                    if (arg && arg.player && arg.player.hasSkillTag("jueqing", false, player)) {
                        return false;
                    }
                    return true;
                },
                threaten: function (player, target) {
                    if (!player || !target || xyAttitude(player, target) >= 0) return 1;
                    if (player.hasSkillTag("jueqing", false, target)) return 1;
                    // 平方后经引擎开方，得到0.82的轻度降权；始终保持收益正负号。
                    return 0.82 * 0.82;
                },
            },
        },

        // ========== 赤献 ==========
        nihil_chixian: {
            global: "nihil_chixian_global",
        },

        // 任意角色均可在自己的出牌阶段发动；多个殷华共享一次次数限制。
        nihil_chixian_global: {
            sourceSkill: "nihil_chixian",
            enable: "phaseUse",
            usable: 1,
            filter: function (event, player) {
                return game.hasPlayer(function (current) {
                    return current.hasSkill("nihil_chixian", null, null, false);
                });
            },
            filterTarget: function (card, player, target) {
                return target.hasSkill("nihil_chixian", null, null, false);
            },
            selectTarget: function () {
                var owners = game.filterPlayer(function (current) {
                    return current.hasSkill("nihil_chixian", null, null, false);
                });
                return owners.length > 1 ? 1 : -1;
            },
            prompt: function () {
                var owners = game.filterPlayer(function (current) {
                    return current.hasSkill("nihil_chixian", null, null, false);
                });
                return "赤献：失去1点体力，令你与" + get.translation(owners) +
                    (owners.length > 1 ? "中的一人" : "") + "各摸一张牌，然后你获得“血缠”";
            },
            async content(event, trigger, player) {
                var owner = event.targets && event.targets[0];
                if (!owner) return;

                player.logSkill("nihil_chixian", owner);
                await player.loseHp(1);

                if (owner === player) {
                    // “你与其各摸一张”在二者为同一角色时合计摸两张。
                    if (player.isIn()) await player.draw(2);
                } else {
                    if (owner.isIn()) await owner.draw(1);
                    if (player.isIn()) await player.draw(1);
                }

                if (player.isIn()) {
                    player.addSkill("nihil_xuechan");
                    semanticLog(player, "获得了", "#g血缠");
                }
            },
            ai: {
                order: function (item, player) {
                    player = player || get.player();
                    return xyChixianOrder(player);
                },
                result: {
                    player: function (player, target) {
                        if (!xyChixianAllowed(player, target)) return -20;
                        if (xyIsYinhua(player)) return target === player ? 5 : 2.5;
                        return 3.5;
                    },
                    target: function (player, target) {
                        if (!xyChixianAllowed(player, target)) return 0;
                        if (xyIsYinhua(player)) return target === player ? 5 : 0.5;
                        return 1;
                    },
                },
            },
        },

        // ========== 殷殇 ==========
        nihil_yinshang: {
            locked: true,
            forced: true,
            onChooseToUse: function (event) {
                var player = event && event.player;
                if (!xyIsYinhua(player) || !player.isPhaseUsing()) return;
                event._nihilYinhuaAttackDecision = xyAttackDecisionForPlayer(player, XY_SHA_CARD);
            },
            group: [
                "nihil_yinshang_init",
                "nihil_yinshang_convert",
                "nihil_yinshang_ai_use",
                "nihil_yinshang_ai_hp_loss",
                "nihil_yinshang_ai_vulnerable",
                "nihil_yinshang_ai_vulnerable_clear",
            ],
            mod: {
                cardUsable: function (card, player, num) {
                    if (card.name !== "sha" || !player.isPhaseUsing()) return;
                    return num + xyBloodCount();
                },
                aiOrder: function (player, card, num) {
                    if (!xyIsYinhua(player) || !player.isPhaseUsing() || xyCardName(card, player) !== "sha") return;
                    if (xyHasUsablePeach(player)) return 0;
                    var decision = xyPreparedAttackDecision(player, card);
                    // 【杀】与丹恩的分流是出牌阶段收尾决策：先让所有常规正收益操作完成。
                    return decision.action === "ATTACK" ? 0.0001 : 0;
                },
                aiUseful: function (player, card) {
                    if (!xyIsYinhua(player) || !xyIsNormalPhaseDiscardChoice(player)) return;
                    return xyEngineKeepValue(player, card);
                },
            },
            ai: {
                jueqing: true,
                threaten: 1.2,
                effect: {
                    player_use: function (card, player, target) {
                        if (xyCardName(card, player) !== "sha" || !player.isPhaseUsing() ||
                            !target || xyAttitude(player, target) >= 0) return;
                        return [1, 0, xyTargetMultiplier(player, target), 0];
                    },
                },
            },
        },

        // 游戏开始或中途入场时获得血缠。
        nihil_yinshang_init: {
            charlotte: true,
            sourceSkill: "nihil_yinshang",
            trigger: {
                global: "phaseBefore",
                player: "enterGame",
            },
            forced: true,
            popup: false,
            filter: function (event) {
                return event.name !== "phase" || game.phaseNumber === 0;
            },
            async content(event, trigger, player) {
                player.logSkill("nihil_yinshang");
                player.addSkill("nihil_xuechan");
                semanticLog(player, "获得了", "#g血缠");
            },
        },

        // 造成伤害改为目标失去等量体力，随后补上血缠。
        nihil_yinshang_convert: {
            charlotte: true,
            sourceSkill: "nihil_yinshang",
            trigger: { source: "damageBefore" },
            forced: true,
            popup: false,
            filter: function (event) {
                return event.player && event.num > 0;
            },
            async content(event, trigger, player) {
                var target = trigger.player;
                var num = trigger.num;
                var useEvent = typeof trigger.getParent === "function" ? trigger.getParent("useCard") : null;
                trigger.cancel();
                player.logSkill("nihil_yinshang", target);
                var loseHpEvent = target.loseHp(num);
                if (loseHpEvent && useEvent && trigger.card && trigger.card.name === "sha") {
                    loseHpEvent._nihilYinhuaSourceId = xyPlayerId(player);
                    loseHpEvent._nihilYinhuaUseEvent = useEvent;
                    loseHpEvent._nihilYinhuaTargetId = xyPlayerId(target);
                }
                semanticLog(
                    "#g殷殇",
                    "：将对",
                    target,
                    "的",
                    get.cnNumber(num),
                    "点伤害改为等量体力流失",
                );
                await loseHpEvent;
                if (target.isIn() && !target.hasSkill("nihil_xuechan", null, null, false)) {
                    target.addSkill("nihil_xuechan");
                    semanticLog("#g殷殇", "：", target, "获得血缠");
                }
            },
        },

        // 真正使用杀时才把路线与锁定目标写到该useCard事件；AI评分函数只读这些数据。
        nihil_yinshang_ai_use: {
            charlotte: true,
            sourceSkill: "nihil_yinshang",
            trigger: { player: "useCard" },
            forced: true,
            popup: false,
            filter: function (event) {
                return event.card && event.card.name === "sha" &&
                    (typeof event.isPhaseUsing !== "function" || event.isPhaseUsing());
            },
            async content(event, trigger, player) {
                var phase = xyPhaseUseEvent(trigger);
                var previous = xyLastMarkedShaUse(player, trigger, phase);
                var chooseEvent = typeof trigger.getParent === "function" ? trigger.getParent("chooseToUse") : null;
                var prepared = chooseEvent && chooseEvent._nihilYinhuaAttackDecision;
                var decision;
                if (!previous) {
                    decision = prepared || xyDecideInitialRoute(xyBuildRouteState(player, trigger.card));
                } else {
                    var previousTarget = xyFindPlayerById(previous._nihilYinhuaLockedTargetId);
                    if (previousTarget && xyCanAttack(player, previousTarget, trigger.card)) {
                        decision = xyAction("ATTACK", previous._nihilYinhuaAttackReason);
                    } else {
                        decision = prepared || xyRetargetDecisionForPlayer(player, trigger.card);
                    }
                }
                var target = trigger.targets && trigger.targets[0];
                var reason = decision.reason;
                if (reason === "RETARGET_BURST") reason = "RETARGET_BURST";
                xyMarkUseEvent(trigger, "_nihilYinhuaPhaseUse", phase);
                xyMarkUseEvent(trigger, "_nihilYinhuaAttackReason", reason);
                xyMarkUseEvent(trigger, "_nihilYinhuaLockedTargetId", xyPlayerId(target));
                xyMarkUseEvent(trigger, "_nihilYinhuaResult", "pending");
            },
        },

        // changeHp发生在loseHp的濒死结算前，可准确记录“本杀确实令目标失去过体力”。
        nihil_yinshang_ai_hp_loss: {
            charlotte: true,
            sourceSkill: "nihil_yinshang",
            trigger: { global: "changeHpAfter" },
            forced: true,
            popup: false,
            filter: function (event, player) {
                if (!(event.num < 0) || typeof event.getParent !== "function") return false;
                var loseHpEvent = event.getParent("loseHp");
                return !!loseHpEvent && loseHpEvent._nihilYinhuaSourceId === xyPlayerId(player) &&
                    !!loseHpEvent._nihilYinhuaUseEvent;
            },
            async content(event, trigger) {
                var loseHpEvent = trigger.getParent("loseHp");
                var useEvent = loseHpEvent._nihilYinhuaUseEvent;
                var targetId = loseHpEvent._nihilYinhuaTargetId;
                var hitTargets = useEvent._nihilYinhuaHitTargetIds ||
                    (useEvent._nihilYinhuaHitTargetIds = Object.create(null));
                hitTargets[targetId] = true;
                if (!useEvent._nihilYinhuaLockedTargetId || useEvent._nihilYinhuaLockedTargetId === targetId) {
                    xyMarkUseEvent(useEvent, "_nihilYinhuaResult", "hpLoss");
                }
            },
        },

        // 沿用原版“sha_notshan”的保守启发式：排除直击和整体禁闪后，命中视为防御薄弱。
        nihil_yinshang_ai_vulnerable: {
            charlotte: true,
            sourceSkill: "nihil_yinshang",
            trigger: { player: "shaHit" },
            forced: true,
            popup: false,
            filter: function (event, player) {
                var target = event.target;
                if (!target || event.directHit || event.directHit2 || typeof target.countCards !== "function" ||
                    target.countCards("hs") <= 0) return false;
                if (!lib.filter || typeof lib.filter.cardEnabled !== "function" ||
                    !lib.element || typeof lib.element.VCard !== "function") return false;
                var shan = new lib.element.VCard({ name: "shan" });
                if (!lib.filter.cardEnabled(shan, target, "forceEnable")) return false;
                return typeof get.damageEffect !== "function" || get.damageEffect(target, player, target) < 0;
            },
            async content(event, trigger) {
                trigger.target._nihilYinhuaNoShanVulnerable = true;
            },
        },

        // 摸牌和其他获得牌均会进入gain/loseAsync；只有新牌实际进入手牌才清除记录。
        nihil_yinshang_ai_vulnerable_clear: {
            charlotte: true,
            sourceSkill: "nihil_yinshang",
            trigger: { global: ["gainAfter", "loseAsyncAfter"] },
            forced: true,
            popup: false,
            filter: function (event) {
                return xyGamePlayers().some(function (target) {
                    return !!target._nihilYinhuaNoShanVulnerable && xyGainedHandCards(event, target);
                });
            },
            async content(event, trigger) {
                xyGamePlayers().forEach(function (target) {
                    if (target._nihilYinhuaNoShanVulnerable && xyGainedHandCards(trigger, target)) {
                        delete target._nihilYinhuaNoShanVulnerable;
                    }
                });
            },
        },

        // ========== 丹恩 ==========
        nihil_danen: {
            // 先结算丹恩，再由弃牌阶段正文按最新手牌和手牌上限计算弃牌数。
            trigger: { player: "phaseDiscardBegin" },
            direct: true,
            filter: function (event, player) {
                if (player.hasHistory("useCard", function (evt) {
                    return evt.card && evt.card.name === "sha";
                })) return false;

                var canGain = game.hasPlayer(function (current) {
                    return !current.hasSkill("nihil_xuechan", null, null, false);
                });
                var canRecover = player.hp < player.maxHp && game.hasPlayer(function (current) {
                    return current.hasSkill("nihil_xuechan", null, null, false);
                });
                return canGain || canRecover;
            },
            async content(event, trigger, player) {
                var gainTargets = game.filterPlayer(function (current) {
                    return !current.hasSkill("nihil_xuechan", null, null, false);
                });
                var recoverTargets = player.hp < player.maxHp
                    ? game.filterPlayer(function (current) {
                        return current.hasSkill("nihil_xuechan", null, null, false);
                    })
                    : [];

                var result = await player.chooseButtonTarget({
                    createDialog: [
                        get.prompt("nihil_danen"),
                        [[
                            ["gain", "令一名没有“血缠”的角色获得“血缠”"],
                            ["recover", "移去一名角色的“血缠”，然后你回复1点体力"],
                        ], "textbutton"],
                    ],
                    filterButton: function (button) {
                        return get.event()[button.link].length > 0;
                    },
                    filterTarget: function (card, player, target) {
                        var button = ui.selected.buttons && ui.selected.buttons[0];
                        if (!button) return false;
                        return get.event()[button.link].includes(target);
                    },
                    ai1: function (button) {
                        var chooser = get.player();
                        var plan = chooser ? xyBestDanenChoice(chooser) : null;
                        return plan && plan.action === "DANEN" && plan.choice === button.link ? 12 : 0;
                    },
                    ai2: function (target) {
                        var chooser = get.player();
                        var plan = chooser ? xyBestDanenChoice(chooser) : null;
                        return plan && plan.action === "DANEN" && plan.target === target ? 12 : -10;
                    },
                })
                    .set("complexTarget", true)
                    .set("gain", gainTargets)
                    .set("recover", recoverTargets)
                    .forResult();

                if (!result || !result.bool || !result.targets || !result.targets.length) return;

                var target = result.targets[0];
                var choice = result.links && result.links[0];

                if (choice === "gain") {
                    if (target.hasSkill("nihil_xuechan", null, null, false)) return;
                    player.logSkill("nihil_danen", target);
                    target.addSkill("nihil_xuechan");
                    semanticLog("#g丹恩", "：", target, "获得血缠");
                } else if (choice === "recover") {
                    if (!target.hasSkill("nihil_xuechan", null, null, false) || player.hp >= player.maxHp) return;
                    player.logSkill("nihil_danen", target);
                    target.removeSkill("nihil_xuechan");
                    semanticLog("#g丹恩", "：移去", target, "的血缠以回复体力");
                    await player.recover(1);
                } else {
                    return;
                }

                var count = xyBloodCount();
                if (count > 0 && player.isIn()) await player.draw(count);
            },
        },
    };

    var translates = {
        nihil_xianxueyinhua: "殷华",
        nihil_xianxueyinhua_prefix: "鲜血仪葬",

        nihil_xuechan: "血缠",
        nihil_xuechan_info:
            "“血缠”不可叠加。拥有“血缠”的角色手牌上限+2；" +
            "防止其下次受到的伤害，然后移去“血缠”。",

        nihil_chixian: "赤献",
        nihil_chixian_info:
            "任意角色的出牌阶段限一次，其可以失去1点体力，令你与其各摸一张牌，" +
            "然后其获得“血缠”。",
        nihil_chixian_global: "赤献",
        nihil_chixian_global_info:
            "出牌阶段限一次，你可以失去1点体力，令你与一名拥有【赤献】的角色各摸一张牌，" +
            "然后你获得“血缠”。",

        nihil_yinshang: "殷殇",
        nihil_yinshang_info:
            "<b>锁定技，</b>游戏开始时，你获得“血缠”。当你造成伤害时，改为令目标失去等量体力；" +
            "若其没有“血缠”，其获得之。场上每有一个“血缠”，你于出牌阶段内使用【杀】的次数上限+1。",

        nihil_danen: "丹恩",
        nihil_danen_info:
            "弃牌阶段开始时，若你本回合未使用过【杀】，你可以选择一项：1.令一名角色获得“血缠”；" +
            "2.移去一名角色的“血缠”，然后你回复1点体力。选择后，你摸X张牌（X为场上“血缠”数）。",
    };

    var title = {
        nihil_xianxueyinhua: "#g朱殷流转，皆系吾恩；万灵止息，皆入吾裁",
    };

    var sort = ["nihil_xianxueyinhua"];

    var aiHelpers = {
        chooseCardsToKeep: xyChooseCardsToKeep,
        decideInitialRoute: xyDecideInitialRoute,
        chooseSlashTarget: xyChooseSlashTarget,
        chooseDanenAction: xyChooseDanenAction,
        shouldContinueLockedTarget: xyShouldContinueLockedTarget,
        decideRetarget: xyDecideRetarget,
    };

    window.nihilModules["xianxueyinhua"] = {
        character: character,
        skill: skills,
        translate: translates,
        title: title,
        sort: sort,
        aiHelpers: Object.freeze(aiHelpers),
    };
})();
