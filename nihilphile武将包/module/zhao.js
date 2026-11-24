(function () {
    const markPath = "extension/" + window.NIHIL_EXTENSION_NAME + "/image/mark/";
    const MARK = "nihil_zhusha";
    const PLAN = "nihil_qianmian_turn";
    const SPENT = "nihil_yizhi_used";

    function materialsInOrdering(event) {
        return event.cards?.length && event.cards.every(card => get.position(card, true) === "o");
    }

    function marked(target) {
        return target.getExpansions(MARK).length > 0;
    }

    function followSha(source, target, trap) {
        if (!source.isIn() || !target.isIn()) return;
        const buried = target.getExpansions(MARK);
        if (!trap.cards.length || !trap.cards.every(card => buried.includes(card))) return;
        const card = { name: "sha", nature: trap.nature, suit: trap.suit, number: trap.number, isCard: true };
        if (source.canUse(card, target, false)) return card;
    }

    function canFocusTrap(source, target) {
        const trap = target.storage[MARK];
        return trap && source !== trap.owner && trap.owner.isIn() && trap.owner.hasSkill("nihil_fuzhu_follow") &&
            get.attitude(source, target) < 0 && get.attitude(source, trap.owner) > 0 && followSha(source, target, trap);
    }

    function easierToBury(a, b) {
        return a.hp < b.hp || (a.hp === b.hp && a.countCards("h") < b.countCards("h"));
    }

    function basicChoices(event, player) {
        return get.inpileVCardList(([type, , name, nature]) =>
            type === "basic" && event.filterCard(get.autoViewAs({ name, nature, isCard: true }), player, event));
    }

    function canAsk(player) {
        return !player.hasSkill(SPENT) && player.countCards("h") > 0;
    }

    // 求桃从当前回合角色起按座次询问，已经问过的角色不会再问。
    function rescueWine(request, player, wine) {
        const dying = request.dying;
        const start = [_status.currentPhase, request.getParent("_save", true)?._trigger?.source, dying]
            .find(p => p && (game.players.includes(p) || game.dead.includes(p)));
        const seats = game.filterPlayer().sortBySeat(start);
        const remaining = seats.slice(seats.indexOf(player));
        if (!remaining.includes(dying) || !lib.filter.cardSavable(wine, dying, dying)) return false;
        let healing = 0;
        for (const helper of remaining) {
            if (helper !== dying && (get.attitude(player, helper) <= 0 || get.attitude(helper, dying) <= 0)) continue;
            const cards = helper === player ? player.getCards("hs") : helper.getKnownCards(player);
            healing += cards.filter(c => {
                const name = get.name(c, helper);
                return (name === "tao" || (helper === dying && name === "jiu")) &&
                    lib.filter.cardSavable(c, helper, dying);
            }).length;
        }
        const needed = 1 - dying.hp;
        return healing + 1 >= needed;
    }

    function preferYizhi(request) {
        const player = request.player;
        if (request.skill || request.isMine() || request.isOnline() || !canAsk(player)) return;
        const original = request.ai1 || request.ai;
        if (!original || original.zhaoYizhi) return;
        const score = function (item, ...args) {
            if (item !== "nihil_yizhi") return original.call(this, item, ...args);
            delete request.zhaoPreferredBasic;
            delete request.zhaoWine;
            const dying = request.type === "dying" && request.dying;
            if (dying && dying !== player && get.attitude(player, dying) <= 0) return -1;
            let best = 0;
            for (const card of player.getCards("hs")) {
                if (get.type(card, null, player) !== "basic" || !request.filterCard(card, player, request) ||
                    !lib.filter.cardRespondable(card, player, request)) continue;
                if (request.type === "phase" && player.getUseValue(card) <= 0) continue;
                const priority = original.call(this, card, ...args);
                if (dying && dying !== player && get.name(card, player) === "tao") {
                    request.zhaoPreferredBasic = { name: "tao" };
                    return Math.max(1, priority) + 0.1;
                }
                if (priority > best) {
                    best = priority;
                    request.zhaoPreferredBasic = { name:get.name(card, player), nature:get.nature(card, player) };
                }
            }
            if (!best && dying && dying !== player) {
                const wine = player.getCards("h").find(c => get.name(c, player) === "jiu" && get.name(c, dying) === "jiu");
                if (wine) {
                    if (!rescueWine(request, player, wine)) return -1;
                    request.zhaoWine = wine;
                    request.zhaoPreferredBasic = { name:"tao" };
                    return 2;
                }
            }
            return best ? best + 0.1 : original.call(this, item, ...args);
        };
        score.zhaoYizhi = true;
        request.ai1 = score;
    }

    const skills = {
        nihil_fuzhu: {
            trigger: { player: "useCardToTargeted" },
            global: "nihil_fuzhu_focus",
            mod: {
                targetInRange(card, player, target) {
                    if (get.name(card, player) === "sha" && !marked(target)) return true;
                },
            },
            onremove(player) {
                for (const target of game.filterPlayer(t => t.storage[MARK]?.owner === player)) {
                    target.removeSkill(MARK);
                }
            },
            group: ["nihil_fuzhu_watch", "nihil_fuzhu_follow"],
            filter(event) {
                return event.card.name === "sha" && event.target.isIn() && !marked(event.target) &&
                    !event.excluded.includes(event.target) && materialsInOrdering(event);
            },
            logTarget: "target",
            ai: { effect: {
                player(card, player, target, current, isLink) {
                    if (isLink || !target || card?.name !== "sha" || marked(target) || get.attitude(player, target) >= 0) return;
                    if (!card.cards?.length && get.itemtype(card) !== "card") return;
                    // 埋牌优先按体力、再按手牌数排序。用牌者收益也适用于零伤杀。
                    const rank = game.countPlayer(other => get.attitude(player, other) < 0 && !marked(other) && easierToBury(target, other));
                    return [1, 1 + rank, 0, 0];
                },
            } },
            check(event, player) {
                const plan = player.storage[PLAN];
                return get.attitude(player, event.target) < 0 &&
                    (plan?.damage === 0 || !event.getParent().zhaoFollowSha);
            },
            async content(event, trigger, player) {
                const target = trigger.target;
                if (marked(target) || !materialsInOrdering(trigger)) return;
                const card = trigger.card;
                const stored = {
                    owner: player, nature: get.nature(card), suit: get.suit(card), number: get.number(card),
                    cards: trigger.cards.slice(),
                };
                const move = target.addToExpansion(stored.cards, "gain2");
                move.gaintag.add(MARK);
                await move;
                if (!stored.cards.every(c => target.getExpansions(MARK).includes(c))) return;
                target.storage[MARK] = stored;
                target.addSkill(MARK);
                target.markSkill(MARK);
                trigger.excluded.add(target);
            },
        },
        nihil_fuzhu_focus: {
            onChooseToUse(event) {
                if (event.ai2 === get.cacheEffectUse) event.ai2 = lib.skill.nihil_fuzhu_focus.score;
            },
            score(target, candidates) {
                const score = get.cacheEffectUse(target);
                const event = get.event();
                if (!target || (event.skill && !get.info(event.skill).viewAs)) return score;
                const source = event.player, card = get.card();
                if (!card || get.name(card, source) !== "sha") return score;

                // 引擎比较时传入本次可选目标，选定后会再单独检查一次能否出杀。
                if (source.hasSkill("nihil_fuzhu")) {
                    if (!card.cards?.length && get.itemtype(card) !== "card") return score;
                    const canBury = t => get.attitude(source, t) < 0 && !marked(t);
                    if (canBury(target)) {
                        if (candidates?.some(t => canBury(t) && easierToBury(t, target))) return 0;
                        return Math.max(1, score);
                    }
                    if (candidates?.some(canBury)) return Math.min(0, score);
                } else if (score > 0 && candidates?.length && !canFocusTrap(source, target)) {
                    if (candidates.some(t => canFocusTrap(source, t) && get.cacheEffectUse(t) > 0)) return 0;
                }
                return score;
            },
        },
        nihil_zhusha: {
            trigger: { global: ["loseAfter", "loseAsyncAfter", "dieAfter"] },
            silent: true,
            filter(event, player) {
                const trap = player.storage[MARK];
                if (!trap) return false;
                if (event.name === "die") return event.player === trap.owner;
                return !trap.cards.every(c => player.getExpansions(MARK).includes(c));
            },
            async content(event, trigger, player) { player.removeSkill(MARK); },
            charlotte: true, marktext: "诛", markimage: markPath + "zhao_zhusha.png",
            intro: { content: "expansion", markcount: "expansion" },
            ai: {
                effect: {
                    target(card, source, target, current, isLink) {
                        if (isLink || !card?.name || get.name(card, source) !== "sha") return;
                        // 追杀压制目标，使用者还能摸一张牌。
                        if (!source.hasSkill("nihil_fuzhu") && canFocusTrap(source, target)) return [1, -1, 1, 1];
                    },
                },
            },
            onremove(player) {
                delete player.storage[MARK];
                const cards = player.getExpansions(MARK);
                if (cards.length) player.loseToDiscardpile(cards);
            },
        },
        nihil_fuzhu_watch: {
            // 在埋牌机会之前记录原有的诛杀，避免同一刀刚埋就引爆。
            trigger: { global: "useCardToTarget" }, silent: true,
            filter(event, player) {
                return event.card.name === "sha" && event.target.storage[MARK]?.owner === player && marked(event.target);
            },
            async content(event, trigger) {
                const use = trigger.getParent();
                (use.zhaoTraps ||= new Map()).set(trigger.target, trigger.target.storage[MARK]);
            },
        },
        nihil_fuzhu_follow: {
            trigger: { global: "useCardToTargeted" }, forced: true, popup: false, lastDo: true,
            filter(event, player) {
                const trap = event.getParent().zhaoTraps?.get(event.target);
                return trap?.owner === player && event.target.storage[MARK] === trap;
            },
            async content(event, trigger, player) {
                const { player: source, target } = trigger;
                const traps = trigger.getParent().zhaoTraps;
                const trap = traps.get(target);
                traps.delete(target);
                if (target.storage[MARK] !== trap) return;
                const card = followSha(source, target, trap);
                if (!card) return;
                const follow = source.useCard(card, trap.cards, target, false).set("zhaoFollowSha", true);
                await follow;
                if (target.storage[MARK] === trap && !marked(target)) target.removeSkill(MARK);
                const dealtDamage = game.hasPlayer2(current => current.hasHistory("damage", damage =>
                    damage.num > 0 && !damage.unreal && damage.card === follow.card && damage.getParent("useCard") === follow), true);
                if (source.isIn()) await source.draw();
                if (dealtDamage && player.isIn()) await player.draw();
            },
        },
        nihil_qianmian: {
            trigger: { player: "phaseBegin" }, direct: true,
            cost([draw, hand, sha, damage]) {
                return draw + hand + sha + 2 * damage;
            },
            updateDialog(event, remaining) {
                const dialog = event.dialog;
                if (!dialog) return;
                if (!dialog.zhaoAllocation) {
                    const rows = Array.from(dialog.content.querySelectorAll("select"));
                    if (rows.length !== event.list.length) return;
                    const status = dialog.content.ownerDocument.createElement("div");
                    status.setAttribute("aria-live", "polite");
                    dialog.content.appendChild(status);
                    const controls = rows.map((select, index) => {
                        const row = select.ownerDocument.createElement("div");
                        row.style.cssText = "display:flex;align-items:center;justify-content:center;gap:8px";
                        select.before(row);
                        row.appendChild(select);
                        const buttons = [-1, 1].map(step => {
                            const button = select.ownerDocument.createElement("button");
                            button.type = "button";
                            button.textContent = step < 0 ? "−" : "＋";
                            button.style.cssText = "min-width:36px;min-height:32px;font-size:18px";
                            button.setAttribute("aria-label", (step < 0 ? "减少" : "增加") + event.list[index].prompt);
                            button.onclick = () => {
                                select.value = String(event.numbers[index] + step);
                                select.onchange();
                            };
                            if (step < 0) row.prepend(button);
                            else row.appendChild(button);
                            return button;
                        });
                        return buttons;
                    });
                    dialog.zhaoAllocation = { status, controls };
                }
                dialog.zhaoAllocation.status.textContent = "剩余狐面：" + remaining + " 点";
                dialog.zhaoAllocation.controls.forEach(([minus, plus], index) => {
                    minus.disabled = event.numbers[index] <= 0;
                    plus.disabled = remaining < event.list[index].cost;
                });
            },
            async content(event, trigger, player) {
                const firstLess = game.phaseNumber === 1 && _status.first_less &&
                    (get.config("first_less") || _status.connectMode || _status.first_less_forced);
                const drawBase = 2 - Number(!!firstLess) + Number(player.hasSkill("reyingzi"));
                const handLimit = player.getHandcardLimit();
                const handBase = Number.isSafeInteger(handLimit) ? handLimit :
                    (Number.isSafeInteger(player.hp) ? Math.max(0, player.hp) : 0);
                const lostHp = player.getDamagedHp();
                const bonus = Number.isSafeInteger(lostHp) ? Math.max(0, lostHp) : 0;
                const quota = player.getCardUsable("sha", true);
                // 无限出杀没有可折算的有限点数，保留装备效果，只分配基础次数。
                const shaBase = Number.isSafeInteger(quota) && quota >= 0 ? quota : 1;
                const damageBase = get.info({ name: "sha" }).baseDamage || 1;
                const numbers = [drawBase, handBase, shaBase, damageBase];
                const budget = lib.skill.nihil_qianmian.cost(numbers) + bonus;
                const enemies = game.filterPlayer(t => get.attitude(player, t) < 0);
                const unmarked = enemies.filter(t => !marked(t));
                const slashes = player.getCards("h", card => get.name(card, player) === "sha");
                let attacks = slashes.length && unmarked.length >= 2 ? 2 : 1;
                let power = 0;
                if (!unmarked.length) {
                    attacks = Number(slashes.some(card => enemies.some(t => player.canUse(card, t))));
                    if (attacks && budget >= 1) power = Math.min(2, Math.floor((budget - 1) / 2));
                }
                attacks = Math.min(attacks, budget);
                const remaining = budget - attacks - 2 * power;
                // 给现有手牌留空间，空手时也尽量兼顾摸牌与留牌。
                const carried = player.countCards("h") - Math.min(slashes.length, attacks);
                const keep = Math.min(remaining, Math.floor((remaining + carried) / 2));
                const preferred = [remaining - keep, keep, attacks, power];
                const result = await player.chooseNumbers({
                    prompt: "千面",
                    prompt2: "共 " + budget + " 狐面（已损失体力额外提供 " + bonus + "）。每点可换 1 摸牌、1 手牌上限或 1 出杀次数，每 2 点可换 1 杀伤害。",
                    list: [
                        { prompt: "摸牌数", cost: 1, min: 0, max: budget },
                        { prompt: "手牌上限", cost: 1, min: 0, max: budget },
                        { prompt: "出杀次数", cost: 1, min: 0, max: budget },
                        { prompt: "杀伤害", cost: 2, min: 0, max: Math.floor(budget / 2) },
                    ],
                    numbers, budget, preferred,
                    filterSelect(num, index, evt) {
                        return lib.skill.nihil_qianmian.cost(evt.numbers) +
                            (num - evt.numbers[index]) * evt.list[index].cost <= evt.budget;
                    },
                    filterOk(evt) {
                        const remaining = evt.budget - lib.skill.nihil_qianmian.cost(evt.numbers);
                        lib.skill.nihil_qianmian.updateDialog(evt, remaining);
                        return remaining === 0;
                    },
                    processAI: evt => evt.preferred,
                }).forResult();
                if (!result.bool || result.numbers?.length !== 4 ||
                    !result.numbers.every(n => Number.isSafeInteger(n) && n >= 0)) return;
                if (lib.skill.nihil_qianmian.cost(result.numbers) !== budget) return;
                const [draw, hand, sha, damage] = result.numbers;
                player.logSkill("nihil_qianmian");
                player.storage[PLAN] = { draw, hand, sha, damage, drawBase, handBase, shaBase, damageBase };
                player.addTempSkill(PLAN);
                player.markSkill(PLAN);
                game.log(player, "将本回合的摸牌数、手牌上限、出杀次数、杀伤害分配为", result.numbers.join("／"));
            },
        },
        nihil_qianmian_turn: {
            charlotte: true, onremove: true, mark: true, marktext: "面",
            markimage: markPath + "zhao_qianmian.png",
            intro: { content: plan => "摸牌 " + plan.draw + (plan.hand == null ? "" : "，手牌上限 " + plan.hand) + "，出杀次数 " + plan.sha + "，杀伤害 " + plan.damage },
            mod: {
                maxHandcardFinal(player, num) {
                    const plan = player.storage[PLAN];
                    if (plan?.hand != null) return Math.max(0, num) + plan.hand - plan.handBase;
                },
                cardUsable(card, player, num) {
                    if (card.name === "sha") return Math.max(0, num + player.storage[PLAN].sha - (player.storage[PLAN].shaBase ?? 1));
                },
            },
            trigger: { player: ["phaseDrawBegin2", "shaBegin"] }, forced: true, popup: false,
            lastDo: true,
            filter(event) { return event.name === "sha" || !event.numFixed; },
            async content(event, trigger, player) {
                const plan = player.storage[PLAN];
                if (trigger.name === "sha") {
                    // damage() 将 baseDamage=0 回退为 1，改用命中时的加减量保留零伤及酒等加成。
                    trigger.extraDamage = (trigger.extraDamage || 0) + plan.damage - (plan.damageBase ?? 1);
                } else trigger.num = Math.max(0, trigger.num + plan.draw - (plan.drawBase ?? 2));
            },
        },
        nihil_yizhi: {
            enable: ["chooseToUse", "chooseToRespond"],
            onChooseToUse: preferYizhi,
            onChooseToRespond: preferYizhi,
            ai2: () => 1, // 先进入选牌名步骤，交牌与出牌的目标在后面各自选择。
            direct: true,
            filter(event, player) { return canAsk(player) && basicChoices(event, player).length > 0; },
            hiddenCard(player, name) { return canAsk(player) && get.type(name) === "basic"; },
            chooseButton: {
                dialog(event, player) {
                    let choices = basicChoices(event, player);
                    if (event.name === "chooseToRespond" && choices.some(choice => choice[2] === "sha" && !choice[3])) {
                        choices = choices.filter(choice => choice[2] !== "sha" || !choice[3]);
                    }
                    const dialog = ui.create.dialog("颐指：选择需要的基本牌", [choices, "vcard"]);
                    dialog.direct = choices.length === 1;
                    return dialog;
                },
                check(button) {
                    const card = {name: button.link[2], nature: button.link[3]};
                    const request = get.event().getParent(), preferred = request.zhaoPreferredBasic;
                    if (preferred) return card.name === preferred.name && (!card.nature || card.nature === preferred.nature)
                        ? (card.nature === preferred.nature ? 2 : 1) : -1;
                    return request.type === "phase" ? get.player().getUseValue(card) : 1;
                },
                prompt(links) {
                    return "颐指：选择一张手牌和一名收牌人（可选自己，顺序不限），请其打出" + get.translation({name:links[0][2], nature:links[0][3]});
                },
                backup(links) {
                    return {
                        zhaoWanted: {name: links[0][2], nature: links[0][3]},
                        position: "h", filterCard: true, filterTarget: true, selectTarget: 1,
                        // 引擎先检查手牌，再开放目标；玩家可以先点人，选齐两项才提交。
                        selectCard() { return get.event().isMine() ? [0, 1] : 1; },
                        filterOk() { return ui.selected.cards.length === 1 && ui.selected.targets.length === 1; },
                        discard: false, lose: false,
                        ai1(card) {
                            const wine = get.event().zhaoWine;
                            if (wine) return card === wine ? 1 : -1;
                            return Math.max(0.1, 10 - get.value(card));
                        },
                        ai2(target) {
                            const request = get.event(), player = request.player, wanted = get.info(request.skill).zhaoWanted;
                            if (request.zhaoWine) return target === request.dying ? 1 : -1;
                            if (target === player && player.countCards("hs", card => get.name(card, player) === wanted.name &&
                                (!wanted.nature || get.nature(card, player) === wanted.nature))) return 20;
                            return get.attitude(player, target) + Math.min(4, target.countCards("h"));
                        },
                        async precontent(event, trigger, player) {
                            await lib.skill.nihil_yizhi.requestBasic(event, player);
                        },
                    };
                },
            },
            async requestBasic(event, player) {
                const request = event.getParent(), result = event.result;
                const wanted = get.info(result.skill).zhaoWanted;
                const [gift] = result.cards, [supplier] = result.targets;
                // 原询问只应收到供应的基本牌及其目标，不能把礼物当作响应牌或把收牌人当作杀的目标。
                delete result.skill;
                result.cards = [];
                result.targets = [];
                result.cancel = true;
                if (!canAsk(player) || !supplier?.isIn() || !player.getCards("h").includes(gift)) return;
                const choices = basicChoices(request, player).filter(choice => choice[2] === wanted.name &&
                    (!wanted.nature || choice[3] === wanted.nature));
                if (!choices.length) return;
                player.addTempSkill(SPENT);
                delete request._skillChoice;
                player.logSkill("nihil_yizhi", supplier);
                await player.give([gift], supplier);
                if (!player.isIn() || !supplier.isIn()) return;

                const supplied = await supplier.chooseToRespond(
                    "颐指：可替" + get.translation(player) + "打出" + get.translation(wanted) +
                        (supplier === player ? "，若如此做，你摸两张牌" : "，若如此做，你与其各摸一张牌"),
                    function (card, source) {
                        const req = get.event().getParent("chooseToRespond", true, true);
                        const name = get.name(card, source), nature = get.nature(card, source) || "";
                        return req.zhaoChoices.some(choice => choice[2] === name && (choice[3] || "") === nature) &&
                            lib.filter.cardRespondable(card, source, req);
                    })
                    .set("zhaoChoices", choices).set("noOrdering", true).set("source", player)
                    .set("ai", card => {
                        const supplier = get.player(), source = get.event().source;
                        if (supplier === source && get.itemtype(card) === "card") return Math.max(1, 12 - get.value(card));
                        return get.attitude(supplier, source) > 0 ? 12 - get.value(card) : -1;
                    })
                    .forResult();
                if (!supplied.bool || !supplied.card) return;
                const materials = () => (supplied.cards || []).filter(c => get.position(c, true) === "o");
                const card = get.autoViewAs(supplied.card, materials());
                try {
                    if (player.isIn()) await player.draw(supplier === player ? 2 : 1);
                    if (supplier !== player && supplier.isIn()) await supplier.draw();
                    if (!player.isIn() || !request.filterCard(card, player, request)) return;
                    if (request.name === "chooseToRespond" && !lib.filter.cardRespondable(card, player, request)) return;
                    if (request.name === "chooseToUse" && !get.info(card).notarget) {
                        event._get_card = card;
                        event.dying = request.dying;
                        const range = get.select(request.selectTarget);
                        if (request.type === "dying" && request.dying) {
                            const dying = request.dying;
                            if (!dying.isIn() || dying.hp > 0 || !request.filterTarget(card, player, dying)) return;
                            result.targets = [dying];
                        } else if (range[1] < 0) {
                            result.targets = game.filterPlayer2(target => request.filterTarget(card, player, target));
                            if (!result.targets.length) return;
                        } else if (range[1] > 0) {
                            const selection = await player.chooseTarget({
                                prompt: "颐指：选择" + get.translation(card) + "的目标",
                                _get_card: card, selectTarget: request.selectTarget, filterTarget: request.filterTarget,
                                dying: request.dying, addCount_extra: request.addCount_extra,
                                ai: (target, candidates) => lib.skill.nihil_fuzhu_focus.score(target, candidates),
                                targetRequired: request.targetRequired, filterOk: request.filterOk,
                                complexSelect: request.complexSelect, nihilCanCancel: true,
                            }).forResult();
                            if (!selection.bool) return;
                            result.targets = selection.targets;
                        }
                    }
                    result.card = card;
                    result.cards = materials();
                    delete result.cancel;
                } finally {
                    if (result.cancel && materials().length) await game.cardsDiscard(materials());
                }
            },
            ai: { order: 7, respondSha: true, respondShan: true, save: true,
                skillTagFilter(player) { return canAsk(player); }, result: { player: 1 } },
        },
        nihil_yizhi_used: { charlotte: true },
    };

    window.nihilModules.zhao = {
        character: { nihil_zhao: {
            sex: "female", group: "yao", hp: 3,
            img: "extension/" + window.NIHIL_EXTENSION_NAME + "/image/character/nihil_zhao.png",
            skills: ["nihil_fuzhu", "nihil_qianmian", "nihil_yizhi"],
        } },
        title: { nihil_zhao: "#g妖后" }, sort: ["nihil_zhao"], skill: skills,
        translate: {
            nihil_zhao: "昭", nihil_fuzhu: "伏诛", nihil_zhusha: "诛杀", nihil_qianmian: "千面", nihil_qianmian_turn: "千面", nihil_yizhi: "颐指",
            nihil_fuzhu_info: "当一名没有<b>“诛杀”</b>的角色成为你【杀】的目标时，你可以改为将此【杀】作为<b>“诛杀”</b>置于其武将牌上。其再次成为【杀】的目标时，此【杀】的使用者额外对其使用<b>“诛杀”</b>并摸一张牌。若<b>“诛杀”</b>造成伤害，你摸一张牌。你的【杀】对没有<b>“诛杀”</b>的角色无视距离。",
            nihil_qianmian_info: "回合开始时，将摸牌阶段摸牌数、手牌上限、基础出杀次数和【杀】的基础伤害折算为<b>“狐面”</b>（前三项每点计1，【杀】的基础伤害每点计2）。你每有1点已损失体力，额外获得1点<b>“狐面”</b>。你可以按相同权重，将这些<b>“狐面”</b>重新分配为本回合的上述四项数值，每项均可为0。",
            nihil_yizhi_info: "每回合限一次，当你需要使用或打出基本牌时，你可以选择所需的基本牌，将一张手牌交给一名角色（可以是自己）。其可以打出所需的基本牌，视为由你使用或打出之。若其如此做，你与其各摸一张牌。",
        },
    };
})();
