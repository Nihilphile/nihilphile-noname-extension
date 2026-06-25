import { lib, game, ui, get, ai, _status } from "noname";

/** @type { importCharacterConfig['skill'] } */
const skills = {

    // ============================================================
    // 枪礼 (Gun Rite) 锁定技
    // Part A: 使用/打出杀/闪后从牌堆顶装弹(暗置), 上限6
    // Part B: 出牌阶段实体手牌杀/酒改为摸1牌, 不计次数
    // ============================================================
    tia_qiangli: {
        audio: 2,
        forced: true,
        zhuSkill: true,

        trigger: {
            player: ["useCardAfter", "respondAfter", "useCard2"],
        },

        filter(event, player) {
            // Part B: useCard2 实体手牌杀/酒改摸牌
            if (event.triggername === "useCard2") {
                if (!player.isPhaseUsing()) return false;
                if (!event.card || (event.card.name !== "sha" && event.card.name !== "jiu")) return false;
                if (event.skill === "tia_rongguang" || event.skill === "tia_rongguang_backup") return false;
                if (event.card.storage && event.card.storage.tia_rongguang) return false;
                if (!event.cards || event.cards.length === 0) return false;
                return true;
            }
            // Part A: useCardAfter / respondAfter 装弹
            if (event.skill === "tia_rongguang" || event.skill === "tia_rongguang_backup") return false;
            if (event.card && event.card.storage && event.card.storage.tia_rongguang) return false;
            if (!event.card || (event.card.name !== "sha" && event.card.name !== "shan")) return false;
            const a1 = player.getExpansions("tia_qiangli_ammo").length;
            const a2 = player.getExpansions("tia_daowu_ammo").length;
            if (a1 + a2 >= 6) return false;
            return true;
        },

        async content(event, trigger, player) {
            if (trigger.triggername === "useCard2") {
                // ======== Part B: 杀/酒 改为摸牌 ========
                const stat = player.getStat().card;
                const name = trigger.card.name;
                trigger.targets = [];
                trigger.addCount = false;
                if (typeof stat[name] === "number" && stat[name] > 0) {
                    stat[name]--;
                }
                player.logSkill("tia_qiangli");
                game.log(player, "将", trigger.card, "替换为摸一张牌");
                await player.draw(1);
            } else {
                // ======== Part A: 装弹（暗置）========
                const cards = get.cards(1);
                if (!cards || cards.length === 0) return;
                const next = player.addToExpansion(cards, player, "draw");
                next.gaintag = ["tia_qiangli_ammo"];
                await next;
                if (!player.storage.tia_ammo_order) player.storage.tia_ammo_order = [];
                player.storage.tia_ammo_order.push(cards[0].cardid);
                player.logSkill("tia_qiangli");
                game.log(player, "装填了弹药");
            }
        },

        mod: {
            cardUsable(card, player, num) {
                if (!player.isPhaseUsing()) return;
                if (card.name === "sha" || card.name === "jiu") {
                    return Infinity;
                }
            },
            cardEnabled(card, player, event) {
                if (!player.isPhaseUsing()) return;
                if (card.name === "sha" || card.name === "jiu") {
                    return true;
                }
            },
        },

        intro: {
            content(storage, player) {
                const a1 = player.getExpansions("tia_qiangli_ammo").length;
                const a2 = player.getExpansions("tia_daowu_ammo").length;
                return (a1 + a2) > 0 ? "弹药：" + (a1 + a2) + "张" : "";
            },
        },

        ai: {},
    },

    // ============================================================
    // 荣光 (Glory) 视为使用杀 + 额外结算
    // ============================================================
    tia_rongguang: {
        audio: 2,
        enable: "chooseToUse",

        filter(event, player) {
            const a1 = player.getExpansions("tia_qiangli_ammo").length;
            const a2 = player.getExpansions("tia_daowu_ammo").length;
            return (a1 + a2) > 0;
        },

        filterCard(card, player) {
            return card.hasGaintag("tia_qiangli_ammo") || card.hasGaintag("tia_daowu_ammo");
        },
        selectCard: 1,
        position: "x",

        viewAs(cards, player) {
            if (!cards || cards.length === 0) return null;
            const ammo = cards[0];
            const isDaowu = ammo.hasGaintag("tia_daowu_ammo");
            const nature = isDaowu ? "fire" : undefined;
            return new lib.element.VCard({
                name: "sha",
                nature: nature,
                storage: { tia_rongguang: true },
            });
        },

        async content(event, trigger, player) {
            // 框架走 useCard 流程；额外结算由子技能处理
        },

        group: ["tia_rongguang_extra", "tia_rongguang_track"],

        ai: {
            order: 8,
            result: {
                player(player) {
                    if (player.countCards("h") <= 1) return -1;
                    return 1;
                },
            },
        },
    },

    // 荣光·追踪 记录荣光杀的初始弹药点数
    tia_rongguang_track: {
        charlotte: true,
        trigger: { player: "useCard1" },
        filter(event, player) {
            return event.card && event.card.storage && event.card.storage.tia_rongguang;
        },
        forced: true,
        popup: false,
        async content(event, trigger, player) {
            // trigger 即 useCard 事件本身（useCard1 由 useCard 触发），直接使用，无需 getParent
            const useCardEvt = trigger;
            if (!useCardEvt) return;
            const ammoCard = trigger.cards && trigger.cards[0];
            const ammoPoints = ammoCard ? get.number(ammoCard) : 0;
            if (!useCardEvt.storage) useCardEvt.storage = {};
            useCardEvt.storage.tia_rongguang_state = {
                accumulatedPoints: ammoPoints,
                roundCount: 0,
            };
            // FIX: 首次击发弹药按 X=1 判断是否抵消，在首轮 sha 卡牌事件创建前设置 unhurt
            // 16 - 4 * 1 = 12
            if (ammoPoints > 12) {
                useCardEvt.customArgs = useCardEvt.customArgs || {};
                useCardEvt.customArgs.default = useCardEvt.customArgs.default || {};
                useCardEvt.customArgs.default.unhurt = true;
            }
        },
    },

    // 荣光·额外结算 每轮结算结束后询问是否继续
    // 使用 useCardToEnd 而非 useCardAfter，确保在 effectCount 循环体内生效
    tia_rongguang_extra: {
        charlotte: true,
        trigger: { player: "useCardToEnd" },
        filter(event, player) {
            const parent = event.parent || event;
            if (!parent.card || !parent.card.storage || !parent.card.storage.tia_rongguang) return false;
            if (!parent.targets || parent.targets.length === 0) return false;
            return true;
        },
        forced: true,
        async content(event, trigger, player) {
            const useCardEvt = trigger.parent || trigger;
            if (!useCardEvt || useCardEvt.name !== "useCard") return;
            const state = useCardEvt.storage && useCardEvt.storage.tia_rongguang_state;
            if (!state) return;

            // ======== 去重：每轮只处理一次（仅在最后一目标时处理）========
            const targets = useCardEvt.targets || [];
            if (targets.length === 0) return;
            // 检查当前 trigger.target 是否为最后一目标
            // 对单目标：唯一目标即最后一目标，正常通过
            if (trigger.target !== targets[targets.length - 1]) return;

            // 若本轮已处理过（安全网：roundCount 变化时才重新允许）
            if (state._extraProcessedRound === state.roundCount) return;

            const target = targets[0];
            if (!target || !target.isIn()) return;

            const qlAmmo = player.getExpansions("tia_qiangli_ammo");
            const dwAmmo = player.getExpansions("tia_daowu_ammo");
            const allAmmo = qlAmmo.concat(dwAmmo);
            if (allAmmo.length === 0) return;

            // 找最底端弹药（FIFO 最早入列且仍在 expansion）
            let oldestCard = null;
            const order = player.storage.tia_ammo_order || [];
            for (const cid of order) {
                const found = allAmmo.find(c => c.cardid === cid);
                if (found) { oldestCard = found; break; }
            }
            if (!oldestCard) oldestCard = allAmmo[allAmmo.length - 1];

            // 本轮额外结算的 X = roundCount + 1（下一轮编号）
            const nextRoundNum = state.roundCount + 1;
            const choice = await player
                .chooseBool()
                .set("prompt", get.prompt("tia_rongguang"))
                .set("prompt2", "是否移去弹药" + get.translation(oldestCard) + "使此杀对" + get.translation(target) + "额外结算一次？")
                .set("ai", () => {
                    const pts = get.number(oldestCard);
                    const threshold = 16 - 4 * nextRoundNum;
                    if (pts > threshold) return 0;
                    if (get.attitude(player, target) < 0) return 1;
                    return 0;
                })
                .forResult();

            if (!choice.bool) {
                // 玩家拒绝：标记本轮已处理，不再询问
                state._extraProcessedRound = state.roundCount;
                return;
            }

            player.logSkill("tia_rongguang");

            const ammoPoints = get.number(oldestCard);
            await player.loseToDiscardpile(oldestCard);

            if (player.storage.tia_ammo_order) {
                const idx = player.storage.tia_ammo_order.indexOf(oldestCard.cardid);
                if (idx >= 0) player.storage.tia_ammo_order.splice(idx, 1);
            }

            state.accumulatedPoints += ammoPoints;
            state.roundCount++;

            // ======== 抵消判定：用新增轮次 X = roundCount（已自增后）========
            const roundX = state.roundCount;
            const accumulated = state.accumulatedPoints;
            const threshold = 16 - 4 * roundX;

            // 每轮显式清理/覆盖上一轮的 unhurt，避免一次抵消污染后续轮次
            useCardEvt.customArgs = useCardEvt.customArgs || {};
            useCardEvt.customArgs.default = useCardEvt.customArgs.default || {};
            if (accumulated > threshold) {
                useCardEvt.customArgs.default.unhurt = true;
                game.log(player, "本次荣光结算被抵消！(累计" + accumulated + " > " + threshold + ")");
            } else {
                // 显式删除，确保不残留上一轮的 unhurt
                delete useCardEvt.customArgs.default.unhurt;
            }

            // ======== 触发下一轮 ========
            useCardEvt.effectCount = (useCardEvt.effectCount || 0) + 1;

            // 标记本轮已处理
            state._extraProcessedRound = state.roundCount - 1;
        },
    },

    // ============================================================
    // 悼舞 (Mourn Dance) 黑色牌当杀/闪响应 + 明置为弹药
    // ============================================================
    tia_daowu: {
        audio: 2,
        enable: ["chooseToUse", "chooseToRespond"],

        filter(event, player) {
            if (!player.countCards("hs", card => get.color(card, player) === "black")) return false;

            if (event.name === "chooseToRespond") {
                const respondTo = event.respondTo;
                if (!respondTo || !respondTo[1]) return false;
                const respondCard = respondTo[1];
                if (!get.is.damageCard(respondCard)) return false;
                const source = respondTo[0];
                if (!source || !source.isIn()) return false;
                if (source.countCards("h") < player.countCards("h")) return false;
                const okSha = event.filterCard && event.filterCard({ name: "sha" }, player, event);
                const okShan = event.filterCard && event.filterCard({ name: "shan" }, player, event);
                if (!okSha && !okShan) return false;
            }
            if (event.name === "chooseToUse") {
                if (!player.isPhaseUsing()) return false;
                const vSha = { name: "sha", isCard: true };
                if (!player.hasUseTarget(vSha, false)) return false;
            }
            return true;
        },

        filterCard(card, player) {
            return get.color(card, player) === "black";
        },
        position: "hs",

        viewAs(cards, player) {
            if (!cards || cards.length === 0) return null;
            const evt = _status.event;
            if (evt && evt.name === "chooseToRespond" && evt.respondTo) {
                const respondCard = evt.respondTo[1];
                if (respondCard && respondCard.name === "sha") {
                    return new lib.element.VCard({ name: "shan", storage: { tia_daowu: true } });
                }
                return new lib.element.VCard({ name: "sha", storage: { tia_daowu: true } });
            }
            return new lib.element.VCard({ name: "sha", storage: { tia_daowu: true } });
        },

        group: ["tia_daowu_collect", "tia_daowu_track"],

        ai: {
            respondSha: true,
            respondShan: true,
            skillTagFilter(player, tag, arg) {
                if (arg === "respond" && !player.countCards("hs", card => get.color(card, player) === "black")) return false;
                return true;
            },
            order: 4,
            result: {
                player(player) {
                    if (player.countCards("hs", card => get.color(card, player) === "black") > 0) return 1;
                    return 0;
                },
            },
        },
    },

    // 悼舞·追踪 记录转化牌实体
    tia_daowu_track: {
        charlotte: true,
        trigger: { player: ["useCardAfter", "respondAfter"] },
        filter(event, player) {
            return event.skill && (event.skill === "tia_daowu_backup" || event.skill === "tia_daowu");
        },
        forced: true,
        popup: false,
        async content(event, trigger, player) {
            const cards = trigger.cards || (trigger.card ? [trigger.card] : []);
            if (cards.length === 0) return;
            if (!player.storage.tia_daowu_tracked) player.storage.tia_daowu_tracked = [];
            for (const card of cards) {
                if (card && card.cardid && !player.storage.tia_daowu_tracked.includes(card)) {
                    player.storage.tia_daowu_tracked.push(card.cardid);
                }
            }
            player.storage.tia_daowu_tracked = player.storage.tia_daowu_tracked.filter(cid => {
                return get.cardById(cid) !== undefined;
            });
        },
    },

    // 悼舞·收弹 转化牌将进弃牌堆时改为明置弹药
    tia_daowu_collect: {
        charlotte: true,
        trigger: {
            player: "loseAfter",
            global: ["cardsDiscardAfter"],
        },
        forced: true,
        filter(event, player) {
            const tracked = player.storage.tia_daowu_tracked || [];
            if (tracked.length === 0) return false;
            let lost;
            if (event.name === "cardsDiscard") {
                lost = (event.cards && event.cards.filterInD) ? event.cards.filterInD("d") : [];
            } else {
                lost = (event.getl && event.getl(player)) ? event.getl(player).cards2 || [] : [];
            }
            return lost.length > 0 && lost.some(card => tracked.includes(card));
        },
        async content(event, trigger, player) {
            const tracked = player.storage.tia_daowu_tracked || [];
            if (tracked.length === 0) return;
            let lost;
            if (trigger.name === "cardsDiscard") {
                lost = (trigger.cards && trigger.cards.filterInD) ? trigger.cards.filterInD("d") : [];
            } else {
                lost = (trigger.getl && trigger.getl(player)) ? trigger.getl(player).cards2 || [] : [];
            }
            const toCollect = lost.filter(card => tracked.includes(card));
            if (toCollect.length === 0) return;
            const a1 = player.getExpansions("tia_qiangli_ammo").length;
            const a2 = player.getExpansions("tia_daowu_ammo").length;
            const available = Math.max(0, 6 - (a1 + a2));
            const collect = toCollect.slice(0, available);
            if (collect.length === 0) return;

            player.logSkill("tia_daowu");
            await player.gain(collect, "gain2", "log");
            const next = player.addToExpansion(collect, player, "gain2");
            next.gaintag = ["tia_daowu_ammo"];
            for (const card of collect) {
                card.storage = card.storage || {};
                card.storage.tia_daowu_visible = true;
            }
            await next;

            player.storage.tia_daowu_tracked = tracked.filter(cid => !collect.some(c => c.cardid === cid));
            if (!player.storage.tia_ammo_order) player.storage.tia_ammo_order = [];
            for (const card of collect) {
                player.storage.tia_ammo_order.push(card.cardid);
            }
            game.log(player, "将悼舞牌明置为弹药");
        },
    },
};

export default skills;
