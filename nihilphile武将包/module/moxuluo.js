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
                "nihil_shiying_stack",
                "nihil_shiying_overflow",
                "nihil_pomo_track",
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
                    if (player === target) return;
                    if (isAdapted(target, card)) return false;
                },
            },
            ai: {
                effect: {
                    target: function (card, player, target, current) {
                        if (player === target) return;
                        if (isAdapted(target, card)) return "zeroplayertarget";
                    },
                },
            },
            group: ["nihil_shiying_stack", "nihil_shiying_overflow"],
        },

        // 适应·子技Ⅰ：被命中 → 叠适 + 溢出检查
        nihil_shiying_stack: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: {
                target: ["shaHit", "useCardToEnd"],
                player: ["lebu", "bingliang", "shandian"],
            },
            filter: function (event, player) {
                var name = event.name;
                var card, key;

                // 杀命中
                if (name === "shaHit") {
                    card = event.card;
                    if (!card || card.name !== "sha") return false;
                    if (event.player === player) return false;  // 不是自己打自己
                    key = markKey(card);
                }
                // 普通锦囊结算完毕
                else if (name === "useCardToEnd") {
                    card = event.card || (event.parent && event.parent.card);
                    if (!card || card.name === "sha") return false;
                    if (get.type(card) !== "trick") return false;
                    if (get.type(card) === "delay") return false;
                    if (event.parent && event.parent._neutralized) return false;
                    if (event.player === player) return false;
                    key = card.name;
                }
                // 延时锦囊生效
                else if (name === "lebu" || name === "bingliang" || name === "shandian") {
                    key = name;
                }
                else {
                    return false;
                }

                var marks = player.getStorage(MARK);
                if (marks && marks.includes(key)) return false;
                // 暂存 key 供 content 使用
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

                // 溢出检查（叠后立即判断）
                if (player.countMark(MARK) > player.hp) {
                    player.clearMark(MARK);
                    player.logSkill("nihil_shiying");
                    game.log(player, "的", "#g适", "超过了体力，全部弃置之并回复1点体力");
                    await player.recover(1);
                }
            },
        },

        // 适应·子技Ⅱ：溢出备用触发（体力下降后检测）
        nihil_shiying_overflow: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: { player: "changeHpAfter" },
            filter: function (event, player) {
                return event.num < 0
                    && player.countMark(MARK) > player.hp;
            },
            async content(event, trigger, player) {
                player.clearMark(MARK);
                player.logSkill("nihil_shiying");
                game.log(player, "的", "#g适", "超过了体力，全部弃置之并回复1点体力");
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
                var target = event.target;

                // 追溯缺失的 card / target
                var evt = event;
                while (evt && (!card || !target)) {
                    if (!card && evt.card) card = evt.card;
                    if (!target && evt.target && evt.target !== player) target = evt.target;
                    evt = evt.parent;
                }

                if (!card || !target || !target.isIn()) return false;
                if (card.name !== "sha" && get.type(card) !== "trick") return false;
                if (get.type(card) === "delay") return false;

                // 找到 useCard 祖先
                var useCard = event.getParent("useCard");
                if (!useCard) return false;

                // 打标记
                if (!useCard._pomo_targets) useCard._pomo_targets = [];
                if (!useCard._pomo_card) useCard._pomo_card = card;
                if (!useCard._pomo_targets.includes(target)) {
                    useCard._pomo_targets.push(target);
                }

                return false; // charlotte，无需 content
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

                // 清理标记
                delete trigger._pomo_targets;
                delete trigger._pomo_card;

                if (!card || !targets || !targets.length) return event.finish();

                // 筛有效目标
                targets = targets.filter(function (t) {
                    return t && t.isIn();
                });
                if (!targets.length) return event.finish();

                // 确认弹窗
                var targetNames = targets.map(function (t) {
                    return get.translation(t);
                }).join("、");
                var choice = await player
                    .chooseBool()
                    .set("prompt", get.prompt("nihil_pomo"))
                    .set(
                        "prompt2",
                        "是否发动【破魔】？（将对" +
                            targetNames +
                            "使用同名牌）"
                    )
                    .set("ai", function () {
                        return targets.some(function (t) {
                            return get.attitude(player, t) < 0;
                        });
                    })
                    .forResult();

                if (!choice.bool) return event.finish();

                player.logSkill("nihil_pomo", targets);

                // 判定
                var judge = await player.judge();
                var judgeCard = judge.card || judge;
                var color = get.color(judgeCard, player);

                if (color === "black") {
                    game.log(
                        player,
                        "判定结果为",
                        judgeCard,
                        "（黑色），",
                        "#y破魔",
                        "发动！"
                    );
                    // 印同名牌，穿透使用
                    var copy = get.copy(card);
                    copy.isCard = true;
                    if (!copy.storage) copy.storage = {};
                    copy.storage.nowuxie = true;

                    player
                        .useCard(copy, targets, event.name)
                        .set("directHit", targets)
                        .set("nowuxie", true);
                } else {
                    game.log(
                        player,
                        "判定结果为",
                        judgeCard,
                        "（红色），获得了判定牌"
                    );
                    await player.gain(judgeCard, "gain2", "log");
                }
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
            "<b>锁定技，</b>当你成为其他角色的一张锦囊牌/【杀】的目标并结算后，" +
            "若此牌没有被抵消，将其明置于你的武将牌上方作为【适】。" +
            "与【适】同名的锦囊牌和与【适】同名且属性相同的【杀】对你无效。" +
            "当【适】数量大于你当前体力时，全部弃置之且恢复一点体力。",

        nihil_pomo: "破魔",
        nihil_pomo_info:
            "当你使用的【杀】或普通锦囊牌被抵消或无效后，" +
            "你可判定，若为黑色则视为对抵消来源使用一张同名牌（不可响应且不可被无效）；" +
            "若为红色则获得判定牌。",
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