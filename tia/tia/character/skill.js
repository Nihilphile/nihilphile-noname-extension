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
            player: ["useCardAfter", "respondAfter", "useCard"],
        },

        filter(event, player) {
            // Part B: useCard 实体手牌杀/酒改摸牌
            if (event.triggername === "useCard") {
                if (!player.isPhaseUsing()) return false;
                const evt = event.getParent() || event;
                if (!evt.card || (evt.card.name !== "sha" && evt.card.name !== "jiu")) return false;
                if (evt.skill === "tia_rongguang") return false;
                if (evt.card.storage && evt.card.storage.tia_rongguang) return false;
                if (!evt.cards || evt.cards.length === 0) return false;
                return true;
            }
            // Part A: useCardAfter / respondAfter 装弹
            if (event.skill === "tia_rongguang") return false;
            if (event.card && event.card.storage && event.card.storage.tia_rongguang) return false;
            if (!event.card || (event.card.name !== "sha" && event.card.name !== "shan")) return false;
            const a1 = player.getExpansions("tia_qiangli_ammo").length;
            const a2 = player.getExpansions("tia_daowu_ammo").length;
            if (a1 + a2 >= 6) return false;
            return true;
        },

        async content(event, trigger, player) {
            if (trigger.triggername === "useCard") {
                // ======== Part B: 杀/酒 改为摸牌 ========
                const useCardEvent = trigger.getParent();
                if (!useCardEvent) return;
                useCardEvent.targets.length = 0;
                useCardEvent.addCount = false;
                const stat = player.getStat().card;
                const name = useCardEvent.card.name;
                if (typeof stat[name] === "number" && stat[name] > 0) {
                    stat[name]--;
                }
                player.logSkill("tia_qiangli");
                game.log(player, "将", useCardEvent.card, "替换为摸一张牌");
                await player.draw(1);
            } else {
                // ======== Part A: 装弹（暗置）========
                const cards = get.cards(1);
                if (!cards || cards.length === 0) return;
                const next = player.addToExpansion(cards, player);
                next.gaintag = ["tia_qiangli_ammo"];
                await next;
                for (const card of cards) {
                    card.style.position = "";
                    card.style.transform = "";
                    card.style.left = "";
                    card.style.top = "";
                    card.classList.add("invisible");  // 暗置弹药显示牌背
                }
                player.markSkill("tia_qiangli");
                if (!player.storage.tia_ammo_order) player.storage.tia_ammo_order = [];
                player.storage.tia_ammo_order.push(cards[0].cardid);
                player.logSkill("tia_qiangli");
                game.log(player, "装填了弹药");
            }
        },

        mod: {
            cardUsable(card, player, num) {
                if (!player.isPhaseUsing()) return;
                // 仅限手牌实体牌（荣光虚拟杀不受影响）
                if (get.itemtype(card) !== "card" || get.position(card) !== "h") return;
                if (card.name === "sha" || card.name === "jiu") {
                    return Infinity;
                }
            },
            cardEnabled(card, player, event) {
                if (!player.isPhaseUsing()) return;
                if (get.itemtype(card) !== "card" || get.position(card) !== "h") return;
                if (card.name === "sha" || card.name === "jiu") {
                    return true;
                }
            },
        },

        mark: true,
        marktext: "弹",

        intro: {
            markcount(storage, player) {
                const a1 = player.getExpansions("tia_qiangli_ammo").length;
                const a2 = player.getExpansions("tia_daowu_ammo").length;
                const total = a1 + a2;
                return total > 0 ? String(total) : "";
            },
            content(storage, player) {
                const qlAmmo = player.getExpansions("tia_qiangli_ammo");
                const dwAmmo = player.getExpansions("tia_daowu_ammo");
                const allAmmo = qlAmmo.concat(dwAmmo);
                if (allAmmo.length === 0) return "当前没有弹药。";

                // 按 FIFO 顺序排列（tia_ammo_order 记录加入顺序）
                const order = player.storage.tia_ammo_order || [];
                const ordered = [];
                const seen = {};
                for (const cid of order) {
                    const card = allAmmo.find(c => c.cardid === cid);
                    if (card && !seen[card.cardid]) {
                        seen[card.cardid] = true;
                        ordered.push(card);
                    }
                }
                // 未在 order 中的牌追加到末尾
                for (const card of allAmmo) {
                    if (!seen[card.cardid]) {
                        seen[card.cardid] = true;
                        ordered.push(card);
                    }
                }

                let html = "当前弹药数：" + ordered.length + "<br>";
                for (let i = 0; i < ordered.length; i++) {
                    const card = ordered[i];
                    const isDaowu = card.hasGaintag("tia_daowu_ammo");
                    const display = isDaowu ? String(get.number(card)) : "未知";
                    html += (i + 1) + "：[" + display + "]<br>";
                }
                return html;
            },
        },

        ai: {},
    },

    // ============================================================
    // 荣光 (Glory) — enable: "phaseUse" 直接选目标，内部处理 FIFO 弹药
    // Part A: 点击技能→选目标→确认→自动移除最底端弹药→出杀（失败则取消）
    // Part B: 额外结算（子技能 tia_rongguang_extra）
    // Part C: 抵消公式（子技能 tia_rongguang_track）
    // Part D: 悼舞弹药 → 火杀
    // ============================================================
    tia_rongguang: {
        audio: 2,
        enable: "phaseUse",
        filter(event, player) {
            const a1 = player.getExpansions("tia_qiangli_ammo").length;
            const a2 = player.getExpansions("tia_daowu_ammo").length;
            return (a1 + a2) > 0;
        },

        filterTarget(card, player, target) {
            return target != player && player.canUse({ name: "sha" }, target);
        },
        selectTarget: [1, 1],

        async content(event, trigger, player) {
            "step 0"
            const qlAmmo = player.getExpansions("tia_qiangli_ammo");
            const dwAmmo = player.getExpansions("tia_daowu_ammo");
            const allAmmo = qlAmmo.concat(dwAmmo);
            let oldestCard = null;
            const order = player.storage.tia_ammo_order || [];
            for (const cid of order) {
                const found = allAmmo.find(c => c.cardid === cid);
                if (found) { oldestCard = found; break; }
            }
            if (!oldestCard) oldestCard = allAmmo[allAmmo.length - 1];
            if (!oldestCard) { event.finish(); return; }

            const isDaowu = oldestCard.hasGaintag("tia_daowu_ammo");
            const ammoPoints = get.number(oldestCard);

            player.logSkill("tia_rongguang");
            await player.loseToDiscardpile(oldestCard);
            if (player.storage.tia_ammo_order) {
                const idx = player.storage.tia_ammo_order.indexOf(oldestCard.cardid);
                if (idx >= 0) player.storage.tia_ammo_order.splice(idx, 1);
            }

            // 弹药清空后隐藏标记区，更新 mark
            const remaining = player.getExpansions("tia_qiangli_ammo").length + player.getExpansions("tia_daowu_ammo").length;
            player.markSkill("tia_qiangli");
            if (remaining === 0) player.node.expansions.style.display = "none";

            // 首轮抵消判定：X=1, 阈值=12
            if (ammoPoints > 12) {
                game.log(player, "荣光击发失败！(弹药点数" + ammoPoints + " > 12)");
                event.finish();
                return;
            }

            // 将状态存入 storage，供 track/extra 子技能使用
            player.storage.tia_rongguang_pending_state = {
                accumulatedPoints: ammoPoints,
                roundCount: 0,
            };

            event._tia_vcard = new lib.element.VCard({
                name: "sha",
                nature: isDaowu ? "fire" : undefined,
                storage: { tia_rongguang: true },
            });

            "step 1"
            const useSkillEvent = event.getParent();
            const selectedTargets = useSkillEvent && useSkillEvent.targets;
            if (selectedTargets && selectedTargets.length && event._tia_vcard) {
                player.useCard(event._tia_vcard, selectedTargets);
                // track 子技能在 useCard1 触发时从 player.storage 读取并清理 pending_state
            } else {
                delete player.storage.tia_rongguang_pending_state;
                event.finish();
            }
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

    // 荣光·追踪 — 抵消判定在 useCard1 时注入 unhurt
    tia_rongguang_track: {
        charlotte: true,
        trigger: { player: "useCard1" },
        filter(event, player) {
            return event.card && event.card.storage && event.card.storage.tia_rongguang;
        },
        forced: true,
        popup: false,
        async content(event, trigger, player) {
            const useCardEvt = trigger;
            if (!useCardEvt) return;

            // 状态由 content 存到 player.storage 后备
            let state = player.storage.tia_rongguang_pending_state;
            if (state) {
                delete player.storage.tia_rongguang_pending_state;
            } else {
                state = useCardEvt.storage && useCardEvt.storage.tia_rongguang_state;
            }
            if (!state) return;

            if (!useCardEvt.storage) useCardEvt.storage = {};
            useCardEvt.storage.tia_rongguang_state = state;

            if (state.accumulatedPoints > 12) {
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

            // 本轮额外结算的 X = roundCount + 2（roundCount 从 0 起，初始杀 X=1 已过）
            const nextRoundNum = state.roundCount + 2;
            const choice = await player
                .chooseBool()
                .set("prompt", get.prompt("tia_rongguang"))
                .set("prompt2", "是否移去一发弹药使此杀对" + get.translation(target) + "额外结算一次？")
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

            // 弹药清空后隐藏标记区，更新 mark
            const remaining = player.getExpansions("tia_qiangli_ammo").length + player.getExpansions("tia_daowu_ammo").length;
            player.markSkill("tia_qiangli");
            if (remaining === 0) player.node.expansions.style.display = "none";

            state.accumulatedPoints += ammoPoints;
            state.roundCount++;

            // ======== 抵消判定：当前轮移除的弹药点数 vs 16-4X ========
            const roundX = state.roundCount + 1;
            const threshold = 16 - 4 * roundX;

            useCardEvt.customArgs = useCardEvt.customArgs || {};
            useCardEvt.customArgs.default = useCardEvt.customArgs.default || {};
            if (ammoPoints > threshold) {
                useCardEvt.customArgs.default.unhurt = true;
                game.log(player, "本次荣光结算被抵消！(弹药点数" + ammoPoints + " > " + threshold + ")");
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
            const next = player.addToExpansion(collect, player);
            next.gaintag = ["tia_daowu_ammo"];
            for (const card of collect) {
                card.storage = card.storage || {};
                card.storage.tia_daowu_visible = true;
            }
            await next;
            for (const card of collect) {
                card.style.position = "";
                card.style.transform = "";
                card.style.left = "";
                card.style.top = "";
            }
            player.markSkill("tia_qiangli");
            player.storage.tia_daowu_tracked = tracked.filter(cid => !collect.some(c => c.cardid === cid));
            if (!player.storage.tia_ammo_order) player.storage.tia_ammo_order = [];
            for (const card of collect) {
                player.storage.tia_ammo_order.push(card.cardid);
            }
            game.log(player, "将悼舞牌明置为弹药");
        },
    },
    // ============================================================
    // 测试技能 — 准备阶段开始时获得 6 弹药（从牌堆顶），测完即删
    // 使用 phaseZhunbeiBegin 而非 gameStart，确保联机模式下玩家对象已就绪
    // ============================================================
    tia_test_startup_ammo: {
        charlotte: true,
        trigger: { player: "phaseZhunbeiBegin" },
        forced: true,
        popup: false,
        filter(event, player) {
            return player.storage.tia_test_done !== true && player.getExpansions("tia_qiangli_ammo").length === 0 && player.getExpansions("tia_daowu_ammo").length === 0;
        },
        async content(event, trigger, player) {
            player.storage.tia_test_done = true;
            const cards = get.cards(6);
            if (!cards || cards.length === 0) return;
            const next = player.addToExpansion(cards, player);
            next.gaintag = ["tia_qiangli_ammo"];
            await next;
            for (const card of cards) {
                card.style.position = "";
                card.style.transform = "";
                card.style.left = "";
                card.style.top = "";
                card.classList.add("invisible");
            }
            player.markSkill("tia_qiangli");
            if (!player.storage.tia_ammo_order) player.storage.tia_ammo_order = [];
            for (const card of cards) {
                player.storage.tia_ammo_order.push(card.cardid);
            }
            game.log(player, "装填了 6 张测试弹药");
        },
    },

};

export default skills;
