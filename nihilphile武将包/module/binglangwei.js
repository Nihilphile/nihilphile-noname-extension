(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";

    function image(id, ext) {
        return "extension/" + EXT_NAME + "/image/character/" + id + "." + (ext || "png");
    }

    // ============================================================
    //  兵狼卫 — 凯武·救驾·甲装
    // ============================================================

    var character = {
        nihil_binglangwei: {
            sex: "male",
            group: "fu",
            hp: 4,
            maxHp: 5,
            skills: [
                "nihil_kaiwu",
                "nihil_kaiwu_shield",
                "nihil_kaiwu_draw",
                "nihil_kaiwu_convert",
                "nihil_jiujia",
                "nihil_jiazhuang",
            ],
            img: image("nihil_binglangwei"),
        },
    };

    var skills = {
        // ========== 凯武（主技能·锁定技） ==========
        nihil_kaiwu: {
            audio: 2,
            locked: true,
            forced: true,
            mod: {
                maxHandcard(player, num) {
                    return num + player.hujia;
                },
            },
            ai: {
                effect: {
                    // 桃转盾仍有价值——满血也吃桃
                    player_use(card, player, target) {
                        if (player === target && card.name === "tao"
                            && player.hasSkill("nihil_kaiwu") && player.hujia < 5) {
                            return [1, 1];
                        }
                    },
                },
            },
            group: [
                "nihil_kaiwu_shield",
                "nihil_kaiwu_draw",
                "nihil_kaiwu_convert",
            ],
        },

        // 凯武·子技Ⅰ：体力下降 → 获护盾
        nihil_kaiwu_shield: {
            charlotte: true,
            trigger: { player: "changeHpAfter" },
            forced: true,
            popup: false,
            filter(event, player) {
                return event.num < 0;
            },
            async content(event, trigger, player) {
                await player.changeHujia(-trigger.num, null, true);
            },
        },

        // 凯武·子技Ⅱ：准备阶段摸牌（数量 = 护盾值）
        nihil_kaiwu_draw: {
            charlotte: true,
            trigger: { player: "phaseBegin" },
            forced: true,
            popup: false,
            filter(event, player) {
                return player.hujia > 0;
            },
            async content(event, trigger, player) {
                player.logSkill("nihil_kaiwu");
                game.log(player, "发动了", "#g凯武", "，摸了",
                    get.cnNumber(player.hujia), "张牌");
                await player.draw(player.hujia);
            },
        },

        // 凯武·子技Ⅲ：非濒死非甲装回复 → 转护盾
        nihil_kaiwu_convert: {
            charlotte: true,
            trigger: { player: "recoverBefore" },
            forced: true,
            popup: false,
            filter(event, player) {
                if (player.hp <= 0) return false;
                if (event.nihil_jiazhuang) return false;
                return event.num > 0;
            },
            async content(event, trigger, player) {
                trigger.cancel();
                player.logSkill("nihil_kaiwu");
                game.log(player, "将回复体力转为获得了",
                    get.cnNumber(trigger.num), "点护甲");
                await player.changeHujia(trigger.num, null, true);
            },
        },

        // ========== 救驾（每回合限一次·防伤转体力流失） ==========
        nihil_jiujia: {
            audio: 2,
            trigger: { global: "damageBegin4" },
            usable: 1,
            filter(event, player) {
                return event.player !== player
                    && event.player.isIn()
                    && event.num > 0;
            },
            check(event, player) {
                if (get.attitude(player, event.player) <= 0) return false;
                // 不会濒死 → 发动
                if (player.hp > event.num) return true;
                // 会濒死，但有桃/酒自救 → 发动
                if (player.hasCard(function(card) {
                    return card.name === "tao" || card.name === "jiu";
                }, "h")) return true;
                // 会死且无自救 → 不发动
                return false;
            },
            async content(event, trigger, player) {
                trigger.cancel();
                var num = trigger.num;
                player.logSkill("nihil_jiujia", trigger.player);
                game.log(player, "替", trigger.player, "挡下了",
                    get.cnNumber(num), "点伤害");
                await player.loseHp(num);
            },
            ai: {
                order: 9,
                result: {
                    player(player, target) {
                        if (!target) return 0;
                        if (get.attitude(player, target) <= 0) return 0;
                        if (target.hp <= 1) return 2.5;
                        if (target.hp <= 2) return 1.5;
                        return 0.8;
                    },
                },
            },
        },

        // ========== 甲装（出牌阶段·耗2盾回1血） ==========
        nihil_jiazhuang: {
            audio: 2,
            enable: "phaseUse",
            filter(event, player) {
                return player.hujia >= 2 && player.hp < player.maxHp;
            },
            async content(event, trigger, player) {
                await player.changeHujia(-2);
                player.logSkill("nihil_jiazhuang");
                game.log(player, "消耗了2点护甲，回复了1点体力");
                var evt = player.recover(1);
                evt.nihil_jiazhuang = true;
                await evt;
            },
            ai: {
                order: 9,
                result: {
                    player(player) {
                        if (player.hujia >= 4 && player.hp < player.maxHp) return 2;
                        return 0;
                    },
                },
            },
        },
    };

    var title = {
        nihil_binglangwei: "#g城在山河稳，天下和",
    };

    var translates = {
        nihil_binglangwei: "兵狼卫",
        nihil_binglangwei_prefix: "城在山河稳，天下和",

        nihil_kaiwu: "凯武",
        nihil_kaiwu_info:
            "<b>锁定技，</b>每当你体力值下降1点，你获得一点护盾。" +
            "你的手牌上限恒等于你的当前体力+护盾值，" +
            "且每有1点护盾，准备阶段你摸一张牌。" +
            "当你于非濒死状态以【甲装】以外的方式回复体力时，改为获得等量护盾。",

        nihil_jiujia: "救驾",
        nihil_jiujia_info:
            "每回合限一次，当一名其他角色受到伤害时，你可以防止之，" +
            "然后你失去等同于本次伤害的体力值。",

        nihil_jiazhuang: "甲装",
        nihil_jiazhuang_info:
            "出牌阶段，你可以失去2点护盾，回复一点体力。",
    };

    var sort = ["nihil_binglangwei"];

    window.nihilModules["binglangwei"] = {
        character: character,
        skill: skills,
        translate: translates,
        title: title,
        sort: sort,
    };
})();
