(function () {
    window.nihilModules = window.nihilModules || {};

    function clamp(num, min, max) {
        return Math.max(min, Math.min(max, num));
    }

    function isHarmfulJudge(card) {
        var name = card && (card.viewAs || card.name);
        return name === "lebu" || name === "bingliang";
    }

    function isRiskJudge(card) {
        var name = card && (card.viewAs || card.name);
        return name === "shandian" || name === "fulei";
    }

    function cardSubtypes(card) {
        return get.subtypes(card) || [];
    }

    function cardPosition(card) {
        return get.position(card) || "";
    }

    function distanceDelta(card, key) {
        var info = get.info(card, false);
        if (!info || !info.distance || typeof info.distance[key] !== "number") return 0;
        return info.distance[key];
    }

    function getEquipsWithout(player, removed) {
        var equips = [];
        if (player.getVCards) equips = player.getVCards("e") || [];
        else equips = player.getCards("e") || [];
        return equips.filter(function (card) {
            if (card === removed) return false;
            if (card.cards && card.cards.includes && card.cards.includes(removed)) return false;
            return true;
        });
    }

    function getAttackRangeWithout(player, removed) {
        var range = 1;
        try {
            range = player.getEquipRange(getEquipsWithout(player, removed));
        } catch (e) {
            range = 1;
        }
        range = game.checkMod(player, range, "attackRange", player);
        range = game.checkMod(player, range, "attackRangeFinal", player);
        return Math.max(1, range || 1);
    }

    function canAttackWithoutEquip(source, target, removed) {
        if (!source || !target || !removed) return false;
        var sub = cardSubtypes(removed);
        var dist = get.distance(source, target, "attack");
        var range = source.getAttackRange();
        if (sub.includes("equip4")) {
            dist -= distanceDelta(removed, "globalFrom");
        }
        if (sub.includes("equip1")) {
            range = getAttackRangeWithout(source, removed);
        }
        return dist <= range;
    }

    function plusHorseUnlocksAttack(player, target, card) {
        if (!player || !target || player.inRange(target)) return false;
        var sub = cardSubtypes(card);
        if (!sub.includes("equip3")) return false;
        var dist = get.distance(player, target, "attack");
        var without = dist - distanceDelta(card, "globalTo");
        return without <= player.getAttackRange();
    }

    function removesAttackThreat(player, target, card) {
        if (!player || !target || !card || !target.inRange(player)) return false;
        var sub = cardSubtypes(card);
        if (!sub.includes("equip1") && !sub.includes("equip4")) return false;
        return !canAttackWithoutEquip(target, player, card);
    }

    function isStrongWeapon(card, player, target) {
        var name = get.name(card);
        if (["zhuge", "qinglong", "guanshi"].includes(name)) return true;
        if (name === "cixiong" && player && target && player.sex !== target.sex) return true;
        if (name === "qilin" && target && target.getEquip && target.getEquip("equip4")) return true;
        if (name === "yushan" && player && player.getEquip && player.getEquip("tengjia")) return true;
        return false;
    }

    function offenseBias(player) {
        var bias = 0.55;
        game.countPlayer(function (target) {
            if (get.attitude(player, target) >= 0) return;
            if (target.hp <= 1) bias = Math.max(bias, 0.9);
            else if (target.hp <= 2 && target.countCards("h") <= 2) bias = Math.max(bias, 0.75);
        });
        return bias;
    }

    function defenseBias(player) {
        if (!player) return 0.55;
        if (player.hp <= 1) return 0.95;
        if (player.hp === 2) return 0.75;
        return 0.55;
    }

    function canAffect(card, player, target, isShunshou) {
        if (!card || !player || !target) return false;
        if (isShunshou) return lib.filter.canBeGained(card, player, target);
        return lib.filter.canBeDiscarded(card, player, target);
    }

    function safeCardValue(card, player, target, button) {
        if (!card) return 0;
        var owner = get.owner(card) || target || player;
        var pos = cardPosition(card);
        if (pos === "h") {
            if (button && button.classList && button.classList.contains("infohidden")) {
                var count = owner && owner.countCards ? owner.countCards("h") : 4;
                if (count <= 1) return 2;
                if (count === 2) return 1.6;
                if (count === 3) return 1;
                if (count === 4) return 0.8;
                if (count === 5) return 0.6;
                return 0.4;
            }
            var name = get.name(card, owner);
            if (name === "tao") return 8;
            if (name === "wuzhong") return 7;
            if (name === "wuxie") return 6;
            if (name === "shunshou" || name === "guohe") return 5.5;
            if (name === "jiu") return 5;
            if (name === "shan") return 4;
            if (name === "sha") return 3.5;
            var type = get.type(card, null, owner);
            if (type === "equip") return 4.5;
            if (type === "trick" || type === "delay") return 5;
            return 3;
        }
        if (button) {
            try {
                return get.buttonValue(button);
            } catch (e) {}
        }
        if (pos === "j") {
            if (isHarmfulJudge(card)) return 8;
            if (isRiskJudge(card)) return 4;
            return 2;
        }
        try {
            return get.value(card, owner);
        } catch (e) {
            return 3;
        }
    }

    function handPressureScore(card, player, target, isShunshou) {
        var count = target.countCards("h");
        if (!count) return 0;
        var score = 0;
        if (count <= 2) score = 55;
        else if (count <= 4) score = 45;
        else if (count <= 6) score = 35;
        else score = 15;
        if (card && cardPosition(card) === "h" && player.hasSkillTag && player.hasSkillTag("viewHandcard", null, target, true)) {
            score += clamp(safeCardValue(card, player, target) / 2, -8, 10);
        }
        return score + (isShunshou ? 6 : 0);
    }

    function scoreFriendCard(card, player, target, isShunshou) {
        var pos = cardPosition(card);
        if (pos === "j") {
            if (isHarmfulJudge(card)) return 105;
            if (isRiskJudge(card)) return 72;
            return 12;
        }
        if (pos === "e") {
            if (get.name(card) === "baiyin" && target.isDamaged && target.isDamaged()) return isShunshou ? -5 : 24;
            if (safeCardValue(card, player, target) <= 0) return 45;
        }
        return -Math.max(1, safeCardValue(card, player, target));
    }

    function scoreEnemyEquip(card, player, target, isShunshou, baseVal) {
        var sub = cardSubtypes(card);
        var add = isShunshou ? 0 : 0;
        var off = offenseBias(player);
        var def = defenseBias(player);

        if (sub.includes("equip3") && plusHorseUnlocksAttack(player, target, card)) {
            return 96 + off * 18 + (isShunshou ? 8 : 0) + baseVal * 0.02;
        }
        if ((sub.includes("equip1") || sub.includes("equip4")) && removesAttackThreat(player, target, card)) {
            return 94 + def * 18 + (isShunshou ? 5 : 0) + baseVal * 0.02;
        }
        if (sub.includes("equip2")) {
            if (get.name(card) === "baiyin" && target.isDamaged && target.isDamaged()) {
                return 18 + (isShunshou ? 5 : 0);
            }
            return 84 + off * 8 + (isShunshou ? 5 : 0) + baseVal * 0.02;
        }
        if (sub.includes("equip1")) {
            add = isStrongWeapon(card, player, target) ? 18 : 6;
            return 58 + add + def * 6 + (isShunshou ? 6 : 0) + baseVal * 0.02;
        }
        if (sub.includes("equip3")) return 62 + off * 10 + (isShunshou ? 6 : 0) + baseVal * 0.02;
        if (sub.includes("equip4")) return 56 + def * 10 + (isShunshou ? 5 : 0) + baseVal * 0.02;
        if (sub.some(function (s) { return /^equip/.test(s); })) {
            return 48 + (isShunshou ? 5 : 0) + baseVal * 0.02;
        }
        return 0;
    }

    function cardScore(card, player, target, isShunshou, button, assumeLegal) {
        if (!assumeLegal && !canAffect(card, player, target, isShunshou)) return 0;
        var att = get.attitude(player, target);
        var pos = cardPosition(card);
        var baseVal = safeCardValue(card, player, target, button);

        if (att > 0) return scoreFriendCard(card, player, target, isShunshou);
        if (att === 0) return Math.max(0, baseVal);

        if (pos === "j") {
            if (isHarmfulJudge(card)) return 0;
            if (isRiskJudge(card)) return 28;
            return 8;
        }
        if (pos === "e") return scoreEnemyEquip(card, player, target, isShunshou, baseVal);
        if (pos === "h") return handPressureScore(card, player, target, isShunshou);
        return Math.max(0, baseVal);
    }

    function getActionCards(player, target, isShunshou, positions) {
        var cards = [];
        var getter = isShunshou ? "getGainableCards" : "getDiscardableCards";
        for (var i = 0; i < positions.length; i++) {
            var pos = positions[i];
            if (target[getter]) cards.addArray(target[getter](player, pos));
        }
        return cards;
    }

    function positionsForCard(card) {
        var position = card && card.position;
        if (typeof position === "string") return position;
        return get.is.single() ? "he" : "hej";
    }

    function bestTargetScore(player, target, isShunshou, sourceCard) {
        if (!player || !target || player === target) return 0;
        var positions = positionsForCard(sourceCard);
        var cards = getActionCards(player, target, isShunshou, positions);
        var best = 0;
        for (var i = 0; i < cards.length; i++) {
            best = Math.max(best, cardScore(cards[i], player, target, isShunshou, null, true));
        }
        return best;
    }

    function bestAreaScore(player, target, isShunshou, positions) {
        var cards = getActionCards(player, target, isShunshou, positions);
        var best = 0;
        for (var i = 0; i < cards.length; i++) {
            best = Math.max(best, cardScore(cards[i], player, target, isShunshou, null, true));
        }
        return best;
    }

    function targetResult(player, target, isShunshou, sourceCard) {
        if (!targetResult._depth) targetResult._depth = 0;
        if (targetResult._depth > 3) return 0;
        targetResult._depth++;
        try {
            var score = bestTargetScore(player, target, isShunshou, sourceCard);
            if (score <= 0) return 0;
            if (get.attitude(player, target) > 0) return score / 35;
            return -score / 35;
        } finally {
            targetResult._depth--;
        }
    }

    function buttonAI(button, isShunshou) {
        var event = _status.event;
        var player = event.player;
        var target = event.target || (button && button.link && get.owner(button.link));
        var card = button && button.link;
        if (!card || !target) return 0;
        return cardScore(card, player, target, isShunshou, button);
    }

    window.nihilAiCards = {
        bestAreaScore: bestAreaScore,
    };

    function installCardAI(currentLib) {
        if (!currentLib.card) return;
        if (currentLib.card.guohe && currentLib.card.guohe.ai) {
            currentLib.card.guohe.content = function () {
                "step 0";
                if (get.is.single()) {
                    var hasHand = target.countDiscardableCards(player, "h");
                    var hasEquip = target.countDiscardableCards(player, "e");
                    if (hasHand && hasEquip) {
                        player
                            .chooseControl("手牌区", "装备区")
                            .set("ai", function () {
                                var handScore = window.nihilAiCards.bestAreaScore(player, target, false, "h");
                                var equipScore = window.nihilAiCards.bestAreaScore(player, target, false, "e");
                                return equipScore > handScore ? 1 : 0;
                            })
                            .set("prompt", "弃置" + get.translation(target) + "装备区的一张牌，或观看其手牌并弃置其中的一张牌。");
                    } else {
                        event._result = { control: hasHand ? "手牌区" : "装备区" };
                    }
                } else {
                    event._result = { control: "所有区域" };
                }
                "step 1";
                var pos;
                var vis = "visible";
                if (result.control === "手牌区") {
                    pos = "h";
                } else if (result.control === "装备区") {
                    pos = "e";
                } else {
                    pos = "hej";
                    vis = undefined;
                }
                if (target.countDiscardableCards(player, pos)) {
                    player.discardPlayerCard(pos, target, true, vis).set("target", target).set("complexSelect", false).set("ai", lib.card.guohe.ai.button);
                }
            };
            currentLib.card.guohe.ai.button = function (button) {
                return buttonAI(button, false);
            };
            currentLib.card.guohe.ai.result = currentLib.card.guohe.ai.result || {};
            currentLib.card.guohe.ai.result.target = function (player, target, card) {
                return targetResult(player, target, false, card);
            };
        }
        if (currentLib.card.shunshou && currentLib.card.shunshou.ai) {
            currentLib.card.shunshou.ai.button = function (button) {
                return buttonAI(button, true);
            };
            currentLib.card.shunshou.ai.result = currentLib.card.shunshou.ai.result || {};
            currentLib.card.shunshou.ai.result.target = function (player, target, card) {
                return targetResult(player, target, true, card);
            };
            currentLib.card.shunshou.ai.result.player = function (player, target, card) {
                return Math.max(0, bestTargetScore(player, target, true, card) / 45);
            };
        }
        if (currentLib.card.guohe_copy && currentLib.card.guohe_copy.ai) {
            currentLib.card.guohe_copy.ai.result = currentLib.card.guohe_copy.ai.result || {};
            currentLib.card.guohe_copy.ai.result.target = function (player, target, card) {
                return targetResult(player, target, false, card);
            };
        }
        if (currentLib.card.guohe_copy2 && currentLib.card.guohe_copy2.ai) {
            currentLib.card.guohe_copy2.ai.result = currentLib.card.guohe_copy2.ai.result || {};
            currentLib.card.guohe_copy2.ai.result.target = function (player, target, card) {
                return targetResult(player, target, false, card || { position: "he" });
            };
        }
        if (currentLib.card.shunshou_copy && currentLib.card.shunshou_copy.ai) {
            currentLib.card.shunshou_copy.ai.result = currentLib.card.shunshou_copy.ai.result || {};
            currentLib.card.shunshou_copy.ai.result.target = function (player, target, card) {
                return targetResult(player, target, true, card);
            };
            currentLib.card.shunshou_copy.ai.result.player = function (player, target, card) {
                return Math.max(0, bestTargetScore(player, target, true, card) / 45);
            };
        }
        if (currentLib.card.shunshou_copy2 && currentLib.card.shunshou_copy2.ai) {
            currentLib.card.shunshou_copy2.ai.result = currentLib.card.shunshou_copy2.ai.result || {};
            currentLib.card.shunshou_copy2.ai.result.target = function (player, target, card) {
                return targetResult(player, target, true, card || { position: "he" });
            };
            currentLib.card.shunshou_copy2.ai.result.player = function (player, target, card) {
                return Math.max(0, bestTargetScore(player, target, true, card || { position: "he" }) / 45);
            };
        }
    }

    window.nihilModules["ai_cards"] = {
        init: function (currentLib) {
            currentLib.arenaReady = currentLib.arenaReady || [];
            currentLib.arenaReady.push(function () {
                installCardAI(currentLib);
            });
        },
    };
})();
