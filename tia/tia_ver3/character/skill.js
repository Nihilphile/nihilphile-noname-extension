import { lib, game, ui, get, ai, _status } from "noname";

const AMMO = "tia3_ammo";
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
    if (!card || ammo.length >= MAX_AMMO) return false;
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
        storage: { tia3_rongguang: true },
    };
    if (first && first.source === "daowu") card.nature = "fire";
    return card;
}

function getDaowuContext(event, player) {
    const respondTo = event.respondTo;
    if (!respondTo || !respondTo[0] || !respondTo[1]) return null;
    const source = respondTo[0], card = respondTo[1];
    if (!source.isIn || !source.isIn()) return null;
    if (!get.is.damageCard(card)) return null;
    return { source, card };
}

function daowuTrack(player, cards) {
    if (!cards || !cards.length) return;
    if (!Array.isArray(player.storage.tia3_daowu_tracked)) player.storage.tia3_daowu_tracked = [];
    for (const card of cards) {
        if (card && card.cardid && !player.storage.tia3_daowu_tracked.includes(card.cardid)) {
            player.storage.tia3_daowu_tracked.push(card.cardid);
        }
    }
}

function daowuLostCards(event, player) {
    if (event.name === "cardsDiscard") {
        return event.cards && event.cards.filterInD ? event.cards.filterInD("d") : [];
    }
    const lose = event.getl && event.getl(player);
    return lose ? lose.cards2 || [] : [];
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
    tia3_ammo: {
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

    tia3_qiangli: {
        audio: 2,
        forced: true,
        trigger: { player: ["useCardAfter", "respondAfter"] },
        filter(event, player) {
            if (!event.card) return false;
            if (event.card.storage && event.card.storage.tia3_rongguang) return false;
            if (!["sha", "shan"].includes(event.card.name)) return false;
            return getAmmo(player).length < MAX_AMMO;
        },
        async content(event, trigger, player) {
            const cards = get.cards(1);
            if (!cards.length) return;
            await game.cardsGotoSpecial(cards);
            addAmmoFromCard(player, cards[0], false, "qiangli");
            game.log(player, "装填了一发", "#g暗置弹药");
        },
        mod: {
            cardUsable(card, player, num) {
                if (!player.isPhaseUsing()) return;
                if (card.storage && card.storage.tia3_qiangli_recast && (card.name === "sha" || card.name === "jiu")) return Infinity;
                if (get.itemtype(card) !== "card" || get.position(card) !== "h") return;
                if (card.name === "sha" || card.name === "jiu") return Infinity;
            },
            cardEnabled(card, player) {
                if (!player.isPhaseUsing()) return;
                if (card.storage && card.storage.tia3_qiangli_recast && (card.name === "sha" || card.name === "jiu")) return true;
                if (get.itemtype(card) !== "card" || get.position(card) !== "h") return;
                if (card.name === "sha" || card.name === "jiu") return true;
            },
            selectTarget(card, player, range) {
                if (!player.isPhaseUsing()) return;
                if (card.storage && card.storage.tia3_qiangli_recast && (card.name === "sha" || card.name === "jiu")) {
                    range[0] = -1;
                    range[1] = -1;
                    return;
                }
                if (get.itemtype(card) !== "card" || get.position(card) !== "h") return;
                if (card.name === "sha" || card.name === "jiu") {
                    range[0] = -1;
                    range[1] = -1;
                }
            },
            targetInRange(card, player, target) {
                if (!player.isPhaseUsing()) return;
                if (card.storage && card.storage.tia3_qiangli_recast && card.name === "sha") return true;
                if (get.itemtype(card) !== "card" || get.position(card) !== "h") return;
                if (card.name === "sha") return true;
            },
        },
        group: ["tia3_qiangli_recast", "tia3_qiangli_draw"],
        subSkill: {
            recast: {
                enable: "phaseUse",
                filter(event, player) {
                    return player.hasCard(card => get.position(card) === "h" && ["sha", "jiu"].includes(get.name(card, player)), "h");
                },
                filterCard(card, player) {
                    return get.position(card) === "h" && ["sha", "jiu"].includes(get.name(card, player));
                },
                position: "h",
                selectCard: 1,
                selectTarget: -1,
                viewAs(cards, player) {
                    if (!cards || !cards.length) return null;
                    return {
                        name: get.name(cards[0], player),
                        isCard: true,
                        storage: { tia3_qiangli_recast: true },
                    };
                },
                prompt: "将一张实体手牌【杀】或【酒】重铸",
                check(card) {
                    return 6 - get.value(card);
                },
                ai: {
                    order: 8,
                    result: {
                        player: 1,
                    },
                },
            },
            draw: {
                charlotte: true,
                trigger: { player: "useCard1" },
                forced: true,
                popup: false,
                filter(event, player) {
                    if (!player.isPhaseUsing()) return false;
                    if (!event.card || !["sha", "jiu"].includes(event.card.name)) return false;
                    if (event.card.storage && event.card.storage.tia3_rongguang) return false;
                    if (!(event.card.storage && event.card.storage.tia3_qiangli_recast) && !(Array.isArray(event.cards) && event.cards.length > 0 && event.cards.every(card => ["sha", "jiu"].includes(get.name(card, player))))) return false;
                    return Array.isArray(event.cards) && event.cards.length > 0;
                },
                async content(event, trigger, player) {
                    trigger.addCount = false;
                    if (Array.isArray(trigger.targets)) trigger.targets.length = 0;
                    const stat = player.getStat().card;
                    const name = trigger.card.name;
                    if (typeof stat[name] === "number" && stat[name] > 0) stat[name]--;
                    player.logSkill("tia3_qiangli");
                    game.log(player, "将", trigger.card, "的效果改为摸一张牌");
                    await player.draw();
                },
            },
        },
    },

    tia3_rongguang: {
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
            if (!event.result.card) event.result.card = makeRongguangSha(player);
            const card = event.result.card;
            if (!card.storage) card.storage = {};
            card.storage.tia3_rongguang = true;
            card.storage.tia3_rongguang_state = {
                round: 1,
                currentPoint: ammo.number,
            };
            if (ammo.source === "daowu") card.nature = "fire";
            player.logSkill("tia3_rongguang");
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
        group: ["tia3_rongguang_track", "tia3_rongguang_extra"],
    },

    tia3_rongguang_track: {
        charlotte: true,
        trigger: { player: "useCard1" },
        forced: true,
        popup: false,
        filter(event, player) {
            return !!(event.card && event.card.storage && event.card.storage.tia3_rongguang);
        },
        async content(event, trigger, player) {
            const state = trigger.card.storage.tia3_rongguang_state;
            if (!state) return;
            if (!trigger.storage) trigger.storage = {};
            trigger.storage.tia3_rongguang_state = state;
            trigger.customArgs = trigger.customArgs || {};
            trigger.customArgs.default = trigger.customArgs.default || {};
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

    tia3_rongguang_extra: {
        charlotte: true,
        trigger: { player: "useCardToEnd" },
        forced: true,
        popup: false,
        filter(event, player) {
            const useCard = event.getParent("useCard") || event.parent;
            return !!(useCard && useCard.card && useCard.card.storage && useCard.card.storage.tia3_rongguang && getAmmo(player).length);
        },
        async content(event, trigger, player) {
            const useCard = trigger.getParent("useCard") || trigger.parent;
            if (!useCard || !useCard.storage || !useCard.storage.tia3_rongguang_state) return;
            const state = useCard.storage.tia3_rongguang_state;
            const targets = useCard.targets || [];
            if (!targets.length) return;
            if (trigger.target && trigger.target !== targets[targets.length - 1]) return;

            const target = targets[0];
            if (!target || !target.isIn()) return;
            const nextRound = state.round + 1;
            const choice = await player.chooseBool()
                .set("prompt", get.prompt("tia3_rongguang"))
                .set("prompt2", "是否移去最底端的一发弹药，令此【杀】对" + get.translation(target) + "额外结算一次？")
                .set("ai", () => get.attitude(player, target) < 0)
                .forResult();
            if (!choice.bool) return;

            const ammo = takeAmmo(player);
            if (!ammo) return;
            player.logSkill("tia3_rongguang");
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

    tia3_daowu: {
        audio: 2,
        enable: ["chooseToUse", "chooseToRespond"],
        hiddenCard(player, name) {
            return (name === "sha" || name === "shan") && player.countCards("hs", card => get.color(card, player) === "black") > 0;
        },
        filter(event, player) {
            if (!getDaowuContext(event, player)) return false;
            if (!player.countCards("hs", card => get.color(card, player) === "black")) return false;
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
                    viewAs: { name, isCard: true, storage: { tia3_daowu: true } },
                    filterCard(card, player) {
                        return get.color(card, player) === "black";
                    },
                    position: "hs",
                    selectCard: 1,
                    popname: true,
                    async precontent(event, trigger, player) {
                        if (event.result.card) {
                            event.result.card.storage = event.result.card.storage || {};
                            event.result.card.storage.tia3_daowu = true;
                        }
                        daowuTrack(player, event.result.cards);
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
                return player.countCards("hs", card => get.color(card, player) === "black") > 0;
            },
        },
        group: "tia3_daowu_collect",
    },

    tia3_daowu_collect: {
        charlotte: true,
        trigger: {
            player: "loseAfter",
            global: "cardsDiscardAfter",
        },
        forced: true,
        popup: false,
        filter(event, player) {
            const tracked = player.storage.tia3_daowu_tracked;
            if (!Array.isArray(tracked) || !tracked.length) return false;
            if (getAmmo(player).length >= MAX_AMMO) return false;
            return daowuLostCards(event, player).some(card => tracked.includes(card.cardid));
        },
        async content(event, trigger, player) {
            const tracked = player.storage.tia3_daowu_tracked || [];
            const cards = daowuLostCards(trigger, player).filter(card => tracked.includes(card.cardid));
            if (!cards.length) return;
            for (const card of cards) {
                const index = player.storage.tia3_daowu_tracked.indexOf(card.cardid);
                if (index >= 0) player.storage.tia3_daowu_tracked.splice(index, 1);
                if (getAmmo(player).length >= MAX_AMMO) continue;
                const result = await player.chooseBool(get.prompt("tia3_daowu"), "是否将" + get.translation(card) + "明置为一发弹药？")
                    .set("choice", true)
                    .forResult();
                if (!result.bool) continue;
                await game.cardsGotoSpecial(card);
                addAmmoFromCard(player, card, true, "daowu");
                player.logSkill("tia3_daowu");
                game.log(player, "将", card, "明置为一发弹药");
            }
        },
    },
};

export default skills;
