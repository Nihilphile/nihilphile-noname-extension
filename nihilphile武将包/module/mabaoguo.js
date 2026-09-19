(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "Nihilphile";
    var HUNYUAN = "nihil_touxi";
    var DISABLED = "nihil_wude_disabled";

    function alive(player) { return !!player && player.isIn(); }

    function slashNumber(event) {
        var materials = event.cards || event.card.cards || [];
        if (!materials.length && get.itemtype(event.card) === "card") materials = [event.card];
        if (!materials.length) return 0;
        return Math.max.apply(null, materials.map(function (card) {
            var number = get.number(card, false);
            return typeof number === "number" ? number : 0;
        }));
    }

    function sealableSkills(target) {
        return target.getSkills(null, false, false).filter(function (skill) {
            var info = lib.skill[skill];
            return info && !info.charlotte && !info.sub && !info.equipSkill &&
                lib.translate[skill + "_info"] &&
                !skill.startsWith("_");
        });
    }

    function materialAllowed(card, player, target) {
        return game.checkMod(card, player, "unchanged", "cardEnabled2", player) !== false &&
            player.canUse(get.autoViewAs({ name: "sha", nature: undefined }, [card]), target, false, false);
    }

    var skills = {
        nihil_wude: {
            trigger: { player: "useCardToPlayered" },
            direct: true,
            filter: function (event, player) {
                return get.name(event.card) === "sha" && alive(event.target) &&
                    player.canCompare(event.target, true);
            },
            async content(event, trigger, player) {
                var target = trigger.target;
                var number = slashNumber(trigger);
                var choice = await player.chooseBool("武德：以此【杀】的点数（" + number + "）与" +
                    get.translation(target) + "拼点？")
                    .set("choice", get.attitude(player, target) < 0 && number >= 6).forResult();
                if (!choice.bool || !alive(target) || !player.canCompare(target, true)) return;
                player.logSkill("nihil_wude", target);
                // Native compare needs a Card for display. This detached, destructible
                // representation has no materials and can never become a usable card.
                // lose() ignores it because it is absent from the owner's hejsx zones.
                var shadow = game.createCard("sha", get.suit(trigger.card, false), number, get.nature(trigger.card, false));
                shadow.remove();
                shadow.number = number; // Keep virtual sha's zero explicit.
                shadow.destroyed = true;
                shadow.destroyLog = false;
                var fixed = {};
                fixed[player.playerid] = shadow;
                var result;
                try {
                    result = await player.chooseToCompare(target).set("fixedResult", fixed)
                        .set("_nihilWude", true).forResult();
                } finally {
                    // No ordering/discard insertion, even on cancellation or failure.
                    shadow.remove();
                }
                if (!result.bool || !alive(target) || !alive(player)) return;
                var options = sealableSkills(target);
                if (!options.length) return;
                var selected = await player.chooseControl(options.concat("cancel2"))
                    .set("prompt", "武德：令" + get.translation(target) + "的一个技能本回合失效")
                    .set("_nihilWudeOptions", options).set("_nihilWudeTarget", target)
                    .set("ai", function () {
                        var request = _status.event;
                        return get.attitude(request.player, request._nihilWudeTarget) < 0 ?
                            request._nihilWudeOptions[0] : "cancel2";
                    }).forResult();
                if (!options.includes(selected.control) || !alive(target) ||
                    !sealableSkills(target).includes(selected.control)) return;
                target.addTempSkill(DISABLED, { global: "phaseAfter" });
                target.storage[DISABLED] = target.storage[DISABLED] || [];
                if (!target.storage[DISABLED].includes(selected.control)) target.storage[DISABLED].push(selected.control);
                target.disableSkill(DISABLED, selected.control);
                target.syncStorage(DISABLED);
                target.markSkill(DISABLED);
                game.log(target, "的", "#g" + get.translation(selected.control), "本回合失效");
            },
        },
        nihil_wude_disabled: {
            charlotte: true,
            mark: true,
            marktext: "封",
            intro: { content: function (storage) {
                return "本回合失效：" + (storage || []).map(function (skill) { return get.translation(skill); }).join("、");
            } },
            onremove: function (player) {
                player.enableSkill(DISABLED);
                delete player.storage[DISABLED];
            },
        },
        nihil_touxi: {
            trigger: { global: "phaseBegin" },
            direct: true,
            marktext: "元",
            intro: { name: "混元", name2: "混元", content: "mark" },
            group: "nihil_touxi_hurt",
            filter: function (event, player) {
                return alive(player) && alive(event.player) && event.player !== player &&
                    !(event._nihilTouxiAsked || []).includes(player.playerid) &&
                    player.countMark(HUNYUAN) > 0 && player.getCards("h").some(function (card) {
                        return materialAllowed(card, player, event.player);
                    });
            },
            async content(event, trigger, player) {
                trigger._nihilTouxiAsked = trigger._nihilTouxiAsked || [];
                if (trigger._nihilTouxiAsked.includes(player.playerid)) return;
                trigger._nihilTouxiAsked.push(player.playerid);
                var target = trigger.player;
                var choice = await player.chooseCard("h", "偷袭：移去1个混元，将一张手牌当【杀】对" +
                    get.translation(target) + "使用", function (card, owner) {
                        var target = _status.event._nihilTouxiTarget;
                        return game.checkMod(card, owner, "unchanged", "cardEnabled2", owner) !== false &&
                            owner.canUse(get.autoViewAs({ name: "sha", nature: undefined }, [card]), target, false, false);
                    }).set("_nihilTouxiTarget", target).set("ai", function (card) {
                        var request = _status.event;
                        var benefit = get.effect(request._nihilTouxiTarget,
                            get.autoViewAs({ name: "sha", nature: undefined }, [card]), request.player, request.player);
                        return benefit > 0 ? 7 - get.value(card) : 0;
                    }).forResult();
                if (!choice.bool || !choice.cards || choice.cards.length !== 1 ||
                    !alive(player) || !alive(target) || target === player || player.countMark(HUNYUAN) < 1) return;
                var card = choice.cards[0];
                if (!player.getCards("h").includes(card) || !materialAllowed(card, player, target)) return;
                player.logSkill("nihil_touxi", target);
                player.removeMark(HUNYUAN, 1);
                await player.useCard(get.autoViewAs({ name: "sha", nature: undefined }, [card]), [card], target, false);
            },
            subSkill: {
                hurt: {
                    trigger: { player: "damageEnd" },
                    forced: true,
                    popup: false,
                    filter: function (event) {
                        return event.num > 0;
                    },
                    async content(event, trigger, player) {
                        // Armor changes HP loss, not the engine's suffered damage.
                        // damageEnd follows the normal damage/dying resolution.
                        player.addMark(HUNYUAN, trigger.num);
                    },
                },
            },
        },
    };
    window.nihilModules.mabaoguo = {
        character: {
            nihil_mabaoguo: {
                sex: "male", group: "shen", hp: 4, maxHp: 4,
                skills: ["nihil_wude", "nihil_touxi"],
                img: "extension/" + EXT_NAME + "/image/character/nihil_mabaoguo.png",
            },
        },
        skill: skills,
        translate: {
            nihil_mabaoguo: "马保国",
            nihil_wude: "武德",
            nihil_wude_disabled: "武德失效",
            nihil_wude_info: "当你指定一名角色成为你【杀】的目标后，若其有手牌，你可以用与此【杀】点数相同的牌与其拼点（你无须另交手牌；多张牌转化的【杀】取素材最大点数，无素材的【杀】为0点）。若你赢，你可以令其一个武将技能失效直到本回合结束。",
            nihil_touxi: "偷袭",
            nihil_touxi_hurt: "混元",
            nihil_touxi_info: "你每受到1点伤害，获得1个“混元”。其他角色的回合开始时限一次，你可以移去1个“混元”，将一张手牌当无距离限制的普通【杀】对其使用，此【杀】不计入使用次数。",
        },
        title: { nihil_mabaoguo: "闪电五连鞭" },
        sort: ["nihil_mabaoguo"],
    };
})();
