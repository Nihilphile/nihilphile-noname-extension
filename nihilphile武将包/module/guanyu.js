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

    function guanyuClamp(num, min, max) {
        return Math.max(min, Math.min(max, num));
    }

    function guanyuSourceCard(card) {
        if (card && Array.isArray(card.cards) && card.cards.length) return card.cards[0];
        return card;
    }

    function guanyuMakeSha(card) {
        const x = card ? guanyuWushengX(card) : 1;
        if (get.autoViewAs) {
            const sha = get.autoViewAs({ name: "sha" }, card ? [card] : []);
            sha._rangeX = x;
            return sha;
        }
        return {
            name: "sha",
            cards: card ? [card] : [],
            suit: card ? get.suit(card) : undefined,
            number: card ? get.number(card) : undefined,
            color: card ? get.color(card) : undefined,
            _rangeX: x,
        };
    }

    function guanyuCardNumber(card, player) {
        const source = guanyuSourceCard(card);
        return get.number(source || card, player) || (source && source.number) || (card && card.number) || 0;
    }

    function guanyuIsRedSha(card, player) {
        if (!card || get.name(card, player) !== "sha") return false;
        if (get.color(card, player) === "red") return true;
        const source = guanyuSourceCard(card);
        return !!source && get.color(source, player) === "red";
    }

    function guanyuCanBonus(card, target, player) {
        if (!card || !target) return false;
        return target.hp > guanyuWushengX(card, player);
    }

    function guanyuEnemyThreat(player, target) {
        if (!target || get.attitude(player, target) >= 0) return 1;
        let threat = 1;
        if (get.threaten) threat = get.threaten(target, player, true) || 1;
        if (target.hp <= 1) threat += 0.7;
        else if (target.hp <= 2) threat += 0.35;
        return threat;
    }

    function guanyuOffenseTendency(player) {
        let tendency = player.hp >= 3 ? 0.95 : 0.75;
        if (player.needsToDiscard && player.needsToDiscard()) tendency += 0.25;
        game.filterPlayer(current => {
            if (current === player || get.attitude(player, current) >= 0) return;
            const threat = guanyuEnemyThreat(player, current);
            tendency = Math.max(tendency, 0.85 + Math.min(0.7, (threat - 1) * 0.28));
            if (current.hp <= 1) tendency = Math.max(tendency, 1.65);
            else if (current.hp <= 2) tendency = Math.max(tendency, 1.35);
        });
        return guanyuClamp(tendency, 0.65, 1.85);
    }

    function guanyuDefenseTendency(player) {
        let tendency = 0.75;
        if (player.hp <= 1) tendency = 2.1;
        else if (player.hp === 2) tendency = 1.55;
        else if (player.hp === 3) tendency = 1.05;
        if (player.countCards("h") <= Math.max(1, player.hp)) tendency += 0.25;
        const pressure = game.countPlayer(current => {
            if (current === player || get.attitude(player, current) >= 0) return false;
            return current.canUse && current.canUse({ name: "sha", isCard: true }, player);
        });
        tendency += Math.min(0.45, pressure * 0.15);
        return guanyuClamp(tendency, 0.7, 2.6);
    }

    function guanyuWushengX(card, player) {
        const num = guanyuCardNumber(card, player) || 13;
        return guanyuClamp(Math.ceil(num / 3), 1, 5);
    }

    function guanyuWushengBaseKeepValue(card, player) {
        const x = guanyuWushengX(card, player);
        if (x === 1) return 5;
        if (x === 2) return 4;
        if (x === 3) return 3;
        if (x === 4) return 2;
        return 1;
    }

    function guanyuWushengDistanceBonus(card, player) {
        const x = guanyuWushengX(card, player);
        const enemies = game.filterPlayer(current => current !== player && get.attitude(player, current) < 0 && current.isIn && current.isIn());
        if (!enemies.length) return 0;
        let bonus = 0;
        const step = 1.3;
        if (x >= 2 && !enemies.some(enemy => get.distance(player, enemy) <= 1)) bonus += step;
        if (x >= 3 && !enemies.some(enemy => get.distance(player, enemy) <= 2)) bonus += step;
        if (x >= 4 && !enemies.some(enemy => get.distance(player, enemy) <= 3)) bonus += step;
        if (x >= 5 && !enemies.some(enemy => get.distance(player, enemy) <= 4)) bonus += step;
        return bonus;
    }

    function guanyuWushengFutureValue(card, player) {
        if (!card || get.color(card, player) !== "red") return 0;
        return guanyuWushengBaseKeepValue(card, player) + guanyuWushengDistanceBonus(card, player);
    }

    function guanyuCardDefenseValue(card, player, base) {
        let value = typeof base === "number" ? Math.max(0, base) : 0;
        const name = get.name(card, player);
        if (name === "tao") value += player.hp <= 2 ? 8 : 4.5;
        else if (name === "jiu") value += player.hp <= 2 ? 4.5 : 1.2;
        else if (name === "shan") value += player.hp <= 2 ? 4.5 : 1.8;
        else if (name === "wuxie") value += 3.2;
        else if (name === "taoyuan") value += player.hp <= 2 ? 2.2 : 0.6;
        else if (name === "wugu") value += 0.8;
        else if (name === "sha") value += 0.4;
        if (get.color(card, player) === "red" && player.hp <= 2 && ["tao", "jiu", "shan", "wuxie"].includes(name)) value += 1.2;
        const subtype = get.subtype(card, false);
        if (get.position(card) === "e") value += 1.2;
        if (subtype === "equip2") value += player.hp <= 2 ? 2.8 : 1.2;
        if (subtype === "equip3") value += player.hp <= 2 ? 1.8 : 0.8;
        return value;
    }

    function guanyuWushengKeepValue(card, player, base) {
        const offense = guanyuOffenseTendency(player);
        const defense = guanyuDefenseTendency(player);
        return guanyuWushengFutureValue(card, player) * offense + guanyuCardDefenseValue(card, player, base) * defense;
    }

    function guanyuWushengUseCost(card, player) {
        return guanyuWushengKeepValue(card, player, 0);
    }

    function guanyuCanReachByWusheng(card, player, target) {
        if (!card || !player || !target) return false;
        return get.distance(player, target) <= guanyuWushengX(card, player);
    }

    function guanyuWushengTargetScore(player, target, sourceCard) {
        if (!target || target === player || !target.isIn || !target.isIn()) return -Infinity;
        if (get.attitude(player, target) >= 0) return -Infinity;
        const sha = guanyuMakeSha(sourceCard);
        sha._rangeX = guanyuWushengX(sourceCard, player);
        if (!guanyuCanReachByWusheng(sourceCard, player, target)) return -Infinity;
        if (lib.filter.targetEnabled(sha, player, target) === false) return -Infinity;

        let score = get.effect(target, sha, player, player);
        const bonus = guanyuCanBonus(sourceCard, target, player);
        const damage = bonus ? 2 : 1;
        const threat = guanyuEnemyThreat(player, target);
        const kill = target.hp <= damage;
        if (kill) score += 12 + Math.min(4, threat);
        if (bonus) score += 5.2 + Math.min(1.6, target.hp * 0.28);
        if (!kill && target.hp <= damage + 1) score += 1.4;
        score += Math.min(1.5, (threat - 1) * 0.45);
        if (target.countCards("h") > 0) score += 0.35;
        score -= Math.max(0, target.countCards("h") - 2) * 0.18;
        return score;
    }

    function guanyuWushengActionPriority(player, target, sourceCard) {
        if (!target || target === player || get.attitude(player, target) >= 0) return 0;
        if (!guanyuCanReachByWusheng(sourceCard, player, target)) return 0;
        const sha = guanyuMakeSha(sourceCard);
        sha._rangeX = guanyuWushengX(sourceCard, player);
        if (lib.filter.targetEnabled(sha, player, target) === false) return 0;
        const damage = guanyuCanBonus(sourceCard, target, player) ? 2 : 1;
        if (target.hp <= damage) return 3;
        if (damage > 1) return 2;
        return 1;
    }

    function guanyuBestWushengAction(player, sourceCard) {
        let best = null;
        game.filterPlayer(current => {
            const priority = guanyuWushengActionPriority(player, current, sourceCard);
            if (!priority) return;
            const score = guanyuWushengTargetScore(player, current, sourceCard);
            if (score <= 0 && priority < 3) return;
            if (!best || priority > best.priority || priority === best.priority && score > best.score) {
                best = { target: current, priority, score };
            }
        });
        return best;
    }

    function guanyuWushengUseScore(player, card) {
        const action = guanyuBestWushengAction(player, card);
        const cost = guanyuWushengUseCost(card, player);
        if (!action) return -cost;
        const base = action.priority === 3 ? 100 : action.priority === 2 ? 60 : 20;
        return base + action.score * 2.2 - cost;
    }

    function guanyuWushengCheck(card) {
        const player = _status.event && _status.event.player;
        if (!player) return 0;
        if (_status.event.name === "chooseToRespond") {
            return 10 / Math.max(1, guanyuWushengUseCost(card, player));
        }
        return guanyuWushengUseScore(player, card);
    }

    function guanyuWushengOrder(item, player) {
        if (!player || !_status.event || _status.event.type !== "phase") return 4;
        let best = 0;
        player.getCards("hes").forEach(card => {
            if (get.color(card, player) === "red") best = Math.max(best, guanyuWushengUseScore(player, card));
        });
        if (best <= 0) return 0;
        if (best >= 90) return get.order({ name: "sha" }) + 2.2;
        if (best >= 50) return get.order({ name: "sha" }) + 1.2;
        return get.order({ name: "sha" }) + 0.2 + guanyuClamp(best / 30, 0, 0.8);
    }

    function guanyuWushengEffect(card, player, target) {
        if (!guanyuIsRedSha(card, player) || !target || get.attitude(player, target) >= 0) return;
        let mult = 1.08;
        if (guanyuCanBonus(card, target, player)) mult += 0.32;
        if (target.hp <= (guanyuCanBonus(card, target, player) ? 2 : 1)) mult += 0.22;
        if (target.countCards("h") <= 2) mult += 0.12;
        else if (target.countCards("h") >= 5) mult -= 0.08;
        mult += Math.min(0.18, (guanyuEnemyThreat(player, target) - 1) * 0.06);
        return [1, 0, guanyuClamp(mult, 0.95, 1.75), 0];
    }

    // ============================================================
    //  关羽 — 仁锋断恶
    // ============================================================

    var character = {
        nihil_guanyu: {
            sex: "male",
            group: "shu",
            hp: 4,
            maxHp: 4,
            skills: ["nihil_wusheng", "nihil_wusheng_damage", "nihil_duanyi"],
            img: image("nihil_guanyu"),
        },
    };

    var skills = {
    // ========== 武圣 ==========
    nihil_wusheng: {
        audio: 2,
        enable: ["chooseToRespond", "chooseToUse"],
        filterCard(card, player) {
            return get.color(card, player) === "red";
        },
        position: "hes",
        viewAs(cards, player) {
            if (cards.length !== 1) return null;
            var num = get.number(cards[0], player);
            var X = Math.ceil(num / 3);
            return {
                name: "sha",
                cards: cards,
                _rangeX: X,
            };
        },
        viewAsFilter(player) {
            return player.countCards("hes", card => get.color(card, player) === "red") > 0;
        },
        prompt: "将一张红色牌当【杀】使用或打出",
        mod: {
            targetInRange(card, player, target) {
                if (get.name(card, player) === "sha" && typeof card._rangeX === "number") {
                    var dist = get.distance(player, target);
                    return dist <= card._rangeX;
                }
            },
            aiValue(player, card, num) {
                if (get.position(card) !== "h" && get.position(card) !== "s") return;
                if (get.color(card, player) !== "red") return;
                return num + guanyuWushengKeepValue(card, player, num) * 0.42;
            },
            aiUseful(player, card, num) {
                if (get.position(card) !== "h" && get.position(card) !== "s") return;
                if (get.color(card, player) !== "red") return;
                return num + guanyuWushengKeepValue(card, player, num) * 0.36;
            },
        },
        check: guanyuWushengCheck,
        ai: {
            order: guanyuWushengOrder,
            respondSha: true,
            skillTagFilter(player) {
                return player.countCards("hes", card => get.color(card, player) === "red") > 0;
            },
            effect: {
                player_use: guanyuWushengEffect,
                player: guanyuWushengEffect,
            },
            result: {
                player(player, target) {
                    return target && get.attitude(player, target) < 0 ? 1 : 0;
                },
            },
        },
        group: "nihil_wusheng_damage",
    },

    // 武圣·伤害+1（显式注册在 skills 数组中）
    nihil_wusheng_damage: {
        charlotte: true,
        trigger: { source: "damageBegin1" },
        forced: true,
        popup: false,
        filter(event, player) {
            if (!event.card || event.card.name !== "sha") return false;
            if (get.color(event.card) !== "red") return false;
            const num = get.number(event.card) || event.card.number || 0;
            if (!num) return false;
            if (!event.player) return false;
            const X = Math.ceil(num / 3);
            return event.player.hp > X;
        },
        async content(event, trigger, player) {
            trigger.num++;
            semanticLog("#g武圣", "：", player, "对", trigger.player, "的伤害+1");
        },
    },

    // ========== 断义 ==========
    nihil_duanyi: {
        audio: 2,
        trigger: { player: "useCardToPlayered" },
        filter(event, player) {
            return event.card && event.card.name === "sha" && event.target && event.target.countCards("h") > 0;
        },
        async content(event, trigger, player) {
            const target = trigger.target;
            const hs = target.getCards("h");
            if (!hs.length) return event.finish();

            let card;
            if (player.isAI && player.isAI()) {
                // AI 逻辑
                if (get.attitude(player, target) > 0) return event.finish(); // 队友不发动
                card = hs[Math.floor(Math.random() * hs.length)];            // 敌人随机盲选
            } else {
                // 人类逻辑
                const visible = get.attitude(player, target) > 0;
                const result = await player.choosePlayerCard(target, "h", 1, get.prompt("nihil_duanyi", target), visible).forResult();
                if (!result.bool || !result.cards.length) return event.finish();
                card = result.cards[0];
            }

            player.logSkill("nihil_duanyi", target);

            target.showCards([card]);

            const color = get.color(card, target);
            if (color === "red") {
                await target.give([card], player);
            } else {
                const allHs = target.getCards("h");
                if (allHs.length) {
                    const next = target.addToExpansion(allHs, "giveAuto", target);
                    next.gaintag.add("nihil_duanyi2");
                    await next;
                    semanticLog(
                        "#g断义",
                        "：",
                        target,
                        "的",
                        get.cnNumber(allHs.length),
                        "张手牌被扣置，技能失效至本回合结束",
                    );
                }
                target.addTempSkill("baiban");
                target.addSkill("nihil_duanyi2");
            }
        },
        group: "nihil_duanyi2",
    },

    // 断义·回合结束恢复（charlotte 子技能）
    nihil_duanyi2: {
        trigger: { global: "phaseEnd" },
        forced: true,
        popup: false,
        charlotte: true,
        sourceSkill: "nihil_duanyi",
        filter(event, player) {
            return player.getExpansions("nihil_duanyi2").length > 0;
        },
        async content(event, trigger, player) {
            const cards = player.getExpansions("nihil_duanyi2");
            if (cards.length) {
                await player.gain(cards, "draw");
                semanticLog(player, "收回了被【断义】扣置的", get.cnNumber(cards.length), "张牌");
            }
            player.removeSkill("nihil_duanyi2");
        },
        intro: {
            markcount: "expansion",
            mark(dialog, storage, player) {
                const cards = player.getExpansions("nihil_duanyi2");
                if (player.isUnderControl(true)) {
                    dialog.addAuto(cards);
                } else {
                    return "共有" + get.cnNumber(cards.length) + "张牌被扣置";
                }
            },
        },
    },
    };

    var title = {
        nihil_guanyu: "#r仁锋断恶",
    };

    var translates = {
        nihil_guanyu: "关羽",
        nihil_guanyu_prefix: "仁锋断恶",

        nihil_wusheng: "武圣",
        nihil_wusheng_info:
            "你可将一张红色牌当【杀】使用或打出，且此【杀】的距离为X。你使用的红【杀】，对体力大于X的角色伤害+1。（X为此红【杀】点数/3，向上取整）",

        nihil_duanyi: "断义",
        nihil_duanyi_info:
            "当一名角色成为你【杀】的目标时，你可选择其一张手牌展示，若此牌为黑色，则扣置其所有手牌且所有技能失效直至本回合结束；若为红色，你获得之。（对队友可见展示，对敌方盲选）",
    };

    var sort = ["nihil_guanyu"];

    window.nihilModules["guanyu"] = {
        character: character,
        skill: skills,
        translate: translates,
        title: title,
        sort: sort,
    };
})();
