import { lib, game, ui, get, ai, _status } from "noname";

const YCC_SHA_CARD = { name: "sha", isCard: true };

function yccCardKeepValue(card, player) {
    return get.useful(card, player) + get.value(card, player) / 3;
}

function yccCountWuzhong(player) {
    return player.countCards("h", card => get.name(card, player) === "wuzhong");
}

function yccMaxOtherHand(player) {
    let max = 0;
    game.filterPlayer(current => {
        if (current !== player) max = Math.max(max, current.countCards("h"));
    });
    return max;
}

function yccYuceMaxReachable(player) {
    return yccMaxOtherHand(player) <= player.countCards("h") + yccCountWuzhong(player) + 1;
}

function yccYuceShaValue(player) {
    if (!player.hasValueTarget(YCC_SHA_CARD)) return 0;
    return player.getUseValue(YCC_SHA_CARD);
}

function yccYucePlanActive(player) {
    if (_status.currentPhase !== player) return false;
    if (!player.hasSkill("ycc_yuce", null, null, false)) return false;
    if (!yccYuceMaxReachable(player)) return false;
    if (yccYuceShaValue(player) <= 0) return false;
    return true;
}

function yccYuceShouldPreserveHand(player) {
    if (!yccYucePlanActive(player)) return false;
    return player.countCards("h") - 1 < yccMaxOtherHand(player);
}

function yccYuceHasPositiveShaTarget(player) {
    return game.hasPlayer(target => {
        return target !== player && player.canUse(YCC_SHA_CARD, target) && get.effect(target, YCC_SHA_CARD, player, player) > 0;
    });
}

function yccYuceEquipSubtypes(card) {
    const list = get.subtypes(card, false);
    if (Array.isArray(list) && list.length) return list;
    const subtype = get.subtype(card, false);
    return subtype ? [subtype] : [];
}

function yccYuceEquipAddsShaTarget(player, card, subtypes) {
    const info = get.info(card);
    if (!info || !info.distance) return false;
    let range = player.getAttackRange();
    if (subtypes.includes("equip1") && typeof info.distance.attackFrom == "number") {
        range = Math.max(range, -info.distance.attackFrom + 1);
    }
    if ((subtypes.includes("equip4") || subtypes.includes("equip6")) && typeof info.distance.globalFrom == "number" && info.distance.globalFrom < 0) {
        range += -info.distance.globalFrom;
    }
    if (range <= player.getAttackRange()) return false;
    return game.hasPlayer(target => {
        if (target === player || get.attitude(player, target) >= 0) return false;
        if (player.canUse(YCC_SHA_CARD, target)) return false;
        if (lib.filter.targetEnabled(YCC_SHA_CARD, player, target) === false) return false;
        if (get.distance(player, target) > range) return false;
        return get.effect(target, YCC_SHA_CARD, player, player) > 0;
    });
}

function yccYuceDefensiveMountBlocksSha(player, card) {
    const info = get.info(card);
    const globalTo = info && info.distance && typeof info.distance.globalTo == "number" ? info.distance.globalTo : 0;
    if (globalTo <= 0) return false;
    return game.hasPlayer(source => {
        if (source === player || get.attitude(player, source) >= 0) return false;
        if (!source.canUse(YCC_SHA_CARD, player)) return false;
        if (get.effect(player, YCC_SHA_CARD, source, player) >= 0) return false;
        return get.distance(source, player) + globalTo > source.getAttackRange();
    });
}

function yccYuceEquipImprovesShaOutput(player, card) {
    if (get.name(card, player) !== "zhuge") return false;
    if (player.getEquip && player.getEquip("zhuge")) return false;
    if (player.countCards("h", current => current !== card && get.name(current, player) === "sha") < 2) return false;
    return yccYuceHasPositiveShaTarget(player);
}

function yccYuceEquipOrder(player, card, num) {
    const subtypes = yccYuceEquipSubtypes(card);
    const noDiscardPressure = !player.needsToDiscard();
    const wouldLoseYuceMax = yccYuceShouldPreserveHand(player);
    if (!noDiscardPressure && !wouldLoseYuceMax) return num;

    if (subtypes.includes("equip4") || subtypes.includes("equip1") || subtypes.includes("equip6")) {
        if (subtypes.includes("equip1") && yccYuceEquipImprovesShaOutput(player, card)) return num;
        if (yccYuceEquipAddsShaTarget(player, card, subtypes)) return num;
        if ((subtypes.includes("equip4") || subtypes.includes("equip6")) && yccYuceHasPositiveShaTarget(player)) return 0;
        return 0;
    }

    if (subtypes.includes("equip3")) {
        if (yccYuceDefensiveMountBlocksSha(player, card)) return num;
        return 0;
    }

    if (subtypes.includes("equip2") || subtypes.includes("equip5")) {
        if (player.hp <= 2 || get.equipValue(card, player) >= 7.5) return num;
        return 0;
    }

    return 0;
}

