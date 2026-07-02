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

function isDaowuResponseWindow(event, player) {
    if (!event) return false;
    if (getDaowuContext(event, player)) return true;
    if (event.type === "respondSha" || event.type === "respondShan") return true;
    if (event.name === "chooseToRespond" || event.name === "chooseToUse") {
        if (event.respondTo && event.respondTo[1] && isDamageCard(event.respondTo[1])) return true;
    }
    return false;
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

function tiaClamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
}

function tiaPoint(card) {
    return get.number(card) || (card && card.number) || 13;
}

function tiaCardName(card, player) {
    return card && card.name ? card.name : get.name(card, player);
}

function tiaShotThreshold(round) {
    return 16 - 4 * round;
}

function tiaIsKingPoint(num) {
    return num >= 13;
}

function tiaAmmoSucceeds(ammo, round) {
    if (!ammo || !ammo.visible) return null;
    return (ammo.number || 13) <= tiaShotThreshold(round);
}

function tiaAmmoIsVisibleKing(ammo) {
    return !!(ammo && ammo.visible && tiaIsKingPoint(ammo.number || 13));
}

function tiaAmmoWillFail(ammo, round) {
    const success = tiaAmmoSucceeds(ammo, round);
    return success === false;
}

function tiaCardToAmmo(card, player) {
    return {
        number: tiaPoint(card),
        visible: true,
        source: "candidate",
        name: tiaCardName(card, player),
        card,
    };
}

function tiaDarkAmmoCandidate() {
    return {
        number: 7,
        visible: false,
        source: "danyi",
        name: "unknown",
    };
}

function tiaAmmoNumber(ammo) {
    return ammo && ammo.visible ? (ammo.number || 13) : 7;
}

function tiaCanStartGroup(ammo) {
    if (!ammo) return false;
    if (!ammo.visible) return true;
    return !tiaIsKingPoint(ammo.number || 13);
}

function tiaCanSecond(ammo) {
    if (!ammo) return false;
    if (!ammo.visible) return true;
    return (ammo.number || 13) <= 8;
}

function tiaCanThird(ammo, next) {
    if (!ammo) return false;
    if (ammo.visible) return (ammo.number || 13) <= 4;
    return !next || !tiaCanSecond(next);
}

function tiaHiddenRunLength(ammoList, index) {
    let length = 0;
    while (index + length < ammoList.length && ammoList[index + length] && !ammoList[index + length].visible) length++;
    return length;
}

function tiaMakeAmmoGroups(ammoList) {
    const groups = [];
    let index = 0;
    while (index < ammoList.length) {
        const first = ammoList[index];
        const hiddenRun = tiaHiddenRunLength(ammoList, index);
        if (hiddenRun >= 2) {
            const previousIsHidden = index > 0 && ammoList[index - 1] && !ammoList[index - 1].visible;
            const length = hiddenRun >= 5 || (hiddenRun === 3 && previousIsHidden) ? 3 : 2;
            groups.push({
                start: index,
                list: ammoList.slice(index, index + length),
                type: "dark",
                complete: true,
                enhanced: length >= 3,
            });
            index += length;
            continue;
        }
        const group = { start: index, list: [first], type: "normal", complete: false };
        if (tiaAmmoIsVisibleKing(first)) {
            group.type = "clean";
            group.complete = true;
            groups.push(group);
            index++;
            continue;
        }
        if (!tiaCanStartGroup(first)) {
            group.type = "bad";
            groups.push(group);
            index++;
            continue;
        }
        const second = ammoList[index + 1];
        if (tiaCanSecond(second)) {
            group.list.push(second);
            group.complete = true;
            const third = ammoList[index + 2];
            const fourth = ammoList[index + 3];
            if (tiaCanThird(third, fourth)) {
                group.list.push(third);
                group.complete = true;
                group.enhanced = true;
            } else {
                group.half = true;
            }
        }
        groups.push(group);
        index += group.list.length;
    }
    return groups;
}

function tiaCompleteAmmoGroups(ammoList) {
    return tiaMakeAmmoGroups(ammoList).filter(group => group.complete);
}

function tiaCompleteAmmoGroupCount(player, extraAmmo) {
    const list = getAmmo(player).slice();
    if (extraAmmo) list.push(extraAmmo);
    return tiaCompleteAmmoGroups(list).length;
}

