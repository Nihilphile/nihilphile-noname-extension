(function () {
    if (typeof lib === "undefined") var lib = globalThis.lib;
    if (typeof game === "undefined") var game = globalThis.game;
    if (typeof ui === "undefined") var ui = globalThis.ui;
    if (typeof get === "undefined") var get = globalThis.get;
    if (typeof ai === "undefined") var ai = globalThis.ai;
    if (typeof _status === "undefined") var _status = globalThis._status;

    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";

    function image(id, ext) {
        return "ext:" + EXT_NAME + "/image/character/" + id + "." + (ext || "png");
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
            skills: ["nihil_wusheng", "nihil_duanyi"],
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
        ai: {
            respondSha: true,
        },
        group: "nihil_wusheng_damage",
    },

    // 武圣·伤害+1（charlotte 子技能）
    nihil_wusheng_damage: {
        charlotte: true,
        trigger: { source: "damageBegin1" },
        forced: true,
        popup: false,
        filter(event, player) {
            if (!event.card || event.card.name !== "sha") return false;
            if (get.color(event.card) !== "red") return false;
            const num = get.number(event.card);
            if (typeof num !== "number") return false;
            const X = Math.ceil(num / 3);
            return event.target && event.target.hp > X;
        },
        async content(event, trigger, player) {
            trigger.num++;
            game.log(player, "触发了", "#y【武圣】", "伤害+1");
        },
    },

    // ========== 断义 ==========
    nihil_duanyi: {
        audio: 2,
        trigger: { player: "useCardToPlayered" },
        direct: true,
        filter(event, player) {
            return event.card && event.card.name === "sha" && event.target.countCards("h") > 0;
        },
        async content(event, trigger, player) {
            const target = trigger.target;
            const hs = target.getCards("h");
            if (!hs.length) return event.finish();

            // 随机展示一张手牌
            const card = hs[Math.floor(Math.random() * hs.length)];
            game.log(target, "被", player, "展示了", card);
            target.showCards([card]);

            const color = get.color(card, target);
            if (color === "red") {
                // 红：获得之
                player.logSkill("nihil_duanyi", target);
                await target.give([card], player);
                game.log(player, "获得了", card);
            } else {
                // 黑：扣置所有手牌 + 技能失效
                player.logSkill("nihil_duanyi", target);
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
        ai: {
            directHit_ai: true,
            skillTagFilter(player, tag, arg) {
                if (get.attitude(player, arg.target) > 0) return false;
                if (tag === "directHit_ai") {
                    return arg.target.hp >= Math.max(1, arg.target.countCards("h") - 1);
                }
                return false;
            },
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
