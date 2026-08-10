(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";

    function image(id, ext) {
        return "extension/" + EXT_NAME + "/image/character/" + id + "." + (ext || "png");
    }

    var XY_SHA_CARD = { name: "sha", isCard: true };
    var xyKeepValueGuard = false;

    function xyIsIn(player) {
        return !!player && (typeof player.isIn !== "function" || player.isIn());
    }

    function xyHasBlood(player) {
        return xyIsIn(player) && player.hasSkill("nihil_xuechan", null, null, false);
    }

    function xyIsYinhua(player) {
        return xyIsIn(player) && player.hasSkill("nihil_yinshang", null, null, false);
    }

    function xyAttitude(player, target) {
        if (!player || !target) return 0;
        return get.attitude(player, target);
    }

    function xyBloodCount() {
        return game.countPlayer(function (current) {
            return xyHasBlood(current);
        });
    }

    function xyShaCount(player) {
        return player.countCards("hs", function (card) {
            return get.name(card, player) === "sha";
        });
    }

    function xyUsedSha(player) {
        return player.hasHistory("useCard", function (event) {
            return event.card && event.card.name === "sha";
        });
    }

    function xyMayHaveShanOdds(target, player) {
        if (typeof target.mayHaveShan === "function") {
            var odds = target.mayHaveShan(player, "use", true, "odds");
            if (typeof odds === "number" && !isNaN(odds)) {
                return Math.max(0, Math.min(1, odds));
            }
        }
        var hand = target.countCards("h");
        if (hand <= 0) return 0;
        if (hand <= 2) return 0.35;
        return 0.6;
    }

    function xyIsDirectHit(player, target) {
        return player.hasSkillTag("directHit_ai", true, {
            target: target,
            card: XY_SHA_CARD,
        }, true);
    }

    function xyCanAttack(player, target) {
        if (!xyIsIn(target) || target === player || xyAttitude(player, target) >= 0) return false;
        return player.canUse(XY_SHA_CARD, target);
    }

    function xyEffectiveSha(player, target, shaCount) {
        var usable = player.getCardUsable("sha");
        if (usable === Infinity) usable = shaCount;
        if (typeof usable !== "number" || isNaN(usable)) usable = 0;
        usable = Math.max(0, usable);

        var guaranteed = Math.min(shaCount, usable);
        var attempts = guaranteed;
        var conditional = false;

        // 无血缠目标存活并被命中后，可能动态解锁下一次【杀】。
        if (!xyHasBlood(target) && target.hp > 1 && guaranteed > 0 && shaCount > guaranteed) {
            attempts = Math.min(shaCount, guaranteed + 1);
            conditional = attempts > guaranteed;
        }

        return {
            attempts: attempts,
            guaranteed: guaranteed,
            conditional: conditional,
        };
    }

    function xyOpenFireWindow(player, target, attacks) {
        if (attacks <= 0) return false;
        var direct = xyIsDirectHit(player, target) || xyMayHaveShanOdds(target, player) === 0;
        if (direct || xyHasBlood(target) || target.countCards("h") <= 2) {
            return target.hp <= attacks;
        }
        return target.hp + 1 <= attacks;
    }

    function xyAttackTier(target, attacks) {
        if (attacks >= 3 && xyHasBlood(target)) return 4;
        if (attacks >= 3) return 3;
        if (attacks >= 2 && xyHasBlood(target)) return 2;
        if (attacks >= 2) return 1;
        return 0;
    }

    function xyAttackTargetScore(player, target, shaCount) {
        if (!xyCanAttack(player, target)) return null;
        var effective = xyEffectiveSha(player, target, shaCount);
        if (effective.attempts <= 0) return null;

        var tier = xyAttackTier(target, effective.attempts);
        // 基础档位保持“三杀有缠 > 三杀 >= 二杀有缠 > 普通二杀”。
        var tierScore = [100, 230, 320, 360, 420][tier];
        var hand = target.countCards("h");
        var odds = xyMayHaveShanOdds(target, player);
        var openFire = xyOpenFireWindow(player, target, effective.attempts);
        var score = tierScore;

        if (openFire) score += 1000;
        if (xyHasBlood(target)) score += 16;
        if (hand <= 2) score += (3 - hand) * 6;
        if (odds === 0) score += 20;
        score += Math.max(0, 4 - target.hp) * 7;
        score += Math.max(0, -xyAttitude(player, target));
        if (effective.conditional) score -= 12;

        return {
            target: target,
            attacks: effective.attempts,
            guaranteed: effective.guaranteed,
            conditional: effective.conditional,
            tier: tier,
            openFire: openFire,
            shanOdds: odds,
            score: score,
        };
    }

    function xyBestAttackTarget(player, shaCount) {
        var best = null;
        game.filterPlayer(function (target) {
            var current = xyAttackTargetScore(player, target, shaCount);
            if (current && (!best || current.score > best.score)) best = current;
        });
        return best;
    }

    function xyHasPriorityNonSha(player) {
        if (!player.isPhaseUsing()) return false;
        return player.getCards("h").some(function (card) {
            if (get.name(card, player) === "sha") return false;
            if (lib.filter.cardEnabled(card, player) === false) return false;
            if (typeof player.hasUseTarget === "function" && !player.hasUseTarget(card)) return false;
            return player.getUseValue(card) > 0;
        });
    }

    function xyIsDefenseCard(card, player) {
        var name = get.name(card, player);
        if (["tao", "shan", "jiu", "wuxie"].includes(name)) return true;
        var subtypes = get.subtypes(card, false) || [];
        return subtypes.includes("equip2");
    }

    function xyBaseKeepValue(card, player) {
        xyKeepValueGuard = true;
        try {
            return Math.max(0, get.useful(card, player)) + Math.max(0, get.value(card, player)) / 3;
        } finally {
            xyKeepValueGuard = false;
        }
    }

    function xyCardIdentity(card) {
        return card.cardid || card.cardId || String(card);
    }

    function xyRankInCards(card, cards, player) {
        var list = cards.slice().sort(function (a, b) {
            var diff = xyBaseKeepValue(b, player) - xyBaseKeepValue(a, player);
            if (diff) return diff;
            return xyCardIdentity(a) > xyCardIdentity(b) ? 1 : -1;
        });
        return list.indexOf(card);
    }

    function xyDefenseSlots(player) {
        var limit = player.getHandcardLimit();
        if (limit >= 5) return 3;
        if (limit >= 3) return 2;
        return Math.max(0, limit);
    }

    function xyKeepAdjustment(card, player) {
        // aiValue/aiUseful 的 player 是“估值者”，不一定是牌的所有者（如【顺手牵羊】选牌）。
        // 只为殷华自己的手牌计算留牌结构，避免把他人手牌带入整手排序并反复估值。
        if (get.position(card) !== "h" || get.owner(card) !== player) return 0;
        var hand = player.getCards("h");
        var name = get.name(card, player);

        if (xyIsDefenseCard(card, player)) {
            var defenses = hand.filter(function (current) {
                return xyIsDefenseCard(current, player);
            });
            return xyRankInCards(card, defenses, player) < xyDefenseSlots(player) ? 2.4 : -0.4;
        }

        if (name === "sha") {
            var reserve = player.getHandcardLimit() >= 4 ? 1 : 0;
            var shas = hand.filter(function (current) {
                return get.name(current, player) === "sha";
            });
            return xyRankInCards(card, shas, player) < reserve ? 2.2 : -1.2;
        }

        var mobility = hand.filter(function (current) {
            return get.name(current, player) !== "sha" && !xyIsDefenseCard(current, player);
        });
        return xyRankInCards(card, mobility, player) === 0 ? 1.4 : 0;
    }

    function xyCardUnitValue(card, player) {
        var keep = xyBaseKeepValue(card, player) + xyKeepAdjustment(card, player);
        return Math.max(0.4, Math.min(3, keep / 4));
    }

    function xyDiscardEstimate(player) {
        var overflow = player.needsToDiscard();
        if (overflow <= 0) return { count: 0, value: 0 };
        var values = player.getCards("h").map(function (card) {
            return xyCardUnitValue(card, player);
        }).sort(function (a, b) {
            return a - b;
        });
        return {
            count: overflow,
            value: values.slice(0, overflow).reduce(function (sum, value) {
                return sum + value;
            }, 0),
        };
    }

    function xyDanenTargetScore(player, choice, target) {
        if (!xyIsIn(target)) return -Infinity;
        var isSelf = target === player;
        var attitude = isSelf ? 5 : xyAttitude(player, target);
        if (!isSelf && attitude <= 0) return -20;

        var drawBonus = 0.6 * (xyBloodCount() + (choice === "gain" ? 1 : 0));
        if (choice === "gain") {
            if (xyHasBlood(target)) return -Infinity;
            if (isSelf) {
                if (player.hp <= 1) return 42 + drawBonus;
                if (player.hp === 2) return 15 + drawBonus;
                return 12 + drawBonus;
            }
            var gainScore = player.hp === 2 ? 26 : 20;
            gainScore += Math.max(0, 3 - target.hp) * 2;
            return gainScore + Math.min(5, attitude) + drawBonus;
        }

        if (choice === "recover") {
            if (!xyHasBlood(target) || target.hp >= target.maxHp) return -Infinity;
            if (isSelf) {
                if (player.hp <= 1) return 44 + drawBonus;
                if (player.hp === 2) {
                    var hasBloodlessFriend = game.hasPlayer(function (current) {
                        return current !== player && xyAttitude(player, current) > 0 && !xyHasBlood(current);
                    });
                    return (hasBloodlessFriend ? 18 : 32) + drawBonus;
                }
                return 12 + drawBonus;
            }
            return 14 + Math.max(0, 2 - target.hp) * 4 + Math.min(5, attitude) + drawBonus;
        }

        return -Infinity;
    }

    function xyBestDanenChoice(player) {
        var best = null;
        ["gain", "recover"].forEach(function (choice) {
            game.filterPlayer(function (target) {
                var score = xyDanenTargetScore(player, choice, target);
                if (!best || score > best.score) {
                    best = { choice: choice, target: target, score: score };
                }
            });
        });
        return best;
    }

    function xyDanenNetValue(player, discard) {
        var best = xyBestDanenChoice(player);
        if (!best || best.score <= 0) return 0;
        var count = xyBloodCount() + (best.choice === "gain" ? 1 : 0);
        return 2 + count - discard.value;
    }

    function xyAttackNetValue(player, best, discard) {
        var attempts = Math.min(best.attacks, best.attacks >= 3 ? 3 : 2);
        var hitOdds = xyIsDirectHit(player, best.target) ? 1 : 1 - best.shanOdds;
        hitOdds = Math.max(0.15, Math.min(1, hitOdds));
        var pressure = 2 * attempts * hitOdds;
        var bloodGift = xyHasBlood(best.target) ? 0 : 2.5 * (1 - Math.pow(1 - hitOdds, attempts));

        var shaValues = player.getCards("hs", function (card) {
            return get.name(card, player) === "sha";
        }).map(function (card) {
            return xyCardUnitValue(card, player);
        }).sort(function (a, b) {
            return a - b;
        });
        var shaCost = shaValues.slice(0, attempts).reduce(function (sum, value) {
            return sum + value;
        }, 0);
        var avoidedDiscard = attempts >= discard.count ? discard.value : discard.value * attempts / discard.count;
        return pressure - bloodGift - shaCost + avoidedDiscard;
    }

    function xyAttackPlan(player) {
        var plan = {
            attack: false,
            reason: "danen",
            best: null,
            attackValue: -Infinity,
            danenValue: 0,
        };
        if (_status.currentPhase !== player || !player.isPhaseUsing()) return plan;

        var shaCount = xyShaCount(player);
        if (shaCount <= 0) return plan;
        var best = xyBestAttackTarget(player, shaCount);
        plan.best = best;
        if (!best) return plan;

        if (xyHasPriorityNonSha(player)) {
            plan.reason = "nonsha";
            return plan;
        }

        if (best.openFire) {
            plan.attack = true;
            plan.reason = "finish";
            return plan;
        }

        // 一血时把丹恩自救置于普通压制之前。
        if (player.hp <= 1) {
            plan.reason = "survival";
            return plan;
        }

        // 已经使用过【杀】便无法再发动丹恩，继续完成既定攻势。
        if (xyUsedSha(player)) {
            plan.attack = true;
            plan.reason = "committed";
            return plan;
        }

        if (best.attacks >= 3) {
            plan.attack = true;
            plan.reason = best.tier === 4 ? "triple_blood" : "triple";
            return plan;
        }

        if (best.attacks >= 2) {
            var discard = xyDiscardEstimate(player);
            plan.danenValue = xyDanenNetValue(player, discard);
            plan.attackValue = xyAttackNetValue(player, best, discard);
            var margin = best.tier === 2 ? 0.35 : 0.75;
            if (plan.attackValue > plan.danenValue + margin) {
                plan.attack = true;
                plan.reason = best.tier === 2 ? "double_blood" : "double_value";
            }
        }

        return plan;
    }

    function xyChixianAllowed(player, owner) {
        if (!xyIsIn(owner) || player.hp <= 1 || xyHasBlood(player)) return false;
        return owner === player || xyAttitude(player, owner) > 0;
    }

    function xyChixianOrder(player) {
        var canUse = game.hasPlayer(function (owner) {
            return owner.hasSkill("nihil_chixian", null, null, false) && xyChixianAllowed(player, owner);
        });
        if (!canUse) return 0;
        return xyIsYinhua(player) ? 8.2 : 7.4;
    }

    // ============================================================
    //  鲜血仪葬 殷华 — 赤献·殷殇·丹恩
    // ============================================================

    var character = {
        nihil_xianxueyinhua: {
            sex: "male",
            group: "yao",
            hp: 3,
            maxHp: 3,
            skills: [
                "nihil_chixian",
                "nihil_yinshang",
                "nihil_danen",
            ],
            img: image("nihil_xianxueyinhua"),
        },
    };

    var skills = {
        // ========== 血缠（不可叠加的状态技能） ==========
        nihil_xuechan: {
            charlotte: true,
            locked: true,
            forced: true,
            mark: true,
            marktext: "缠",
            intro: {
                name: "血缠",
                content: "手牌上限+2；防止下次受到的伤害，然后移去“血缠”",
            },
            trigger: { player: "damageBegin4" },
            filter: function (event, player) {
                return event.num > 0;
            },
            async content(event, trigger, player) {
                player.removeSkill("nihil_xuechan");
                trigger.cancel();
            },
            mod: {
                maxHandcard: function (player, num) {
                    return num + 2;
                },
            },
            ai: {
                filterDamage: true,
                skillTagFilter: function (player, tag, arg) {
                    if (tag !== "filterDamage") return;
                    if (arg && arg.player && arg.player.hasSkillTag("jueqing", false, player)) {
                        return false;
                    }
                    return true;
                },
                threaten: function (player, target) {
                    if (!player || !target || xyAttitude(player, target) >= 0) return 1;
                    // 暂停殷华自身的定制目标偏好；绝情来源交由通用牌效处理。
                    if (player.hasSkillTag("jueqing", false, target)) return 1;
                    // 引擎对敌方威胁度取平方根后乘到完整目标效果上；平方可得到预期倍率且保持正负号。
                    return 0.82 * 0.82;
                },
            },
        },

        // ========== 赤献 ==========
        nihil_chixian: {
            global: "nihil_chixian_global",
        },

        // 任意角色均可在自己的出牌阶段发动；多个殷华共享一次次数限制。
        nihil_chixian_global: {
            sourceSkill: "nihil_chixian",
            enable: "phaseUse",
            usable: 1,
            filter: function (event, player) {
                return game.hasPlayer(function (current) {
                    return current.hasSkill("nihil_chixian", null, null, false);
                });
            },
            filterTarget: function (card, player, target) {
                return target.hasSkill("nihil_chixian", null, null, false);
            },
            selectTarget: function () {
                var owners = game.filterPlayer(function (current) {
                    return current.hasSkill("nihil_chixian", null, null, false);
                });
                return owners.length > 1 ? 1 : -1;
            },
            prompt: function () {
                var owners = game.filterPlayer(function (current) {
                    return current.hasSkill("nihil_chixian", null, null, false);
                });
                return "赤献：失去1点体力，令你与" + get.translation(owners) +
                    (owners.length > 1 ? "中的一人" : "") + "各摸一张牌，然后你获得“血缠”";
            },
            async content(event, trigger, player) {
                var owner = event.targets && event.targets[0];
                if (!owner) return;

                player.logSkill("nihil_chixian", owner);
                await player.loseHp(1);

                if (owner === player) {
                    // “你与其各摸一张”在二者为同一角色时合计摸两张。
                    if (player.isIn()) await player.draw(2);
                } else {
                    if (owner.isIn()) await owner.draw(1);
                    if (player.isIn()) await player.draw(1);
                }

                if (player.isIn()) {
                    player.addSkill("nihil_xuechan");
                }
            },
            ai: {
                order: function (item, player) {
                    player = player || get.player();
                    if (xyIsYinhua(player)) return 0;
                    return xyChixianOrder(player);
                },
                result: {
                    player: function (player, target) {
                        if (xyIsYinhua(player)) return 0;
                        if (!xyChixianAllowed(player, target)) return -20;
                        return 3.5;
                    },
                    target: function (player, target) {
                        if (xyIsYinhua(player)) return 0;
                        if (!xyChixianAllowed(player, target)) return 0;
                        return 1;
                    },
                },
            },
        },

        // ========== 殷殇 ==========
        nihil_yinshang: {
            locked: true,
            forced: true,
            group: [
                "nihil_yinshang_init",
                "nihil_yinshang_convert",
            ],
            mod: {
                cardUsable: function (card, player, num) {
                    if (card.name !== "sha" || !player.isPhaseUsing()) return;
                    return num + game.countPlayer(function (current) {
                        return current.hasSkill("nihil_xuechan", null, null, false);
                    });
                },
            },
            ai: {
                jueqing: true,
            },
        },

        // 游戏开始或中途入场时获得血缠。
        nihil_yinshang_init: {
            charlotte: true,
            sourceSkill: "nihil_yinshang",
            trigger: {
                global: "phaseBefore",
                player: "enterGame",
            },
            forced: true,
            popup: false,
            filter: function (event, player) {
                return event.name !== "phase" || game.phaseNumber === 0;
            },
            async content(event, trigger, player) {
                player.logSkill("nihil_yinshang");
                player.addSkill("nihil_xuechan");
            },
        },

        // 造成伤害改为目标失去等量体力，随后补上血缠。
        nihil_yinshang_convert: {
            charlotte: true,
            sourceSkill: "nihil_yinshang",
            trigger: { source: "damageBefore" },
            forced: true,
            popup: false,
            filter: function (event, player) {
                return event.player && event.num > 0;
            },
            async content(event, trigger, player) {
                var target = trigger.player;
                var num = trigger.num;
                trigger.cancel();
                player.logSkill("nihil_yinshang", target);
                await target.loseHp(num);
                if (target.isIn() && !target.hasSkill("nihil_xuechan", null, null, false)) {
                    target.addSkill("nihil_xuechan");
                }
            },
        },

        // ========== 丹恩 ==========
        nihil_danen: {
            // 与原生“盛息”等弃牌阶段摸牌技能一致：先结算丹恩，
            // 再由弃牌阶段正文按结算后的手牌数与当前手牌上限计算弃牌数。
            trigger: { player: "phaseDiscardBegin" },
            direct: true,
            filter: function (event, player) {
                if (player.hasHistory("useCard", function (evt) {
                    return evt.card && evt.card.name === "sha";
                })) return false;

                return game.hasPlayer(function (current) {
                    return !current.hasSkill("nihil_xuechan", null, null, false) ||
                        (current.hasSkill("nihil_xuechan", null, null, false) && current.hp < current.maxHp);
                });
            },
            async content(event, trigger, player) {
                var gainTargets = game.filterPlayer(function (current) {
                    return !current.hasSkill("nihil_xuechan", null, null, false);
                });
                var recoverTargets = game.filterPlayer(function (current) {
                    return current.hasSkill("nihil_xuechan", null, null, false) && current.hp < current.maxHp;
                });

                var result = await player.chooseButtonTarget({
                    createDialog: [
                        get.prompt("nihil_danen"),
                        [[
                            ["gain", "令一名没有“血缠”的角色获得“血缠”"],
                            ["recover", "令一名受伤的“血缠”角色回复1点体力"],
                        ], "textbutton"],
                    ],
                    filterButton: function (button) {
                        return get.event()[button.link].length > 0;
                    },
                    filterTarget: function (card, player, target) {
                        var button = ui.selected.buttons && ui.selected.buttons[0];
                        if (!button) return false;
                        return get.event()[button.link].includes(target);
                    },
                })
                    .set("complexTarget", true)
                    .set("gain", gainTargets)
                    .set("recover", recoverTargets)
                    .forResult();

                if (!result || !result.bool || !result.targets || !result.targets.length) return;

                var target = result.targets[0];
                var choice = result.links && result.links[0];
                player.logSkill("nihil_danen", target);

                if (choice === "gain") {
                    target.addSkill("nihil_xuechan");
                } else if (choice === "recover") {
                    await target.recover(1);
                } else {
                    return;
                }

                var count = game.countPlayer(function (current) {
                    return current.hasSkill("nihil_xuechan", null, null, false);
                });
                if (count > 0 && player.isIn()) {
                    await player.draw(count);
                }
            },
        },
    };

    var translates = {
        nihil_xianxueyinhua: "殷华",
        nihil_xianxueyinhua_prefix: "鲜血仪葬",

        nihil_xuechan: "血缠",
        nihil_xuechan_info:
            "“血缠”不可叠加。拥有“血缠”的角色手牌上限+2；" +
            "防止其下次受到的伤害，然后移去“血缠”。",

        nihil_chixian: "赤献",
        nihil_chixian_info:
            "任意角色的出牌阶段限一次，其可以失去1点体力，令你与其各摸一张牌，" +
            "然后其获得“血缠”。",
        nihil_chixian_global: "赤献",
        nihil_chixian_global_info:
            "出牌阶段限一次，你可以失去1点体力，令你与一名拥有【赤献】的角色各摸一张牌，" +
            "然后你获得“血缠”。",

        nihil_yinshang: "殷殇",
        nihil_yinshang_info:
            "<b>锁定技，</b>游戏开始时，你获得“血缠”。当你造成伤害时，改为令目标失去等量体力；" +
            "若其没有“血缠”，其获得之。场上每有一个“血缠”，你于出牌阶段内使用【杀】的次数上限+1。",

        nihil_danen: "丹恩",
        nihil_danen_info:
            "弃牌阶段开始时，若你本回合未使用过【杀】，你可以选择一项：1.令一名角色获得“血缠”；" +
            "2.令一名“血缠”角色回复1点体力。然后你摸X张牌（X为场上“血缠”数）。",
    };

    var title = {
        nihil_xianxueyinhua: "#g朱殷流转，皆系吾恩；万灵止息，皆入吾裁",
    };

    var sort = ["nihil_xianxueyinhua"];

    window.nihilModules["xianxueyinhua"] = {
        character: character,
        skill: skills,
        translate: translates,
        title: title,
        sort: sort,
    };
})();