function tiaAmmoPlanScore(ammoList) {
    const groups = tiaMakeAmmoGroups(ammoList);
    let score = 0;
    groups.forEach((group, index) => {
        if (group.complete) {
            score += 8 + group.list.length;
            if (index === 0) score += 2;
            if (group.enhanced) score += 1.2;
        } else {
            score -= 2.5;
        }
        if (group.type === "clean") score -= 1;
    });
    return score;
}

function tiaDanyiOverflowImprovement(player) {
    const ammo = getAmmo(player);
    if (ammo.length < MAX_AMMO) return 0;
    return tiaAmmoPlanScore(ammo.slice(1).concat([tiaDarkAmmoCandidate()])) - tiaAmmoPlanScore(ammo);
}

function tiaLastAmmoGroup(player, extraCard) {
    const list = getAmmo(player).slice();
    if (extraCard) list.push(tiaCardToAmmo(extraCard, player));
    const groups = tiaMakeAmmoGroups(list);
    return groups.length ? groups[groups.length - 1] : null;
}

function tiaFirstAmmoGroup(player) {
    const groups = tiaMakeAmmoGroups(getAmmo(player));
    return groups.length ? groups[0] : null;
}

function tiaCanExtendLastGroupWithAmmo(player, extraAmmo) {
    const before = tiaMakeAmmoGroups(getAmmo(player));
    const after = tiaMakeAmmoGroups(getAmmo(player).concat([extraAmmo]));
    if (!before.length || !after.length) return false;
    const lastBefore = before[before.length - 1];
    const lastAfter = after[after.length - 1];
    if (lastAfter.start !== lastBefore.start) return false;
    return lastAfter.list.length > lastBefore.list.length;
}

function tiaCanExtendLastGroup(player, card) {
    return tiaCanExtendLastGroupWithAmmo(player, tiaCardToAmmo(card, player));
}

function tiaDanyiExtendsGroup(player) {
    return tiaCanExtendLastGroupWithAmmo(player, tiaDarkAmmoCandidate());
}

function tiaBestDanyiGroupScore(player) {
    let best = -Infinity;
    player.getCards("h").forEach(card => {
        if (isEntityShaOrJiu(card)) best = Math.max(best, tiaDanyiCostScore(card, player));
    });
    return best;
}

function tiaCanImproveCurrentGroupByDanyi(player) {
    return tiaBestDanyiGroupScore(player) > 0;
}

function tiaNextLoadSlot(player) {
    return Math.min(MAX_AMMO, getAmmo(player).length + 1);
}

function tiaPointFitValue(num, slot) {
    num = num || 13;
    if (tiaIsKingPoint(num)) return -4;
    if (slot <= 1) return num <= 12 ? (num <= 4 ? 2.2 : num <= 8 ? 2.8 : 3.4) : -3;
    if (slot === 2) return num <= 8 ? (num <= 4 ? 1.8 : 3.2) : -1.6;
    if (slot === 3) return num <= 4 ? 4.2 : -1.3;
    return num <= 4 ? 0.6 : -1.2;
}

function tiaBlackFutureAttackValue(card, player) {
    if (get.color(card, player) !== "black") return 0;
    const num = tiaPoint(card);
    let value = tiaPointFitValue(num, tiaNextLoadSlot(player));
    if (tiaCanExtendLastGroup(player, card)) value += 2.2;
    if (num <= 4) value += 3.2;
    else if (num <= 8) value += 1.3;
    else if (num <= 12) value += 0.4;
    if (tiaCardName(card, player) === "shan" && num <= 4) value += 0.8;
    if (tiaCardName(card, player) === "wuxie") value += 0.4;
    return value;
}

function tiaIsDefenseCard(card, player) {
    if (!card) return false;
    const name = tiaCardName(card, player);
    if (get.color(card, player) === "black") return true;
    if (["tao", "shan", "wuxie"].includes(name)) return true;
    return name === "jiu" && player.hp <= 2;
}

function tiaDefensiveResourceCount(player, except) {
    return player.countCards("h", card => {
        if (card === except) return false;
        return tiaIsDefenseCard(card, player);
    });
}

function tiaDefenseFloor(player) {
    return player.hp <= 1 ? 1 : 2;
}

function tiaDefenseTendency(player) {
    let tendency = 0.8;
    if (player.hp <= 1) tendency = 2.2;
    else if (player.hp === 2) tendency = 1.45;
    else if (player.hp >= 3) tendency = 0.95;
    if (tiaDefensiveResourceCount(player) <= 2) tendency += 0.25;
    const pressure = game.countPlayer(current => {
        if (current === player || get.attitude(player, current) >= 0) return false;
        return current.canUse && current.canUse({ name: "sha", isCard: true }, player);
    });
    tendency += Math.min(0.35, pressure * 0.12);
    return tiaClamp(tendency, 0.75, 2.6);
}