function yccHuangmingTargetScore(player, originalTarget, target, canUseShaOn) {
    if (!target || target === player || !target.isIn()) return -Infinity;
    if (get.attitude(player, originalTarget) >= 0) return -Infinity;

    const hand = target.countCards("h");
    const isEnemy = get.attitude(player, target) < 0;
    const canSha = canUseShaOn(target);

    if (isEnemy) {
        const internalSha = canSha ? Math.max(0, get.effect(originalTarget, YCC_SHA_CARD, target, player)) : 0;
        return 100 + hand * 10 + internalSha * 2;
    }

    const isFriend = get.attitude(player, target) > 0;
    const originalTargetWeak = originalTarget.hp <= 1 || originalTarget.countCards("h") <= 1;
    if (isFriend && originalTargetWeak && hand > 4 && canSha) {
        const finishValue = get.effect(originalTarget, YCC_SHA_CARD, target, player);
        if (finishValue > 0) return 85 + hand + finishValue * 8;
    }

    return -Infinity;
}

function yccHuangmingControlChoice(chosen, owner, originalTarget) {
    const shaEffect = get.effect(originalTarget, YCC_SHA_CARD, chosen, chosen);
    const giftValue = owner.countCards("h") > 0 ? 2.5 : 0;
    const shaCost = 1.5;
    const optionSha = shaEffect + giftValue - shaCost;
    const optionDiscard = chosen.countCards("h") > 0 ? -3 - Math.min(2, chosen.countCards("h") / 2) : 0;
    return optionSha >= optionDiscard ? 0 : 1;
}

function yccQinzhengEnemies(player) {
    return game.filterPlayer(current => current !== player && get.attitude(player, current) < 0);
}

function yccQinzhengIsDuel(player) {
    const enemies = yccQinzhengEnemies(player);
    return enemies.length === 1 && game.countPlayer(current => current !== player) === 1;
}

function yccQinzhengHasAllyHuangmingSupport(player, enemy) {
    return game.hasPlayer(current => {
        if (current === player || current === enemy) return false;
        if (get.attitude(player, current) <= 0) return false;
        if (current.countCards("h") <= 4) return false;
        if (!current.hasSha()) return false;
        if (lib.filter.cardEnabled(YCC_SHA_CARD, current) === false) return false;
        if (lib.filter.targetEnabled(YCC_SHA_CARD, current, enemy) === false) return false;
        return get.effect(enemy, YCC_SHA_CARD, current, player) > 0;
    });
}

function yccQinzhengResetWatch(player) {
    player.storage.ycc_qinzheng_no_support = 0;
    player.storage.ycc_qinzheng_watch_round = game.roundNumber;
}

function yccQinzhengUpdateWatch(player) {
    if (player.storage.ycc_qinzheng_watch_round === game.roundNumber) return;
    player.storage.ycc_qinzheng_watch_round = game.roundNumber;
    const enemies = yccQinzhengEnemies(player);
    if (enemies.length !== 1) {
        player.storage.ycc_qinzheng_no_support = 0;
        return;
    }
    if (yccQinzhengIsDuel(player)) {
        player.storage.ycc_qinzheng_no_support = 3;
        return;
    }
    if (yccQinzhengHasAllyHuangmingSupport(player, enemies[0])) {
        player.storage.ycc_qinzheng_no_support = 0;
        return;
    }
    player.storage.ycc_qinzheng_no_support = (player.storage.ycc_qinzheng_no_support || 0) + 1;
}

function yccQinzhengShouldUse(player) {
    if (!player.hasSkill("ycc_huangming", null, null, false)) return false;
    const enemies = yccQinzhengEnemies(player);
    if (enemies.length !== 1) return false;
    if (yccQinzhengIsDuel(player)) return true;
    if (yccQinzhengHasAllyHuangmingSupport(player, enemies[0])) return false;
    return (player.storage.ycc_qinzheng_no_support || 0) >= 3;
}

