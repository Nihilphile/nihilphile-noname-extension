(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "Nihilphile";
    var MARK = "nihil_huajin";

    function alive(player) {
        return !!player && player.isIn();
    }

    function useEvent(event) {
        return event.getParent("useCard", true);
    }

    function activeBranch(event, player) {
        var use = useEvent(event);
        return alive(player) && event.target === player &&
            get.name(event.card) === "sha" && use && !use.all_excluded &&
            use.targets.includes(player) && !use.excluded.includes(player);
    }

    function transferCost(event, player, target) {
        if (!activeBranch(event, player) || !alive(target) ||
            target === player) return 0;
        var use = useEvent(event);
        if (use.targets.includes(target)) return 0;
        if (target === event.player) {
            // Reflection explicitly permits sha's original source as its own target.
            // Bypass only the card's ordinary self-target rule, not skill prohibitions.
            if (game.checkMod(event.card, event.player, target, "unchanged", "playerEnabled", event.player) === false ||
                game.checkMod(event.card, event.player, target, "unchanged", "targetEnabled", target) === false) return 0;
        } else if (!lib.filter.targetEnabled(event.card, event.player, target)) return 0;
        // D is directed, equipment/skill-adjusted distance, not lost HP or range.
        var distance = get.distance(player, target);
        if (!Number.isFinite(distance) || distance < 1) return 0;
        var cost = 1 + distance + (target === event.player ? 1 : 0);
        return player.countMark(MARK) >= cost ? cost : 0;
    }

    async function reward(event, player) {
        // Per-target trigger and whole-card refund have different lifetimes.
        if (event._nihilHuajinRewarded) return;
        event._nihilHuajinRewarded = true;
        player.addMark(MARK, 1);
        var use = useEvent(event);
        if (use && !use._nihilHuajinRefunded) {
            use._nihilHuajinRefunded = true;
            if (use.addCount !== false) {
                use.addCount = false;
                var stat = use.player.getStat().card;
                if (typeof stat.sha === "number") stat.sha = Math.max(0, stat.sha - 1);
            }
        }
        if (alive(event.player)) await event.player.draw(1);
    }

    var skills = {
        nihil_huajin: {
            locked: true,
            forced: true,
            trigger: { global: "phaseZhunbeiBegin" },
            filter: function (event, player) {
                return alive(player) && player.hujia <= player.getDamagedHp() + 1;
            },
            async content(event, trigger, player) {
                await player.changeHujia(1);
            },
            group: ["nihil_huajin_target", "nihil_huajin_hurt"],
            marktext: "消",
            intro: { name: "消力", name2: "消力", content: "mark" },
            subSkill: {
                target: {
                    trigger: { target: "useCardToTarget" },
                    priority: 10,
                    forced: true,
                    popup: false,
                    filter: function (event, player) {
                        return activeBranch(event, player) &&
                            player.hasSkill("nihil_huajin") && !event._nihilHuajinRewarded;
                    },
                    async content(event, trigger, player) {
                        // Reward before optional Jieshi: this mark is already spendable.
                        player.logSkill("nihil_huajin");
                        await reward(trigger, player);
                    },
                },
                hurt: {
                    trigger: { player: "changeHp" },
                    forced: true,
                    popup: false,
                    firstDo: true,
                    filter: function (event, player) {
                        var damage = event.getParent();
                        return event.num < 0 && damage && damage.name === "damage" &&
                            damage.card && get.name(damage.card) === "sha" && player.hasSkill("nihil_huajin");
                    },
                    content: function (event, trigger, player) {
                        // changeHp.num is the actual HP delta after armor absorption.
                        player.addTempSkill("nihil_huajin_disabled", { global: "phaseAfter" });
                        player.disableSkill("nihil_huajin_disabled", "nihil_huajin");
                        game.log(player, "的", "#g化劲", "本回合失效");
                    },
                },
            },
        },
        nihil_huajin_disabled: {
            charlotte: true,
            mark: true,
            marktext: "失",
            intro: { content: "化劲本回合失效；回合结束后恢复。" },
            onremove: function (player) {
                player.enableSkill("nihil_huajin_disabled");
            },
        },
        nihil_jieshi: {
            trigger: { target: "useCardToTarget" },
            direct: true,
            filter: function (event, player) {
                return activeBranch(event, player) && game.hasPlayer(function (target) {
                    return transferCost(event, player, target) > 0;
                });
            },
            async content(event, trigger, player) {
                var candidates = game.players.filter(function (target) {
                    return transferCost(trigger, player, target) > 0;
                });
                var choice = await player.chooseTarget(
                    "借势：移去1＋距离个消力；转给杀的使用者额外移去1个", function (card, owner, target) {
                        // Sent as source text to remote clients: use only public event data.
                        return _status.event._nihilJieshiCandidates.includes(target);
                    }).set("_nihilJieshiCandidates", candidates)
                    .set("source", trigger.player).set("card", trigger.card)
                    .set("ai", function (target) {
                        var request = _status.event;
                        if (!request._nihilJieshiCandidates.includes(target)) return 0;
                        return get.effect(target, request.card, request.source, request.player) -
                            get.effect(request.player, request.card, request.source, request.player) -
                            (1 + get.distance(request.player, target) + (target === request.source ? 1 : 0)) * 0.2;
                    }).forResult();
                if (!choice.bool || !choice.targets || choice.targets.length !== 1) return;
                var target = choice.targets[0];
                // Recompute distance and budget; Huajin already resolved at priority 10.
                var cost = transferCost(trigger, player, target);
                if (!cost) return;
                var use = useEvent(trigger);
                player.logSkill("nihil_jieshi", target);
                player.removeMark(MARK, cost);
                // Same useCard/card/source/materials; native liuli restarts this target pass.
                use.triggeredTargets2.remove(player);
                use.targets.remove(player);
                use.targets.push(target);
            },
        },
        nihil_huiwu: {
            enable: "phaseUse",
            usable: 1,
            filterTarget: function (card, player, target) {
                return target !== player && target.isIn();
            },
            async content(event, trigger, player) {
                var target = event.target;
                if (!alive(player) || !alive(target)) return;
                var result = await target.chooseToUse({
                    prompt: "会武：对" + get.translation(player) + "使用一张【杀】，否则其视为对你使用一张【杀】（均无距离、次数限制）",
                    _nihilHuiwuTarget: player,
                    filterCard: function (card, owner) {
                        return get.name(card, owner) === "sha" && lib.filter.cardEnabled(card, owner);
                    },
                    filterTarget: function (card, owner, target) {
                        return target === _status.event._nihilHuiwuTarget && target.isIn() &&
                            owner.canUse(card, target, false, false);
                    },
                    selectTarget: 1,
                    targetRequired: true,
                    addCount: false,
                    nodistance: true,
                }).forResult();
                if (!result.bool && alive(player) && alive(target)) {
                    var card = { name: "sha", isCard: true };
                    if (player.canUse(card, target, false, false)) {
                        await player.useCard(card, target, false);
                    }
                }
            },
            ai: {
                order: 4,
                expose: 0.2,
                result: {
                    target: function (player, target) {
                        return get.effect(target, { name: "sha" }, player, target);
                    },
                },
            },
        },
    };

    window.nihilModules.wujizi = {
        character: {
            nihil_wujizi: {
                sex: "male",
                group: "qian",
                hp: 3,
                maxHp: 3,
                skills: ["nihil_huajin", "nihil_jieshi", "nihil_huiwu"],
                img: "extension/" + EXT_NAME + "/image/character/nihil_wujizi.png",
            },
        },
        init: function (lib, game) {
            if (!lib.group.includes("qian")) game.addGroup("qian", "千", "千", {});
            lib.groupnature.qian = "wood";
            Object.assign(lib.translate, { qian: "千", qian2: "千", qian_short: "千", qian_config: "千势力" });
        },
        skill: skills,
        translate: {
            nihil_wujizi: "无极子",
            nihil_huajin: "化劲",
            nihil_huajin_target: "化劲",
            nihil_huajin_hurt: "化劲",
            nihil_huajin_disabled: "化劲失效",
            nihil_huajin_info: "锁定技，每名角色的准备阶段开始时，若你的护盾数不大于X，你获得1点护盾（X为你已损失的体力值+1）。当你成为【杀】的目标时，你获得1个“消力”，此【杀】不计入使用次数，然后使用者摸一张牌。同一张【杀】的次数仅返还一次。当你的体力因【杀】的伤害而减少时，此技能本回合失效。",
            nihil_jieshi: "借势",
            nihil_jieshi_info: "当你成为【杀】的目标时，你可以选择一名不是此【杀】其他目标的其他角色，移去1+D个“消力”，将此【杀】对你的目标转移给该角色（D为你到其当前距离）。若该角色为此【杀】的使用者，你须额外移去1个“消力”。新目标不受原使用者攻击范围限制，但须符合此【杀】的目标禁止条件。",
            nihil_huiwu: "会武",
            nihil_huiwu_info: "出牌阶段限一次，你可以令一名其他角色对你使用一张【杀】，否则视为你对其使用一张【杀】。以此法使用的【杀】均无距离和次数限制，且不计入使用次数。",
        },
        title: { nihil_wujizi: "武术的胜利" },
        sort: ["nihil_wujizi"],
    };
})();