function tiaOffenseTendency(player) {
    const ammo = getAmmo(player);
    let tendency = 0.75 + Math.min(0.55, ammo.length * 0.12);
    if (ammo.length >= 3) tendency += 0.15;
    if (ammo[0] && tiaAmmoIsVisibleKing(ammo[0])) tendency += 0.35;
    game.filterPlayer(target => {
        if (target === player || get.attitude(player, target) >= 0) return;
        if (target.hp <= 1) tendency = Math.max(tendency, 1.55);
        else if (target.hp <= 2 && target.countCards("h") <= 2) tendency = Math.max(tendency, 1.25);
    });
    if (player.hp <= 1) tendency -= 0.25;
    return tiaClamp(tendency, 0.55, 1.8);
}

function tiaDefenseValue(card, player, base) {
    const name = tiaCardName(card, player);
    const num = tiaPoint(card);
    let value = typeof base == "number" ? base : 0;
    if (get.color(card, player) === "black") {
        value += 4.4;
        if (num <= 4) value += 2.5;
        else if (num <= 8) value += 1.1;
        else if (num <= 12) value += 0.3;
    }
    if (get.color(card, player) === "black" && tiaIsKingPoint(num)) value -= 1.4;
    if (name === "tao") value += player.hp <= 1 ? 7 : player.hp === 2 ? 4.5 : 2.4;
    else if (name === "jiu") value += player.hp <= 1 ? 5.8 : player.hp === 2 ? 2.2 : 0;
    else if (name === "shan") value += 1.6;
    else if (name === "wuxie") {
        value += 2.8;
        if (tiaDefensiveResourceCount(player, card) >= 2) value += 1.2;
        if (player.hp <= 1 && !player.countCards("h", c => c !== card && ["tao", "jiu"].includes(tiaCardName(c, player)))) value -= 1.2;
    }
    if (get.subtype(card, false) === "equip2" || get.subtype(card, false) === "equip3") value += player.hp <= 2 ? 1.6 : 0.6;
    return value;
}

function tiaKeepValue(card, player, base) {
    const offense = tiaBlackFutureAttackValue(card, player);
    const defense = tiaDefenseValue(card, player, base);
    return offense * tiaOffenseTendency(player) + defense * tiaDefenseTendency(player);
}

function tiaDanyiCostScore(card, player) {
    const ammo = getAmmo(player);
    const name = tiaCardName(card, player);
    const color = get.color(card, player);
    const num = tiaPoint(card);
    const completeGroups = tiaCompleteAmmoGroupCount(player);
    const completeGroupsAfter = tiaCompleteAmmoGroupCount(player, tiaDarkAmmoCandidate());
    const defenseAfter = tiaDefensiveResourceCount(player, card);
    const defenseShortage = Math.max(0, tiaDefenseFloor(player) - defenseAfter);
    let score = 5.8;

    if (completeGroups <= 0) score += player.hp >= 3 ? 5.4 : 2.6;
    else if (completeGroups < 2) score += player.hp >= 3 ? 3.2 : 1.2;
    else score -= 18;
    if (completeGroupsAfter > completeGroups) score += 3.2;

    if (ammo.length >= MAX_AMMO) {
        const improvement = tiaDanyiOverflowImprovement(player);
        if (improvement > 1.2) score += tiaClamp(improvement, 1.2, 5.5);
        else score -= 9;
    } else if (ammo.length <= 2) {
        score += 1.8;
    }

    if (tiaDanyiExtendsGroup(player)) score += 2.8;
    if (color === "red") score += 4.4;
    else if (num >= 9) score += 0.8;
    else if (num >= 5) score -= 1.5;
    else score -= 4.8;

    if (defenseShortage) {
        score -= defenseShortage * (player.hp <= 2 ? 8.5 : completeGroups <= 0 ? 3.2 : 5.2);
    }
    if (name === "jiu" && player.hp <= 2) score -= player.hp <= 1 ? 5.5 : 2.8;
    if (color === "black") score -= 2.2;

    return score - tiaKeepValue(card, player, 0) * (player.hp <= 2 ? 0.55 : 0.38);
}