export const character = {
    ycc_yuchengchen: {
        sex: "male",
        group: "fu",
        hp: 4,
        skills: ["ycc_huangming", "ycc_yuce", "ycc_qinzheng"],
        img: "extension/nihilphile/image/character/ycc_yuchengchen.jpg",
    },
};

export const skills = {
ycc_huangming: {
        audio: 2,
        trigger: { player: "useCardAfter" },
        filter(event, player) {
            return event.card && event.card.name === "sha" && event.targets && event.targets.length;
        },
        direct: true,
        async content(event, trigger, player) {
            // Single target: auto-select; multi-target: let ycc pick the "靶子"
            let originalTarget;
            if (trigger.targets.length === 1) {
                originalTarget = trigger.targets[0];
            } else {
                const pickResult = await player
                    .chooseTarget("皇命：请选择一个【杀】的目标作为靶子", (card, p, target) => {
                        return trigger.targets.includes(target);
                    })
                    .set("ai", target => {
                        // Prefer enemy with low hand
                        const att = get.attitude(player, target);
                        if (att >= 0) return -1;
                        return 10 - target.countCards("h");
                    })
                    .forResult();
                if (!pickResult.bool) return event.finish();
                originalTarget = pickResult.targets[0];
            }
            if (!originalTarget || !originalTarget.isIn()) return event.finish();

            // Helper: check if chosen character can use sha on the original target,
            // ignoring distance (per 皇命 spec: 此【杀】无视距离限制).
            // Uses direct filter checks rather than canUse() to avoid any hidden
            // distance/event-context interference during preliminary qualification.
            const canUseShaOn = (chosen) => {
                if (!chosen.hasSha()) return false;
                const shaCard = { name: "sha", isCard: true };
                // cardEnabled: sha is always enabled (enable: true), but guard anyway
                if (lib.filter.cardEnabled(shaCard, chosen) === false) return false;
                // targetEnabled: sha filterTarget is (player !== target) — no distance
                return lib.filter.targetEnabled(shaCard, chosen, originalTarget) !== false;
            };

            // Helper: check if chosen has hand cards
            const hasHandCards = (chosen) => chosen.countCards("h") > 0;

            // Helper: execute option 1 - chosen uses sha on original target, then player gives a card to chosen
            async function executeOption1(chosen) {
                const useResult = await chosen
                    .chooseToUse({
                        prompt: "皇命：对" + get.translation(originalTarget) + "使用一张【杀】（无视距离限制）",
                        filterCard(card, player, event) {
                            if (get.name(card, player) !== "sha") return false;
                            return lib.filter.filterCard.apply(this, arguments);
                        },
                        filterTarget: (card, p, tgt) => {
                            if (tgt !== originalTarget) return false;
                            return lib.filter.targetEnabledx(card, p, tgt);
                        },
                        selectTarget: 1,
                        forced: true,
                        addCount: false,
                        nodistance: true,
                    })
                    .set("logSkill", "ycc_huangming")
                    .forResult();

                // After successfully using sha, player gives one hand card to chosen
                if (useResult.bool && player.countCards("h") > 0 && chosen.isIn()) {
                    const giveResult = await player
                        .chooseCard("h", true, "皇命：请交给" + get.translation(chosen) + "一张手牌")
                        .set("ai", card => {
                            return 10 - yccCardKeepValue(card, player);
                        })
                        .forResult();
                    if (giveResult.bool && giveResult.cards.length) {
                        await player.give(giveResult.cards, chosen);
                    }
                }
            }

            // Helper: execute option 2 - Yuchenchen discards one card from chosen
            async function executeOption2(chosen) {
                await player.discardPlayerCard(chosen, "h", true);
            }

            // Choose another character (not Yuchenchen, not the original target)
            const result = await player
                .chooseTarget(
                    get.prompt("ycc_huangming"),
                    "令一名其他角色选择一项执行",
                    (card, p, target) => {
                        if (target === p) return false;
                        if (target === originalTarget) return false;
                        return canUseShaOn(target) || hasHandCards(target);
                    }
                )
                .set("ai", target => {
                    const pl = get.player();
                    return yccHuangmingTargetScore(pl, originalTarget, target, canUseShaOn);
                })
                .forResult();

            if (!result.bool) return event.finish();
            const chosen = result.targets[0];

            player.logSkill("ycc_huangming", chosen);
            player.line(chosen, "green");

            const opt1 = canUseShaOn(chosen);
            const opt2 = hasHandCards(chosen);

            if (opt1 && opt2) {
                // Both options available: chosen character uses chooseControl
                const controlResult = await chosen
                    .chooseControl()
                    .set("choiceList", [
                        "对" + get.translation(originalTarget) + "使用一张【杀】（无视距离），然后" + get.translation(player) + "交给你一张手牌",
                        "令" + get.translation(player) + "弃置你一张手牌"
                    ])
                    .set("prompt", "皇命：请选择一项")
                    .set("ai", () => {
                        const me = get.player();
                        return yccHuangmingControlChoice(me, player, originalTarget);
                    })
                    .forResult();

                if (controlResult.index === 0) {
                    await executeOption1(chosen);
                } else if (controlResult.index === 1) {
                    await executeOption2(chosen);
                } else {
                    return event.finish();
                }
            } else if (opt1) {
                await executeOption1(chosen);
            } else if (opt2) {
                await executeOption2(chosen);
            }
        },
    },

    // 御策
    ycc_yuce: {
        audio: 2,
        trigger: { player: "phaseUseEnd" },
        direct: true,
        mod: {
            aiOrder(player, card, num) {
                if (!yccYucePlanActive(player)) return;
                if (get.itemtype(card) !== "card" || get.position(card) !== "h") return;
                const name = get.name(card, player);
                if (name === "wuzhong") return num + 0.5;
                if (get.type(card, null, player) === "equip") return yccYuceEquipOrder(player, card, num);
                if (!yccYuceShouldPreserveHand(player)) return;
                const useValue = player.getUseValue(card);
                if (name === "sha" && useValue > 0) return num;
                if (useValue >= Math.max(2, yccYuceShaValue(player))) return num;
                if (num > 0) return 0;
            },
        },
        filter(event, player) {
            const hc = player.countCards("h");
            const isMax = !game.hasPlayer(current => {
                return current !== player && current.countCards("h") > hc;
            });
            const isMin = !game.hasPlayer(current => {
                return current !== player && current.countCards("h") < hc;
            });
            return isMax || isMin;
        },
        async content(event, trigger, player) {
            const hc = player.countCards("h");
            const isMax = !game.hasPlayer(current => {
                return current !== player && current.countCards("h") > hc;
            });
            const isMin = !game.hasPlayer(current => {
                return current !== player && current.countCards("h") < hc;
            });

            // If conditions changed and neither holds, end immediately
            if (!isMax && !isMin) return event.finish();

            if (isMin) {
                const drawResult = await player
                    .chooseBool()
                    .set("prompt", get.prompt("ycc_yuce"))
                    .set("prompt2", "你可以摸两张牌")
                    .set("ai", () => true)
                    .forResult();

                if (drawResult.bool) {
                    player.logSkill("ycc_yuce");
                    await player.draw(2);
                }
            }

            if (isMax) {
                const shaCard = { name: "sha", isCard: true };
                if (player.hasValueTarget(shaCard)) {
                    const shaResult = await player
                        .chooseBool()
                        .set("prompt", get.prompt("ycc_yuce"))
                        .set("prompt2", "你可以视为使用一张【杀】")
                        .set("ai", () => player.hasValueTarget(shaCard))
                        .forResult();

                    if (shaResult.bool) {
                        player.logSkill("ycc_yuce");
                        await player.chooseUseTarget(shaCard, true, false)
                            .set("logSkill", "ycc_yuce");
                    }
                }
            }
        },
    },

    // 亲征 (limited skill)
    ycc_qinzheng: {
        audio: 2,
        enable: "phaseUse",
        limited: true,
        group: "ycc_qinzheng_watch",
        filter(event, player) {
            return player.hasSkill("ycc_huangming", null, null, false);
        },
        async content(event, trigger, player) {
            player.awakenSkill(event.name);
            await player.loseMaxHp();
            player.removeSkill("ycc_huangming");
            player.addSkill("ycc_handlimit");
            player.addSkill("ycc_longji");
            delete player.storage.ycc_qinzheng_no_support;
            delete player.storage.ycc_qinzheng_watch_round;
        },
        ai: {
            order(item, player) {
                return yccQinzhengShouldUse(player) ? 10 : -1;
            },
            result: {
                player(player) {
                    return yccQinzhengShouldUse(player) ? 3 : -1;
                },
            },
        },
    },

    ycc_qinzheng_watch: {
        charlotte: true,
        trigger: { global: "roundStart" },
        forced: true,
        popup: false,
        filter(event, player) {
            return player.hasSkill("ycc_qinzheng", null, null, false) && player.hasSkill("ycc_huangming", null, null, false);
        },
        async content(event, trigger, player) {
            yccQinzhengUpdateWatch(player);
        },
        onremove(player) {
            yccQinzhengResetWatch(player);
        },
    },

    // 亲征 -> 手牌上限 +1 (permanent, independent skill)
    ycc_handlimit: {
        charlotte: true,
        mod: {
            maxHandcard(player, num) {
                return num + 1;
            },
        },
    },

    // 龙殛
    ycc_longji: {
        audio: 2,
        trigger: { player: "useCardToPlayered" },
        forced: true,
        filter(event, player) {
            if (!event.card || event.card.name !== "sha") return false;
            return true;
        },
        async content(event, trigger, player) {
            const target = trigger.target;
            if (!target || !target.isIn()) return;
            if (!player.isIn()) return;

            // Must show all hand cards
            await target.showHandcards(get.translation(target) + "是" + get.translation(player) + "【杀】的目标，须展示所有手牌");

            const cards = target.getCards("h");
            if (!cards.length) return;

            // Yuchenchen (player) selects one card to detain
            const result = await player
                .choosePlayerCard(target, "h", true, "visible", [1, 1])
                .set("prompt", "龙殛：选择扣置" + get.translation(target) + "的一张手牌")
                .set("ai", button => {
                    // Take the most valuable card from enemies, least valuable from allies
                    const val = get.value(button.link);
                    if (get.attitude(player, target) > 0) return -val;
                    return val;
                })
                .forResult();

            if (!result.bool || !result.cards.length) return;

            // Place card in target's own expansion
            const next = target.addToExpansion(result.cards, player, "give");
            next.gaintag = ["ycc_longji"];

            // Ensure the return sub-skill is active on source (Yuchenchen)
            if (!player.hasSkill("ycc_longji_return", null, null, false)) {
                player.addSkill("ycc_longji_return");
            }
        },
        onremove(player, skill) {
            // When 龙殛 is removed, return all detained cards to their owners
            const targets = game.filterPlayer(t => t.getExpansions("ycc_longji").length > 0);
            for (const target of targets) {
                const cards = target.getExpansions("ycc_longji");
                if (cards.length > 0) {
                    if (target.isIn() && !target.isDead()) {
                        target.gain(cards, "gain2");
                    } else {
                        game.cardsDiscard(cards);
                    }
                }
            }
        },
        subSkill: {
            return: {
                charlotte: true,
                trigger: { global: "phaseAfter" },
                forced: true,
                filter(event, player) {
                    // Check if any player has ycc_longji expansion cards to return
                    return game.hasPlayer(t => t.getExpansions("ycc_longji").length > 0);
                },
                async content(event, trigger, player) {
                    // Return detained cards for each target, separately
                    const targets = game.filterPlayer(t => t.getExpansions("ycc_longji").length > 0);
                    for (const target of targets) {
                        const cards = target.getExpansions("ycc_longji");
                        if (cards.length > 0 && target.isIn() && !target.isDead()) {
                            await target.gain(cards, "gain2");
                            game.log(target, "收回了被【龙殛】扣置的牌");
                        } else if (cards.length > 0) {
                            game.cardsDiscard(cards);
                        }
                    }
                },
            },
        },
    },

    
};

export const title = {
    ycc_yuchengchen: "#g瑞武帝",
};

export const translates = {
ycc_yuchengchen: "御承宸",
    ycc_yuchengchen_prefix: "ycc",
    ycc_huangming: "皇命",
    ycc_huangming_info: "当你使用【杀】结算完成后，你可以令一名其他角色选择一项：1.对该目标使用一张【杀】（无视距离限制），然后你交给其一张手牌（没有则不交）；2.你弃置其一张手牌。",
    ycc_yuce: "御策",
    ycc_yuce_info: "出牌阶段结束时，若你手牌数为全场最高，你可以视为使用一张【杀】；若你手牌数为全场最低，你可以摸两张牌。",
    ycc_qinzheng: "亲征",
    ycc_qinzheng_info: "限定技，出牌阶段，你可以失去一点体力上限和【皇命】，手牌上限+1，获得【龙殛】。",
    ycc_longji: "龙殛",
    ycc_longji_info: "当一名角色成为你【杀】的目标时，其必须展示所有手牌，然后你扣置其一张手牌直到本回合结束。",
    ycc_handlimit: "亲征",
    ycc_handlimit_info: "你的手牌上限+1。",

    
};

export const sort = ["ycc_yuchengchen"];
