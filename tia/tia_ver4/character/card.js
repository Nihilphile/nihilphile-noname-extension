import { lib, game, ui, get, ai, _status } from "noname";

const AMMO = "tia4_ammo";
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

async function darkLoad(player, source) {
    const cards = get.cards(1);
    if (!cards.length) return false;
    await game.cardsGotoSpecial(cards);
    if (!addAmmoFromCard(player, cards[0], false, source)) return false;
    game.log(player, "暗装了一发", "#g弹药");
    return true;
}

async function drawTwoDiscardOne(player) {
    const cards = get.cards(2);
    if (!cards.length) return;
    await player.gain(cards, "gain2", "log");
    const valid = cards.filter(card => get.owner(card) === player);
    if (!valid.length) return;
    await player.chooseToDiscard("h", true, card => valid.includes(card))
        .set("prompt", "弹仪：弃置此次摸到的一张牌")
        .set("ai", card => 6 - get.value(card))
        .forResult();
}

const cards = {
    tia4_danyi: {
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
            const result = await target.chooseControl("暗装2次", "摸2弃1")
                .set("prompt", "弹仪")
                .set("prompt2", "选择暗装2次，或摸两张牌并弃置其中一张")
                .set("ai", () => getAmmo(target).length < 4 ? 0 : 1)
                .forResult();
            if (result.control === "暗装2次") {
                await darkLoad(target, "qiangli");
                await darkLoad(target, "qiangli");
            } else {
                await drawTwoDiscardOne(target);
            }
        },
        ai: {
            order: 8,
            result: {
                target(player, target) {
                    return 1;
                },
            },
            tag: {
                draw: 1,
            },
        },
    },
};

export default cards;