function tiaGetDamageResponseGroupState(player) {
	    const groups = tiaMakeAmmoGroups(getAmmo(player));
	    if (!groups.length) return "empty";
	    const last = groups[groups.length - 1];
	    if (last.complete) return "empty";
	    if (last.list.length === 1) return "one";
	    return "empty";
	}

	function tiaDamageResponsePointBase(pt, groupState) {
	    if (tiaIsKingPoint(pt)) return 5;
	    if (groupState === "empty") {
	        if (pt >= 9 && pt <= 12) return 100;
	        if (pt >= 5 && pt <= 8)  return 70;
	        if (pt >= 1 && pt <= 4)  return 50;
	    } else {
	        if (pt >= 5 && pt <= 8)  return 100;
	        if (pt >= 1 && pt <= 4)  return 70;
	        if (pt >= 9 && pt <= 12) return 35;
	    }
	    return 0;
	}

	function tiaDamageResponseCardScore(card, player, asName) {
	    const pt = tiaPoint(card);
	    const groupState = tiaGetDamageResponseGroupState(player);
	    let score = tiaDamageResponsePointBase(pt, groupState);
	    const isBlack = get.color(card, player) === "black";
	    if (!isBlack) score += 6;
	    score -= tiaKeepValue(card, player, 0) * 0.08;
	    const cardName = tiaCardName(card, player);
	    if (cardName === asName) score += 0.5;
	    return score;
	}

function tiaDamageResponseScoreToOrder(score, defaultOrder) {
    if (score >= 105) return Math.max(defaultOrder + 2, 6);
    if (score >= 100) return Math.max(defaultOrder + 1, 4.5);
    if (score >= 75)  return Math.max(defaultOrder, 3.5);
    if (score >= 50)  return Math.max(defaultOrder - 0.5, 2.5);
    return Math.max(defaultOrder - 1, 1.5);
}

function tiaEntityDamageResponseScore(card, player) {
    const event = _status.event;
    if (!event || event.name !== "chooseToRespond" && event.name !== "chooseToUse") return null;
    if (typeof event.filterCard !== "function") return null;
    if (!card || get.itemtype(card) !== "card" || get.position(card) !== "h") return null;
    const name = tiaCardName(card, player);
    if (name === "shan") {
        if (!isDaowuResponseWindow(event, player)) return null;
        if (!event.filterCard(card, player, event)) return null;
        return tiaDamageResponseCardScore(card, player, "shan");
    }
    if (name === "sha") {
        const context = getDaowuContext(event, player);
        if (!context || !context.card || !["nanman", "juedou"].includes(context.card.name)) return null;
        if (!event.filterCard(card, player, event)) return null;
        return tiaDamageResponseCardScore(card, player, "sha");
    }
    return null;
}

	function tiaHasWorthwhileDanyi(player) {
    return player.hasCard(card => isEntityShaOrJiu(card) && tiaDanyiCostScore(card, player) > 0, "h");
}

function tiaRongguangTargetScore(player, target, round, ammo) {
    if (!target || target === player || get.attitude(player, target) >= 0) return -Infinity;
    const sha = makeRongguangSha(player);
    if (player.canUse && !player.canUse(sha, target)) return -Infinity;
    let score = get.effect(target, sha, player, player);
    const success = tiaAmmoSucceeds(ammo, round);
    if (success === false) {
        if (tiaAmmoIsVisibleKing(ammo)) return Math.max(0.6, score * 0.2 + 0.6);
        return -Infinity;
    }
    if (success === true) score += 1.8;
    else score += round === 1 ? 1.1 : round === 2 ? 0.65 : 0.25;
    if (target.hp <= 1) score += 2.8;
    else if (target.hp <= 2) score += 1.1;
    if (target.countCards("h") <= 1) score += 0.8;
    else if (target.countCards("h") >= 5) score -= 0.6;
    if (round === 2) score += 0.6;
    if (round === 3 && getAmmo(player).length >= 4) score += 0.35;
    return score;
}

function tiaBestRongguangTargetScore(player, round, ammo) {
    let best = -Infinity;
    game.filterPlayer(target => {
        best = Math.max(best, tiaRongguangTargetScore(player, target, round, ammo));
    });
    return best;
}

function tiaRongguangOrder(item, player) {
    const ammo = getAmmo(player);
    if (!ammo.length) return 0;
    const firstGroup = tiaFirstAmmoGroup(player);
    const completeGroups = tiaCompleteAmmoGroupCount(player);
    if (!firstGroup || !firstGroup.complete) return 0;
    if (completeGroups < 2 && tiaHasWorthwhileDanyi(player)) return 0;
    const first = firstGroup.list[0];
    if (tiaAmmoWillFail(first, 1) && !tiaAmmoIsVisibleKing(first)) return 0;
    const best = tiaBestRongguangTargetScore(player, 1, first);
    if (best <= 0 && !tiaAmmoIsVisibleKing(first)) return 0;
    return (completeGroups >= 2 ? 8.7 : 5.6) + tiaClamp(best / 3, 0, 2.3);
}

