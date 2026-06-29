import { lib, game, ui, get, ai, _status } from "../../../noname.js";

const AMMO = "tia_ammo";
const MAX_AMMO = 6;

export function getAmmo(player) {
    if (!Array.isArray(player.storage[AMMO])) player.storage[AMMO] = [];
    return player.storage[AMMO];
}

export function syncAmmo(player) {
    const ammo = getAmmo(player);
    player.syncStorage(AMMO);
    if (ammo.length) player.markSkill(AMMO);
    else player.unmarkSkill(AMMO);
    player.updateMarks();
}

export function addAmmoFromCard(player, card, visible, source) {
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

export function takeAmmo(player) {
    const ammo = getAmmo(player);
    if (!ammo.length) return null;
    const item = ammo.shift();
    syncAmmo(player);
    return item;
}

export function makeRongguangSha(player) {
    return {
        name: "sha",
        isCard: true,
        storage: { tia_rongguang: true },
    };
}

export function isEntityShaOrJiu(card) {
    return get.itemtype(card) === "card" && get.position(card) === "h" && (card.name === "sha" || card.name === "jiu");
}

export function isDamageCard(card) {
    if (get.is && get.is.damageCard) return get.is.damageCard(card);
    if (get.tag && get.tag(card, "damage")) return true;
    return card.name === "sha";
}

export function getDaowuContext(event, player) {
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

export function refreshRongguangQinggang(player, target, card) {
    if (!card || card.name !== "sha" || !target || !target.isIn || !target.isIn()) return;
    if (!player.getEquip || !player.getEquip("qinggang")) return;
    target.addTempSkill("qinggang2");
    if (!Array.isArray(target.storage.qinggang2)) target.storage.qinggang2 = [];
    if (!target.storage.qinggang2.includes(card)) target.storage.qinggang2.push(card);
    target.markSkill("qinggang2");
}

export async function darkLoad(player, source) {
    const cards = get.cards(1);
    if (!cards.length) return false;
    await game.cardsGotoSpecial(cards);
    if (!addAmmoFromCard(player, cards[0], false, source)) return false;
    game.log(player, "暗装了一发", "#g弹药");
    return true;
}

export { AMMO, MAX_AMMO };
