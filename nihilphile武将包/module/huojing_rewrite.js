(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";

    var ZHANSHUAI = "nihil_zhanshuai";
    var SHUAI = "nihil_shuai";
    var XIEGONG = "nihil_xiegong";
    var HUOJING_AI_USE_BASELINE = 0.8;
    var HUOJING_AI_TELEMETRY = "_nihilHuoJingSlashTelemetry";

    // ============================================================
    //  霍旌 AI：纯决策层
    //  只读取传入快照，不修改游戏对象。U* 与 D/H 的权重为 2:3。
    // ============================================================

    function huojingNormalizeSlashStats(stats) {
        stats = stats || {};
        var rounds = Math.max(0, Math.floor(Number(stats.rounds) || 0));
        var uses = Math.max(0, Math.floor(Number(stats.uses) || 0));
        var hits = Math.max(0, Math.floor(Number(
            stats.hits == null ? stats.hitUses : stats.hits,
        ) || 0));
        return {
            rounds: rounds,
            uses: uses,
            hits: Math.min(uses, hits),
            damage: Math.max(0, Number(stats.damage) || 0),
        };
    }

    function huojingSlashMetrics(stats) {
        stats = huojingNormalizeSlashStats(stats);
        if (!stats.rounds || !stats.uses) {
            return {
                averageUses: 0,
                relativeUses: 0,
                damagePerHit: 0,
                score: 0,
                hasEvidence: false,
            };
        }
        var averageUses = stats.uses / stats.rounds;
        var damagePerHit = stats.hits > 0 ? stats.damage / stats.hits : 1;
        var relativeUses = averageUses / HUOJING_AI_USE_BASELINE;
        return {
            averageUses: averageUses,
            relativeUses: relativeUses,
            damagePerHit: damagePerHit,
            score: relativeUses * 2 + damagePerHit * 3,
            hasEvidence: true,
        };
    }

    function huojingQualifiesCommander(state) {
        state = state || {};
        return state.inGame !== false
            && !state.isOwner
            && state.identity !== "nei"
            && Number(state.attitude) > 0
            && huojingSlashMetrics(state.stats).hasEvidence;
    }

    function huojingScoreCommanderCandidate(state) {
        if (!huojingQualifiesCommander(state)) return 0;
        return huojingSlashMetrics(state.stats).score;
    }

    function huojingChooseCommanderCandidate(states, current) {
        var best = null;
        (states || []).forEach(function (state) {
            if (!huojingQualifiesCommander(state)) return;
            var score = huojingScoreCommanderCandidate(state);
            if (!best || score > best.score + 1e-9) {
                best = { state: state, score: score };
                return;
            }
            if (Math.abs(score - best.score) > 1e-9) return;

            // 同分时先保留现任帅，再按态度稳定排序；最后保持座次顺序。
            var stateIsCurrent = state.target === current;
            var bestIsCurrent = best.state.target === current;
            if (stateIsCurrent !== bestIsCurrent) {
                if (stateIsCurrent) best = { state: state, score: score };
                return;
            }
            if (Number(state.attitude) > Number(best.state.attitude)) {
                best = { state: state, score: score };
            }
        });
        return best ? best.state.target : null;
    }

    function image(id, ext) {
        return "extension/" + EXT_NAME + "/image/character/" + id + "." + (ext || "png");
    }

    function semanticLog() {
        if (typeof game !== "undefined" && game && typeof game.log === "function") {
            game.log.apply(game, arguments);
        }
    }

    function allPlayers() {
        return (game.players || []).concat(game.dead || []);
    }

    function isInGame(player) {
        return !!player && (!player.isIn || player.isIn());
    }

    function isCommander(player) {
        return !!player && !!player.hasSkill && player.hasSkill(SHUAI);
    }

    function getCommander() {
        var players = game.players || [];
        for (var i = 0; i < players.length; i++) {
            if (isCommander(players[i])) return players[i];
        }
        return null;
    }

    function livingHuojings(start) {
        var players = (game.players || []).filter(function (current) {
            return isInGame(current) && current.hasSkill && current.hasSkill(ZHANSHUAI);
        });
        if (typeof players.sortBySeat === "function") {
            var sorted = players.sortBySeat(start || (game.players && game.players[0]));
            if (sorted) players = sorted;
        }
        return players;
    }

    // ============================================================
    //  霍旌 AI：隐藏统计与引擎适配层
    //  不创建可见标记，不同步技能状态，也不改变真人的选择范围。
    // ============================================================

    function huojingAiRoundNumber() {
        return Math.max(0, Math.floor(Number(game.roundNumber) || 0));
    }

    function huojingAiEmptyStats() {
        return { rounds: 0, uses: 0, hits: 0, damage: 0 };
    }

    function huojingAiTelemetry(target, create) {
        if (!target) return null;
        var telemetry = target[HUOJING_AI_TELEMETRY];
        if ((!telemetry || typeof telemetry !== "object") && create !== false) {
            telemetry = {
                activeRound: null,
                live: huojingAiEmptyStats(),
                totals: huojingAiEmptyStats(),
                frozen: huojingAiEmptyStats(),
            };
            target[HUOJING_AI_TELEMETRY] = telemetry;
        }
        return telemetry || null;
    }

    function huojingAiAdvanceRound(round) {
        round = Math.max(0, Math.floor(Number(round) || huojingAiRoundNumber()));
        var everyone = allPlayers();

        everyone.forEach(function (target) {
            var telemetry = huojingAiTelemetry(target, false);
            if (!telemetry || telemetry.activeRound == null
                || telemetry.activeRound >= round) return;
            telemetry.totals.rounds += 1;
            telemetry.totals.uses += telemetry.live.uses;
            telemetry.totals.hits += telemetry.live.hits;
            telemetry.totals.damage += telemetry.live.damage;
            telemetry.activeRound = null;
            telemetry.live = huojingAiEmptyStats();
        });

        (game.players || []).forEach(function (target) {
            var telemetry = huojingAiTelemetry(target, true);
            if (telemetry.activeRound !== round) {
                telemetry.activeRound = round;
                telemetry.live = huojingAiEmptyStats();
            }
        });

        everyone.forEach(function (target) {
            var telemetry = huojingAiTelemetry(target, false);
            if (telemetry) telemetry.frozen = huojingNormalizeSlashStats(telemetry.totals);
        });
    }

    function huojingAiLiveStats(target) {
        var round = huojingAiRoundNumber();
        var telemetry = huojingAiTelemetry(target, false);
        if (!telemetry || telemetry.activeRound !== round) {
            // 正常对局由 roundStart 初始化；这是兼容中途入场和测试环境的兜底。
            huojingAiAdvanceRound(round);
            telemetry = huojingAiTelemetry(target, true);
            if (telemetry.activeRound !== round) {
                telemetry.activeRound = round;
                telemetry.live = huojingAiEmptyStats();
            }
        }
        return telemetry.live;
    }

    function huojingAiGetSlashStats(target) {
        var telemetry = huojingAiTelemetry(target, false);
        return huojingNormalizeSlashStats(telemetry && telemetry.frozen);
    }

    function huojingAiRecordSlashUse(useCardEvent) {
        if (!useCardEvent || !useCardEvent.player) return;
        var round = huojingAiRoundNumber();
        if (useCardEvent._nihilHuoJingAiRecordedRound === round) return;
        var stats = huojingAiLiveStats(useCardEvent.player);
        stats.uses += 1;
        useCardEvent._nihilHuoJingAiRecordedRound = round;
        useCardEvent._nihilHuoJingAiHitRecorded = false;
    }

    function huojingAiIsChainDamage(damageEvent) {
        if (!damageEvent) return false;
        if (typeof damageEvent.notLink === "function") {
            try {
                return !damageEvent.notLink();
            } catch (error) {}
        }
        if (typeof damageEvent.getParent === "function") {
            var parent = damageEvent.getParent();
            return !!parent && (parent.name === "_lianhuan" || parent.name === "_lianhuan2");
        }
        return false;
    }

    function huojingAiEffectiveSlashDamage(damageEvent, useCardEvent) {
        if (huojingAiIsChainDamage(damageEvent)) return 0;
        var actual = Math.max(0, Number(damageEvent && damageEvent.num) || 0);
        var wine = Math.max(0, Number(useCardEvent && useCardEvent.jiu_add) || 0);
        var xiegong = Math.max(
            0,
            Number(useCardEvent && useCardEvent._nihilXiegongDamageBonus) || 0,
        );
        return Math.max(0, actual - wine - xiegong);
    }

    function huojingAiRecordSlashDamage(damageEvent) {
        if (!damageEvent || !damageEvent.source) return;
        var round = huojingAiRoundNumber();

        var useCardEvent = null;
        if (typeof damageEvent.getParent === "function") {
            useCardEvent = damageEvent.getParent("useCard");
        }
        if (!useCardEvent
            || useCardEvent.player !== damageEvent.source
            || useCardEvent._nihilHuoJingAiRecordedRound !== round) return;

        var effectiveDamage = huojingAiEffectiveSlashDamage(damageEvent, useCardEvent);
        if (effectiveDamage <= 0) return;
        var stats = huojingAiLiveStats(damageEvent.source);
        stats.damage += effectiveDamage;
        if (!useCardEvent._nihilHuoJingAiHitRecorded) {
            stats.hits += 1;
            useCardEvent._nihilHuoJingAiHitRecorded = true;
        }
    }

    function huojingAiPlayerState(owner, target) {
        return {
            target: target,
            inGame: isInGame(target),
            isOwner: target === owner,
            identity: target && target.identity,
            attitude: target ? get.attitude(owner, target) : 0,
            stats: huojingAiGetSlashStats(target),
        };
    }

    function huojingAiBestCommander(owner, commander) {
        var states = (game.players || []).map(function (target) {
            return huojingAiPlayerState(owner, target);
        });
        return huojingChooseCommanderCandidate(states, commander);
    }

    function huojingAiCommanderTargetScore(owner, target) {
        return huojingScoreCommanderCandidate(
            huojingAiPlayerState(owner, target),
        );
    }

    function huojingAiYizhongTargetScore(owner, target, commander) {
        if (!target || !isInGame(target) || target.identity === "nei") return 0;
        if (target === commander && (!target.hasSkill || !target.hasSkill(XIEGONG))) {
            return 10000;
        }
        return Math.max(0, Number(get.attitude(owner, target)) || 0);
    }

    function huojingAiLowValueCardScore(card, player) {
        var value = Number(get.value(card, player));
        if (!isFinite(value)) value = 0;
        return Math.max(1, 100 - value);
    }

    // “帅”的唯一写入口。标记技能本身是权威状态，不另存 player 引用。
    function setCommander(target) {
        if (target && !isInGame(target)) target = null;
        var previous = getCommander();
        var players = allPlayers();
        for (var i = 0; i < players.length; i++) {
            var current = players[i];
            if (current !== target && isCommander(current)) {
                current.removeSkill(SHUAI);
            }
        }
        if (target) {
            if (!isCommander(target)) target.addSkill(SHUAI);
            // addSkill 已负责在场广播；这两步同时用于阶段边界的标记自愈。
            if (typeof target.syncSkills === "function") target.syncSkills();
            if (typeof target.markSkill === "function") target.markSkill(SHUAI);
        }
        if (previous !== target) {
            if (target) {
                semanticLog("#g战帅", "：", target, "成为唯一的“帅”");
            } else if (previous) {
                semanticLog("#g战帅", "：“帅”位暂时空缺");
            }
        }
        return target;
    }

    function addXiegongBonus(useCardEvent) {
        if (typeof useCardEvent.baseDamage !== "number") {
            useCardEvent.baseDamage = 1;
        }
        useCardEvent.baseDamage += 1;
        useCardEvent._nihilXiegongDamageBonus = Math.max(
            0,
            Number(useCardEvent._nihilXiegongDamageBonus) || 0,
        ) + 1;
        if (!useCardEvent.customArgs || typeof useCardEvent.customArgs !== "object") {
            useCardEvent.customArgs = { default: {} };
        }
        if (!useCardEvent.customArgs.default) useCardEvent.customArgs.default = {};

        allPlayers().forEach(function (current) {
            if (!current || current.playerid == null) return;
            var id = current.playerid;
            if (!useCardEvent.customArgs[id]) useCardEvent.customArgs[id] = {};
            if (typeof useCardEvent.customArgs[id].shanRequired === "number") {
                useCardEvent.customArgs[id].shanRequired += 1;
            } else {
                useCardEvent.customArgs[id].shanRequired = 2;
            }
        });
    }

    function hasPhysicalRespondableSha(player, responseEvent) {
        if (!player || typeof player.hasCard !== "function") return false;
        return player.hasCard(function (card) {
            if (get.name(card, player) !== "sha") return false;
            if (!lib.filter.cardRespondable(card, player, responseEvent)) return false;
            return !responseEvent
                || typeof responseEvent.filterCard !== "function"
                || responseEvent.filterCard(card, player, responseEvent);
        }, "hs");
    }

    async function resolveXiegongFailure(owner, commander) {
        if (!owner || !commander) return "no_commander";

        if (owner === commander) {
            // 规则特例：“交给自己一张牌再摸一张”简化为净摸一张。
            // 只有仍拥有【军赏】的霍旌能因这次自交获得摸牌；【遗忠】
            // 只授予【协攻】，继承者不会凭空获得【军赏】的收益。
            if (owner.hasSkill && owner.hasSkill("nihil_junshang")) {
                if (typeof owner.logSkill === "function") owner.logSkill("nihil_junshang");
                semanticLog("#g协攻", "：", owner, "未响应，按自帅特例摸一张牌");
                await owner.draw(1);
                return "self_draw";
            }
            return "self_no_junshang";
        }

        if (!isInGame(commander) || owner.countCards("h") <= 0) {
            semanticLog("#g协攻", "：", owner, "未响应且无法交牌");
            return "no_handcard";
        }

        var choose = owner.chooseCard(
            "h",
            true,
            "协攻：你须交给“帅”一张手牌",
        );
        choose.set("ai", function (card) {
            return huojingAiLowValueCardScore(card, owner);
        });
        var result = await choose.forResult();
        if (!result || !result.bool || !result.cards || !result.cards.length) {
            return "became_unavailable";
        }

        if (typeof owner.logSkill === "function") owner.logSkill(XIEGONG, commander);
        semanticLog("#g协攻", "：", owner, "未响应，进入向", commander, "交牌的分支");
        await owner.give(result.cards, commander);
        return "gave_handcard";
    }

    function matchingTransferredCards(moveEvent, owner, commander) {
        if (!moveEvent || !owner || !commander || owner === commander) return [];
        if (typeof moveEvent.getl !== "function" || typeof moveEvent.getg !== "function") {
            return [];
        }
        var loss = moveEvent.getl(owner);
        var lost = loss && Array.isArray(loss.cards2) ? loss.cards2 : [];
        var gained = moveEvent.getg(commander);
        if (!Array.isArray(gained) || !lost.length) return [];

        var result = [];
        gained.forEach(function (card) {
            if (lost.includes(card) && !result.includes(card)) result.push(card);
        });
        return result;
    }

    var character = {
        nihil_huojing: {
            sex: "male",
            group: "qun",
            hp: 4,
            skills: [ZHANSHUAI, XIEGONG, "nihil_junshang", "nihil_yizhong"],
            img: image("nihil_huojing"),
        },
    };

    var skills = {
        nihil_zhanshuai: {
            group: [
                "nihil_zhanshuai_init",
                "nihil_zhanshuai_change",
                "nihil_zhanshuai_ai_round",
                "nihil_zhanshuai_ai_slash_use",
                "nihil_zhanshuai_ai_slash_damage",
            ],
        },

        nihil_zhanshuai_init: {
            charlotte: true,
            trigger: { global: "phaseBefore", player: "enterGame" },
            forced: true,
            silent: true,
            popup: false,
            filter(event, player) {
                if (event.name === "phase" && game.phaseNumber !== 0) return false;
                if (getCommander()) return false;
                if (event.name === "enterGame") return true;
                return livingHuojings()[0] === player;
            },
            async content(event, trigger, player) {
                setCommander(player);
            },
        },

        nihil_zhanshuai_change: {
            charlotte: true,
            trigger: { player: "phaseJieshuBegin" },
            direct: true,
            filter(event, player) {
                var commander = getCommander();
                return game.hasPlayer(function (target) {
                    return target !== player && target !== commander && isInGame(target);
                });
            },
            async content(event, trigger, player) {
                var commander = getCommander();
                var best = huojingAiBestCommander(player, commander);
                var next = player.chooseTarget(
                    "战帅：是否更改“帅”？",
                    "令一名不为你的角色成为唯一的“帅”",
                    function (card, owner, target) {
                        return target !== owner && target.isIn()
                            && !target.hasSkill("nihil_shuai");
                    },
                );
                next.set("ai", function (target) {
                    if (!best || best === commander || target !== best) return 0;
                    return 100 + huojingAiCommanderTargetScore(player, target);
                });
                var result = await next.forResult();
                if (!result || !result.bool || !result.targets || !result.targets.length) return;
                var target = result.targets[0];
                player.logSkill(ZHANSHUAI, target);
                setCommander(target);
            },
        },

        nihil_zhanshuai_ai_round: {
            charlotte: true,
            sourceSkill: ZHANSHUAI,
            trigger: { global: "roundStart" },
            forced: true,
            silent: true,
            popup: false,
            filter(event, player) {
                return livingHuojings()[0] === player;
            },
            async content() {
                huojingAiAdvanceRound(huojingAiRoundNumber());
            },
        },

        nihil_zhanshuai_ai_slash_use: {
            charlotte: true,
            sourceSkill: ZHANSHUAI,
            trigger: { global: "useCard1" },
            forced: true,
            silent: true,
            popup: false,
            filter(event, player) {
                return livingHuojings()[0] === player
                    && !!event.player
                    && !!event.card
                    && event.card.name === "sha";
            },
            async content(event, trigger) {
                huojingAiRecordSlashUse(trigger);
            },
        },

        nihil_zhanshuai_ai_slash_damage: {
            charlotte: true,
            sourceSkill: ZHANSHUAI,
            trigger: { global: "damageSource" },
            forced: true,
            silent: true,
            popup: false,
            filter(event, player) {
                return livingHuojings()[0] === player
                    && !!event.source
                    && !!event.card
                    && event.card.name === "sha"
                    && typeof event.num === "number"
                    && event.num > 0
                    && !event._cancelled;
            },
            async content(event, trigger) {
                huojingAiRecordSlashDamage(trigger);
            },
        },

        nihil_shuai: {
            charlotte: true,
            mark: true,
            marktext: "帅",
            intro: {
                name: "帅",
                content: "当前角色是全场唯一的“帅”",
            },
            group: "nihil_shuai_die",
        },

        nihil_shuai_die: {
            charlotte: true,
            trigger: { player: "dieAfter" },
            forced: true,
            forceDie: true,
            popup: false,
            async content(event, trigger, player) {
                var successor = livingHuojings(player)[0] || null;
                setCommander(successor);
                if (successor && typeof successor.logSkill === "function") {
                    successor.logSkill(ZHANSHUAI);
                } else if (!successor) {
                    semanticLog("#g战帅", "：“帅”阵亡，帅位空缺");
                }
            },
        },

        nihil_xiegong: {
            locked: true,
            forced: true,
            trigger: { global: "useCard1" },
            filter(event, player) {
                return isInGame(player)
                    && event.card
                    && event.card.name === "sha"
                    && isCommander(event.player);
            },
            async content(event, trigger, player) {
                var canRespond = player.hasUsableCard("sha", "respond");
                if (!canRespond) {
                    event.result = { ok: false, reason: "unavailable", cards: [], card: null };
                    await resolveXiegongFailure(player, trigger.player);
                    return;
                }

                var choose = player.chooseToRespond(
                    "协攻：请选择并打出一张【杀】",
                    { name: "sha" },
                );
                // hasUsableCard 也会把 hiddenCard/viewAs 等虚拟响应计入其中，
                // 但这类预检在 chooseToRespond 真正建立后仍可能无牌可选。
                // 对空选择设置 forced 会让引擎创建 card=undefined 的 respond
                // 事件并在播放牌动画时崩溃；实体可响应【杀】才安全强制。
                choose.set("forced", hasPhysicalRespondableSha(player, choose));
                choose.set("ai", function (card) {
                    return huojingAiLowValueCardScore(card, player);
                });
                var result = await choose.forResult();
                var success = !!(result && result.bool);
                event.result = {
                    ok: success,
                    reason: success ? "responded" : "became_unavailable",
                    cards: result && result.cards || [],
                    card: result && result.card || null,
                };

                if (!success) {
                    await resolveXiegongFailure(player, trigger.player);
                    return;
                }
                addXiegongBonus(trigger);
                semanticLog(
                    "#g协攻",
                    "：",
                    player,
                    "响应成功；“帅”的此【杀】伤害+1，所需【闪】+1",
                );
            },
            ai: {
                threaten: 1.4,
            },
        },

        nihil_junshang: {
            group: ["nihil_junshang_damage", "nihil_junshang_transfer"],
        },

        nihil_junshang_damage: {
            charlotte: true,
            trigger: { global: "damageEnd" },
            forced: true,
            popup: false,
            filter(event) {
                return !!event.source
                    && isCommander(event.source)
                    && !!event.card
                    && event.card.name === "sha"
                    && typeof event.num === "number"
                    && event.num > 0
                    && !event._cancelled;
            },
            async content(event, trigger, player) {
                player.logSkill("nihil_junshang", trigger.source);
                await player.draw(trigger.num);
            },
        },

        nihil_junshang_transfer: {
            charlotte: true,
            trigger: { global: ["gainAfter", "loseAsyncAfter"] },
            forced: true,
            popup: false,
            getIndex(event, player) {
                var commander = getCommander();
                if (!commander || commander === player) return [];
                if (!matchingTransferredCards(event, player, commander).length) return [];
                return [commander];
            },
            filter(event, player, name, commander) {
                return matchingTransferredCards(event, player, commander).length > 0;
            },
            logTarget(event, player, name, commander) {
                return commander;
            },
            async content(event, trigger, player) {
                var commander = event.targets && event.targets[0];
                var cards = matchingTransferredCards(trigger, player, commander);
                if (!cards.length) return;
                player.logSkill("nihil_junshang", commander);
                await player.draw(cards.length);
            },
        },

        nihil_yizhong: {
            trigger: { player: "die" },
            direct: true,
            forceDie: true,
            filter(event, player) {
                return game.hasPlayer(function (target) {
                    return target !== player && target.isIn()
                        && !target.hasSkill("nihil_xiegong");
                });
            },
            async content(event, trigger, player) {
                var next = player.chooseTarget(
                    "遗忠：是否令一名角色获得【协攻】？",
                    "令一名尚未拥有【协攻】的存活角色获得【协攻】",
                    function (card, owner, target) {
                        return target !== owner && target.isIn()
                            && !target.hasSkill("nihil_xiegong");
                    },
                );
                next.set("forceDie", true);
                next.set("ai", function (target) {
                    return huojingAiYizhongTargetScore(
                        player,
                        target,
                        getCommander(),
                    );
                });
                var result = await next.forResult();
                if (!result || !result.bool || !result.targets || !result.targets.length) return;
                var target = result.targets[0];
                player.logSkill("nihil_yizhong", target);
                await target.addSkills(XIEGONG);
                semanticLog("#g遗忠", "：", target, "获得【协攻】");
            },
        },
    };

    var translates = {
        nihil_huojing: "霍旌",

        nihil_zhanshuai: "战帅",
        nihil_zhanshuai_info:
            "游戏开始时，你成为全场唯一的“帅”。结束阶段，你可以令一名不为你的角色成为“帅”。",

        nihil_shuai: "帅",
        nihil_shuai_info: "当前角色是全场唯一的“帅”。",

        nihil_xiegong: "协攻",
        nihil_xiegong_info:
            "<b>锁定技，</b>当“帅”使用【杀】后，你须打出一张【杀】：若如此做，此【杀】的伤害+1，且其每个目标抵消此【杀】所需的【闪】数+1；否则，若你不为“帅”且你有手牌，你交给“帅”一张手牌。若你即为“帅”，此交牌不移动牌；你仅在拥有【军赏】时按其规则摸一张牌。",

        nihil_junshang: "军赏",
        nihil_junshang_info:
            "当“帅”使用【杀】造成伤害后，你摸等同于伤害值的牌；当你的牌从你的手牌区或装备区进入“帅”的手牌区后，你摸等量的牌。",

        nihil_yizhong: "遗忠",
        nihil_yizhong_info:
            "当你死亡时，你可以令一名尚未拥有【协攻】的存活角色获得【协攻】。拥有“帅”的角色死亡后，若你仍存活，你成为“帅”。",
    };

    var sort = ["nihil_huojing"];

    window.nihilModules.huojing_rewrite = {
        character: character,
        skill: skills,
        translate: translates,
        sort: sort,
        testHooks: {
            getCommander: getCommander,
            setCommander: setCommander,
            addXiegongBonus: addXiegongBonus,
            hasPhysicalRespondableSha: hasPhysicalRespondableSha,
            resolveXiegongFailure: resolveXiegongFailure,
            matchingTransferredCards: matchingTransferredCards,
        },
        aiHelpers: {
            normalizeSlashStats: huojingNormalizeSlashStats,
            slashMetrics: huojingSlashMetrics,
            qualifiesCommander: huojingQualifiesCommander,
            scoreCommanderCandidate: huojingScoreCommanderCandidate,
            chooseCommanderCandidate: huojingChooseCommanderCandidate,
            advanceRound: huojingAiAdvanceRound,
            getSlashStats: huojingAiGetSlashStats,
            recordSlashUse: huojingAiRecordSlashUse,
            recordSlashDamage: huojingAiRecordSlashDamage,
            effectiveSlashDamage: huojingAiEffectiveSlashDamage,
            isChainDamage: huojingAiIsChainDamage,
            bestCommander: huojingAiBestCommander,
            commanderTargetScore: huojingAiCommanderTargetScore,
            yizhongTargetScore: huojingAiYizhongTargetScore,
        },
    };
})();
