import { lib, game, ui, get, ai, _status } from "noname";

const AMMO = "tia6_ammo";
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
    return {
        name: "sha",
        isCard: true,
        storage: { tia6_rongguang: true },
    };
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
    tia6_ammo: {
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

    tia6_qiangli: {
        audio: 2,
        locked: true,
        forced: true,
        mod: {
            cardname(card, player) {
                if (_status.currentPhase === player && isEntityShaOrJiu(card)) return "tia6_danyi";
            },
            cardEnabled(card, player) {
                if (_status.currentPhase === player && isEntityShaOrJiu(card)) return true;
            },
            cardEnabled2(card, player) {
                if (_status.currentPhase === player && isEntityShaOrJiu(card)) return true;
            },
        },
    },

    tia6_rongguang: {
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
            card.storage.tia6_rongguang = true;
            card.storage.tia6_rongguang_state = {
                round: 1,
                currentPoint: ammo.number,
                id: rongguangId,
            };
            if (ammo.source === "daowu") card.nature = "fire";
            player.logSkill("tia6_rongguang");
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
        group: ["tia6_rongguang_track", "tia6_rongguang_extra"],
    },

    tia6_rongguang_track: {
        charlotte: true,
        trigger: { player: "useCard1" },
        forced: true,
        popup: false,
        filter(event, player) {
            return !!(event.card && event.card.storage && event.card.storage.tia6_rongguang);
        },
        async content(event, trigger, player) {
            const state = trigger.card.storage.tia6_rongguang_state;
            if (!state) return;
            if (!trigger.storage) trigger.storage = {};
            trigger.storage.tia6_rongguang_state = state;
            trigger.customArgs = trigger.customArgs || {};
            trigger.customArgs.default = trigger.customArgs.default || {};
            // Propagate unique ID from card to useCard event for precise matching
            trigger._tia6_rongguang_id = state.id;
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

    tia6_rongguang_extra: {
        charlotte: true,
        trigger: { player: "useCardToEnd" },
        forced: true,
        popup: false,
        filter(event, player) {
            // Precise ID matching: useCardToEnd.parent is the useCard event.
            // Only passes for useCard events tagged with a 荣光 unique ID.
            const useCard = event.parent;
            if (!useCard || !useCard._tia6_rongguang_id) return false;
            if (!getAmmo(player).length) return false;
            // Only the last target triggers extra settlement (multi-target sha, e.g. 方天画戟)
            const targets = useCard.targets || [];
            if (targets.length && event.target && event.target !== targets[targets.length - 1]) return false;
            return true;
        },
        async content(event, trigger, player) {
            const useCard = trigger.parent;
            if (!useCard || !useCard._tia6_rongguang_id) return;
            if (!useCard.storage || !useCard.storage.tia6_rongguang_state) return;
            const state = useCard.storage.tia6_rongguang_state;
            const targets = useCard.targets || [];
            if (!targets.length) return;

            const target = targets[0];
            if (!target || !target.isIn()) return;

            const nextRound = state.round + 1;
            const choice = await player.chooseBool()
                .set("prompt", get.prompt("tia6_rongguang"))
                .set("prompt2", "是否移去最底端的一发弹药，令此【杀】对" + get.translation(target) + "额外结算一次？")
                .set("ai", () => get.attitude(player, target) < 0)
                .forResult();
            if (!choice.bool) return;

            const ammo = takeAmmo(player);
            if (!ammo) return;

            player.logSkill("tia6_rongguang");
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

    tia6_daowu: {
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
                    viewAs: { name, isCard: true, storage: { tia6_daowu: true } },
                    filterCard(card, player) {
                        return get.color(card, player) === "black";
                    },
                    position: "h",
                    selectCard: 1,
                    popname: true,
                    async precontent(event, trigger, player) {
                        if (event.result.card) {
                            event.result.card.storage = event.result.card.storage || {};
                            event.result.card.storage.tia6_daowu = true;
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
        group: "tia6_daowu_collect",
    },

    tia6_daowu_collect: {
        charlotte: true,
        trigger: { player: ["useCardAfter", "respondAfter"] },
        forced: true,
        popup: false,
        filter(event, player) {
            if (!event.card) return false;
            if (!["sha", "shan"].includes(event.card.name)) return false;
            if (event.card.storage && event.card.storage.tia6_rongguang) return false;
            if (!Array.isArray(event.cards) || !event.cards.length) return false;
            return !!getDaowuContext(event, player);
        },
        async content(event, trigger, player) {
            const cards = trigger.cards;
            if (!Array.isArray(cards)) return;
            for (const entityCard of cards) {
                if (!entityCard || getAmmo(player).length >= MAX_AMMO) continue;
                const result = await player.chooseBool(get.prompt("tia6_daowu"), "是否将" + get.translation(entityCard) + "明置为一发弹药？")
                    .set("choice", true)
                    .forResult();
                if (!result.bool) continue;
                await game.cardsGotoSpecial(entityCard);
                addAmmoFromCard(player, entityCard, true, "daowu");
                player.logSkill("tia6_daowu");
                game.log(player, "将", entityCard, "明置为一发弹药");
            }
        },
    },
};

export default skills;
