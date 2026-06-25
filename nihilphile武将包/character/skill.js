import { lib, game, ui, get, ai, _status } from "noname";

const AMMO = "tia_ammo";
const MAX_AMMO = 6;

function getAmmo(player) {
    if (!Array.isArray(player.storage[AMMO])) player.storage[AMMO] = [];
    return player.storage[AMMO];
}

function syncAmmo(player) {
    const ammo = getAmmo(player);
    player.syncStorage(AMMO);
    if (ammo.length) player.markSkill(AMMO);
    else player.unmarkSkill(AMMO);
    player.updateMarks();
}

function addAmmoFromCard(player, card, visible, source) {
    const ammo = getAmmo(player);
    if (!card) return false;
    if (ammo.length >= MAX_AMMO) {
        ammo.shift();
        game.log(player, "排出了最早的一发", "#g弹药");
    }
    ammo.push({
        number: get.number(card),
        visible: !!visible,
        source,
        cardid: card.cardid,
        name: get.name(card),
        suit: get.suit(card),
    });
    syncAmmo(player);
    return true;
}

function takeAmmo(player) {
    const ammo = getAmmo(player);
    if (!ammo.length) return null;
    const item = ammo.shift();
    syncAmmo(player);
    return item;
}

function makeRongguangSha(player) {
    const first = getAmmo(player)[0];
    const card = {
        name: "sha",
        isCard: true,
        storage: { tia_rongguang: true },
    };
    if (first && first.source === "daowu") card.nature = "fire";
    return card;
}

function isEntityShaOrJiu(card) {
    return get.itemtype(card) === "card" && get.position(card) === "h" && (card.name === "sha" || card.name === "jiu");
}

function getDaowuContext(event, player) {
    const respondTo = event.respondTo;
    if (!respondTo || !respondTo[0] || !respondTo[1]) return null;
    const source = respondTo[0], card = respondTo[1];
    if (!source.isIn || !source.isIn()) return null;
    if (!get.is.damageCard(card)) return null;
    return { source, card };
}

function refreshRongguangQinggang(player, target, card) {
    if (!card || card.name !== "sha" || !target || !target.isIn || !target.isIn()) return;
    if (!player.getEquip || !player.getEquip("qinggang")) return;
    target.addTempSkill("qinggang2");
    if (!Array.isArray(target.storage.qinggang2)) target.storage.qinggang2 = [];
    if (!target.storage.qinggang2.includes(card)) target.storage.qinggang2.push(card);
    target.markSkill("qinggang2");
}

