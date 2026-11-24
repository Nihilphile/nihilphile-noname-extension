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

    // ============================================================
    //  决意之殇 殷华 — 残言·残恨·残心
    // ============================================================

    var character = {
        nihil_yinhua: {
            sex: "male",
            group: "fu",
            hp: 2,
            maxHp: 3,
            skills: [
                "nihil_canyan",
                "nihil_canyuan",
                "nihil_canxin",
            ],
            img: image("nihil_yinhua"),
        },
    };

    var skills = {
        // ========== 残言（主技能） ==========
        nihil_canyan: {
            audio: 2,
            enable: "chooseToUse",
            filter: function (event, player) {
                return player.hasCard(function (card) {
                    return card.name === "sha";
                }, "h");
            },
            chooseButton: {
                dialog: function (event, player) {
                    var list = get.inpileVCardList(function (info) {
                        return get.type(info[2]) === "trick";
                    });
                    // 排除本回合已使用过的锦囊
                    var usedNames = [];
                    player.getHistory("useCard", function (evt) {
                        if (evt.card) {
                            var name = get.name(evt.card);
                            if (get.type(name) === "trick") {
                                usedNames.push(name);
                            }
                        }
                    });
                    list = list.filter(function (item) {
                        return !usedNames.includes(item[2]);
                    });
                    return ui.create.dialog("残言", [list, "vcard"]);
                },
                backup: function (links, player) {
                    var trickName = links[0][2];
                    return {
                        filterCard: function (card, player) {
                            return get.name(card, player) === "sha";
                        },
                        selectCard: 1,
                        viewAs: function (cards, player) {
                            return {
                                name: trickName,
                                cards: cards,
                                _nihil_canyan: true,
                            };
                        },
                        filterTarget: function (card, player, target) {
                            var info = get.info(card);
                            if (typeof info.filterTarget === "function") {
                                if (!info.filterTarget(card, player, target)) return false;
                            }
                            var X = player.getDamagedHp();
                            return get.distance(player, target) <= X;
                        },
                    };
                },
                prompt: function (links) {
                    return "将一张杀当作" + get.translation(links[0][2]) + "使用";
                },
                check: function (button) {
                    var card = { name: button.link[2], nature: button.link[3], isCard: true };
                    return get.player().getUseValue(card);
                },
            },
            ai: {
                order: 7,
                result: {
                    player: function (player) {
                        if (player.getDamagedHp() > 0) return 2;
                        return 0;
                    },
                },
            },
            group: "nihil_canyan_selfsha",
        },

        // ========== 残言·子技：锦囊结算后自伤杀 ==========
        nihil_canyan_selfsha: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: { player: "useCardAfter" },
            filter: function (event, player) {
                return event.card && event.card._nihil_canyan;
            },
            async content(event, trigger, player) {
                var targets = trigger.targets;
                var N = targets ? targets.length : 0;
                if (N <= 0) return;
                player.logSkill("nihil_canyan");
                semanticLog("#g残言", "：", player, "须对自己结算一张伤害为", N, "的【杀】");
                // 自指杀无视防具（藤甲/仁王盾），但可正常出闪
                var card = { name: "sha", isCard: true };
                player.addTempSkill("qinggang2");
                player.storage.qinggang2 = player.storage.qinggang2 || [];
                player.storage.qinggang2.push(card);
                var evt = player.useCard(card, player, false);
                evt.baseDamage = N;
                await evt;
            },
        },

        // ========== 残恨（锁定技） ==========
        nihil_canyuan: {
            audio: 2,
            locked: true,
            forced: true,
            trigger: { global: "phaseJieshuBegin" },
            filter: function (event, player) {
                // 本回合失去了锦囊牌
                var lostTrick = player.getHistory("lose", function (evt) {
                    return evt.cards && evt.cards.some(function (card) {
                        return get.type(card) === "trick";
                    });
                }).length > 0;
                // 或本回合使用过锦囊牌（含残言转化的虚拟锦囊）
                var usedTrick = player.getHistory("useCard", function (evt) {
                    if (!evt.card) return false;
                    return get.type(get.name(evt.card)) === "trick";
                }).length > 0;
                // 未使用实体杀（有 component cards 的杀）
                var usedRealSha = player.getHistory("useCard", function (evt) {
                    if (!evt.card) return false;
                    return get.name(evt.card) === "sha"
                        && evt.cards && evt.cards.length > 0;
                }).length > 0;

                return (lostTrick || usedTrick) && !usedRealSha;
            },
            async content(event, trigger, player) {
                var X = player.getDamagedHp();
                if (X <= 0) return;
                player.logSkill("nihil_canyuan");
                var shas = Array.from(ui.discardPile.childNodes).filter(function (card) {
                    return card.name === "sha";
                });
                if (shas.length > 0) {
                    var cards = shas.slice(0, X);
                    semanticLog("#g残恨", "：从弃牌堆选取", get.cnNumber(cards.length), "张【杀】");
                    await player.gain(cards, "gain2");
                }
            },
        },

        // ========== 残心（锁定技） ==========
        nihil_canxin: {
            audio: 2,
            locked: true,
            forced: true,
            trigger: { target: "useCardToTargeted" },
            filter: function (event, player) {
                return event.card && event.card.name === "sha";
            },
            async content(event, trigger, player) {
                var X = player.getDamagedHp();
                player.logSkill("nihil_canxin");
                if (X > 0) {
                    await player.draw(X);
                }
                var discardNum = X - 1;
                if (discardNum > 0 && player.countCards("h") > 0) {
                    await player.chooseToDiscard(discardNum, true).set("ai", function (card) {
                        return -get.value(card);
                    });
                }
            },
            ai: {
                // 被杀时的防御威慑：敌人不太想杀你
                threaten: function (player, target) {
                    if (target && target.hp < target.maxHp) return 0.8;
                    return 0.4;
                },
            },
        },
    };

    var translates = {
        nihil_yinhua: "殷华",
        nihil_yinhua_prefix: "赤色残花",

        nihil_canyan: "残言",
        nihil_canyan_info:
            "出牌阶段，你可以将一张【杀】当作本回合未使用过的非延时锦囊牌使用。" +
            "此牌仅可指定与你距离不大于X的角色，" +
            "且此牌结算后，视为你对自己使用一张伤害等同于其指定目标数的杀。（X为你已损失体力值）",

        nihil_canyuan: "残恨",
        nihil_canyuan_info:
            "<b>锁定技，</b>每个回合结束阶段，若本回合你失去了锦囊牌且未使用过实体【杀】，" +
            "则你从弃牌堆获得X张杀。（X为你已损失体力值）",

        nihil_canxin: "残心",
        nihil_canxin_info:
            "<b>锁定技，</b>当你成为【杀】的目标后，摸X张牌并弃置X-1张牌。" +
            "（X为你已损失体力值）",
    };

    var title = {
        nihil_yinhua: "#g万策尽，恨难终",
    };

    var sort = ["nihil_yinhua"];

    window.nihilModules["yinhua"] = {
        character: character,
        skill: skills,
        translate: translates,
        title: title,
        sort: sort,
    };
})();
