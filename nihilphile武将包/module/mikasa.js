(function () {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";
    var FAILED = "nihil_fengren_failed_turn";

    function alive(player) {
        return !!player && player.isIn();
    }

    function shaAvailable(player) {
        return player.storage[FAILED] !== game.phaseNumber;
    }

    function failSha(player) {
        player.storage[FAILED] = game.phaseNumber;
        player.syncStorage(FAILED);
        game.log(player, "的", "#g锋刃", "本回合失效");
    }

    function choiceEvent(event) {
        if (event.name === "chooseToUse") return event;
        return event.getParent("chooseToUse", true);
    }

    function originalFilter(event, name) {
        return event.skill && event._backup ? event._backup[name] : event[name];
    }

    function acceptsCard(event, card, player) {
        var filter = originalFilter(event, "filterCard");
        return !filter || filter(card, player, event);
    }

    function acceptsTarget(event, card, player, target) {
        if (!alive(player) || !alive(target) || player === target) return false;
        var filter = originalFilter(event, "filterTarget");
        if (filter) return filter(card, player, target);
        return player.canUse(card, target, event._nihilXuanzhan ? false : null, false);
    }

    function fengrenTarget(event, player, target) {
        var card = { name: "sha", isCard: true };
        return acceptsTarget(event, card, player, target);
    }

    function adjacentTargets(use) {
        var result = [];
        (use.targets || []).forEach(function (reference) {
            ["previousSeat", "nextSeat"].forEach(function (direction) {
                var cursor = reference[direction];
                var seen = new Set([reference]);
                while (cursor && !seen.has(cursor)) {
                    seen.add(cursor);
                    if (alive(cursor)) {
                        if (!result.includes(cursor)) result.push(cursor);
                        break;
                    }
                    cursor = cursor[direction];
                }
            });
        });
        return result;
    }

    function xuanTargets(use, player) {
        if (!alive(player) || !use.card) return [];
        var name = get.name(use.card);
        var targets = name === "sha" ? adjacentTargets(use) :
            name === "shan" && use.respondTo && get.name(use.respondTo[1]) === "sha" ?
                [use.respondTo[0]] : [];
        return targets.filter(function (target) {
            return alive(target) && target !== player &&
                player.canUse({ name: "sha", isCard: true }, target, false, false);
        });
    }

    function virtualCard(name) {
        // No physical materials: do not copy any revealed card's suit or nature.
        return get.autoViewAs({ name: name, isCard: true, suit: "none", color: "none", number: null, cards: [] });
    }

    function shanEnabled(event, player, card) {
        if (event.name === "chooseToRespond") {
            return !lib.filter.cardRespondable || lib.filter.cardRespondable(card, player, event);
        }
        return lib.filter.cardEnabled(card, player, "forceEnable");
    }

    async function revealAndDiscard(player, name, skill) {
        // Deliberately do not call get.cards(2): that helper replenishes the pile.
        var cards = Array.from(ui.cardPile.childNodes).slice(0, 2);
        if (!cards.length) return false;
        var matched = cards.some(function (card) { return get.name(card) === name; });
        await game.cardsGotoOrdering(cards);
        try {
            // Default showCards is a public dialog (not a private chooseButton).
            await player.showCards(cards, get.translation(player) + "发动了【" + get.translation(skill) + "】");
        } finally {
            // Respect other effects that already moved a card; never move it twice.
            var remaining = cards.filter(function (card) { return get.position(card, true) === "o"; });
            if (remaining.length) await game.cardsDiscard(remaining);
        }
        return matched;
    }

    async function revealTopSha(player, skill) {
        // Fengren uses a matching revealed card as its physical material.
        var cards = Array.from(ui.cardPile.childNodes).slice(0, 1);
        if (!cards.length) return null;
        var card = cards[0];
        await game.cardsGotoOrdering(cards);
        try {
            await player.showCards(cards, get.translation(player) + "发动了【" + get.translation(skill) + "】");
        } catch (error) {
            var remaining = cards.filter(function (current) { return get.position(current, true) === "o"; });
            if (remaining.length) await game.cardsDiscard(remaining);
            throw error;
        }
        if (get.name(card) === "sha" && get.position(card, true) === "o") return card;
        var remaining = cards.filter(function (current) { return get.position(current, true) === "o"; });
        if (remaining.length) await game.cardsDiscard(remaining);
        return null;
    }

    async function discardOrdering(cards) {
        var remaining = cards.filter(function (card) { return get.position(card, true) === "o"; });
        if (remaining.length) await game.cardsDiscard(remaining);
    }

    function handSha(player, target, request) {
        return player.getCards("h").filter(function (card) {
            return get.name(card, player) === "sha" &&
                acceptsCard(request, card, player) &&
                acceptsTarget(request, card, player, target);
        });
    }

    function fengrenOrder(item, player) {
        var order = get.order({ name: "sha", isCard: true }, player);
        return typeof order === "number" ? order + 0.3 : 3.5;
    }

    function cheapestSha(card, player) {
        // AI-only score: every legal sha stays selectable, cheaper cards rank first.
        return Math.max(1, 10 - get.value(card, player));
    }

    function abortUse(result) {
        // chooseToUse consumes cancel before useResult, then returns to its UI.
        result.bool = true;
        result.cancel = true;
        result.cards = [];
        delete result.card;
        delete result.skill;
    }

    var skills = {
        nihil_xuanzhan: {
            trigger: { player: "useCardAfter" },
            direct: true,
            filter: function (event, player) {
                return xuanTargets(event, player).length > 0;
            },
            async content(event, trigger, player) {
                var targets = xuanTargets(trigger, player);
                if (!targets.length) return;
                await player.chooseToUse({
                    prompt: "旋斩：对合法邻位（或杀的使用者）使用一张杀",
                    _nihilXuanzhan: true,
                    filterCard: function (card, owner) {
                        return get.name(card, owner) === "sha" &&
                            lib.filter.cardEnabled(card, owner);
                    },
                    filterTarget: function (card, owner, target) {
                        return targets.includes(target) && alive(target) &&
                            owner.canUse(card, target, false, false);
                    },
                    selectTarget: 1,
                    // Distance/quota are waived only for this request; still count use.
                    addCount: true,
                    logSkill: "nihil_xuanzhan",
                    // These callbacks are consulted only by AI; human legality/UI is unchanged.
                    ai1: function (card) {
                        return get.order(card, player);
                    },
                    ai2: function (target) {
                        var card = typeof get.card === "function" ? get.card() : null;
                        return get.effect(target, card || { name: "sha", isCard: true }, player, player);
                    },
                });
            },
            ai: { expose: 0.1 },
        },
        nihil_fengren: {
            enable: "chooseToUse",
            viewAs: { name: "sha", isCard: true },
            filterCard: function () { return false; },
            selectCard: -1,
            selectTarget: 1,
            filter: function (event, player) {
                if (!alive(player) || !shaAvailable(player) ||
                    !acceptsCard(event, { name: "sha", isCard: true }, player)) return false;
                return game.players.some(function (target) {
                    return fengrenTarget(event, player, target);
                });
            },
            filterTarget: function (card, player, target) {
                return fengrenTarget(_status.event, player, target);
            },
            async precontent(event, trigger, player) {
                var result = event.result;
                var request = choiceEvent(event);
                var target = result.targets && result.targets[0];
                if (!request || !target || !fengrenTarget(request, player, target)) {
                    abortUse(result);
                    return;
                }
                player.logSkill("nihil_fengren");
                var revealed = await revealTopSha(player, "nihil_fengren");
                if (revealed) {
                    var physical = get.autoViewAs(revealed);
                    if (!acceptsCard(request, physical, player) ||
                        !acceptsTarget(request, physical, player, target)) {
                        await discardOrdering([revealed]);
                        abortUse(result);
                        return;
                    }
                    result.card = physical;
                    result.cards = [revealed];
                    result.targets = [target];
                    delete result.skill;
                    return;
                }
                var selected;
                if (alive(player)) {
                    var candidates = handSha(player, target, request);
                    if (candidates.length) {
                        var choice = await player.chooseCard("h", false,
                            "锋刃：使用一张手牌杀；未使用则本技能本回合失效", function (card) {
                                return candidates.includes(card) &&
                                    handSha(player, target, request).includes(card);
                            }).set("ai", function (card) {
                                return cheapestSha(card, player);
                            }).forResult();
                        selected = choice.bool && choice.cards && choice.cards[0];
                    }
                }
                if (!selected || !player.getCards("h").includes(selected) ||
                    !acceptsCard(request, selected, player) ||
                    !acceptsTarget(request, selected, player, target)) {
                    failSha(player);
                    abortUse(result);
                    return;
                }
                result.card = get.autoViewAs(selected);
                result.cards = [selected];
                result.targets = [target];
                delete result.skill;
            },
            ai: { order: fengrenOrder, result: { player: 1 } },
        },
        nihil_jidong: {
            trigger: { player: ["chooseToUseBefore", "chooseToRespondBefore"] },
            filter: function (event, player) {
                return ["chooseToUse", "chooseToRespond"].includes(event.name) &&
                    alive(player) && !event.responded &&
                    !event._nihilJidongShanTried && !!event.filterCard &&
                    event.filterCard(virtualCard("shan"), player, event) &&
                    shanEnabled(event, player, virtualCard("shan"));
            },
            check: function () { return true; },
            async content(event, trigger, player) {
                trigger._nihilJidongShanTried = true;
                var matched = await revealAndDiscard(player, "shan", "nihil_jidong");
                var card = virtualCard("shan");
                if (!matched || !alive(player) ||
                    !trigger.filterCard(card, player, trigger)) return;
                if (!shanEnabled(trigger, player, card)) return;
                trigger.result = { bool: true, card: card, cards: [], targets: [] };
                trigger.responded = true;
            },
            ai: {
                // The original sha must create its chooseToUse even without hand shan.
                respondShan: true,
                skillTagFilter: function (player, tag, arg) {
                    if (!alive(player)) return false;
                },
            },
        },
    };

    window.nihilModules.mikasa = {
        character: {
            nihil_mikasa: {
                sex: "female",
                group: "man",
                hp: 4,
                maxHp: 4,
                skills: ["nihil_xuanzhan", "nihil_fengren", "nihil_jidong"],
                img: "extension/" + EXT_NAME + "/image/character/nihil_mikasa.png",
            },
        },
        init: function (lib, game) {
            if (!lib.group.includes("man")) game.addGroup("man", "漫", "漫", {});
            lib.groupnature.man = "key";
            Object.assign(lib.translate, { man: "漫", man2: "漫", man_short: "漫", man_config: "漫势力" });
        },
        skill: skills,
        translate: {
            nihil_mikasa: "三笠",
            nihil_mikasa_prefix: "福",
            nihil_xuanzhan: "旋斩",
            nihil_xuanzhan_info: "当你使用的【杀】结算结束后，你可以对一名与此【杀】的目标相邻的其他角色使用一张【杀】；当你使用【闪】响应【杀】后，你可以对该【杀】的使用者使用一张【杀】。以此法使用的【杀】不受距离和次数限制。",
            nihil_fengren: "锋刃",
            nihil_fengren_info: "当你需要使用【杀】时，你可以亮出牌堆顶一张牌。若此牌为【杀】，则使用之；否则，将此牌置入弃牌堆，然后你须使用一张手牌中的【杀】，若未使用，则本技能本回合失效。",
            nihil_jidong: "机动",
            nihil_jidong_info: "当你需要使用或打出【闪】时，你可以亮出牌堆顶两张牌，然后将这些牌置入弃牌堆。若其中有【闪】，则视为你使用或打出一张【闪】。每次需要使用或打出【闪】时限尝试一次。",
        },
        title: { nihil_mikasa: "阿克曼之力" },
        sort: ["nihil_mikasa"],
    };
})();
