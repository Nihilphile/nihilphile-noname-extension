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

/** @type { importCharacterConfig['skill'] } */
const skills = {
