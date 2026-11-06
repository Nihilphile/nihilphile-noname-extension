(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "Nihilphile";
    var MARK = "nihil_longyou";
    var TURN = "nihil_caisheng_turn";

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
        var prototype = lib.element.Player.prototype;
        if (!prototype.recover._nihilShengyu) {
            var original = prototype.recover;
            var recover = function () {
                var next = original.apply(this, arguments);
                // Native recover.filterStop runs before recoverBefore/Begin.
                if (fieldActive() && !this.storage.nohp) delete next.filterStop;
                return next;
            };
            recover._nihilShengyu = true;
            prototype.recover = recover;
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
        // Finish native removeMark and Shengyu's draws before continuing the skill.
        await _status.event.waitNext();
        return num;
    }

    function transfer(source, target, num) {
        // A transfer must not emit the engine's removeMark event.
        source.storage[MARK] -= num;
        source.syncStorage(MARK);
        source[source.countMark(MARK) ? "markSkill" : "unmarkSkill"](MARK);
        grant(target, num);
        game.log(source, "将", num, "层龙佑转移给", target);
    }

    function hpLoss(event, player) {
        var parent = event.getParent();
        if (event.num >= 0 || !parent || !["damage", "loseHp"].includes(parent.name)) return 0;
        var armor = parent.name === "damage" && !parent.nohujia && !player.hasSkillTag("nohujia") ? player.hujia : 0;
        return Math.max(0, -event.num - armor);
    }

    function turnState(player) {
        return player.storage[TURN] || { count: 0, targets: [] };
    }

    function slashTarget(card, player, target) {
        return alive(target) && player.canUse(card, target);
    }

    var skills = {
        nihil_shengyu: {
            persevereSkill: true,
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
            group: ["nihil_shengyu_recover", "nihil_shengyu_draw"],
            subSkill: {
                recover: {
                    persevereSkill: true,
                    trigger: { global: "recoverBegin" },
                    forced: true,
                    popup: false,
                    lastDo: true,
                    priority: -1000,
                    filter: function (event) {
                        return !event._nihilShengyu && !event.player.storage.nohp &&
                            event.num > Math.max(0, event.player.maxHp - event.player.hp);
                    },
                    async content(event, trigger) {
                        if (trigger._nihilShengyu) return;
                        trigger._nihilShengyu = true;
                        var healing = Math.max(0, trigger.player.maxHp - trigger.player.hp);
                        var excess = trigger.num - healing;
                        trigger.num = healing;
                        grant(trigger.player, excess);
                    },
                },
                draw: {
                    persevereSkill: true,
                    trigger: { global: "removeMark" },
                    forced: true,
                    popup: false,
                    filter: function (event) { return event.markName === MARK && event.num > 0; },
                    async content(event, trigger, player) { await player.draw(trigger.num); },
                },
            },
        },
        nihil_longyou: {
            charlotte: true,
            forced: true,
            popup: false,
            marktext: "佑",
            intro: {
                name: "龙佑",
                name2: "龙佑",
                content: "共有#层龙佑。受伤或流失体力时，先消耗龙佑抵扣实际扣血；每移除一层，拥有【生域】的角色各摸一张牌。转移不算移除。",
            },
            trigger: { player: "changeHpBegin" },
            lastDo: true,
            priority: -1000,
            filter: function (event, player) { return player.countMark(MARK) > 0 && hpLoss(event, player) > 0; },
            async content(event, trigger, player) {
                var count = Math.min(player.countMark(MARK), hpLoss(trigger, player));
                trigger.num += count;
                await remove(player, count);
            },
        },
        nihil_mingsi: {
            trigger: { player: "useCardToTarget" },
            direct: true,
            filter: function (event) { return get.name(event.card) === "sha" && alive(event.target); },
            async content(event, trigger, player) {
                var target = trigger.target;
                var result = await player.chooseBool("命祀：是否令" + get.translation(target) + "减体力上限获得龙佑，或转移龙佑给你？")
                    .set("_nihilTarget", target)
                    .set("ai", function () { return get.attitude(_status.event.player, _status.event._nihilTarget) < 0; }).forResult();
                if (!result.bool || !alive(player) || !alive(target)) return;
                player.logSkill("nihil_mingsi", target);
                var options = ["减上限并获得两层龙佑"];
                if (target.countMark(MARK) > 0) options.push("转移龙佑");
                var choice = await target.chooseControl(options)
                    .set("prompt", "命祀：选择一项（此杀仍继续结算）")
                    .set("ai", function () { return _status.event.player.countMark("nihil_longyou") > 0 ? 1 : 0; }).forResult();
                if (!alive(player) || !alive(target)) return;
                if (choice.control === options[1] && target.countMark(MARK) > 0) {
                    var amounts = Array.from({ length: target.countMark(MARK) }, function (_, index) { return String(index + 1); });
                    var amount = await target.chooseControl(amounts)
                        .set("prompt", "命祀：选择转移给" + get.translation(player) + "的龙佑层数")
                        .set("ai", function () { return 0; }).forResult();
                    if (!alive(player) || !alive(target)) return;
                    var num = Number(amount.control);
                    if (Number.isInteger(num) && num >= 1 && num <= target.countMark(MARK)) transfer(target, player, num);
                } else {
                    await target.loseMaxHp(1);
                    grant(target, 2);
                }
            },
            ai: { expose: 0.15 },
        },
        nihil_caisheng: {
            enable: "phaseUse",
            selectTarget: 1,
            filter: function () { return game.hasPlayer(function (target) { return target.countMark(MARK) > 0; }); },
            filterTarget: function (card, player, target) { return alive(target) && target.countMark(MARK) > 0; },
            prompt: function (event, player) {
                return "裁生：流失" + turnState(player).count + "点体力，清空一名角色的龙佑并视为使用杀";
            },
            async content(event, trigger, player) {
                var target = event.target;
                if (!alive(target) || target.countMark(MARK) <= 0) return;
                var state = turnState(player);
                var cost = state.count;
                state.count++;
                player.storage[TURN] = state;
                player.addTempSkill(TURN, { global: "phaseAfter" });
                player.syncStorage(TURN);
                if (cost > 0) await player.loseHp(cost);
                if (!alive(player) || !alive(target)) return;
                if (!state.targets.includes(target.playerid)) state.targets.push(target.playerid);
                player.syncStorage(TURN);
                var count = await remove(target, target.countMark(MARK));
                if (!count || !alive(player)) return;
                var card = { name: "sha", isCard: true };
                if (!game.hasPlayer(function (current) { return slashTarget(card, player, current); })) return;
                var choice = await player.chooseTarget([1, count], true,
                    "裁生：视为使用一张杀，选择至多" + count + "个目标", function (card, owner, current) {
                        return current.isIn() && owner.canUse({ name: "sha", isCard: true }, current);
                    }).set("ai", function (current) {
                        return get.effect(current, { name: "sha", isCard: true }, _status.event.player, _status.event.player);
                    }).forResult();
                if (!choice.bool || !alive(player)) return;
                var targets = choice.targets.filter(function (current) { return slashTarget(card, player, current); }).slice(0, count);
                if (targets.length) await player.useCard(card, targets);
            },
            ai: {
                order: 6,
                result: {
                    player: function (player, target) {
                        var cost = turnState(player).count;
                        if (cost >= player.hp + player.countMark(MARK)) return -100;
                        var draws = target ? target.countMark(MARK) : 0;
                        return draws - Math.max(0, cost - player.countMark(MARK)) * 3;
                    },
                    target: function (player, target) { return -target.countMark(MARK); },
                },
            },
        },
        nihil_caisheng_turn: {
            charlotte: true,
            onremove: true,
            mod: {
                playerEnabled: function (card, player, target) {
                    if (turnState(player).targets.includes(target.playerid)) return false;
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
            nihil_baichi: "白螭",
            nihil_shengyu: "生域",
            nihil_shengyu_info: "持恒技，所有角色回复体力可超出体力上限，每溢出1点转化为其一层“龙佑”。每层“龙佑”视为额外1点体力，受伤或流失体力时优先消耗“龙佑”抵扣实际扣血。每移除一层“龙佑”，你摸一张牌。游戏开始时，你获得3层“龙佑”。满体力角色也可使用【桃】。转移不算移除。",
            nihil_longyou: "龙佑",
            nihil_mingsi: "命祀",
            nihil_mingsi_info: "当一名角色成为你使用【杀】的目标时，你可以令其选择一项：①减少1点体力上限并获得2层“龙佑”；②将其至少一层“龙佑”转移给你。",
            nihil_caisheng: "裁生",
            nihil_caisheng_info: "出牌阶段，你可以流失X点体力，移除一名有“龙佑”的角色的所有“龙佑”（可以选择自己），且该角色本回合不能成为你使用的牌的目标，然后视为使用一张【杀】，目标数至多为此次移除的层数。X为本回合此前发动此技能的次数（首次为0）。",
            nihil_caisheng_turn: "裁生",
        },
        title: { nihil_baichi: "太素司生" },
        sort: ["nihil_baichi"],
    };
})();
