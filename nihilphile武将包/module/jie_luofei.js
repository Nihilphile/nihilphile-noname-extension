(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "Nihilphile";
    var PUPPET = "nihil_jie_xueou";

    function marked(player) { return player && player.isIn() && player.hasMark(PUPPET); }
    function mark(player) {
        if (!player || !player.isIn()) return;
        player.addSkill(PUPPET);
        if (!player.hasMark(PUPPET)) player.addMark(PUPPET, 1);
    }
    function removeBlood(player) {
        player.removeMark(PUPPET, player.countMark(PUPPET));
        player.removeSkill(PUPPET);
    }
    function bloodUsed(event, source, spend) {
        var turn = event.getParent("phase", true);
        if (turn) {
            var used = turn.nihilJieXueyinUsedSources || (turn.nihilJieXueyinUsedSources = []);
            if (used.includes(source)) return true;
            if (spend) used.push(source);
        } else {
            var history = source.getHistory("custom");
            if (history.some(function (entry) { return entry.nihilJieXueyinUsed; })) return true;
            if (spend) history.push({ nihilJieXueyinUsed: true });
        }
        return false;
    }
    function withTargets(targets, action, plan) {
        var saved = ui.selected.targets;
        var current = get.event(), oldPlayer = Object.getOwnPropertyDescriptor(current, "player"), oldCard = Object.getOwnPropertyDescriptor(current, "_get_card");
        ui.selected.targets = targets;
        if (plan) { current.player = plan.user; current._get_card = plan.card; }
        try { return action(); }
        finally {
            ui.selected.targets = saved;
            if (oldPlayer) Object.defineProperty(current, "player", oldPlayer); else delete current.player;
            if (oldCard) Object.defineProperty(current, "_get_card", oldCard); else delete current._get_card;
        }
    }
    function targetAllowed(plan, prefix, target) {
        if (prefix.includes(target)) return false;
        return withTargets(prefix, function () {
            var info = get.info(plan.card);
            if (target.removed || !info.deadTarget && target.isDead() || !info.includeOut && target.isOut()) return false;
            var enabled = info.singleCard && info.filterAddedTarget && prefix.length ?
                info.filterAddedTarget(plan.card, plan.user, target, prefix[prefix.length - 1]) :
                lib.filter.targetEnabled(plan.card, plan.user, target);
            return enabled && lib.filter.targetInRange(plan.card, plan.user, target);
        }, plan);
    }
    function targetRange(plan, targets) {
        return withTargets(targets, function () { return lib.filter.selectTarget(plan.card, plan.user); }, plan);
    }

    function complete(plan, targets) {
        var info = get.info(plan.card);
        var range = targetRange(plan, targets);
        return (info.notarget || targets.length >= range[0] && targets.length <= range[1]) &&
            withTargets(targets, function () { return !info.filterOk || info.filterOk(); }, plan);
    }
    function useTargets(plan, prefix, exact) {
        prefix = prefix || [];
        if (!plan.card || !plan.user.isIn()) return null;
        if (!withTargets([], function () { return lib.filter.cardEnabled(plan.card, plan.user); }, plan)) return null;
        var info = get.info(plan.card);
        if (info.multicheck && !withTargets([], function () { return info.multicheck(plan.card, plan.user); }, plan)) return null;
        if (info.notarget) return !prefix.length && complete(plan, []) ? [] : null;
        var range = targetRange(plan, prefix);
        var candidates = game.players.slice();
        if (info.deadTarget) candidates.addArray(game.dead);
        if (range[1] === -1) {
            var all = candidates.filter(function (target) { return targetAllowed(plan, [], target); });
            return all.length &&
                withTargets(all, function () { return !info.filterOk || info.filterOk(); }, plan) &&
                (!exact || all.length === prefix.length && all.every(function (p) { return prefix.includes(p); })) ? all : null;
        }
        for (var i = 0; i < prefix.length; i++) {
            if (!targetAllowed(plan, prefix.slice(0, i), prefix[i])) return null;
        }
        if (complete(plan, prefix)) return prefix.slice();
        if (exact || prefix.length >= range[1]) return null;
        for (var target of candidates) {
            if (!targetAllowed(plan, prefix, target)) continue;
            var result = useTargets(plan, prefix.concat(target), false);
            if (result) return result;
        }
        return null;
    }
    function targetGroups(plan, people) {
        var groups = [], range = targetRange(plan, []), info = get.info(plan.card);
        if (info.notarget || range[1] === -1) {
            var fixed = useTargets(plan);
            if (fixed) groups.push(fixed);
            return groups;
        }
        if (!plan.card || !plan.user.isIn()) return groups;
        if (!withTargets([], function () { return lib.filter.cardEnabled(plan.card, plan.user); }, plan)) return groups;
        if (info.multicheck && !withTargets([], function () { return info.multicheck(plan.card, plan.user); }, plan)) return groups;
        function visit(prefix) {
            var limits = targetRange(plan, prefix);
            if (limits[1] === -1) {
                if (useTargets(plan, prefix, true) !== null) groups.push(prefix.slice());
                return;
            }
            if (prefix.length >= limits[0] && prefix.length <= limits[1] &&
                withTargets(prefix, function () { return !info.filterOk || info.filterOk(); }, plan)) groups.push(prefix.slice());
            if (prefix.length >= limits[1]) return;
            people.forEach(function (target) {
                if (targetAllowed(plan, prefix, target)) visit(prefix.concat(target));
            });
        }
        visit([]);
        return groups;
    }
    function phaseOf(event, owner) {
        var phase = event.name === "phaseUse" ? event : event.getParent("phaseUse", true);
        return phase && phase.player === owner ? phase : null;
    }
    function puppets(card) {
        return game.filterPlayer(function (user) { return marked(user) && useTargets({ card: card, user: user }) !== null; });
    }
    async function chooseTargets(plan) {
        var possible = useTargets(plan);
        if (!possible) return null;
        var info = get.info(plan.card), range = targetRange(plan, []);
        if (info.notarget || range[1] === -1 || range[1] === 0) return possible;
        var request = plan.controller.chooseTarget("驭傀：替" + get.translation(plan.user) + "选择" + get.translation(plan.card) + "的目标")
            .set("_get_card", plan.card)
            .set("nihilPuppetUser", plan.user)
            .set("complexTarget", true)
            .set("complexSelect", true)
            .set("custom", { add: {}, replace: { window: function () { ui.click.cancel(); } } })
            .set("selectTarget", function () {
                var event = get.event();
                return lib.skill.nihil_jie_yulei.targetRange({ card: event._get_card, user: event.nihilPuppetUser }, ui.selected.targets);
            })
            .set("ai", function (target) {
                var event = get.event();
                var score = lib.skill.nihil_jie_yulei.aiPlanner.score("target", event.player, {
                    card: event._get_card, user: event.nihilPuppetUser, target: target, prefix: ui.selected.targets,
                });
                return score === undefined ? get.effect_use(target, event._get_card, event.nihilPuppetUser, event.player) : score;
            })
            .set("filterTarget", function (card, player, target) {
                var event = get.event();
                return lib.skill.nihil_jie_yulei.useTargets({ card: card, user: event.nihilPuppetUser }, ui.selected.targets.concat(target)) !== null;
            })
            .set("filterOk", function () {
                var event = get.event();
                return lib.skill.nihil_jie_yulei.useTargets({ card: event._get_card, user: event.nihilPuppetUser }, ui.selected.targets, true) !== null;
            });
        lib.skill.nihil_jie_yulei.aiPlanner.beginAttempt(request, plan.card, plan.user);
        var result = await request.forResult();
        var targets = result.bool ? useTargets(plan, result.targets, true) : null;
        lib.skill.nihil_jie_yulei.aiPlanner.observeResult(request, result, targets !== null);
        return targets;
    }
    var skills = {
        nihil_jie_xueou: {
            locked: true, forced: true, forceDie: true,
            ai: { effect: { player: function (card, source, target) {
                return lib.skill.nihil_jie_yulei.aiPlanner.score("sourceEffect", source, { card: card, source: source, target: target });
            } } },
            marktext: "印", onremove: true,
            intro: { content: "已获得血印（每名角色至多一个）", nocount: true },
            trigger: { source: "damageSource" },
            filter: function (event, player) {
                return event.num > 0 && event.source === player && player.hasSkill(PUPPET) &&
                    player.hasMark(PUPPET) && !bloodUsed(event, player, false);
            },
            async content(event, trigger, player) {
                if (!lib.skill.nihil_jie_xueou.filter(trigger, player)) return;
                bloodUsed(trigger, player, true);
                var num = trigger.num;
                mark(trigger.player);
                var owners = game.filterPlayer(function (owner) { return owner.hasSkill("nihil_jie_xueyin"); });
                for (var owner of owners) {
                    if (owner.isIn() && owner.hasSkill("nihil_jie_xueyin")) await owner.draw(num);
                }
            },
        },
        nihil_jie_xueyin: {
            onChooseToUse: function (event) { lib.skill.nihil_jie_yulei.aiPlanner.decorateChoice(event); },
            onChooseToRespond: function (event) { lib.skill.nihil_jie_yulei.aiPlanner.decorateChoice(event); },
            locked: true, forced: true, derivation: PUPPET,
            trigger: { player: "damageBegin3" },
            removeBlood: removeBlood,
            filter: function (event) {
                return event.num > 0 && event.source && event.source.isIn();
            },
            async content(event, trigger, player) {
                if (trigger.source.hasMark(PUPPET)) {
                    removeBlood(trigger.source);
                    await player.recover(1);
                } else {
                    mark(trigger.source);
                }
            },
            ai: {
                effect: {
                    target: function (card, source, target) {
                        return lib.skill.nihil_jie_yulei.aiPlanner.score("effect", target, { card: card, source: source, target: target });
                    },
                },
            },
        },
        nihil_jie_shicheng: {
            enable: "phaseUse",
            onChooseToUse: function (event) {
                lib.skill.nihil_jie_yulei.aiPlanner.decorateChoice(event);
                if (game.online) return;
                var phase = phaseOf(event, event.player);
                event.set("nihilJieShichengAvailable", phase ? ["remove", "damage"].filter(function (option) {
                    return !(phase.nihilJieShichengUsed || []).includes(option);
                }) : []);
            },
            filter: function (event) {
                var options = event.nihilJieShichengAvailable || [];
                return options.includes("damage") || options.includes("remove") && game.hasPlayer(function (target) {
                    return target.isIn() && target.hasMark("nihil_jie_xueou");
                });
            },
            commit: function (result, player, option) {
                result.nihilJieShichengAccepted = false;
                var phase = phaseOf(get.event(), player);
                if (!phase) return;
                if (!phase.nihilJieShichengUsed) phase.nihilJieShichengUsed = [];
                if (phase.nihilJieShichengUsed.includes(option)) return;
                phase.nihilJieShichengUsed.push(option);
                result.nihilJieShichengAccepted = option;
            },
            chooseButton: {
                check: function (button) {
                    return lib.skill.nihil_jie_yulei.aiPlanner.score("option", get.player(), { option: button.link[0] });
                },
                dialog: function (event) {
                    var options = event.nihilJieShichengAvailable || [];
                    return ui.create.dialog("誓生：选择一项", [[
                        [["remove", options.includes("remove")], "移去一名角色的血印，然后其回复1点体力"],
                        [["damage", options.includes("damage")], "令一名角色对你造成1点伤害，然后若你存活，你摸一张牌"],
                    ], "textbutton"]);
                },
                filter: function (button) {
                    return button.link[1] && (button.link[0] === "damage" || game.hasPlayer(function (target) {
                        return target.isIn() && target.hasMark("nihil_jie_xueou");
                    }));
                },
                backup: function (links) {
                    return {
                        filterCard: function () { return false; }, selectCard: -1, selectTarget: 1,
                        ai2: links[0][0] === "remove" ? function (target) {
                            return lib.skill.nihil_jie_yulei.aiPlanner.score("option", get.player(), { option: "remove", target: target });
                        } : function (target) {
                            return lib.skill.nihil_jie_yulei.aiPlanner.score("option", get.player(), { option: "damage", target: target });
                        },
                        filterTarget: links[0][0] === "remove" ? function (card, player, target) {
                            return target.isIn() && target.hasMark("nihil_jie_xueou");
                        } : function (card, player, target) { return target.isIn(); },
                        onuse: links[0][0] === "remove" ? function (result, player) {
                            lib.skill.nihil_jie_shicheng.commit(result, player, "remove");
                        } : function (result, player) {
                            lib.skill.nihil_jie_shicheng.commit(result, player, "damage");
                        },
                        async content(event, trigger, player) {
                            var choice = event.getParent("chooseToUse", true);
                            var option = choice && choice.result.nihilJieShichengAccepted;
                            if (!option) return;
                            choice.result.nihilJieShichengAccepted = false;
                            var target = event.target;
                            if (!player.isIn() || !target.isIn()) return;
                            if (option === "remove") {
                                if (!target.hasMark("nihil_jie_xueou")) return;
                                lib.skill.nihil_jie_xueyin.removeBlood(target);
                                await target.recover(1);
                            } else if (option === "damage") {
                                await player.damage(1, target);
                                if (player.isIn()) await player.draw(1);
                            }
                        },
                    };
                },
                prompt: function (links) {
                    return links[0][0] === "remove" ? "誓生：移去一名角色的血印，然后其回复1点体力" :
                        "誓生：令一名角色对你造成1点伤害，然后若你存活，你摸一张牌";
                },
            },
            ai: { order: function (item, player) { return lib.skill.nihil_jie_yulei.aiPlanner.score("order", player, { skill: "shicheng" }) || 0; }, result: { player: 1 } },
        },
        nihil_jie_yulei: {
            group: "nihil_jie_yulei_active",
            useTargets: useTargets, targetRange: targetRange, puppets: puppets,
            aiPlanner: window.nihilJieLuofeiAI.create({ lib: lib, game: game, ui: ui, get: get, _status: _status,
                rules: { phaseOf: phaseOf, useTargets: useTargets, targetRange: targetRange, targetAllowed: targetAllowed, targetGroups: targetGroups } }),
            mod: {
                aiOrder: function (player, card, value) {
                    if (typeof card === "string") return;
                    return lib.skill.nihil_jie_yulei.aiPlanner.score("order", player, { card: card });
                },
                aiUseful: function (player, card, value) {
                    return lib.skill.nihil_jie_yulei.aiPlanner.score("keep", player, { card: card });
                },
                aiValue: function (player, card, value) {
                    return lib.skill.nihil_jie_yulei.aiPlanner.score("axeCost", player, { card: card });
                },
            },
            subSkill: {
                active: {
                    enable: "phaseUse", position: "h", direct: true, selectTarget: 1,
                    selectCard: function () { return ui.selected.cards.length ? 1 : [0, 1]; },
                    complexCard: true, complexTarget: true, targetprompt: "用牌者",
                    discard: false, lose: false, delay: false,
                    onChooseToUse: function (event) {
                        lib.skill.nihil_jie_yulei.aiPlanner.decorateChoice(event);
                        if (game.online) return;
                        var phase = phaseOf(event, event.player);
                        event.set("nihilPuppetShaAvailable", !!phase && !phase.nihilPuppetShaUsed);
                    },
                    check: function (card) {
                        return lib.skill.nihil_jie_yulei.aiPlanner.score("card", get.player(), { card: card });
                    },
                    ai2: function (user) {
                        return lib.skill.nihil_jie_yulei.aiPlanner.score("user", get.player(), { card: ui.selected.cards[0], user: user });
                    },
                    ai: { order: function (item, player) { return lib.skill.nihil_jie_yulei.aiPlanner.score("order", player, { skill: "puppet" }) || 0; }, result: { player: 1 } },
                    filter: function (event, player) {
                        return event.type === "phase" && player.getCards("h").some(function (card) {
                            return (get.name(card) !== "sha" || event.nihilPuppetShaAvailable === true) && puppets(card).length > 0;
                        });
                    },
                    filterCard: function (card, player) {
                        if (!player.getCards("h").includes(card) || get.name(card) === "sha" && get.event().nihilPuppetShaAvailable !== true) return false;
                        var users = lib.skill.nihil_jie_yulei.puppets(card);
                        return ui.selected.targets.length ? users.includes(ui.selected.targets[0]) : users.length > 0;
                    },
                    filterTarget: function (card, player, target) {
                        var selected = ui.selected.cards[0];
                        return player.getCards("h").some(function (candidate) {
                            return (!selected || selected === candidate) &&
                                (get.name(candidate) !== "sha" || get.event().nihilPuppetShaAvailable === true) &&
                                lib.skill.nihil_jie_yulei.puppets(candidate).includes(target);
                        });
                    },
                    filterOk: function () {
                        var event = get.event();
                        return ui.selected.cards.length === 1 && ui.selected.targets.length === 1 &&
                            lib.skill.nihil_jie_yulei_active.filterCard(ui.selected.cards[0], event.player) &&
                            lib.skill.nihil_jie_yulei_active.filterTarget(null, event.player, ui.selected.targets[0]);
                    },
                    prompt: "选择一张手牌和一名血印角色作为用牌者（先选任意一方均可），选齐后自动进入目标选择，点击空白处取消；每个出牌阶段以此法至多使用一张杀",
                    async content(event, trigger, player) {
                        var card = event.cards[0], user = event.target, phase = phaseOf(event, player);
                        if (!phase || !marked(user) || !player.getCards("h").includes(card) || get.name(card) === "sha" && phase.nihilPuppetShaUsed) return;
                        var plan = { card: card, user: user, controller: player };
                        var targets = await chooseTargets(plan);
                        if (!targets || phaseOf(event, player) !== phase || !marked(user) || !player.getCards("h").includes(card) || useTargets(plan, targets, true) === null) return;
                        if (get.name(card) === "sha" && phase.nihilPuppetShaUsed) return;
                        player.logSkill("nihil_jie_yulei", user);
                        user.useCard(card, targets, false);
                        if (get.name(card) === "sha") phase.nihilPuppetShaUsed = true;
                    },
                },
            },
        },
    };
    window.nihilModules.jie_luofei = {
        character: {
            nihil_jie_luofei: {
                sex: "female", group: "shen", hp: 3, maxHp: 3,
                img: "extension/" + EXT_NAME + "/image/character/nihil_jie_luofei.png",
                skills: ["nihil_jie_xueyin", "nihil_jie_shicheng", "nihil_jie_yulei"],
            },
        },
        skill: skills,
        title: { nihil_jie_luofei: "血偶师" },
        translate: {
            nihil_jie_luofei: "落绯",
            nihil_jie_xueou: "血印",
            nihil_jie_xueyin: "血契",
            nihil_jie_xueyin_info: "锁定技，当你受到伤害时，若伤害来源没有“血印”，则其获得“血印”；否则移去其“血印”，你回复1点体力。每名角色至多拥有一个“血印”，拥有“血印”的角色获得技能〖血印〗。",
            nihil_jie_xueou_info: "锁定技，每个回合限一次，当你实际造成伤害后，令伤害目标获得“血印”，然后所有存活且拥有〖血契〗的角色各摸等同于此次伤害值的牌。移去“血印”时失去此技能，重获“血印”不重置本回合次数。",
            nihil_jie_shicheng: "誓生",
            nihil_jie_shicheng_info: "出牌阶段每项限一次，你可以选择一项：移去一名角色的“血印”，然后其回复1点体力；或令一名角色对你造成1点伤害，然后若你存活，你摸一张牌。",
            nihil_jie_yulei: "驭傀",
            nihil_jie_yulei_active: "驭傀",
            nihil_jie_yulei_info: "出牌阶段，你可以令一名拥有“血印”标记的角色使用你的一张手牌，由你替其选择目标。以该角色的距离和目标条件判断，不受次数限制且不计入次数。每个出牌阶段，以此法至多使用一张【杀】。",
        },
        sort: ["nihil_jie_luofei"],
    };
})();
