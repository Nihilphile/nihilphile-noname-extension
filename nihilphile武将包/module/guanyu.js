(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";

    function image(id, ext) {
        return "extension/" + EXT_NAME + "/image/character/" + id + "." + (ext || "png");
    }

    function guanyuClamp(num, min, max) {
        return Math.max(min, Math.min(max, num));
    }

    function guanyuSourceCard(card) {
        if (card && Array.isArray(card.cards) && card.cards.length) return card.cards[0];
        return card;
    }

    function guanyuMakeSha(card) {
        if (get.autoViewAs) return get.autoViewAs({ name: "sha" }, card ? [card] : []);
        return {
            name: "sha",
            cards: card ? [card] : [],
            suit: card ? get.suit(card) : undefined,
            number: card ? get.number(card) : undefined,
            color: card ? get.color(card) : undefined,
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
        const num = guanyuCardNumber(card, player);
        if (!num || !target) return false;
        return target.hp > Math.ceil(num / 3);
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

    function guanyuFutureAttackValue(card, player) {
        const num = guanyuCardNumber(card, player) || 13;
        let value = Math.max(0.4, (14 - num) / 3);
        if (num <= 3) value += 0.8;
        else if (num <= 6) value += 0.35;
        if (get.name(card, player) === "sha") value += 0.4;
        return value;
    }

    function guanyuDefenseValue(card, player) {
        let value = get.useful(card, player) + get.value(card, player) / 3;
        const name = get.name(card, player);
        if (name === "tao") value += player.hp <= 2 ? 6 : 3;
        else if (name === "shan") value += player.hp <= 2 ? 3.5 : 1.5;
        else if (name === "wuxie") value += 2;
        const subtype = get.subtype(card, false);
        if (get.position(card) === "e") value += 1;
        if ((subtype === "equip2" || subtype === "equip3") && player.hp <= 2) value += 2;
        return value;
    }

    function guanyuKeepValue(card, player) {
        return guanyuFutureAttackValue(card, player) * guanyuOffenseTendency(player) + guanyuDefenseValue(card, player) * guanyuDefenseTendency(player);
    }

    function guanyuWushengTargetScore(player, target, sourceCard) {
        if (!target || target === player || !target.isIn || !target.isIn()) return -Infinity;
        if (get.attitude(player, target) >= 0) return -Infinity;
        const sha = guanyuMakeSha(sourceCard);
        if (player.canUse && !player.canUse(sha, target)) return -Infinity;

        let score = get.effect(target, sha, player, player);
        const bonus = guanyuCanBonus(sourceCard, target, player);
        const damage = bonus ? 2 : 1;
        const threat = guanyuEnemyThreat(player, target);
        if (bonus) score += 1.6 + Math.min(1.2, target.hp * 0.25);
        if (target.hp <= damage) score += 4.2;
        else if (target.hp <= damage + 1) score += 1.5;
        score += Math.min(1.5, (threat - 1) * 0.45);
        if (target.countCards("h") > 0) score += 0.35;
        score -= Math.max(0, target.countCards("h") - 2) * 0.18;
        return score;
    }

    function guanyuBestWushengScore(player, sourceCard) {
        let best = -Infinity;
        game.filterPlayer(current => {
            best = Math.max(best, guanyuWushengTargetScore(player, current, sourceCard));
        });
        return best;
    }

    function guanyuWushengUseScore(player, card) {
        const best = guanyuBestWushengScore(player, card);
        if (best <= 0) return -guanyuKeepValue(card, player);
        return best * 2.2 - guanyuKeepValue(card, player);
    }

    function guanyuWushengCheck(card) {
        const player = _status.event && _status.event.player;
        if (!player) return 5 - get.value(card);
        if (_status.event.name === "chooseToRespond") {
            return 10 / Math.max(1, guanyuKeepValue(card, player));
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
        return get.order({ name: "sha" }) + 0.25 + guanyuClamp(best / 5, 0, 1.6);
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
        viewAs: { name: "sha" },
        viewAsFilter(player) {
            return player.countCards("hes", card => get.color(card, player) === "red") > 0;
        },
        prompt: "将一张红色牌当【杀】使用或打出",
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
        },
    },

    // ========== 断义 ==========
    nihil_duanyi: {
        audio: 2,
        trigger: { player: "useCardToPlayered" },
        direct: true,
        filter(event, player) {
            return event.card && event.card.name === "sha" && event.target && event.target.countCards("h") > 0;
        },
        async content(event, trigger, player) {
            const target = trigger.target;
            const hs = target.getCards("h");
            if (!hs.length) return event.finish();

            player.logSkill("nihil_duanyi", target);

            let card;
            if (get.attitude(player, target) > 0) {
                // 队友：明选一张展示
                const result = await player.choosePlayerCard(target, "h", 1, get.prompt("nihil_duanyi", target), "visible").forResult();
                if (!result.bool || !result.cards.length) return event.finish();
                card = result.cards[0];
            } else {
                // 敌方/未知：随机
                card = hs[Math.floor(Math.random() * hs.length)];
            }

            game.log(target, "被", player, "展示了", card);
            target.showCards([card]);

            const color = get.color(card, target);
            if (color === "red") {
                // 红：获得之
                await target.give([card], player);
                game.log(player, "获得了", card);
            } else {
                // 黑：扣置所有手牌 + 技能失效
                const allHs = target.getCards("h");
                if (allHs.length) {
                    const next = target.addToExpansion(allHs, "giveAuto", target);
                    next.gaintag.add("nihil_duanyi2");
                    await next;
                    game.log(target, "的手牌被", "#y扣置");
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
                game.log(player, "收回了扣置的牌");
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
            "你可将一张红色牌当【杀】使用或打出。你使用的红【杀】，对体力大于X的角色伤害+1。（X为此红【杀】点数/3，向上取整）",

        nihil_duanyi: "断义",
        nihil_duanyi_info:
            "当一名角色成为你【杀】的目标时，你可展示其一张手牌（随机展示），若此牌为黑色，则扣置其所有手牌且所有技能失效直至本回合结束；若为红色，你获得之。",
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
