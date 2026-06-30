(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";

    function image(id, ext) {
        return "extension/" + EXT_NAME + "/image/character/" + id + "." + (ext || "png");
    }

    var MARK = "nihil_shiying";

    function markKey(card) {
        if (card.name === "sha") {
            var nat = game.hasNature(card) ? (get.nature(card) || "none") : "none";
            return "sha:" + nat;
        }
        return card.name;
    }

    function isAdapted(player, card) {
        var marks = player.getStorage(MARK);
        if (!marks || !marks.length) return false;
        return marks.includes(markKey(card));
    }

    // ============================================================
    //  魔虚罗 — 适应·破魔
    // ============================================================

    var character = {
        nihil_moxuluo: {
            sex: "male",
            group: "mo",
            hp: 4,
            skills: [
                "nihil_shiying",
                "nihil_shiying_stack_sha_flag",
                "nihil_shiying_stack_sha",
                "nihil_shiying_stack_trick",
                "nihil_shiying_stack_basic",
                "nihil_shiying_stack_delay",
                "nihil_shiying_overflow",
                "nihil_pomo_track",
                "nihil_pomo_track_sha",
                "nihil_pomo",
            ],
            img: image("nihil_moxuluo"),
        },
    };

    var skills = {
        // ========== 适应（主技能·锁定技） ==========
        nihil_shiying: {
            audio: 2,
            locked: true,
            forced: true,
            mark: true,
            marktext: "适",
            intro: {
                content: function (storage, player) {
                    var marks = player.getStorage(MARK);
                    if (!marks || !marks.length) return "暂无适应的牌";
                    var list = marks.map(function (k) {
                        if (k.indexOf("sha:") === 0) {
                            var nat = k.slice(4);
                            if (nat === "none") return "普通杀";
                            return get.translation(nat) + "杀";
                        }
                        return get.translation(k);
                    });
                    return "已适应：" + list.join("、");
                },
            },
            mod: {
                targetEnabled: function (card, player, target) {
                    if (isAdapted(target, card)) {
                        console.log("[适·block] 拦截 " + card.name + " 对 " + get.translation(target));
                        return false;
                    }
                },
            },
            ai: {
                effect: {
                    target: function (card, player, target, current) {
                        if (isAdapted(target, card)) return "zeroplayertarget";
                    },
                },
            },
            group: ["nihil_shiying_stack_sha_flag", "nihil_shiying_stack_sha", "nihil_shiying_stack_trick", "nihil_shiying_stack_basic", "nihil_shiying_stack_delay", "nihil_shiying_overflow"],
        },

        // 适应·子技Ⅰa-flag：杀命中 → 打标记（延迟到 useCardToEnd 再叠）
        nihil_shiying_stack_sha_flag: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: { target: "shaHit" },
            filter: function (event, player) {
                var card = event.card;
                if (!card || card.name !== "sha") return false;
                var key = markKey(card);
                var marks = player.getStorage(MARK);
                if (marks && marks.includes(key)) return false;
                player.storage._shiying_pending_sha = key;
                console.log("[适·sha] flag: " + key);
                return false; // 不执行业务，等 useCardToEnd
            },
        },

        // 适应·子技Ⅰa：杀结算完毕 → 叠适（濒死已结束）
        nihil_shiying_stack_sha: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: { target: "useCardToEnd" },
            filter: function (event, player) {
                var card = event.card || (event.parent && event.parent.card);
                if (!card || card.name !== "sha") return false;
                var key = player.storage._shiying_pending_sha;
                if (!key) return false;
                delete player.storage._shiying_pending_sha;
                console.log("[适·sha] useCardToEnd, key=", key);
                event._shiying_key = key;
                return true;
            },
            async content(event, trigger, player) {
                var key = trigger._shiying_key;
                if (!key) return;
                player.markAuto(MARK, key);
                player.logSkill("nihil_shiying");
                game.log(player, "适应了", "#y" + get.translation(key));
                player.updateMarks();
                // 此时伤害和濒死已结算完毕，hp 是最终值
                var cnt2 = player.countMark(MARK);
                console.log("[适] 叠后overflow检测: count=" + cnt2 + " hp=" + player.hp + (cnt2 > player.hp ? "  TRIGGER清空!" : ""));
                if (cnt2 > player.hp) {
                    player.storage[MARK].length = 0;
                    player.unmarkSkill(MARK);
                    player.logSkill("nihil_shiying");
                    game.log(player, "的", "#g适", "超过了体力，全部弃置之并回复1点体力");
                    player.updateMarks();
                    await player.recover(1);
                    console.log("[适] sha 溢出处理完成");
                }
            },
        },

        // 适应·子技Ⅰb：普通锦囊结算完毕 → 叠适
        nihil_shiying_stack_trick: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: { target: "useCardToEnd" },
            filter: function (event, player) {
                var card = event.card || (event.parent && event.parent.card);
                if (!card || card.name === "sha") {
                    console.warn("[适·trick] card无效或是杀:", card && card.name);
                    return false;
                }
                var ctype = get.type(card);
                if (ctype !== "trick") {
                    console.warn("[适·trick] 非锦囊 type=", ctype, " name=", card.name);
                    return false;
                }
                if (ctype === "delay") {
                    console.warn("[适·trick] 延时锦囊跳过");
                    return false;
                }
                if (event.parent && event.parent._neutralized) {
                    console.warn("[适·trick] 被无懈抵消");
                    return false;
                }
                var key = card.name;
                var marks = player.getStorage(MARK);
                if (marks && marks.includes(key)) {
                    console.warn("[适·trick] 已适应此牌:", key);
                    return false;
                }
                console.log("[适·trick] V filter通过, key=", key);
                event._shiying_key = key;
                return true;
            },
            async content(event, trigger, player) {
                var key = trigger._shiying_key;
                if (!key) return;
                player.markAuto(MARK, key);
                player.logSkill("nihil_shiying");
                game.log(player, "适应了", "#y" + get.translation(key));
                player.updateMarks();
                var cnt2 = player.countMark(MARK);
                console.log("[适] 叠后overflow检测: count=" + cnt2 + " hp=" + player.hp + (cnt2 > player.hp ? "  TRIGGER清空!" : ""));
                if (cnt2 > player.hp) {
                    player.storage[MARK].length = 0;
                    player.unmarkSkill(MARK);
                    player.logSkill("nihil_shiying");
                    game.log(player, "的", "#g适", "超过了体力，全部弃置之并回复1点体力");
                    player.updateMarks();
                    await player.recover(1);
                    console.log("[适] trick/delay 溢出处理完成");
                }
            },
        },

        // 适应·子技Ⅰc：基本牌（桃/酒）结算完毕 → 叠适
        nihil_shiying_stack_basic: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: { target: "useCardToEnd" },
            filter: function (event, player) {
                var card = event.card || (event.parent && event.parent.card);
                if (!card) return false;
                if (get.type(card) !== "basic") return false;
                if (card.name !== "tao" && card.name !== "jiu") return false;
                if (event.parent && event.parent._neutralized) return false;
                var key = card.name;
                var marks = player.getStorage(MARK);
                if (marks && marks.includes(key)) return false;
                console.log("[适·basic] V filter通过, key=", key);
                event._shiying_key = key;
                return true;
            },
            async content(event, trigger, player) {
                var key = trigger._shiying_key;
                if (!key) return;
                player.markAuto(MARK, key);
                player.logSkill("nihil_shiying");
                game.log(player, "适应了", "#y" + get.translation(key));
                player.updateMarks();
                var cnt2 = player.countMark(MARK);
                console.log("[适] 叠后overflow检测: count=" + cnt2 + " hp=" + player.hp + (cnt2 > player.hp ? "  TRIGGER清空!" : ""));
                if (cnt2 > player.hp) {
                    player.storage[MARK].length = 0;
                    player.unmarkSkill(MARK);
                    player.logSkill("nihil_shiying");
                    game.log(player, "的", "#g适", "超过了体力，全部弃置之并回复1点体力");
                    player.updateMarks();
                    await player.recover(1);
                    console.log("[适] basic 溢出处理完成");
                }
            },
        },

        // 适应·子技Ⅰd：延时锦囊生效 → 叠适（仅 phaseJudge，不含 useCard）
        nihil_shiying_stack_delay: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: { player: ["lebuEnd", "bingliangEnd", "shandianEnd"] },
            filter: function (event, player) {
                // 仅 phaseJudge 阶段的生效事件
                if (event.getParent().name !== "phaseJudge") return false;
                // 仅判定生效（_result.bool===false）才叠，天过的不叠
                if (!event._result || event._result.bool !== false) return false;
                // 从 Event 名提取牌名（"lebuEnd"→"lebu"）
                var key = event.name.replace(/End$/, "");
                var marks = player.getStorage(MARK);
                if (marks && marks.includes(key)) {
                    console.warn("[适·delay] 已适应此牌:", key);
                    return false;
                }
                console.log("[适·delay] V filter通过, key=", key);
                event._shiying_key = key;
                return true;
            },
            async content(event, trigger, player) {
                var key = trigger._shiying_key;
                if (!key) return;
                player.markAuto(MARK, key);
                player.logSkill("nihil_shiying");
                game.log(player, "适应了", "#y" + get.translation(key));
                player.updateMarks();
                var cnt2 = player.countMark(MARK);
                console.log("[适] 叠后overflow检测: count=" + cnt2 + " hp=" + player.hp + (cnt2 > player.hp ? "  TRIGGER清空!" : ""));
                if (cnt2 > player.hp) {
                    player.storage[MARK].length = 0;
                    player.unmarkSkill(MARK);
                    player.logSkill("nihil_shiying");
                    game.log(player, "的", "#g适", "超过了体力，全部弃置之并回复1点体力");
                    player.updateMarks();
                    await player.recover(1);
                    console.log("[适] trick/delay 溢出处理完成");
                }
            },
        },

        // 适应·子技Ⅱ：溢出触发（loseHpEnd，濒死已结束；卡牌叠适内的 overflow 处理 useCard 路径）
        nihil_shiying_overflow: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: { player: ["damageEnd", "loseHpEnd"] },
            filter: function (event, player) {
                var cnt = player.countMark(MARK);
                if (cnt <= player.hp) return false;
                console.log("[适·overflow] " + event.name + " 触发溢出! count=" + cnt + " hp=" + player.hp);
                return true;
            },
            async content(event, trigger, player) {
                player.storage[MARK].length = 0;
                player.unmarkSkill(MARK);
                player.logSkill("nihil_shiying");
                game.log(player, "的", "#g适", "超过了体力，全部弃置之并回复1点体力");
                player.updateMarks();
                await player.recover(1);
            },
        },

        // 破魔·子技：中立化期间给 useCard 打标记
        nihil_pomo_track: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: { player: "eventNeutralized" },
            filter: function (event, player) {
                var card = event.card;
                // 不要 AOE / 延时锦囊
                if (!card) return false;
                if (card.name !== "sha" && get.type(card) !== "trick") return false;
                if (get.type(card) === "delay") return false;
                // 单体锦囊：目标数必须为 1（或杀天然单目标）
                var allTargets = event.targets;
                if (card.name !== "sha" && allTargets && allTargets.length > 1) return false;

                var target = event.target;
                if (!target || !target.isIn()) return false;

                var useCard = event.getParent("useCard");
                if (!useCard) return false;

                if (!useCard._pomo_targets) useCard._pomo_targets = [];
                if (!useCard._pomo_card) useCard._pomo_card = card;
                if (!useCard._pomo_targets.includes(target)) {
                    useCard._pomo_targets.push(target);
                }
                console.log("[破魔·track] 标记: card=" + card.name + " target=" + get.translation(target));
                return false;
            },
        },

        // 破魔·子技（sha）：杀被闪避/藤甲取消 → 打标记
        nihil_pomo_track_sha: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: { target: ["shaMiss", "shaCancelled"] },
            filter: function (event, player) {
                var card = event.card;
                if (!card || card.name !== "sha") return false;

                var target = event.target;
                if (!target || !target.isIn()) return false;

                var useCard = event.getParent("useCard");
                if (!useCard) return false;

                if (!useCard._pomo_targets) useCard._pomo_targets = [];
                if (!useCard._pomo_card) useCard._pomo_card = card;
                if (!useCard._pomo_targets.includes(target)) {
                    useCard._pomo_targets.push(target);
                }
                console.log("[破魔·track-sha] 标记: event=" + event.name + " target=" + get.translation(target));
                return false;
            },
        },

        // 破魔（主技能·牌结算后确认发动）
        nihil_pomo: {
            audio: 2,
            trigger: { player: "useCardAfter" },
            filter: function (event, player) {
                return event._pomo_targets && event._pomo_targets.length > 0;
            },
            check: function (event, player) {
                var targets = event._pomo_targets;
                if (!targets) return false;
                return targets.some(function (t) {
                    return t && t.isIn() && get.attitude(player, t) < 0;
                });
            },
            async content(event, trigger, player) {
                var card = trigger._pomo_card;
                var targets = trigger._pomo_targets;
                delete trigger._pomo_targets;
                delete trigger._pomo_card;

                if (!card || !targets || !targets.length) return event.finish();

                targets = targets.filter(function (t) { return t && t.isIn(); });
                if (!targets.length) return event.finish();

                var targetNames = targets.map(function (t) {
                    return get.translation(t);
                }).join("、");

                player.logSkill("nihil_pomo", targets);
                console.log("[破魔] 触发, card=" + card.name);

                // Step 1: 判定（无需确认，直接判）
                var result = await player.judge().forResult();
                var color = result.color;
                console.log("[破魔] 判定: color=" + color);

                if (color !== "black") {
                    game.log(player, "判定结果为", result.card, "（红色），破魔失败");
                    return event.finish();
                }

                game.log(player, "判定结果为", result.card, "（黑色），可以弃一张牌发动破魔");

                // Step 3: 弃置一张牌
                var discardResult = await player
                    .chooseToDiscard(1, "he")
                    .set("prompt", "弃置一张牌，视为对" + targetNames + "打出同名牌（不可响应）")
                    .set("ai", function (card2) {
                        return 6 - get.value(card2);
                    })
                    .forResult();

                if (!discardResult.bool || !discardResult.cards || !discardResult.cards.length) {
                    game.log(player, "取消了破魔");
                    return event.finish();
                }

                await player.discard(discardResult.cards);

                // Step 4: 打出复制牌（不可响应）
                var copy = get.copy(card);
                copy.isCard = true;

                // 杀复制：给目标加 qinggang2 破防具（藤甲/仁王盾）+ directHit 跳闪/八卦
                if (card.name === "sha") {
                    for (var i = 0; i < targets.length; i++) {
                        targets[i].addTempSkill("qinggang2");
                        if (!Array.isArray(targets[i].storage.qinggang2)) {
                            targets[i].storage.qinggang2 = [];
                        }
                        targets[i].storage.qinggang2.push(copy);
                    }
                }

                player.logSkill("nihil_pomo", targets);
                game.log(player, "弃置了", discardResult.cards, "，",
                    "#y破魔", "！对", targets, "打出了", "#y" + get.translation(card.name));

                var useCardEvent = player.useCard(copy, targets, event.name);
                useCardEvent.set("directHit", targets);
                useCardEvent.set("nowuxie", true);
                await useCardEvent;

                console.log("[破魔] 完成");
            },
            ai: {
                order: 9,
                result: {
                    player: function (player) {
                        return 1;
                    },
                },
            },
        },
    };

    var title = {
        nihil_moxuluo: "#g布瑠部由良良 八握剑异戒神将魔虚罗",
    };

    var translates = {
        nihil_moxuluo: "魔虚罗",
        nihil_moxuluo_prefix: "布瑠部由良良 八握剑异戒神将魔虚罗",

        nihil_shiying: "适应",
        nihil_shiying_info:
            "<b>锁定技，</b>当你成为一张锦囊牌/【杀】的目标并结算后，" +
            "若此牌没有被抵消，将其明置于你的武将牌上方作为【适】。" +
            "与【适】同名的锦囊牌和与【适】同名且属性相同的【杀】对你无效。" +
            "当【适】数量大于你当前体力时，全部弃置之且恢复一点体力。",

        nihil_pomo: "破魔",
        nihil_pomo_info:
            "当你使用的【杀】被闪避/防具抵消，或单体锦囊牌被无效后，" +
            "你可判定，若为黑色则你可弃置一张牌，视为打出一张同名牌（不可响应，无视防具）。",
    };

    var sort = ["nihil_moxuluo"];

    window.nihilModules["moxuluo"] = {
        character: character,
        skill: skills,
        translate: translates,
        title: title,
        sort: sort,
    };
})();