function tiaShouldRongguangExtra(player, target, round, state) {
    if (state && state.groupRemaining > 0) return true;
    const ammo = getAmmo(player);
    if (!ammo.length || !target || get.attitude(player, target) >= 0) return false;
    if (state && state.groupRemaining <= 0) return false;
    const next = ammo[0];
    if (round >= 4) return false;
    if (tiaAmmoWillFail(next, round)) return tiaAmmoIsVisibleKing(next);
    const score = tiaRongguangTargetScore(player, target, round, next);
    if (round === 2) return score > 0.6 && (ammo.length >= 2 || target.hp <= 2 || target.countCards("h") <= 1);
    if (round === 3) return score > 1.8 && (ammo.length >= 4 || target.hp <= 1 || target.countCards("h") === 0);
    return false;
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
            aiOrder(player, card, num) {
                if (isDaowuResponseWindow(_status.event, player)) {
                    if (card.name === "shan") {
                        const score = tiaDamageResponseCardScore(card, player, "shan");
                        return tiaDamageResponseScoreToOrder(score, 3);
                    }
                    if (card.name === "sha") {
                        const ctx = getDaowuContext(_status.event, player);
                        if (ctx && ctx.card && ["nanman", "juedou"].includes(ctx.card.name)) {
                            const score = tiaDamageResponseCardScore(card, player, "sha");
                            return tiaDamageResponseScoreToOrder(score, 3.2);
                        }
                    }
                }
                if (_status.currentPhase === player && isEntityShaOrJiu(card)) {
                    const score = tiaDanyiCostScore(card, player);
                    if (score <= 0) return 0;
                    return Math.max(num || 0, 7.2 + tiaClamp(score / 4, 0, 2.4));
                }
                    if ((card.name === "guohe" || card.name === "shunshou") && get.color(card, player) === "black" && get.position(card) === "h") {
                        if (tiaDefensiveResourceCount(player, card) <= tiaDefenseFloor(player)) return 2;
                    }
            },
            aiUseful(player, card, num) {
                if (get.position(card) !== "h") return;
                const responseScore = tiaEntityDamageResponseScore(card, player);
                if (responseScore !== null) return Math.max(-2, num - tiaClamp(responseScore / 2.2, 0.6, 5.2));
                if (get.color(card, player) === "black") return num + tiaKeepValue(card, player, num) * 0.42;
                if (isEntityShaOrJiu(card) && _status.currentPhase === player && tiaHasWorthwhileDanyi(player)) {
                    return Math.max(-1, num - 1.6);
                }
            },
            aiValue(player, card, num) {
                if (get.position(card) !== "h") return;
                if (get.color(card, player) === "black") return num + tiaKeepValue(card, player, num) * 0.5;
                if (isEntityShaOrJiu(card) && _status.currentPhase === player && tiaHasWorthwhileDanyi(player)) {
                    return Math.max(0, num - 1.2);
                }
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
            const firstGroup = tiaFirstAmmoGroup(player);
            const groupLength = firstGroup && firstGroup.complete ? firstGroup.list.length : 1;
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
                groupLength,
                groupRemaining: Math.max(0, groupLength - 1),
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
            order: tiaRongguangOrder,
            result: {
                player(player) {
                    const ammo = getAmmo(player);
                    if (!ammo.length) return 0;
                    const firstGroup = tiaFirstAmmoGroup(player);
                    if (!firstGroup || !firstGroup.complete) return 0;
                    if (tiaCompleteAmmoGroupCount(player) < 2 && tiaHasWorthwhileDanyi(player)) return 0;
                    if (tiaAmmoWillFail(firstGroup.list[0], 1) && !tiaAmmoIsVisibleKing(firstGroup.list[0])) return 0;
                    return 1;
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
            if (useCard.storage && useCard.storage.tia_rongguang_state && useCard.storage.tia_rongguang_state.groupRemaining <= 0 && !event.isMine()) return false;
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
                .set("ai", () => tiaShouldRongguangExtra(player, target, nextRound, state))
                .forResult();
            if (!choice.bool) return;

            const ammo = takeAmmo(player);
            if (!ammo) return;

            player.logSkill("tia_rongguang");
            game.log(player, "移去了最底端的一发弹药");

            state.round = nextRound;
            state.groupRemaining = Math.max(0, (state.groupRemaining || 0) - 1);
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
        hiddenCard(player, name) {
            return (name === "sha" || name === "shan") && player.countCards("h", card => get.color(card, player) === "black") > 0;
        },
        group: ["tia_daowu_sha", "tia_daowu_shan", "tia_daowu_collect"],
    },

    tia_daowu_sha: {
        audio: "tia_daowu",
        enable: ["chooseToUse", "chooseToRespond"],
        filter(event, player) {
            return isDaowuResponseWindow(event, player) && event.filterCard({ name: "sha", isCard: true }, player, event) && player.countCards("h", card => get.color(card, player) === "black") > 0;
        },
        viewAsFilter(player) {
            return player.countCards("h", card => get.color(card, player) === "black") > 0;
        },
        filterCard(card, player) {
            return get.color(card, player) === "black";
        },
        viewAs: { name: "sha", isCard: true, storage: { tia_daowu: true } },
        position: "h",
        prompt: "将一张黑色手牌当作【杀】响应",
        check(card) {
            return tiaDamageResponseCardScore(card, get.player(), "sha");
        },
        ai: {
            respondSha: true,
            skillTagFilter(player, tag) {
                if (tag !== "respondSha") return false;
                const event = _status.event;
                if (!event || typeof event.filterCard !== "function") return false;
                return isDaowuResponseWindow(event, player) && event.filterCard({ name: "sha", isCard: true }, player, event) && player.countCards("h", card => get.color(card, player) === "black") > 0;
            },
            order(item, player) {
                if (!isDaowuResponseWindow(_status.event, player)) return -1;
                if (!player.countCards("h", card => get.color(card, player) === "black")) return -1;
                const blackCards = player.getCards("h").filter(c => get.color(c, player) === "black");
	                if (!blackCards.length) return -1;
	                let best = -Infinity;
	                blackCards.forEach(c => { best = Math.max(best, tiaDamageResponseCardScore(c, player, "sha")); });
	                return tiaDamageResponseScoreToOrder(best, 4);
            },
        },
    },

    tia_daowu_shan: {
        audio: "tia_daowu",
        enable: ["chooseToUse", "chooseToRespond"],
        filter(event, player) {
            return isDaowuResponseWindow(event, player) && event.filterCard({ name: "shan", isCard: true }, player, event) && player.countCards("h", card => get.color(card, player) === "black") > 0;
        },
        viewAsFilter(player) {
            return player.countCards("h", card => get.color(card, player) === "black") > 0;
        },
        filterCard(card, player) {
            return get.color(card, player) === "black";
        },
        viewAs: { name: "shan", isCard: true, storage: { tia_daowu: true } },
        position: "h",
        prompt: "将一张黑色手牌当作【闪】响应",
        check(card) {
            return tiaDamageResponseCardScore(card, get.player(), "shan");
        },
        ai: {
            respondShan: true,
            skillTagFilter(player, tag) {
                if (tag !== "respondShan") return false;
                const event = _status.event;
                if (!event || typeof event.filterCard !== "function") return false;
                return isDaowuResponseWindow(event, player) && event.filterCard({ name: "shan", isCard: true }, player, event) && player.countCards("h", card => get.color(card, player) === "black") > 0;
            },
            order(item, player) {
                if (!isDaowuResponseWindow(_status.event, player)) return -1;
                if (!player.countCards("h", card => get.color(card, player) === "black")) return -1;
                const blackCards = player.getCards("h").filter(c => get.color(c, player) === "black");
	                if (!blackCards.length) return -1;
	                let best = -Infinity;
	                blackCards.forEach(c => { best = Math.max(best, tiaDamageResponseCardScore(c, player, "shan")); });
	                return tiaDamageResponseScoreToOrder(best, 4);
            },
        },
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
                if (!entityCard) continue;
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
    tia_daowu_info: "当你成为伤害牌目标时，你的黑色手牌可以视为【杀】或者【闪】响应。每当你使用实体【杀】或【闪】响应伤害牌后，你将此牌明置于武将牌上作为\"弹药\"，且此\"弹药\"击发而使用的【杀】改为【火杀】。",
};

var sort = ["tia_tiya"];


window.nihilModules["tia"] = {
    init: function () {},
    character: character,
    card: cards,
    skill: skills,
    translate: translates,
    title: title,
    sort: sort,
};
})();
