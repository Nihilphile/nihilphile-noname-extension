(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "Nihilphile";
    var MARK = "nihil_longyou";
    var TURN = "nihil_caisheng_turn";
    var AFFECTED = "nihil_caisheng_affected";

    function alive(player) {
        return !!player && player.isIn();
    }

    function fieldActive() {
        return game.hasPlayer(function (player) { return player.hasSkill("nihil_shengyu"); });
    }

    function fullRecovery(player) {
        return fieldActive() && !player.storage.nohp && player.hp >= player.maxHp;
    }

    function installRecovery() {
        window.nihilLongyouHp.install(lib, game, ui, get, ai, _status);
        var prototype = lib.element.Player.prototype;
        if (!prototype.recover._nihilShengyu) {
            var original = prototype.recover;
            var recover = function () {
                var next = original.apply(this, arguments);
                // Keep non-positive recovery blocked, including after a trigger changes num.
                var stop = next.filterStop;
                next.filterStop = function () {
                    if (this.num > 0 && fullRecovery(this.player)) return false;
                    return stop.apply(this, arguments);
                };
                return next;
            };
            recover._nihilShengyu = true;
            prototype.recover = recover;
        }
        var taoyuan = lib.card.taoyuan;
        if (taoyuan && !taoyuan._nihilShengyu) {
            var ignoreTarget = taoyuan.ignoreTarget;
            taoyuan.ignoreTarget = function (card, player, target) {
                // The native card skips healthy targets before creating recover.
                if (fullRecovery(target)) return false;
                return typeof ignoreTarget === "function" ? ignoreTarget.apply(this, arguments) : ignoreTarget;
            };
            taoyuan._nihilShengyu = true;
        }
        var tao = lib.card.tao;
        if (!tao || tao._nihilShengyu) return;
        var enable = tao.enable, filterTarget = tao.filterTarget, modTarget = tao.modTarget;
        tao.enable = function (card, player) {
            return fullRecovery(player) || (typeof enable === "function" ? enable.apply(this, arguments) : enable);
        };
        tao.filterTarget = function (card, player, target) {
            return (target === player && fullRecovery(target)) ||
                (typeof filterTarget === "function" ? filterTarget.apply(this, arguments) : filterTarget);
        };
        tao.modTarget = function (card, player, target) {
            return fullRecovery(target) ||
                (typeof modTarget === "function" ? modTarget.apply(this, arguments) : modTarget);
        };
        var targetUse = tao.ai.result.target_use;
        tao.ai.result.target_use = function (player, target, card) {
            if (player === target) {
                var use = fullPeachDecision(player, card);
                if (use !== undefined) return use ? 2 : 0;
            }
            return typeof targetUse === "function" ? targetUse.apply(this, arguments) : targetUse;
        };
        tao._nihilShengyu = true;
    }

    function grant(player, num) {
        if (!alive(player) || num <= 0) return;
        player.addSkill(MARK);
        player.addMark(MARK, num);
    }

    async function remove(player, num) {
        num = Math.min(num, player.countMark(MARK));
        if (num <= 0) return 0;
        player.removeMark(MARK, num);
        // Resolve native mark events before continuing the skill.
        await _status.event.waitNext();
        return num;
    }

    function turnState(player) {
        return player.storage[TURN] || { count: 0, targets: [] };
    }

    function slashTarget(card, player, target, limit) {
        return alive(target) && get.distance(player, target) <= limit && player.canUse(card, target, false, false);
    }

    function mingsiEffect(event, player) {
        var effect = event.getParent(function (current) { return current.type === "card"; }, true);
        return effect && effect.player === player && effect._nihilMingsiOutcome ? effect : null;
    }

    async function rewardMingsi(player, effect) {
        effect._nihilMingsiRewarded = true;
        if (player.hp < effect.target.hp) await player.recover(1);
        else await player.draw(1);
    }

    function strongAllies(source, target) {
        if (get.mode() !== "identity") return false;
        var a = source.identity, b = target.identity;
        return (a === "fan" && b === "fan") ||
            (["zhu", "zhong"].includes(a) && ["zhu", "zhong"].includes(b));
    }

    function enemyOf(source, target) {
        if (strongAllies(source, target)) return false;
        if (get.mode() === "identity") {
            var a = source.identity, b = target.identity;
            if ((a === "fan" && ["zhu", "zhong"].includes(b)) ||
                (b === "fan" && ["zhu", "zhong"].includes(a))) return true;
        }
        return get.attitude(target, source) < 0;
    }

    function recoveryWorks(source, target) {
        return !target.storage.nohp && get.effect(target, { name: "recover" }, source, target) > 0;
    }

    function expectedReduction(effect, source, target) {
        var num = (typeof effect.baseDamage === "number" ? effect.baseDamage : 1) + (effect.extraDamage || 0);
        if (num <= 0) return 0;
        var card = effect.card;
        if (get.name(card) === "sha" && source.hasSkill("guding_skill") && target.countCards("h") === 0) num++;
        var ignoreArmor = target.hasSkillTag("unequip2") || source.hasSkillTag("unequip", false,
            { name: get.name(card), target: target, card: card });
        if (!ignoreArmor) {
            if (target.hasSkill("tengjia2") && game.hasNature(card, "fire")) num++;
            if (target.hasSkill("baiyin_skill")) num = Math.min(num, 1);
        }
        return num;
    }

    function defendMingsi(effect, source, target) {
        if (!alive(source) || !alive(target) || source === target || !source.hasSkill("nihil_mingsi") ||
            target.hasSkill("nihil_shengyu") || effect.unreal || !effect.card || !get.tag(effect.card, "damage")) return;
        // These native skills replace damage before Mingsi can execute.
        if (source.hasSkillTag("jueqing", false, target) || target.hasSkill("gangzhi")) return;
        var num = expectedReduction(effect, source, target);
        if (num <= 0) return;
        if (target.maxHp - num <= 0 || (!fieldActive() && target.hp >= target.maxHp - num) ||
            !recoveryWorks(source, target)) return true;
        return !strongAllies(source, target) && target.hp * 2 > target.maxHp;
    }

    function responseDecision(event) {
        var effect = event.getParent(), source, target = event.player;
        if (event.type === "wuxie") {
            var map = event.info_map || event.respondInfo;
            if (!map) return;
            map = map._source || map;
            // Do not decide rescues for third parties or shared multi-target tricks.
            if (map.isJudge || map.target !== target || map.multitarget || map.multitargets || !map.card) return;
            source = map.player;
            var original = event.getParent(function (current) {
                return current.type === "card" && current.player === source && current.target === target &&
                    current.card === map.card;
            }, true);
            if (!original) return;
            var defend = defendMingsi(original, source, target);
            return defend === undefined ? undefined : (event.state < 0 ? !defend : defend);
        }
        if (!effect || effect.type !== "card" || !effect.card) return;
        var name = get.name(effect.card);
        if (event.name === "chooseToUse" && event.type === "respondShan" && name === "sha" && effect.target === target) {
            source = effect.customSource || effect.player;
        } else if (event.name === "chooseToRespond" && ["nanman", "wanjian", "juedou"].includes(name)) {
            if (name === "juedou") {
                if (effect.turn !== target) return;
                source = effect.source;
            } else {
                if (effect.target !== target) return;
                source = effect.customSource || effect.player;
            }
        } else return;
        return defendMingsi(effect, source, target);
    }

    function fullPeachDecision(player, card) {
        if (!player || player.hasSkill("nihil_shengyu") || player.hasSkill("nihil_mingsi") ||
            !player.isPhaseUsing() || _status.dying.includes(player) || !fullRecovery(player)) return;
        if (!game.hasPlayer(function (owner) {
            return owner !== player && owner.hasSkill("nihil_shengyu") && enemyOf(owner, player);
        })) return;
        if (!recoveryWorks(player, player)) return false;
        var hand = player.getCards("h").filter(function (current) { return !player.canIgnoreHandcard(current); });
        var before = Math.max(0, hand.length - player.getHandcardLimit());
        if (!before) return false;
        // Project native hand-limit modifiers without mutating the live player's HP or marks.
        var projected = Object.create(player);
        Object.defineProperty(projected, "hp", { value: player.hp + 1 });
        projected.storage = Object.assign({}, player.storage);
        projected.storage[MARK] = player.countMark(MARK) + 1;
        var materials = card && card.cards ? card.cards : card ? [card] : [];
        var remaining = hand.filter(function (current) { return !materials.includes(current); }).length;
        return Math.max(0, remaining - projected.getHandcardLimit()) < before;
    }

    function prepareBaichiChoice(event) {
        if (event.responded) return;
        var decision = responseDecision(event);
        if (decision !== undefined) {
            event.ai = event.ai1 = decision ? function () { return 10; } : function () { return -10; };
            event.toUse = event.toRespond = decision;
        } else if (event.name === "chooseToUse" && event.type === "phase" && !event._nihilBaichiPeachAI) {
            event._nihilBaichiPeachAI = true;
            event._nihilBaichiNativeAI1 = event.ai1;
            event.ai1 = function (card) {
                var current = get.event();
                if (get.name(card) === "tao") {
                    var use = lib.skill.nihil_baichi_ai.peachDecision(current.player, card);
                    if (use !== undefined) return use ? Math.max(1, get.order(card, current.player)) : -10;
                }
                var native = current._nihilBaichiNativeAI1;
                return typeof native === "function" ? native.apply(this, arguments) : get.order(card, current.player);
            };
        }
    }

    var skills = {
        nihil_shengyu: {
            persevereSkill: true,
            global: "nihil_baichi_ai",
            forced: true,
            trigger: { global: "gameStart", player: "enterGame" },
            firstDo: true,
            init: function () { installRecovery(); },
            filter: function (event, player) { return !player.storage.nihil_shengyu_started; },
            async content(event, trigger, player) {
                player.storage.nihil_shengyu_started = true;
                player.syncStorage("nihil_shengyu_started");
                grant(player, 3);
            },
        },
        nihil_longyou: {
            charlotte: true,
            marktext: "佑",
            intro: {
                name: "龙佑",
                name2: "龙佑",
                content: function (storage, player) {
                    return "共有" + player.countMark(MARK) + "层龙佑；当前体力" + player.hp +
                        "，体力上限" + player.maxHp + "。龙佑计入所有当前体力计算与通常手牌上限，不增加体力上限。损失体力时优先消耗。";
                },
            },
        },
        nihil_mingsi: {
            global: "nihil_baichi_ai",
            locked: true,
            forced: true,
            trigger: { source: "damageBegin4" },
            lastDo: true,
            priority: -1000,
            filter: function (event) {
                return event.num > 0 && !event.unreal;
            },
            async content(event, trigger) {
                var target = trigger.player;
                var num = trigger.num;
                trigger.cancel();
                await target.loseMaxHp(num);
                if (alive(target)) await target.recover(num * 2);
            },
            group: ["nihil_mingsi_outcome", "nihil_mingsi_loss"],
            subSkill: {
                loss: {
                    forced: true,
                    popup: false,
                    firstDo: true,
                    priority: 1000,
                    trigger: { global: "loseMaxHpBefore" },
                    filter: function (event, player) { return !event._nihilMingsiObserved && !!mingsiEffect(event, player); },
                    async content(event, trigger, player) {
                        var effect = mingsiEffect(trigger, player);
                        trigger._nihilMingsiObserved = true;
                        // Observe actual execution, before loseMaxHpAfter can restore the limit.
                        trigger.pushHandler(function (current, option) {
                            if (option.state === "begin") current._nihilMingsiBefore = current.player.maxHp;
                            else if (option.state === "end" && current.player.maxHp < current._nihilMingsiBefore &&
                                !effect._nihilMingsiOutcome.reduced.includes(current.player)) {
                                effect._nihilMingsiOutcome.reduced.push(current.player);
                            }
                        });
                    },
                },
                outcome: {
                    forced: true,
                    popup: false,
                    firstDo: true,
                    priority: 1000,
                    trigger: { player: ["useCardToBefore", "useCardToExcluded", "useCardToIgnored"] },
                    filter: function (event, player) {
                        return event.player === player && event.card && get.name(event.card) === "sha" &&
                            alive(event.target) && !event._nihilMingsiOutcome;
                    },
                    async content(event, trigger, player) {
                        trigger._nihilMingsiOutcome = { reduced: [] };
                        // The native after queue also runs when a Sha is cancelled or neutralized.
                        trigger.insertAfter(async function (event, trigger, player) {
                            var effect = event.getParent();
                            if (!alive(player) || !player.hasSkill("nihil_mingsi") || !alive(effect.target) ||
                                effect._nihilMingsiOutcome.reduced.includes(effect.target) || effect._nihilMingsiRewarded) return;
                            player.logSkill("nihil_mingsi");
                            await rewardMingsi(player, effect);
                        }, { player: player });
                    },
                },
            },
            ai: { expose: 0.15 },
        },
        nihil_baichi_ai: {
            charlotte: true,
            forced: true,
            popup: false,
            firstDo: true,
            priority: 10000,
            trigger: { player: ["chooseToUseBegin", "chooseToRespondBegin"] },
            filter: function (event) { return responseDecision(event) !== undefined; },
            async content(event, trigger) { prepareBaichiChoice(trigger); },
            onChooseToUse: prepareBaichiChoice,
            onChooseToRespond: prepareBaichiChoice,
            peachDecision: fullPeachDecision,
            ai: {
                effect: {
                    player: function (card, player, target) {
                        if (card && get.name(card) === "tao" && player === target && fullPeachDecision(player, card) === false) {
                            return "zeroplayertarget";
                        }
                    },
                },
            },
        },
        nihil_caisheng: {
            enable: "phaseUse",
            filter: function (event, player) {
                var cost = turnState(player).count;
                return game.hasPlayer(function (target) {
                    return target.countMark(MARK) > (target === player ? cost : 0);
                });
            },
            prompt: function (event, player) {
                return "裁生：流失" + turnState(player).count + "点体力，再清空一名角色的龙佑，可视为使用杀";
            },
            async content(event, trigger, player) {
                var state = turnState(player);
                var cost = state.count;
                state.count++;
                player.storage[TURN] = state;
                player.addTempSkill(TURN, { global: "phaseAfter" });
                player.syncStorage(TURN);
                if (cost > 0) await player.loseHp(cost);
                if (!alive(player) || !game.hasPlayer(function (current) { return current.countMark(MARK) > 0; })) return;
                var donor = await player.chooseTarget([1, 1], true,
                    "裁生：选择一名角色，移除其全部龙佑（可以选择自己）", function (card, owner, current) {
                        return current.isIn() && current.countMark("nihil_longyou") > 0;
                    }).set("ai", function (current) {
                        return -get.attitude(_status.event.player, current) * current.countMark("nihil_longyou");
                    }).forResult();
                if (!donor.bool || !alive(player)) return;
                var target = donor.targets[0];
                if (!alive(target) || !target.countMark(MARK)) return;
                if (!state.targets.includes(target.playerid)) state.targets.push(target.playerid);
                player.syncStorage(TURN);
                target.addTempSkill(AFFECTED, { global: "phaseAfter" });
                target.markSkill(AFFECTED);
                var count = await remove(target, target.countMark(MARK));
                if (!count || !alive(player)) return;
                var card = { name: "sha", isCard: true };
                if (!game.hasPlayer(function (current) { return slashTarget(card, player, current, count); })) return;
                var choice = await player.chooseTarget([1, count], false,
                    "裁生：可视为使用不计次数的杀，距离与目标数上限为" + count, function (card, owner, current) {
                        return current.isIn() && get.distance(owner, current) <= _status.event.nihilCaishengLimit &&
                            owner.canUse({ name: "sha", isCard: true }, current, false, false);
                    }).set("nihilCaishengLimit", count).set("ai", function (current) {
                        return get.effect(current, { name: "sha", isCard: true }, _status.event.player, _status.event.player);
                    }).forResult();
                if (!choice.bool || !alive(player)) return;
                var targets = choice.targets.filter(function (current) { return slashTarget(card, player, current, count); }).slice(0, count);
                if (targets.length) await player.useCard(card, targets, false);
            },
            ai: {
                order: 6,
                result: {
                    player: function (player) {
                        var cost = turnState(player).count;
                        return cost >= player.hp ? -100 : 1 - cost;
                    },
                },
            },
        },
        nihil_caisheng_turn: {
            charlotte: true,
            onremove: true,
            mod: {
                playerEnabled: function (card, player, target) {
                    if (get.tag(card, "damage") && turnState(player).targets.includes(target.playerid)) return false;
                },
            },
        },
        nihil_caisheng_affected: {
            charlotte: true,
            mark: true,
            marktext: "裁",
            intro: {
                name: "裁生",
                content: function (storage, player) {
                    var sources = game.players.concat(game.dead).filter(function (current) {
                        return turnState(current).targets.includes(player.playerid);
                    });
                    return sources.length ? "本回合不能成为" + get.translation(sources) + "使用的伤害牌的目标。回合结束后失效。" :
                        "本回合已受到【裁生】影响。回合结束后失效。";
                },
            },
        },
    };

    window.nihilModules.baichi = {
        init: function () { installRecovery(); },
        character: {
            nihil_baichi: {
                sex: "female",
                group: "shen",
                hp: 1,
                maxHp: 1,
                skills: ["nihil_shengyu", "nihil_mingsi", "nihil_caisheng"],
                img: "extension/" + EXT_NAME + "/image/character/nihil_baichi.png",
            },
        },
        skill: skills,
        translate: {
            nihil_baichi: "螭白",
            nihil_shengyu: "生域",
            nihil_shengyu_info: "持恒技，所有角色回复体力可超出体力上限，每溢出1点转化为其一层“龙佑”。每层“龙佑”计入额外1点当前体力，参与所有技能的当前体力计算及通常手牌上限，但不增加体力上限；损失体力时优先消耗。游戏开始时，你获得3层“龙佑”。满体力不阻止回复，满体力角色也可使用【桃】。",
            nihil_longyou: "龙佑",
            nihil_mingsi: "命祀",
            nihil_mingsi_info: "锁定技，你造成伤害时，防止之，改为令受伤角色减少等量体力上限，然后回复两倍于此伤害数值的体力。你的【杀】未使目标减少体力上限时，若你的当前体力小于该目标，你回复1点体力，否则你摸1张牌（对每名目标的每次结算结束后分别判断，无次数限制）。",
            nihil_caisheng: "裁生",
            nihil_caisheng_info: "出牌阶段，你可以流失X点体力，再选择一名有“龙佑”的角色（可以是自己），移除其所有“龙佑”，且本回合其无法成为你使用的伤害牌的目标；然后你可以视为使用一张【杀】，此【杀】无视次数限制且不计入次数，其距离和目标数上限均为此次实际移除的层数。X为本回合此前发动此技能的次数（首次为0）。",
            nihil_caisheng_turn: "裁生",
            nihil_caisheng_affected: "裁生",
        },
        title: { nihil_baichi: "太素司生" },
        sort: ["nihil_baichi"],
    };
})();