/** @type { importCharacterConfig['skill'] } */
const skills = {
    ycc_huangming: {
        audio: 2,
        trigger: { player: "useCardToPlayered" },
        filter(event, player) {
            return event.card && event.card.name === "sha";
        },
        direct: true,
        async content(event, trigger, player) {
            const originalTarget = trigger.target;
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

            // Helper: execute option 1 - chosen uses sha on original target, then gives card
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

                // After successfully using sha, if still has hand cards, force give one to original target
                if (useResult.bool && chosen.countCards("h") > 0 && originalTarget.isIn()) {
                    const giveResult = await chosen
                        .chooseCard("h", true, "皇命：请交给" + get.translation(originalTarget) + "一张手牌")
                        .set("ai", card => {
                            return 5 - get.value(card);
                        })
                        .forResult();
                    if (giveResult.bool && giveResult.cards.length) {
                        await chosen.give(giveResult.cards, originalTarget);
                    }
                }
            }

            // Helper: execute option 2 - Yuchenchen discards one card from chosen
            async function executeOption2(chosen) {
                await player.discardPlayerCard(chosen, "h", true);
            }

            // Choose another character (not Yuchenchen; original target is allowed per ruling)
            const result = await player
                .chooseTarget(
                    get.prompt("ycc_huangming"),
                    "令一名其他角色选择一项执行",
                    (card, p, target) => {
                        if (target === p) return false;
                        return canUseShaOn(target) || hasHandCards(target);
                    }
                )
                .set("ai", target => {
                    const pl = get.player();
                    const att = get.attitude(pl, target);
                    if (att <= 0) return 6 - att;
                    if (canUseShaOn(target)) return 3;
                    return 1;
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
                        "对" + get.translation(originalTarget) + "使用一张【杀】（无视距离），然后交给其一张手牌",
                        "令" + get.translation(player) + "弃置你一张手牌"
                    ])
                    .set("prompt", "皇命：请选择一项")
                    .set("ai", () => {
                        const me = get.player();
                        if (get.attitude(me, player) <= 0) {
                            if (me.countCards("h") <= 1) return 0;
                            return 1;
                        }
                        if (canUseShaOn(me)) return 0;
                        return 1;
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
                if (player.hasUseTarget(shaCard, false)) {
                    const shaResult = await player
                        .chooseBool()
                        .set("prompt", get.prompt("ycc_yuce"))
                        .set("prompt2", "你可以视为使用一张【杀】")
                        .set("ai", () => player.hasUseTarget(shaCard, false))
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
        filter(event, player) {
            return player.hasSkill("ycc_huangming", null, null, false);
        },
        async content(event, trigger, player) {
            player.awakenSkill(event.name);
            await player.loseMaxHp();
            player.removeSkill("ycc_huangming");
            player.addSkill("ycc_handlimit");
            player.addSkill("ycc_longji");
        },
        ai: {
            order: 9,
            result: {
                player(player) {
                    if (player.hp >= player.maxHp - 1 && player.countCards("h") >= player.maxHp) return 1;
                    if (player.hp <= 1) return -1;
                    return 0;
                },
            },
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

    tia_ammo: {
        charlotte: true,
        mark: true,
        marktext: "弹",
        intro: {
            markcount(storage, player) {
                return getAmmo(player).length;
            },
            content(storage, player) {
                const ammo = Array.isArray(storage) ? storage : getAmmo(player);
                let str = "当前弹药数：" + ammo.length;
                for (let i = 0; i < ammo.length; i++) {
                    const item = ammo[i];
                    str += "<br>" + (i + 1) + "：[" + (item.visible ? item.number : "未知") + "]";
                }
                return str;
            },
        },
    },

    tia_qiangli: {
        audio: 2,
        locked: true,
        forced: true,
        mod: {
            cardname(card, player) {
                if (_status.currentPhase === player && isEntityShaOrJiu(card)) return "tia_danyi";
            },
            cardEnabled(card, player) {
                if (_status.currentPhase === player && isEntityShaOrJiu(card)) return true;
            },
            cardEnabled2(card, player) {
                if (_status.currentPhase === player && isEntityShaOrJiu(card)) return true;
            },
        },
    },

    tia_rongguang: {
        audio: 2,
        enable: "chooseToUse",
        hiddenCard(player, name) {
            return name === "sha" && getAmmo(player).length > 0;
        },
        filter(event, player) {
            if (!getAmmo(player).length) return false;
            return event.filterCard(makeRongguangSha(player), player, event);
        },
        viewAs(cards, player) {
            return makeRongguangSha(player);
        },
        filterCard() {
            return false;
        },
        selectCard: -1,
        log: false,
        async precontent(event, trigger, player) {
            const ammo = takeAmmo(player);
            if (!ammo) {
                if (!event.result) event.result = {};
                event.result.bool = false;
                return;
            }
            if (!event.result) event.result = {};
            event.result.card = makeRongguangSha(player);
            event.result.cards = [];
            const card = event.result.card;
            if (!card.storage) card.storage = {};
            // Generate unique ID to precisely identify this 荣光 usage
            const rongguangId = get.id();
            card.storage.tia_rongguang = true;
            card.storage.tia_rongguang_state = {
                round: 1,
                currentPoint: ammo.number,
                id: rongguangId,
            };
            if (ammo.source === "daowu") card.nature = "fire";
            player.logSkill("tia_rongguang");
            game.log(player, "移去了最底端的一发弹药");
        },
        ai: {
            respondSha: true,
            skillTagFilter(player) {
                return getAmmo(player).length > 0;
            },
            order: 8,
            result: {
                player(player) {
                    return getAmmo(player).length ? 1 : 0;
                },
            },
        },
        group: ["tia_rongguang_track", "tia_rongguang_extra"],
    },

    tia_rongguang_track: {
        charlotte: true,
        trigger: { player: "useCard1" },
        forced: true,
        popup: false,
        filter(event, player) {
            return !!(event.card && event.card.storage && event.card.storage.tia_rongguang);
        },
        async content(event, trigger, player) {
            const state = trigger.card.storage.tia_rongguang_state;
            if (!state) return;
            if (!trigger.storage) trigger.storage = {};
            trigger.storage.tia_rongguang_state = state;
            trigger.customArgs = trigger.customArgs || {};
            trigger.customArgs.default = trigger.customArgs.default || {};
            // Propagate unique ID from card to useCard event for precise matching
            trigger._tia_rongguang_id = state.id;
            const threshold = 16 - 4 * state.round;
            game.log(
                "#g荣光",
                "第",
                "#y" + state.round,
                "次结算：弹药点数",
                "#y" + state.currentPoint,
                "，阈值",
                "#y" + threshold,
                state.currentPoint > threshold ? "，被抵消" : "，生效"
            );
            if (state.currentPoint > threshold) {
                trigger.customArgs.default.unhurt = true;
            } else {
                delete trigger.customArgs.default.unhurt;
            }
        },
    },

    tia_rongguang_extra: {
        charlotte: true,
        trigger: { player: "useCardToEnd" },
        forced: true,
        popup: false,
        filter(event, player) {
            // Precise ID matching: useCardToEnd.parent is the useCard event.
            // Only passes for useCard events tagged with a 荣光 unique ID.
            const useCard = event.parent;
            if (!useCard || !useCard._tia_rongguang_id) return false;
            if (!getAmmo(player).length) return false;
            // Only the last target triggers extra settlement (multi-target sha, e.g. 方天画戟)
            const targets = useCard.targets || [];
            if (targets.length && event.target && event.target !== targets[targets.length - 1]) return false;
            return true;
        },
        async content(event, trigger, player) {
            const useCard = trigger.parent;
            if (!useCard || !useCard._tia_rongguang_id) return;
            if (!useCard.storage || !useCard.storage.tia_rongguang_state) return;
            const state = useCard.storage.tia_rongguang_state;
            const targets = useCard.targets || [];
            if (!targets.length) return;

            const target = targets[0];
            if (!target || !target.isIn()) return;

            const nextRound = state.round + 1;
            const choice = await player.chooseBool()
                .set("prompt", get.prompt("tia_rongguang"))
                .set("prompt2", "是否移去最底端的一发弹药，令此【杀】对" + get.translation(target) + "额外结算一次？")
                .set("ai", () => get.attitude(player, target) < 0)
                .forResult();
            if (!choice.bool) return;

            const ammo = takeAmmo(player);
            if (!ammo) return;

            player.logSkill("tia_rongguang");
            game.log(player, "移去了最底端的一发弹药");

            state.round = nextRound;
            state.currentPoint = ammo.number;
            useCard.customArgs = useCard.customArgs || {};
            useCard.customArgs.default = useCard.customArgs.default || {};
            const threshold = 16 - 4 * state.round;
            game.log(
                "#g荣光",
                "第",
                "#y" + state.round,
                "次结算：弹药点数",
                "#y" + ammo.number,
                "，阈值",
                "#y" + threshold,
                ammo.number > threshold ? "，被抵消" : "，生效"
            );
            if (ammo.number > threshold) {
                useCard.customArgs.default.unhurt = true;
            } else {
                delete useCard.customArgs.default.unhurt;
            }
            refreshRongguangQinggang(player, target, useCard.card);
            useCard.effectCount = (useCard.effectCount || 1) + 1;
        },
    },

    tia_daowu: {
        audio: 2,
        enable: ["chooseToUse", "chooseToRespond"],
        hiddenCard(player, name) {
            return (name === "sha" || name === "shan") && player.countCards("h", card => get.color(card, player) === "black") > 0;
        },
        filter(event, player) {
            if (!getDaowuContext(event, player)) return false;
            if (!player.countCards("h", card => get.color(card, player) === "black")) return false;
            return event.filterCard({ name: "sha", isCard: true }, player, event) || event.filterCard({ name: "shan", isCard: true }, player, event);
        },
        chooseButton: {
            dialog(event, player) {
                const list = [];
                if (event.filterCard({ name: "sha", isCard: true }, player, event)) list.push(["基本", "", "sha"]);
                if (event.filterCard({ name: "shan", isCard: true }, player, event)) list.push(["基本", "", "shan"]);
                return ui.create.dialog("悼舞", [list, "vcard"], "hidden");
            },
            backup(links, player) {
                const name = links[0][2];
                return {
                    viewAs: { name, isCard: true, storage: { tia_daowu: true } },
                    filterCard(card, player) {
                        return get.color(card, player) === "black";
                    },
                    position: "h",
                    selectCard: 1,
                    popname: true,
                    async precontent(event, trigger, player) {
                        if (event.result.card) {
                            event.result.card.storage = event.result.card.storage || {};
                            event.result.card.storage.tia_daowu = true;
                        }
                    },
                };
            },
            prompt(links) {
                return "将一张黑色牌当作【" + get.translation(links[0][2]) + "】响应";
            },
        },
        ai: {
            respondSha: true,
            respondShan: true,
            skillTagFilter(player) {
                return player.countCards("h", card => get.color(card, player) === "black") > 0;
            },
        },
        group: "tia_daowu_collect",
    },

    tia_daowu_collect: {
        charlotte: true,
        trigger: { player: ["useCardAfter", "respondAfter"] },
        forced: true,
        popup: false,
        filter(event, player) {
            if (!event.card) return false;
            if (!["sha", "shan"].includes(event.card.name)) return false;
            if (event.card.storage && event.card.storage.tia_rongguang) return false;
            if (!Array.isArray(event.cards) || !event.cards.length) return false;
            return !!getDaowuContext(event, player);
        },
        async content(event, trigger, player) {
            const cards = trigger.cards;
            if (!Array.isArray(cards)) return;
            for (const entityCard of cards) {
                if (!entityCard || getAmmo(player).length >= MAX_AMMO) continue;
                const result = await player.chooseBool(get.prompt("tia_daowu"), "是否将" + get.translation(entityCard) + "明置为一发弹药？")
                    .set("choice", true)
                    .forResult();
                if (!result.bool) continue;
                await game.cardsGotoSpecial(entityCard);
                addAmmoFromCard(player, entityCard, true, "daowu");
                player.logSkill("tia_daowu");
                game.log(player, "将", entityCard, "明置为一发弹药");
            }
        },
    },
};

export default skills;
