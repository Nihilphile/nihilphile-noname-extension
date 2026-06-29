(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";

    function image(id, ext) {
        return "extension/" + EXT_NAME + "/image/character/" + id + "." + (ext || "png");
    }

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
    return {
        name: "sha",
        isCard: true,
        storage: { tia_rongguang: true },
    };
}

function isEntityShaOrJiu(card) {
    return get.itemtype(card) === "card" && get.position(card) === "h" && (card.name === "sha" || card.name === "jiu");
}

function isDamageCard(card) {
    if (get.is && get.is.damageCard) return get.is.damageCard(card);
    if (get.tag && get.tag(card, "damage")) return true;
    return card.name === "sha";
}

function getDaowuContext(event, player) {
    const respondTo = event.respondTo;
    if (respondTo && respondTo[0] && respondTo[1]) {
        const source0 = respondTo[0], card0 = respondTo[1];
        if (source0.isIn && source0.isIn() && isDamageCard(card0)) {
            return { source: source0, card: card0 };
        }
    }
    let evt = event.parent;
    while (evt) {
        if (evt.respondTo && evt.respondTo[0] && evt.respondTo[1]) {
            const source1 = evt.respondTo[0], card1 = evt.respondTo[1];
            if (source1.isIn && source1.isIn() && isDamageCard(card1)) {
                return { source: source1, card: card1 };
            }
        }
        evt = evt.parent;
    }
    const useCard = event.getParent("useCard");
    if (useCard && useCard.card && useCard.player && isDamageCard(useCard.card)) {
        const src = useCard.player;
        if (src && src.isIn && src.isIn()) {
            return { source: src, card: useCard.card };
        }
    }
    return null;
}

function refreshRongguangQinggang(player, target, card) {
    if (!card || card.name !== "sha" || !target || !target.isIn || !target.isIn()) return;
    if (!player.getEquip || !player.getEquip("qinggang")) return;
    target.addTempSkill("qinggang2");
    if (!Array.isArray(target.storage.qinggang2)) target.storage.qinggang2 = [];
    if (!target.storage.qinggang2.includes(card)) target.storage.qinggang2.push(card);
    target.markSkill("qinggang2");
}

async function darkLoad(player, source) {
    const cards = get.cards(1);
    if (!cards.length) return false;
    await game.cardsGotoSpecial(cards);
    if (!addAmmoFromCard(player, cards[0], false, source)) return false;
    game.log(player, "暗装了一发", "#g弹药");
    return true;
}

var character = {
    tia_tiya: {
        sex: "female",
        group: "western",
        hp: 3,
        skills: ["tia_qiangli", "tia_rongguang", "tia_daowu"],
        img: image("tia_tiya"),
    },
};

var cards = {
tia_danyi: {
        type: "basic",
        enable: true,
        selectTarget: -1,
        toself: true,
        filterTarget(card, player, target) {
            return target === player;
        },
        modTarget: true,
        async content(event, trigger, player) {
            const target = event.target || player;
            // Draw 1 card
            const cards = get.cards(1);
            if (cards.length) {
                await target.gain(cards, "gain2", "log");
            }
            // Dark load 1 card as ammo
            await darkLoad(target, "qiangli");
        },
        ai: {
            order: 8,
            result: {
                target(player, target) {
                    return 1;
                },
            },
            tag: {
                draw: 0.5,
            },
        },
    },
};

var skills = {
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

var title = {
    tia_tiya: "#g黑纱鸣礼",
};

var translates = {
tia_tiya: "缇娅",
    tia_tiya_prefix: "黑纱鸣礼",

    tia_danyi: "弹仪",
    tia_danyi_info: "对自己使用。你摸一张牌，然后将牌堆顶一张牌暗置于武将牌上作为\"弹药\"。若弹药超过上限，按先进先出排出最早弹药。此牌不是锦囊牌，不能被【无懈可击】响应。",
    tia_ammo: "弹药",
    tia_qiangli: "枪礼",
    tia_qiangli_info: "<b>锁定技，</b>你的回合内，你的实体【杀】/【酒】视为【弹仪】。【弹仪】：摸一张牌，然后将牌堆顶一张牌<b>暗装</b>为<b>\"弹药\"</b>。<b>暗装</b>：将牌堆顶一张牌暗置于武将牌上作为<b>\"弹药\"</b>，<b>\"弹药\"</b>上限6张，超过上限时按先进先出排出最早弹药。",
    tia_rongguang: "荣光",
    tia_rongguang_info: "当你需要使用【杀】时，你可移去最底端的一张\"弹药\"，视为使用一张【杀】；以此法使用的【杀】结算结束时，你可移去最底端的一张\"弹药\"，使此【杀】额外结算一次。若此次移除的\"弹药\"点数大于16-4X，视为此结算被抵消（X为此【杀】结算次数）。若初始击发移除的弹药为悼舞明置弹药，则此【杀】视为火【杀】。",
    tia_daowu: "悼舞",
    tia_daowu_info: "当你成为伤害牌目标时，你的黑色手牌可以视为【杀】或者【闪】响应。每当你使用实体【杀】或【闪】响应伤害牌后，你可将此牌明置于武将牌上作为\"弹药\"，且此\"弹药\"击发而使用的【杀】改为【火杀】。",
};

var sort = ["tia_tiya"];

window.nihilModules["tia"] = {
    character: character,
    card: cards,
    skill: skills,
    translate: translates,
    title: title,
    sort: sort,
};
})();
