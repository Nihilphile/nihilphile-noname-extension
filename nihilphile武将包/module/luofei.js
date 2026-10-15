(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";
    var BLOOD_MARK = "nihil_lianxi";
    var STATE_SHENG = "nihil_liusheng_state_sheng";
    var STATE_XI = "nihil_liusheng_state_xi";

    function image(id, ext) {
        return (
            "extension/" +
            EXT_NAME +
            "/image/character/" +
            id +
            "." +
            (ext || "png")
        );
    }

    function semanticLog() {
        if (typeof game !== "undefined" && game && typeof game.log === "function") {
            game.log.apply(game, arguments);
        }
    }

    function isLoseHpChange(event) {
        if (
            !event ||
            event.num >= 0 ||
            typeof event.getParent !== "function"
        ) {
            return false;
        }
        // changeHp 是 loseHp 的直接子事件。第二个参数 true 令未找到时
        // 返回 undefined，而不是引擎默认的空对象，避免把普通伤害误判为流失体力。
        var parent = event.getParent(1, true);
        return !!parent && parent.name === "loseHp";
    }

    function syncLifeState(player) {
        if (!player) return;
        if (typeof player.unmarkSkill === "function") {
            player.unmarkSkill(STATE_SHENG);
            player.unmarkSkill(STATE_XI);
        }
        var count = player.countMark(BLOOD_MARK);
        if (count <= 0 || typeof player.markSkill !== "function") return;

        // 流生发动时会先移去1血：当前为奇数则剩余偶数（生），
        // 当前为偶数则剩余奇数（息）。该标记只作结果预告，不参与结算。
        player.markSkill(count % 2 === 1 ? STATE_SHENG : STATE_XI);
    }

    function addBlood(player, num) {
        num = Math.max(0, Number(num) || 0);
        if (!num) return;
        player.addMark(BLOOD_MARK, num, false);
        syncLifeState(player);
        game.log(player, "获得了", get.cnNumber(num), "枚", "#g血");
    }

    function removeBlood(player, num) {
        player.removeMark(BLOOD_MARK, num, false);
        syncLifeState(player);
        semanticLog(player, "移去了", get.cnNumber(num), "枚", "#g血");
    }

    // ============================================================
    //  落绯 AI：纯决策层
    //  这些函数只读取传入快照并返回建议，不修改任何游戏对象。
    // ============================================================

    function luofeiAiAction(action, reason, extra) {
        var result = { action: action, reason: reason || "" };
        if (extra) {
            Object.keys(extra).forEach(function (key) {
                result[key] = extra[key];
            });
        }
        return result;
    }

    function luofeiIsVulnerableState(handCount, noShanRecord) {
        return Math.max(0, Number(handCount) || 0) <= 1 || !!noShanRecord;
    }

    function luofeiIsOverKillState(targetHp, effectiveSlash, vulnerable) {
        targetHp = Math.max(0, Number(targetHp) || 0);
        effectiveSlash = Math.max(0, Number(effectiveSlash) || 0);
        if (!targetHp || !effectiveSlash) return false;
        return (
            effectiveSlash > targetHp ||
            (effectiveSlash === targetHp && !!vulnerable)
        );
    }

    function luofeiDecideYinchaoSpend(state) {
        state = state || {};
        var blood = Math.max(0, Math.floor(Number(state.blood) || 0));
        if (!blood) return luofeiAiAction("HOLD", "NO_BLOOD", { spend: 0 });
        if (!state.hasProfitableTarget) {
            return luofeiAiAction("HOLD", "NO_PROFITABLE_TARGET", { spend: 0 });
        }
        if (blood === 1 && !state.hasExecutionTarget) {
            return luofeiAiAction("HOLD", "PRESERVE_LAST_BLOOD", { spend: 0 });
        }
        if (blood === 1) {
            return luofeiAiAction("SPEND", "EXECUTION_GAMBLE", { spend: 1 });
        }
        return luofeiAiAction("SPEND", "PRESERVE_ONE_FOR_LIUSHENG", {
            spend: blood - 1,
        });
    }

    function luofeiDecideLiusheng(state) {
        state = state || {};
        var blood = Math.max(0, Math.floor(Number(state.blood) || 0));
        if (!blood || state.targetInGame === false) {
            return luofeiAiAction("HOLD", "UNAVAILABLE");
        }
        var sheng = blood % 2 === 1;
        // 自身目标不走敌我态度。混乱或其他态度修正可能令
        // get.attitude(player, player) 变成负数，不能因此在“息”时自杀。
        if (state.selfTarget) {
            if (sheng && state.targetDamaged) {
                return luofeiAiAction("USE", "SHENG_HELP_SELF", { mode: "SHENG" });
            }
            return luofeiAiAction("HOLD", sheng ? "SHENG_SELF_FULL" : "XI_SELF_HARM", {
                mode: sheng ? "SHENG" : "XI",
            });
        }
        var attitude = Number(state.attitude) || 0;
        if (sheng) {
            if (attitude > 0 && state.targetDamaged) {
                return luofeiAiAction("USE", "SHENG_HELP_ALLY", { mode: "SHENG" });
            }
            return luofeiAiAction("HOLD", "SHENG_BAD_TARGET", { mode: "SHENG" });
        }
        if (attitude < 0) {
            return luofeiAiAction("USE", "XI_PRESS_ENEMY", { mode: "XI" });
        }
        return luofeiAiAction("HOLD", "XI_BAD_TARGET", { mode: "XI" });
    }

    function luofeiScoreYinchaoTarget(state) {
        state = state || {};
        var base = Number(state.baseEffect) || 0;
        // 脆弱/斩杀只在原本正收益的合法目标之间排序，不能翻转收益正负。
        if (base <= 0) return base;
        var score = base;
        if (state.overKill) score += 24;
        if ((Number(state.hp) || 0) <= 1) score += 12;
        if (state.vulnerable) score += 4;
        return score;
    }

    function luofeiDefensiveKeepScore(state) {
        state = state || {};
        var name = state.name || "";
        var subtype = state.subtype || "";
        var hp = Math.max(0, Number(state.hp) || 0);
        var sameNameIndex = Math.max(
            0,
            Math.floor(Number(state.sameNameIndex) || 0),
        );
        var base = Number(state.baseUseful);
        if (!isFinite(base)) base = -1;
        var score;
        var decay = 0.5;

        if (name === "tao") {
            score = 10;
            decay = 0.15;
        } else if (name === "jiu") {
            score = hp <= 1 ? 9.8 : 8.8;
            decay = 0.8;
        } else if (name === "shan") {
            score = 9.6;
            decay = 0.55;
        } else if (name === "wuxie") {
            score = 9.2;
            decay = 0.5;
        } else if (subtype === "equip2") {
            score = 8.6;
            decay = 0.6;
        } else if (subtype === "equip3") {
            score = 8.2;
            decay = 0.65;
        } else {
            return null;
        }

        return Math.max(base, score - Math.min(sameNameIndex, 4) * decay);
    }

    // ============================================================
    //  落绯 AI：只读运行时适配层
    // ============================================================

    function luofeiGamePlayers() {
        if (typeof game.filterPlayer === "function") {
            return game.filterPlayer(function () {
                return true;
            });
        }
        return game.players ? game.players.slice(0) : [];
    }

    function luofeiIsVulnerable(target) {
        if (!target || typeof target.countCards !== "function") return false;
        return luofeiIsVulnerableState(
            target.countCards("h"),
            target._nihilLuofeiNoShanVulnerable,
        );
    }

    function luofeiGainedHandCards(event, target) {
        if (
            !event ||
            !target ||
            typeof event.getg !== "function" ||
            typeof target.getCards !== "function"
        ) {
            return false;
        }
        var gained = event.getg(target) || [];
        if (!gained.length) return false;
        var hand = target.getCards("h");
        return gained.some(function (card) {
            return hand.indexOf(card) !== -1;
        });
    }

    function luofeiSlashEffect(player, target, card) {
        try {
            if (typeof get.effect_use === "function") {
                return Number(get.effect_use(target, card, player, player)) || 0;
            }
            if (typeof get.effect === "function") {
                return Number(get.effect(target, card, player, player)) || 0;
            }
        } catch (error) {}
        return get.attitude(player, target) < 0 ? 1 : 0;
    }

    function luofeiLegalSlashEnemies(player, card) {
        return luofeiGamePlayers().filter(function (target) {
            if (!target || target === player || get.attitude(player, target) >= 0) {
                return false;
            }
            if (typeof target.isIn === "function" && !target.isIn()) return false;
            if (typeof player.canUse !== "function") return true;
            // 正常距离，但不受本阶段【杀】次数限制。
            return player.canUse(card, target, null, false);
        });
    }

    function luofeiYinchaoPlanForPlayer(player) {
        var card = { name: "sha", isCard: true };
        var enemies = luofeiLegalSlashEnemies(player, card);
        var profitable = enemies.filter(function (target) {
            return luofeiSlashEffect(player, target, card) > 0;
        });
        return luofeiDecideYinchaoSpend({
            blood: player.countMark(BLOOD_MARK),
            hasProfitableTarget: profitable.length > 0,
            hasExecutionTarget: profitable.some(function (target) {
                return target.hp <= 1 && luofeiIsVulnerable(target);
            }),
        });
    }

    function luofeiYinchaoTargetScore(player, target, card, remainingSlashes) {
        var vulnerable = luofeiIsVulnerable(target);
        return luofeiScoreYinchaoTarget({
            baseEffect: luofeiSlashEffect(player, target, card),
            hp: target && target.hp,
            vulnerable: vulnerable,
            overKill: luofeiIsOverKillState(
                target && target.hp,
                remainingSlashes,
                vulnerable,
            ),
        });
    }

    function luofeiMakeYinchaoTargetAI(player, card, remainingSlashes) {
        return function (target) {
            return luofeiYinchaoTargetScore(
                player,
                target,
                card,
                remainingSlashes,
            );
        };
    }

    function luofeiIsNormalPhaseDiscardChoice(player) {
        var currentEvent = typeof _status !== "undefined" ? _status.event : null;
        if (
            !currentEvent ||
            currentEvent.name !== "chooseToDiscard" ||
            currentEvent.player !== player ||
            typeof currentEvent.getParent !== "function"
        ) {
            return false;
        }
        var parent = currentEvent.getParent();
        return !!parent && parent.name === "phaseDiscard" && parent.player === player;
    }

    function luofeiCardName(card, player) {
        return typeof get.name === "function" ? get.name(card, player) : card.name;
    }

    function luofeiCardSubtype(card, player) {
        return typeof get.subtype === "function"
            ? get.subtype(card, player)
            : card.subtype || "";
    }

    function luofeiSameNameIndex(player, card, name) {
        if (!player || typeof player.getCards !== "function") return 0;
        var cards = player.getCards("h");
        var index = 0;
        for (var i = 0; i < cards.length; i++) {
            if (cards[i] === card) return index;
            if (luofeiCardName(cards[i], player) === name) index++;
        }
        return index;
    }

    function luofeiEngineKeepValue(player, card, baseUseful) {
        var name = luofeiCardName(card, player);
        return luofeiDefensiveKeepScore({
            name: name,
            subtype: luofeiCardSubtype(card, player),
            hp: player.hp,
            sameNameIndex: luofeiSameNameIndex(player, card, name),
            baseUseful: baseUseful,
        });
    }

    async function discardIfOrdering(card) {
        if (card && get.position(card, true) === "o") {
            await game.cardsDiscard(card);
        }
    }

    var character = {
        nihil_luofei: {
            sex: "female",
            group: "fu",
            hp: 3,
            maxHp: 3,
            skills: ["nihil_lianxi", "nihil_dianchao", "nihil_liusheng"],
            img: image("nihil_luofei"),
        },
    };

    var skills = {
        // ========== 敛息 ==========
        // “血”直接记录在主技能标记上，供殷潮和流生共同消费。
        nihil_lianxi: {
            audio: 2,
            locked: true,
            forced: true,
            mark: true,
            marktext: "血",
            intro: {
                name: "血",
                content: "mark",
            },
            onremove: function (player) {
                if (typeof player.unmarkSkill === "function") {
                    player.unmarkSkill(STATE_SHENG);
                    player.unmarkSkill(STATE_XI);
                }
            },
            group: [
                "nihil_lianxi_convert",
                "nihil_lianxi_losehp",
                "nihil_lianxi_selfloss",
                "nihil_lianxi_ai_vulnerable",
                "nihil_lianxi_ai_vulnerable_clear",
            ],
            mod: {
                // 仅修改落绯 AI 在正常弃牌阶段的留牌评分；其他选择返回 undefined。
                aiUseful: function (player, card, num) {
                    if (!luofeiIsNormalPhaseDiscardChoice(player)) return;
                    var score = luofeiEngineKeepValue(player, card, num);
                    return score === null ? undefined : score;
                },
            },
            ai: {
                jueqing: true,
                threaten: 1.5,
            },
        },

        // 造成伤害时，防止该伤害并令目标改为流失等量体力。
        nihil_lianxi_convert: {
            charlotte: true,
            sourceSkill: "nihil_lianxi",
            trigger: { source: "damageBefore" },
            forced: true,
            popup: false,
            filter: function (event) {
                return event.player && event.num > 0;
            },
            async content(event, trigger, player) {
                var target = trigger.player;
                var num = trigger.num;
                trigger.cancel();
                player.logSkill("nihil_lianxi", target);
                semanticLog(
                    "#g敛息",
                    "：将对",
                    target,
                    "的",
                    get.cnNumber(num),
                    "点伤害改为等量体力流失",
                );
                await target.loseHp(num);
            },
        },

        // 任意角色每实际流失一点体力，获得一枚“血”。
        nihil_lianxi_losehp: {
            charlotte: true,
            sourceSkill: "nihil_lianxi",
            trigger: { global: "changeHpAfter" },
            forced: true,
            popup: false,
            filter: function (event) {
                return isLoseHpChange(event);
            },
            async content(event, trigger, player) {
                addBlood(player, -trigger.num);
            },
        },

        // 落绯每实际损失一点体力，再获得一枚“血”。
        // 因此落绯自己流失体力时，会与上一子技能各结算一次，共获得两枚。
        nihil_lianxi_selfloss: {
            charlotte: true,
            sourceSkill: "nihil_lianxi",
            trigger: { player: "changeHpAfter" },
            forced: true,
            popup: false,
            filter: function (event) {
                return event.num < 0;
            },
            async content(event, trigger, player) {
                addBlood(player, -trigger.num);
            },
        },

        // AI记忆：目标在存在合法出闪条件时被【杀】命中，暂记为“无闪脆弱”。
        // 该字段无可见标记、无规则效果，只会被落绯的AI评分函数读取。
        nihil_lianxi_ai_vulnerable: {
            charlotte: true,
            sourceSkill: "nihil_lianxi",
            trigger: { player: "shaHit" },
            forced: true,
            popup: false,
            filter: function (event, player) {
                var target = event.target;
                if (
                    !target ||
                    event.directHit ||
                    event.directHit2 ||
                    typeof target.countCards !== "function" ||
                    target.countCards("hs") <= 0
                ) {
                    return false;
                }
                if (
                    !lib.filter ||
                    typeof lib.filter.cardEnabled !== "function" ||
                    !lib.element ||
                    typeof lib.element.VCard !== "function"
                ) {
                    return false;
                }
                var shan = new lib.element.VCard({ name: "shan" });
                if (!lib.filter.cardEnabled(shan, target, "forceEnable")) {
                    return false;
                }
                return (
                    typeof get.damageEffect !== "function" ||
                    get.damageEffect(target, player, target) < 0
                );
            },
            async content(event, trigger) {
                trigger.target._nihilLuofeiNoShanVulnerable = true;
            },
        },

        // 目标实际获得新手牌后，无闪信息已经过期，立即清除。
        nihil_lianxi_ai_vulnerable_clear: {
            charlotte: true,
            sourceSkill: "nihil_lianxi",
            trigger: { global: ["gainAfter", "loseAsyncAfter"] },
            forced: true,
            popup: false,
            filter: function (event) {
                return luofeiGamePlayers().some(function (target) {
                    return (
                        !!target._nihilLuofeiNoShanVulnerable &&
                        luofeiGainedHandCards(event, target)
                    );
                });
            },
            async content(event, trigger) {
                luofeiGamePlayers().forEach(function (target) {
                    if (
                        target._nihilLuofeiNoShanVulnerable &&
                        luofeiGainedHandCards(trigger, target)
                    ) {
                        delete target._nihilLuofeiNoShanVulnerable;
                    }
                });
            },
        },

        // ========== 殷潮 ==========
        nihil_dianchao: {
            audio: 2,
            trigger: { player: "phaseJieshuBegin" },
            direct: true,
            filter: function (event, player) {
                return player.countMark(BLOOD_MARK) > 0;
            },
            async content(event, trigger, player) {
                var count = player.countMark(BLOOD_MARK);
                var result = await player
                    .chooseNumbers(
                        "###殷潮###移去任意枚“血”，亮出牌堆顶等量张牌",
                        [
                            {
                                prompt: "请选择要移去的“血”数",
                                min: 1,
                                max: count,
                            },
                        ],
                    )
                    .set("processAI", function () {
                        var current = get.player();
                        var plan = luofeiYinchaoPlanForPlayer(current);
                        return plan.spend > 0 ? [plan.spend] : false;
                    })
                    .forResult();
                var num = result && result.numbers && result.numbers[0];
                if (!result || !result.bool || !num) return;

                player.logSkill("nihil_dianchao");
                removeBlood(player, num);
                var cards = get.cards(num);
                await game.cardsGotoOrdering(cards);
                await player.showCards(
                    cards,
                    get.translation(player) + "发动了【殷潮】",
                );

                var blackCards = cards.filter(function (card) {
                    return get.color(card, false) === "black";
                });
                var redCards = cards.filter(function (card) {
                    return get.color(card, false) === "red";
                });

                if (blackCards.length) {
                    await player.gain(blackCards, "gain2");
                }

                for (var i = 0; i < redCards.length; i++) {
                    var card = redCards[i];
                    if (!player.isIn()) break;

                    var sha = get.autoViewAs({ name: "sha" }, [card]);
                    if (!player.hasUseTarget(sha, true, false)) {
                        await discardIfOrdering(card);
                        continue;
                    }

                    var useResult = await player
                        .chooseUseTarget(
                            { name: "sha", cards: [card] },
                            [card],
                            false,
                        )
                        .set("prompt", "殷潮：你可以将" + get.translation(card) + "当【杀】使用")
                        .set("logSkill", "nihil_dianchao")
                        .set(
                            "ai",
                            luofeiMakeYinchaoTargetAI(
                                player,
                                sha,
                                redCards.length - i,
                            ),
                        )
                        .forResult();

                    // 玩家可以放弃使用；未使用的红牌进入弃牌堆。
                    if (!useResult || !useResult.bool) {
                        await discardIfOrdering(card);
                    }
                }

                // 落绯中途离场、未知颜色牌或异常取消时，统一清理仍在处理区的牌。
                var leftovers = cards.filter(function (card) {
                    return get.position(card, true) === "o";
                });
                if (leftovers.length) {
                    await game.cardsDiscard(leftovers);
                }
            },
            ai: {
                order: 7,
                result: {
                    player: 1,
                },
            },
        },

        // ========== 流生 ==========
        nihil_liusheng: {
            audio: 2,
            trigger: { global: "damageEnd" },
            filter: function (event, player) {
                return (
                    event.player &&
                    event.num > 0 &&
                    !event._cancelled &&
                    event.player.isIn() &&
                    player.countMark(BLOOD_MARK) > 0
                );
            },
            logTarget: "player",
            check: function (event, player) {
                var target = event.player;
                var decision = luofeiDecideLiusheng({
                    blood: player.countMark(BLOOD_MARK),
                    attitude: get.attitude(player, target),
                    targetDamaged: target.isDamaged(),
                    targetInGame: target.isIn(),
                    selfTarget: target === player,
                });
                return decision.action === "USE";
            },
            async content(event, trigger, player) {
                var target = trigger.player;
                // 结算期间暂时保留发动前的“生/息”提示；结算结束后再按新血量刷新。
                player.removeMark(BLOOD_MARK, 1, false);
                try {
                    var result = await player
                        .judge(function (card) {
                            return get.color(card) === "black" ? 1 : -1;
                        })
                        .forResult();

                    if (result.color === "black") {
                        if (
                            result.card &&
                            ["o", "d"].includes(get.position(result.card, true))
                        ) {
                            await player.gain(result.card, "gain2");
                        }
                        return;
                    }

                    if (result.color !== "red" || !target.isIn()) return;
                    if (player.countMark(BLOOD_MARK) % 2 === 0) {
                        await target.recover();
                    } else {
                        await target.loseHp();
                    }
                } finally {
                    syncLifeState(player);
                }
            },
            ai: {
                expose: 0.2,
            },
        },

        // “生/息”只提示此刻发动流生后，红色判定将进入哪一分支。
        nihil_liusheng_state_sheng: {
            charlotte: true,
            marktext: "生",
            intro: {
                name: "流生：生",
                content: "若此时发动【流生】且判定为红色，目标将回复1点体力。",
            },
        },
        nihil_liusheng_state_xi: {
            charlotte: true,
            marktext: "息",
            intro: {
                name: "流生：息",
                content: "若此时发动【流生】且判定为红色，目标将失去1点体力。",
            },
        },
    };

    var translates = {
        nihil_luofei: "落绯",
        nihil_luofei_prefix: "生潮息",

        nihil_lianxi: "敛息",
        nihil_lianxi_info:
            "<b>锁定技，</b>当你造成伤害时，改为目标流失等量体力。" +
            "每当一名角色流失一点体力，或你损失一点体力，你获得一枚“血”。",

        nihil_dianchao: "殷潮",
        nihil_dianchao_info:
            "结束阶段，你可以移去任意枚“血”，亮出牌堆顶等量张牌。" +
            "你获得其中的黑色牌，然后可以将其中的红色牌依次当作不计入次数限制的【杀】使用。" +
            "未以此法使用的红色牌置入弃牌堆。",

        nihil_liusheng: "流生",
        nihil_liusheng_info:
            "当一名角色受到伤害后，若其仍在场，你可以移去一枚“血”，然后进行判定：" +
            "若结果为黑色，你获得判定牌；若结果为红色，且你剩余偶数枚“血”，该角色回复一点体力，否则其流失一点体力。",
    };

    var title = {
        nihil_luofei: "#g生息流转……皆有潮落时。",
    };

    window.nihilModules.luofei = {
        character: character,
        skill: skills,
        translate: translates,
        title: title,
        sort: ["nihil_luofei"],
        aiHelpers: {
            isVulnerable: luofeiIsVulnerableState,
            isOverKill: luofeiIsOverKillState,
            decideYinchaoSpend: luofeiDecideYinchaoSpend,
            decideLiusheng: luofeiDecideLiusheng,
            scoreYinchaoTarget: luofeiScoreYinchaoTarget,
            defensiveKeepScore: luofeiDefensiveKeepScore,
        },
    };
})();
