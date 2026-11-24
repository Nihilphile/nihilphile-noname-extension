(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";

    function image(id, ext) {
        return "extension/" + EXT_NAME + "/image/character/" + id + "." + (ext || "png");
    }

const YCC_SHA_CARD = { name: "sha", isCard: true };
const LIXING_SHA = "ycc_lixing_sha";
const MARK_PATH = "extension/" + EXT_NAME + "/image/mark/";
const QINZHENG_SKIN = "ycc_yuchengchen_qinzheng";

function installLixingCardIcon(lib) {
    const card = lib.element?.Card?.prototype;
    const addGaintag = card?.addGaintag;
    if (!addGaintag || addGaintag.nihilLixingIcon) return;

    const iconUrl = (lib.assetURL || "") + MARK_PATH + "ycc_lixing.png";
    card.addGaintag = function (tag) {
        const result = addGaintag.call(this, tag);
        const label = this.node?.gaintag;
        if (label && this.hasGaintag(LIXING_SHA)) {
            const icon = label.ownerDocument.createElement("img");
            icon.src = iconUrl;
            icon.alt = "";
            icon.style.cssText = "width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:2px;pointer-events:none";
            label.prepend(icon);
        }
        return result;
    };
    card.addGaintag.nihilLixingIcon = true;
}

function semanticLog() {
    if (typeof game !== "undefined" && game && typeof game.log === "function") {
        game.log.apply(game, arguments);
    }
}

function yccMaxOtherHand(player) {
    let max = 0;
    game.filterPlayer(current => {
        if (current !== player) max = Math.max(max, current.countCards("h"));
    });
    return max;
}

// 已知无中能抬高瑞的手牌线；其余领先者各需要多少次顺手，必须合计。
function yccCanReachMax(player, hand) {
    if (hand >= yccMaxOtherHand(player)) return true;
    const cards = player.getCards("h");
    const draws = cards.filter(card => get.name(card, player) === "wuzhong" && player.canUse(card, player));
    const line = hand + draws.length;
    const leaders = game.filterPlayer(other => other !== player && other.countCards("h") > line);
    if (!leaders.length) return true;
    const steals = cards.filter(card => get.name(card, player) === "shunshou");
    const needed = leaders.reduce((sum, other) => sum + other.countCards("h") - line, 0);
    if (needed > steals.length) return false;
    // 为每个缺口分配一张顺手。如已占用，先为原缺口另找一张。
    const assigned = new Map();
    function match(target, seen) {
        for (const card of steals) {
            if (seen.has(card) || !player.canUse(card, target)) continue;
            seen.add(card);
            if (!assigned.has(card) || match(assigned.get(card), seen)) {
                assigned.set(card, target);
                return true;
            }
        }
        return false;
    }
    return leaders.every(target => {
        const need = target.countCards("h") - line;
        if (target.countGainableCards(player, "h") < need || get.attitude(player, target) >= 0) return false;
        for (let i = 0; i < need; i++) {
            if (!match(target, new Set())) return false;
        }
        return true;
    });
}

function yccYuceShaValue(player) {
    if (!yccYuceHasEnemyShaTarget(player)) return 0;
    const value = player.getUseValue(YCC_SHA_CARD);
    // 御策的【杀】不消耗手牌且不计入次数；只要能攻击敌方，就至少有基础收益。
    return Math.max(1, typeof value === "number" ? value : 0);
}

function yccYucePlanActive(player) {
    if (_status.currentPhase !== player) return false;
    if (!player.hasSkill("ycc_yuce", null, null, false)) return false;
    if (!yccCanReachMax(player, player.countCards("h"))) return false;
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

function yccYuceHasEnemyShaTarget(player) {
    return game.hasPlayer(target => {
        return target !== player && player.canUse(YCC_SHA_CARD, target) && get.attitude(player, target) < 0;
    });
}

function yccYuceTargetScore(player, target) {
    const attitude = get.attitude(player, target);
    const rawEffect = get.effect(target, YCC_SHA_CARD, player, player);
    const effect = typeof rawEffect === "number" && !Number.isNaN(rawEffect)
        ? Math.max(-50, Math.min(50, rawEffect))
        : 0;
    // 御策是零牌耗的额外【杀】：敌我关系决定能否出手，通用牌效只负责敌方之间的排序。
    if (attitude < 0) return 100 - attitude + effect;
    if (attitude > 0) return -100 - attitude + effect;
    return effect;
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

function yccHuangmingCanAttack(source, target) {
    return lib.filter.cardEnabled(YCC_SHA_CARD, source) &&
        lib.filter.targetEnabled(YCC_SHA_CARD, source, target);
}

// hand 是【杀】离手后的张数。拆手牌只降低应命者的手牌数。
function yccDiscardSecuresMax(player, target, hand) {
    return target.countDiscardableCards(player, "h") > 0 && hand < yccMaxOtherHand(player) &&
        !game.hasPlayer(other => other !== player &&
            other.countCards("h") - (other === target ? 1 : 0) > hand);
}

function yccPlanningYuce(player) {
    return _status.currentPhase === player && player.isPhaseUsing() &&
        player.hasSkill("ycc_yuce") &&
        !_status.event.getParent(e => e.triggername === "phaseUseEnd", true, true);
}

// 五谷等公开所得由引擎在实体牌上记录知情者。只查询当前手牌，牌离手即失效。
const yccMissingSha = new WeakMap();
const yccPartialResponses = new WeakMap();

function yccObserveSha(event, owner) {
    const source = event.player;
    let missing = yccMissingSha.get(owner);
    if (event.name === "gain") {
        if (!missing?.has(source)) return;
        const known = source.getKnownCards(owner);
        if (known.some(card => get.name(card, source) === "sha")) {
            missing.delete(source);
            return;
        }
        const gained = event.cards.filter(card => get.position(card) === "h" && get.owner(card) === source && !known.includes(card));
        const count = missing.get(source) + gained.length;
        if (count >= 2) missing.delete(source);
        else missing.set(source, count);
        return;
    }

    const parent = event.getParent();
    if (!["nanman", "juedou"].includes(parent.name) || parent.directHit ||
        event.respondTo?.[1] !== parent.card || typeof event.result?.bool !== "boolean") return;
    if (source !== (parent.name === "juedou" ? parent.turn : parent.target)) return;
    // shaRequired 在本次响应结束之后才递减。决斗双方每次换人时重新计数。
    let partial = yccPartialResponses.get(owner);
    if (event.result.bool) {
        if (!partial) yccPartialResponses.set(owner, partial = new WeakSet());
        if (parent.shaRequired > 1) partial.add(parent);
        else partial.delete(parent);
        return;
    }
    if (partial?.delete(parent) || !lib.filter.cardRespondable(YCC_SHA_CARD, source, event)) return;
    if (source.getKnownCards(owner).some(card => get.name(card, source) === "sha")) return;
    if (!missing) yccMissingSha.set(owner, missing = new WeakMap());
    missing.set(source, 0);
}

function yccHasLixing(player) {
    return player.isZhu2() && player.hasSkill("ycc_lixing") && !player.getStat("triggerSkill").ycc_lixing;
}

function yccMinOtherHand(player, donor) {
    return Math.min(...game.filterPlayer(other => other !== player)
        .map(other => other.countCards("h") - (other === donor ? 1 : 0)));
}

// 分档留出区间，区间内按手牌量和牌效破同分。
const HUANGMING = {
    markEnemy: 100, unknownAlly: 200, enemyDiscard: 300, confirmedAlly: 400,
    preserveDraw: 500, enemyDiscardForYuce: 1500, allyDiscardForYuce: 1600,
};

function yccLeavesLowest(player, source, hand) {
    return hand - player.needsToDiscard(hand - player.countCards("h")) <= yccMinOtherHand(player, source);
}

function yccHuangmingTargetScore(player, source, targets, planDiscard, hand = player.countCards("h"), compareBranches = true) {
    const attitude = get.attitude(player, source);
    if (!attitude) return 0;
    const ally = attitude > 0;
    const count = source.countCards("h");
    const secureMax = planDiscard && yccDiscardSecuresMax(player, source, hand);
    if (ally && secureMax) return HUANGMING.allyDiscardForYuce + Number(yccLeavesLowest(player, source, hand));
    const known = source.getKnownCards(player);
    const knownSha = known.filter(card => get.name(card, source) === "sha");
    const lixing = count > 0 && yccHasLixing(player);
    const unknown = known.length < count && !yccMissingSha.get(player)?.has(source);
    const options = knownSha.map(card => ({ card, certain: true }));
    if (lixing) {
        // 转牌保留颜色，属性变为普通。暗牌两种颜色都可能出现。
        for (const suit of new Set(known.map(card => get.suit(card, source)))) {
            options.push({ card: { name: "sha", suit, isCard: true }, certain: true });
        }
    }
    if (known.length < count && (lixing || unknown)) {
        for (const suit of ["heart", "spade"]) {
            options.push({ card: { name: "sha", suit, isCard: true }, certain: lixing });
        }
    }
    let willing = false;
    let hurtsUs = false;
    let attack = 0;
    for (const { card, certain } of options) {
        if (!lib.filter.cardEnabled(card, source)) continue;
        for (const victim of targets) {
            if (!lib.filter.targetEnabled(card, source, victim)) continue;
            if (get.effect(victim, card, source, source) + 1 <= 0) continue;
            willing = true;
            const effect = get.effect(victim, card, source, player);
            if (effect < 0) hurtsUs = true;
            if (!ally || effect <= 0 || get.attitude(player, victim) >= 0) continue;
            const threshold = Math.min(5, 2 + Math.max(1, victim.hp));
            if (certain || count >= threshold) {
                attack = Math.max(attack, (certain ? HUANGMING.confirmedAlly : HUANGMING.unknownAlly) + Math.min(count, 20) + Math.min(effect, 9) / 10);
            }
        }
    }
    let score = attack;
    if (!ally && !willing && source.countDiscardableCards(player, "he")) score = secureMax ? HUANGMING.enemyDiscardForYuce : HUANGMING.enemyDiscard;
    if (!ally && lixing && willing && !hurtsUs) score = HUANGMING.markEnemy;
    // 在不影响御一时先保御二，再按应命者分档。
    if (compareBranches && score > 0 && _status.currentPhase === player && player.isPhaseUsing()) {
        const discard = !ally && !willing;
        const reduced = discard && (secureMax || !source.countDiscardableCards(player, "e")) ? source : null;
        if (yccLeavesLowest(player, reduced, hand)) {
            score += secureMax && discard ? 1 : HUANGMING.preserveDraw;
        }
    }
    return score;
}

// 比较一次顺拆的落点：先保最高，其次保最低，仍差牌时缩小与最高者的差距。
function yccHandOutcome(player, hand, reduced) {
    const others = game.filterPlayer(other => other !== player)
        .map(other => other.countCards("h") - Number(other === reduced));
    const gap = Math.max(0, ...others) - hand;
    const missing = others.reduce((sum, n) => sum + Math.max(0, n - hand), 0);
    const afterDiscard = hand - player.needsToDiscard(hand - player.countCards("h"));
    const low = afterDiscard <= Math.min(...others);
    return (gap <= 0 ? 4 : 0) + Number(low) - Math.min(20, missing) / 10;
}

function yccRemovalBonus(player, target, steal, position) {
    if (!yccPlanningYuce(player) || !yccYuceHasEnemyShaTarget(player)) return 0;
    const name = steal ? "shunshou" : "guohe";
    const resolving = _status.event.getParent(e => e.name === name && e.player === player, true, true);
    const before = player.countCards("h") + Number(!!resolving);
    const after = before - Number(!steal);
    return 160 * (yccHandOutcome(player, after, position === "h" ? target : null) -
        yccHandOutcome(player, before, null));
}

function yccTrueShaRank(player, card, target) {
    if (get.attitude(player, target) >= 0) return 0;
    const hand = player.countCards("h") - 1;
    const max = yccMaxOtherHand(player);
    const effect = get.effect(target, card, player, player);
    if (target.hasSkill("tengjia3") && game.hasNature(card) && effect > 0 &&
        !target.hasSkillTag("unequip2") && !player.hasSkillTag("unequip", false, { name: "sha", card, target })) {
        return game.hasNature(card, "fire") ? 7 : 6;
    }
    if (hand + 1 >= max && !player.needsToDiscard()) return 0;
    const best = Math.max(0, ...game.filterPlayer(other => other !== player && other !== target)
        .map(other => yccHuangmingTargetScore(player, other, [target], true, hand, false)));
    if (hand + 1 >= max) return best && (hand >= max || best >= HUANGMING.allyDiscardForYuce) ? 4 : 0;
    if (best >= HUANGMING.enemyDiscardForYuce) return 5;
    const followUp = best >= HUANGMING.confirmedAlly || (best >= HUANGMING.unknownAlly && best < HUANGMING.enemyDiscard);
    return effect > 0 || followUp ? 1 : 0;
}

function yccPlansSingleSha(player) {
    return yccPlanningYuce(player) && player.hasSkill("ycc_huangming") && player.getCardUsable("sha", true) === 1;
}

function yccQinzhengEnemies(player) {
    return game.filterPlayer(current => current !== player && get.attitude(player, current) < 0);
}

function yccQinzhengIsDuel(player) {
    const enemies = yccQinzhengEnemies(player);
    return enemies.length === 1 && game.countPlayer(current => current !== player) === 1;
}

function yccYuceRecastScore(card) {
    const player = get.player();
    const hand = player.getCards("h");
    const canRecastAll = hand.every(c => player.canRecast(c, player));
    if (!player.isZhu2()) {
        return canRecastAll && hand.every(c => get.value(c, player) < 8) ? 1 : 6 - get.value(card, player);
    }

    const hasArmor = !!player.getVEquip(2) && !player.hasSkillTag("unequip2");
    const threats = game.countPlayer(other => other !== player &&
        get.attitude(player, other) < 0 && other.inRange(player));
    const duelBonus = player.awakenedSkills.includes("ycc_qinzheng") && yccQinzhengIsDuel(player);
    const threshold = 5 - Number(hasArmor) - Number(threats <= 1) - Number(duelBonus);
    if (canRecastAll && player.hp >= threshold) return 1;

    const name = get.name(card, player);
    const reserveWine = player.hp === 1 && !hand.some(c => get.name(c, player) === "tao");
    if (name !== "shan" && name !== "tao" && !(reserveWine && name === "jiu")) return 1;
    // 同名牌留一张；已有不能重铸的同名牌时，它自然充当保留牌。
    const same = hand.filter(c => get.name(c, player) === name);
    const keep = same.find(c => !player.canRecast(c, player)) || same[0];
    return card === keep ? -1 : 1;
}

function yccQinzhengHasAllyHuangmingSupport(player, enemy) {
    return game.hasPlayer(current => {
        if (current === player || current === enemy) return false;
        if (get.attitude(player, current) <= 0) return false;
        return yccHuangmingTargetScore(player, current, [enemy], false, player.countCards("h"), false) >= HUANGMING.unknownAlly;
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
    if (player.maxHp <= 1) return false;
    const enemies = yccQinzhengEnemies(player);
    if (enemies.length !== 1) return false;
    if (yccQinzhengIsDuel(player)) return true;
    if (yccQinzhengHasAllyHuangmingSupport(player, enemies[0])) return false;
    return (player.storage.ycc_qinzheng_no_support || 0) >= 3;
}

var character = {
    ycc_yuchengchen: {
        sex: "male",
        group: "yao",
        hp: 4,
        isZhugong: true,
        skills: ["ycc_huangming", "ycc_yuce", "ycc_qinzheng", "ycc_lixing"],
        img: image("ycc_yuchengchen", "jpg"),
    },
};

var skills = {
    ycc_huangming_observe: {
        charlotte: true,
        silent: true,
        forced: true,
        firstDo: true,
        trigger: { global: ["chooseToRespondAfter", "gainAfter"] },
        filter(event, player) {
            return event.player !== player && (event.name === "gain" ?
                yccMissingSha.get(player)?.has(event.player) : !!event.respondTo);
        },
        async content(event, trigger, player) {
            yccObserveSha(trigger, player);
        },
    },
    ycc_huangming: {
        group: "ycc_huangming_observe",
        audio: 2,
        trigger: { player: "useCardAfter" },
        direct: true,
        filter(event, player) {
            return event.card?.name === "sha" && event.targets?.length > 0 &&
                game.hasPlayer(target => target !== player && !event.targets.includes(target) &&
                    (target.countDiscardableCards(player, "he") > 0 || event.targets.some(original =>
                        original.isIn() && yccHuangmingCanAttack(target, original))));
        },
        async content(event, trigger, player) {
            const originalTargets = trigger.targets.filter(target => target.isIn());
            const fromYuce = trigger.skill === "ycc_yuce";
            const planDiscard = !fromYuce && yccPlanningYuce(player) && yccYuceHasEnemyShaTarget(player);
            const result = await player
                .chooseTarget(get.prompt("ycc_huangming"),
                    "令一名未被此【杀】指定的其他角色出杀并摸牌，或由你弃置其一张手牌或装备牌",
                    (card, source, target) => {
                        const request = get.event();
                        return target !== source && !request.huangmingExcluded.includes(target) &&
                            (target.countDiscardableCards(source, "he") > 0 || request.huangmingTargets.some(original =>
                                lib.filter.cardEnabled({ name: "sha", isCard: true }, target) &&
                                lib.filter.targetEnabled({ name: "sha", isCard: true }, target, original)));
                    })
                .set("nihilCanCancel", true)
                .set("huangmingExcluded", trigger.targets)
                .set("huangmingTargets", originalTargets)
                .set("ai", target => yccHuangmingTargetScore(player, target, originalTargets, planDiscard))
                .forResult();
            if (!result.bool) return;

            const chosen = result.targets[0];
            const seekHandDiscard = planDiscard && yccDiscardSecuresMax(player, chosen, player.countCards("h"));
            player.logSkill("ycc_huangming", chosen);

            if (originalTargets.length > 0) {
                const canDiscard = chosen.countDiscardableCards(player, "he") > 0;
                const ally = get.attitude(chosen, player) > 0;
                // 御一已经结算，队友应命时直接跟原目标，无需再判断手牌排名。
                const followTargets = ally && !seekHandDiscard
                    ? originalTargets.filter(target => fromYuce || get.attitude(player, target) < 0)
                    : [];
                const useEvent = chosen.chooseToUse({
                    prompt: "皇命：对" + get.translation(originalTargets) + "中的一名角色使用一张【杀】",
                    prompt2: canDiscard
                        ? "无距离限制。出杀结算后摸一张牌，或由" + get.translation(player) + "弃置你的一张手牌或装备牌。"
                        : "无距离限制。出杀结算后摸一张牌。",
                    _yccHuangming: true,
                    huangmingTargets: originalTargets,
                    huangmingCanDiscard: canDiscard,
                    huangmingAlly: ally,
                    huangmingFollowTargets: followTargets,
                    huangmingDiscardForYuce: canDiscard && seekHandDiscard && ally,
                    filterCard: (card, source, request) =>
                        get.name(card, source) === "sha" && lib.filter.cardEnabled(card, source, request) &&
                        lib.filter.cardUsable(card, source, request),
                    filterTarget: (card, source, target) => {
                        const request = get.event().getParent("chooseToUse", true, true);
                        return request?.huangmingTargets?.includes(target) && target.isIn() &&
                            lib.filter.targetEnabledx(card, source, target);
                    },
                    selectTarget: 1,
                    nodistance: true,
                    // 先检查转化技的执行结果，再交给引擎使用牌。
                    chooseonly: true,
                    ai1: card => {
                        const request = get.event();
                        if (request.huangmingDiscardForYuce) return -1;
                        if (get.itemtype(card) === "card" && get.name(card, request.player) === "sha" && request.huangmingCanDiscard) {
                            const follow = request.huangmingFollowTargets.length > 0;
                            const targets = follow ? request.huangmingFollowTargets : request.huangmingTargets;
                            const best = Math.max(-Infinity, ...targets
                                .filter(target => lib.filter.targetEnabled(card, request.player, target))
                                .map(target => get.effect(target, card, request.player, request.player)));
                            if (best === -Infinity || (!follow && (request.huangmingAlly ? best <= 0 : best + 1 <= 0))) return -1;
                        }
                        if (get.itemtype(card) === "card" && card.hasGaintag?.("ycc_lixing_sha")) return Infinity;
                        return Math.max(1, get.order(card));
                    },
                    ai2: target => {
                        const request = get.event();
                        if (request.huangmingDiscardForYuce) return -1;
                        // chooseButton 技能先无目标确认，再选材料和实际的杀目标。
                        if (!target) return 1;
                        const source = request.player;
                        const card = get.card() || { name: "sha", isCard: true };
                        const effect = get.effect(target, card, source, source);
                        if (request.huangmingFollowTargets.length) {
                            if (!request.huangmingFollowTargets.includes(target)) return -1;
                            return effect >= 0 ? 1 + effect : 1 / (1 - effect);
                        }
                        return effect + (request.huangmingCanDiscard ? 1 : 0.5);
                    },
                    custom: {
                        add: {
                            card: function () {
                                const request = get.event();
                                if (!request.huangmingCanDiscard || !request.isMine() || request.endButton) return;
                                request.endButton = ui.create.control("令其弃牌", "stayleft", () => {
                                    const current = get.event();
                                    if (!current._yccHuangming) return;
                                    if (current.skill) ui.click.cancel();
                                    ui.click.cancel();
                                });
                            },
                        },
                        replace: {},
                    },
                });
                const useResult = await useEvent.forResult();
                if (useResult?.bool && !useResult.cancel && useResult.card &&
                    get.name(useResult.card, chosen) === "sha" && get.info(useResult.card) &&
                    chosen.isIn() && useResult.targets?.length === 1 &&
                    originalTargets.includes(useResult.targets[0]) && useResult.targets[0].isIn()) {
                    await chosen.useResult(useResult, useEvent);
                    if (chosen.isIn()) await chosen.draw(1);
                    return;
                }
            }

            if (chosen.isIn() && player.isIn() && chosen.countDiscardableCards(player, "he") > 0) {
                const hand = player.countCards("h");
                const discard = player.discardPlayerCard(chosen, "he", true, "皇命：弃置" + get.translation(chosen) + "的一张手牌或装备牌");
                if (chosen.countDiscardableCards(player, "h") && chosen.countDiscardableCards(player, "e")) {
                    let preferredZone;
                    if (planDiscard && yccDiscardSecuresMax(player, chosen, hand)) preferredZone = "h";
                    else if (_status.currentPhase === player && player.hasSkill("ycc_yuce") && player.isPhaseUsing() &&
                        yccLeavesLowest(player, null, hand) && !yccLeavesLowest(player, chosen, hand)) preferredZone = "e";
                    if (preferredZone) {
                        discard.set("preferredZone", preferredZone).set("ai", button => {
                            const request = get.event();
                            const value = get.buttonValue(button) * (get.attitude(request.player, request.target) > 0 ? -1 : 1);
                            // 先按区域保住御策，再按引擎牌值选择该区域中的牌。
                            return Number(get.position(button.link) === request.preferredZone) + Math.atan(value) / Math.PI;
                        });
                    }
                }
                await discard;
            }
        },
    },

    // 御策
    ycc_yuce: {
        audio: 2,
        trigger: { player: ["phaseUseEnd", "phaseDiscardEnd", "phaseJieshuEnd"] },
        direct: true,
        mod: {
            aiOrder(player, card, num) {
                if (get.itemtype(card) !== "card" || get.position(card) !== "h") return;
                const name = get.name(card, player);
                if (name === "sha" && yccPlansSingleSha(player)) {
                    const rank = Math.max(0, ...game.filterPlayer(target => player.canUse(card, target))
                        .map(target => yccTrueShaRank(player, card, target)));
                    return rank ? 0.001 * rank : 0;
                }
                if (!yccYucePlanActive(player)) return;
                if (name === "wuzhong") return num + 0.5;
                if (name === "shunshou" || name === "guohe") return num;
                if (name !== "sha" && yccPlansSingleSha(player) && player.countCards("h") >= yccMaxOtherHand(player) &&
                    !yccCanReachMax(player, player.countCards("h") - 1)) return 0;
                if (get.type(card, null, player) === "equip") return yccYuceEquipOrder(player, card, num);
                if (!yccYuceShouldPreserveHand(player)) return;
                const useValue = player.getUseValue(card);
                if (name === "sha" && useValue > 0) return num;
                if (useValue >= Math.max(2, yccYuceShaValue(player))) return num;
                if (num > 0) return 0;
            },
        },
        onChooseToUse(event) {
            if (event.type !== "phase" || event.ai2 !== get.cacheEffectUse || !yccPlansSingleSha(event.player)) return;
            event.ai2 = target => {
                const card = get.card();
                const physical = ui.selected.cards;
                if (card?.name !== "sha" || physical.length !== 1 || get.name(physical[0], event.player) !== "sha" ||
                    get.position(physical[0]) !== "h" || event.skill) return get.cacheEffectUse(target);
                const rank = yccTrueShaRank(event.player, physical[0], target);
                return rank ? rank * 100 + Math.max(-40, Math.min(40, get.effect(target, card, event.player, event.player))) : -1;
            };
        },
        filter(event, player, triggerName) {
            const hand = player.countCards("h");
            const hasHigher = () => game.hasPlayer(current => current.countCards("h") > hand);
            const hasLower = () => game.hasPlayer(current => current.countCards("h") < hand);
            if (triggerName === "phaseUseEnd") {
                return !hasHigher() && player.hasUseTarget(YCC_SHA_CARD);
            }
            if (triggerName === "phaseDiscardEnd") return !hasLower();
            return triggerName === "phaseJieshuEnd" && hasHigher() && hasLower() && player.countCards("h", card => player.canRecast(card, player)) > 0;
        },
        async content(event, trigger, player) {
            if (event.triggername === "phaseJieshuEnd") {
                const result = await player.chooseCard("h", [1, Infinity],
                    (card, player) => player.canRecast(card, player),
                    "御策：重铸任意张手牌，若重铸全部手牌则额外摸一张")
                    .set("nihilCanCancel", true)
                    .set("ai", yccYuceRecastScore)
                    .forResult();
                if (result.bool && result.cards?.length) {
                    const all = result.cards.length === player.countCards("h");
                    player.logSkill("ycc_yuce");
                    await player.recast(result.cards);
                    if (all && player.isIn()) await player.draw(1);
                }
                return;
            }

            const draw = event.triggername === "phaseDiscardEnd";
            const result = await player
                .chooseBool()
                .set("prompt", get.prompt("ycc_yuce"))
                .set("prompt2", draw ? "你可以摸两张牌" : "你可以视为使用一张【杀】")
                .set("ai", () => draw || yccYuceHasEnemyShaTarget(player))
                .forResult();
            if (!result.bool) return;

            if (draw) {
                player.logSkill("ycc_yuce");
                await player.draw(2);
            } else {
                await player.chooseUseTarget({ name: "sha", isCard: true }, false)
                    .set("ai", target => yccYuceTargetScore(player, target))
                    .set("logSkill", "ycc_yuce");
            }
        },
    },

    ycc_qinzheng: {
        audio: 2,
        trigger: { player: "phaseZhunbeiBegin" },
        limited: true,
        mark: false,
        skillAnimation: true,
        group: "ycc_qinzheng_watch",
        derivation: "ycc_longji",
        filter(event, player) {
            return !player.awakenedSkills.includes("ycc_qinzheng");
        },
        check(event, player) {
            return yccQinzhengShouldUse(player);
        },
        async content(event, trigger, player) {
            player.awakenSkill("ycc_qinzheng");
            await player.loseMaxHp();
            player.removeSkill("ycc_huangming");
            if (player.isIn()) {
                player.addSkill("ycc_handlimit");
                player.addSkill("ycc_longji");
                player.changeSkin?.({ characterName: "ycc_yuchengchen" }, QINZHENG_SKIN);
                semanticLog("#g亲征", "：", player, "失去【皇命】，获得【龙殛】，手牌上限+1");
            }
            delete player.storage.ycc_qinzheng_no_support;
            delete player.storage.ycc_qinzheng_watch_round;
        },
    },

    ycc_qinzheng_watch: {
        charlotte: true,
        trigger: { global: "roundStart" },
        forced: true,
        popup: false,
        filter(event, player) {
            return !player.awakenedSkills.includes("ycc_qinzheng");
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
        mark: true,
        marktext: "征",
        markimage: MARK_PATH + "ycc_qinzheng.png",
        intro: { content: "你的手牌上限+1。" },
        mod: {
            maxHandcard(player, num) {
                return num + 1;
            },
        },
    },

    ycc_longji: {
        audio: 2,
        trigger: { player: "useCardToPlayered" },
        forced: true,
        logTarget: "target",
        filter(event, player) {
            return event.card?.name === "sha" && event.target !== player &&
                event.target.isIn() && event.target.countCards("h") > 0;
        },
        async content(event, trigger, player) {
            const target = trigger.target;
            await target.showHandcards(get.translation(target) + "是" + get.translation(player) + "【杀】的目标，须展示所有手牌");
            if (!target.isIn() || !player.isIn() || !target.countGainableCards(player, "h")) return;

            await player.gainPlayerCard(target, "h", true, "visible")
                .set("prompt", "龙殛：获得" + get.translation(target) + "的一张手牌")
                .set("ai", button => {
                    const request = get.event();
                    const value = get.value(button.link, request.target);
                    return get.attitude(request.player, request.target) > 0 ? -value : value;
                });
        },
    },

    ycc_lixing: {
        audio: 2,
        zhuSkill: true,
        usable: 1,
        trigger: { player: ["useSkill", "logSkillBegin"] },
        getIndex(event, player) {
            const info = get.info(event.skill);
            if (!event.targets?.length || !info || info.charlotte || info.equipSkill ||
                event.type === "equip" || event.type === "global" || event.skill === "ycc_lixing") {
                return [];
            }

            // 主动技已经通过 useSkill 记录自己的目标。只补充技能日志里的新目标。
            const active = event.log_event?.getParent("useSkill", true, true);
            const source = event.sourceSkill || info.sourceSkill || event.skill;
            const activeSource = active && (get.info(active.skill)?.sourceSkill || active.skill);
            const loggedTargets = activeSource === source ? active?.targets : [];
            return [...new Set(event.targets)].filter(target =>
                target !== player && !loggedTargets?.includes(target));
        },
        filter(event, player, triggerName, target) {
            return player.isZhu2() && target?.isIn() &&
                target.countCards("h", card => !card.hasGaintag(LIXING_SHA)) > 0;
        },
        async cost(event, trigger, player) {
            const target = event.indexedData;
            const result = await player.choosePlayerCard(target, "h", 1,
                "历行：选择" + get.translation(target) + "的一张手牌，本回合视为【杀】")
                .set("nihilCanCancel", true)
                .set("filterButton", button => !button.link.hasGaintag("ycc_lixing_sha"))
                .set("ai", button => {
                    const request = get.event();
                    const target = request.target;
                    const attitude = get.attitude(request.player, target);
                    const value = get.buttonValue(button);
                    if (attitude < 0) return Math.max(1, value);
                    if (request.lixingSource === "ycc_huangming" && yccPlanningYuce(request.player) && yccYuceHasEnemyShaTarget(request.player) &&
                        yccDiscardSecuresMax(request.player, target, request.player.countCards("h"))) return 0;
                    if (attitude > 0 && request.lixingSource === "ycc_huangming") return 1 / (1 + Math.max(0, value));
                    return 0;
                })
                .set("lixingSource", trigger.skill)
                .forResult();
            if (result?.bool && result.cards?.length) {
                event.result = { bool: true, cards: result.cards, targets: [target] };
            }
        },
        async content(event) {
            const [target] = event.targets;
            if (!target.isIn()) return;
            const cards = target.getCards("h", card => event.cards.includes(card));
            if (!cards.length) return;
            target.addTempSkill(LIXING_SHA);
            target.addGaintag(cards, LIXING_SHA);
        },
    },

    ycc_lixing_sha: {
        charlotte: true,
        mod: {
            cardname(card) {
                if (get.itemtype(card) === "card" && card.hasGaintag(LIXING_SHA)) return "sha";
            },
            cardnature(card) {
                if (get.itemtype(card) === "card" && card.hasGaintag(LIXING_SHA)) return false;
            },
            aiOrder(player, card, num) {
                if (get.itemtype(card) === "card" && card.hasGaintag(LIXING_SHA)) return num + 1;
            },
            aiUseful(player, card) {
                if (_status.event.name === "chooseToRespond" && get.itemtype(card) === "card" && card.hasGaintag(LIXING_SHA)) return -1;
            },
        },
        onremove(player) {
            player.removeGaintag(LIXING_SHA);
        },
    },
};

var title = {
    ycc_yuchengchen: "#g妖帝",
};

var translates = {
    ycc_yuchengchen: "瑞",
    ycc_huangming: "皇命",
    ycc_huangming_info: "你使用的【杀】结算后，你可以令一名未被此【杀】指定的其他角色选择一项：对你此【杀】的一名目标使用一张【杀】（无距离限制），然后摸一张牌；或由你弃置其一张手牌或装备牌。",
    ycc_yuce: "御策",
    ycc_yuce_info: "出牌阶段结束时，若你的手牌数为全场最高，你可以视为使用一张【杀】。弃牌阶段结束时，若你的手牌数为全场最低，你可以摸两张牌。结束阶段结束时，若你的手牌数既非全场最高也非全场最低，你可以重铸任意张手牌，若重铸了全部手牌，则额外摸一张牌。",
    ycc_qinzheng: "亲征",
    ycc_qinzheng_info: "限定技，准备阶段，你可以减1点体力上限并失去【皇命】，然后手牌上限+1并获得【龙殛】。",
    ycc_longji: "龙殛",
    ycc_longji_info: "其他角色成为你【杀】的目标时，其展示所有手牌，然后你获得其中一张。",
    ycc_handlimit: "亲征",
    ycc_handlimit_info: "你的手牌上限+1。",
    ycc_lixing: "历行",
    ycc_lixing_sha: "历行",
    ycc_lixing_info: "主公技，每回合限一次，当其他角色成为你发动的技能的目标时，你可以令其一张手牌于本回合视为【杀】。",
};

var sort = ["ycc_yuchengchen"];

window.nihilModules["ycc"] = {
    init: installLixingCardIcon,
    removalBonus: yccRemovalBonus,
    character: character,
    characterSubstitute: {
        ycc_yuchengchen: [
            [QINZHENG_SKIN, ["img:" + image(QINZHENG_SKIN), "die:ycc_yuchengchen", "tempname:ycc_yuchengchen"]],
        ],
    },
    skill: skills,
    translate: translates,
    title: title,
    sort: sort,
};
})();
