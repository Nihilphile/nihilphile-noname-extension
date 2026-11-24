game.import("character", function (lib, game, ui, get, ai, _status) {
    "use strict";

    var extensionName = window.MECHANISM_TEST_EXTENSION_NAME || "MechanismTest";
    var HISTORY_KEY = "mechanism_test_history";
    var CANCEL = "cancel2";

    var cardPresets = {
        "杀·♠7": { name: "sha", suit: "spade", number: 7 },
        "火杀·♥7": { name: "sha", suit: "heart", number: 7, nature: "fire" },
        "雷杀·♣7": { name: "sha", suit: "club", number: 7, nature: "thunder" },
        "闪·♦8": { name: "shan", suit: "diamond", number: 8 },
        "桃·♥6": { name: "tao", suit: "heart", number: 6 },
        "酒·♠9": { name: "jiu", suit: "spade", number: 9 },
        "决斗·♣1": { name: "juedou", suit: "club", number: 1 },
        "借刀杀人·♣12": { name: "jiedao", suit: "club", number: 12 },
        "诸葛连弩·♣1": { name: "zhuge", suit: "club", number: 1 },
        "青釭剑·♠6": { name: "qinggang", suit: "spade", number: 6 },
        "寒冰剑·♠2": { name: "hanbing", suit: "spade", number: 2 },
        "方天画戟·♦12": { name: "fangtian", suit: "diamond", number: 12 },
        "八卦阵·♣2": { name: "bagua", suit: "club", number: 2 },
        "仁王盾·♣2": { name: "renwang", suit: "club", number: 2 },
        "赤兔·♥5": { name: "chitu", suit: "heart", number: 5 },
        "的卢·♣5": { name: "dilu", suit: "club", number: 5 },
        "爪黄飞电·♥13": { name: "zhuahuang", suit: "heart", number: 13 },
        "大宛·♠13": { name: "dawan", suit: "spade", number: 13 },
    };

    var categoryLabels = {
        "基本牌": "basic",
        "普通锦囊": "trick",
        "延时锦囊": "delay",
        "装备牌": "equip",
        "其他已注册牌": "other",
    };

    var suitLabels = {
        "♠ [spade]": "spade",
        "♥ [heart]": "heart",
        "♣ [club]": "club",
        "♦ [diamond]": "diamond",
    };

    function translated(value) {
        return get.translation(value);
    }

    function appendRecord(player, text) {
        if (!Array.isArray(player.storage[HISTORY_KEY])) {
            player.storage[HISTORY_KEY] = [];
        }
        player.storage[HISTORY_KEY].push(text);
        if (player.storage[HISTORY_KEY].length > 50) {
            player.storage[HISTORY_KEY].splice(0, player.storage[HISTORY_KEY].length - 50);
        }
        player.syncStorage(HISTORY_KEY);
        player.markSkill(HISTORY_KEY);
        game.log(player, "#g[机制台]", text);
    }

    async function chooseLivingTarget(player, prompt, excludeSelf) {
        var chooser = excludeSelf
            ? player.chooseTarget(prompt, function (card, owner, target) {
                return target.isIn() && target !== owner;
            })
            : player.chooseTarget(prompt, function (card, owner, target) {
                return target.isIn();
            });
        var result = await chooser
            .set("ai", function () { return 1; })
            .forResult();
        if (!result || !result.bool || !result.targets || !result.targets.length) return null;
        return result.targets[0];
    }

    async function chooseControl(player, controls, prompt) {
        var result = await player
            .chooseControl(controls, CANCEL)
            .set("prompt", prompt)
            .set("ai", function () { return "cancel2"; })
            .forResult();
        if (!result || !result.control || result.control === CANCEL) return null;
        return result.control;
    }

    async function choosePositiveInteger(player, prompt) {
        var shortcut = await chooseControl(player, ["1点", "2点", "3点", "自定义正整数"], prompt);
        if (!shortcut) return null;
        if (shortcut !== "自定义正整数") return parseInt(shortcut, 10);

        var digits = "";
        while (true) {
            var display = digits || "（尚未输入）";
            var control = await chooseControl(
                player,
                ["完成输入", "退格", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
                prompt + "；当前值：" + display,
            );
            if (!control) return null;
            if (control === "退格") {
                digits = digits.slice(0, -1);
                continue;
            }
            if (control === "完成输入") {
                var amount = Number(digits);
                if (digits && Number.isSafeInteger(amount) && amount > 0) return amount;
                appendRecord(player, "拒绝：数值必须是大于0的安全整数");
                continue;
            }
            var candidate = (digits + control).replace(/^0+(?=\d)/, "");
            var candidateNumber = Number(candidate);
            if (!Number.isSafeInteger(candidateNumber)) {
                appendRecord(player, "拒绝：数值超出JavaScript安全整数范围");
                continue;
            }
            digits = candidate;
        }
    }

    function getRegisteredCardEntries(category) {
        return Object.keys(lib.card)
            .filter(function (name) {
                var info = lib.card[name];
                if (!info || typeof info !== "object") return false;
                var type = info.type || get.type(name);
                if (!type || type === "none") return false;
                if (category === "other") return !["basic", "trick", "delay", "equip"].includes(type);
                return type === category;
            })
            .sort(function (a, b) {
                return a.localeCompare(b);
            })
            .map(function (name) {
                return {
                    name: name,
                    label: translated(name) + " [" + name + "]",
                };
            });
    }

    async function chooseRegisteredCardSpec(player, prompt) {
        var categoryLabel = await chooseControl(player, Object.keys(categoryLabels), prompt + "：选择牌类");
        if (!categoryLabel) return null;
        var entries = getRegisteredCardEntries(categoryLabels[categoryLabel]);
        if (!entries.length) {
            appendRecord(player, "拒绝：所选牌类没有已注册卡牌");
            return null;
        }
        var labelMap = {};
        entries.forEach(function (entry) { labelMap[entry.label] = entry.name; });
        var cardLabel = await chooseControl(player, entries.map(function (entry) { return entry.label; }), prompt + "：选择精确牌ID");
        if (!cardLabel) return null;
        var name = labelMap[cardLabel];
        if (!name || !lib.card[name]) {
            appendRecord(player, "拒绝：未知或未注册牌 " + cardLabel);
            return null;
        }
        var suitLabel = await chooseControl(player, Object.keys(suitLabels), prompt + "：选择花色");
        if (!suitLabel) return null;
        var numberLabel = await chooseControl(
            player,
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"],
            prompt + "：选择点数",
        );
        if (!numberLabel) return null;
        var spec = { name: name, suit: suitLabels[suitLabel], number: parseInt(numberLabel, 10) };
        if (name === "sha") {
            var natureMap = { "普通 [none]": undefined };
            (lib.inpile_nature || []).forEach(function (nature) {
                natureMap[translated(nature) + " [" + nature + "]"] = nature;
            });
            var natureLabel = await chooseControl(player, Object.keys(natureMap), prompt + "：选择【杀】属性");
            if (!natureLabel) return null;
            spec.nature = natureMap[natureLabel];
        }
        return spec;
    }

    async function chooseCardSpec(player, prompt) {
        var mode = await chooseControl(player, ["快捷预设", "按牌类与精确ID"], prompt + "：选择生成方式");
        if (!mode) return null;
        if (mode === "快捷预设") {
            var presetLabel = await chooseControl(player, Object.keys(cardPresets), prompt + "：选择快捷预设");
            if (!presetLabel) return null;
            var preset = cardPresets[presetLabel];
            return {
                name: preset.name,
                suit: preset.suit,
                number: preset.number,
                nature: preset.nature,
                display: presetLabel,
            };
        }
        var spec = await chooseRegisteredCardSpec(player, prompt);
        if (spec) {
            spec.display = translated(spec.name) + " [" + spec.name + "]·" + translated(spec.suit) + spec.number + (spec.nature ? "·" + translated(spec.nature) : "");
        }
        return spec;
    }

    async function generatePhysicalCard(player) {
        var target = await chooseLivingTarget(player, "机制台：选择获得新实体牌的角色", false);
        if (!target) return appendRecord(player, "取消：生成实体牌（未选择目标）");
        var spec = await chooseCardSpec(player, "机制台：选择实体牌");
        if (!spec) return appendRecord(player, "取消：生成实体牌（规格未完成）");
        if (!lib.card[spec.name]) return appendRecord(player, "拒绝：未知或未注册牌 " + spec.name);
        var card = game.createCard2(spec.name, spec.suit, spec.number, spec.nature);
        await target.gain(card, "gain2");
        appendRecord(player, "生成实体牌" + spec.display + "，由" + translated(target) + "获得");
    }

    async function useMateriallessSlash(player) {
        var label = await chooseControl(player, ["普通杀", "火杀", "雷杀"], "机制台：选择无材料【杀】类型");
        if (!label) return appendRecord(player, "取消：使用无材料杀（未选择类型）");
        var card = { name: "sha", isCard: true };
        if (label === "火杀") card.nature = "fire";
        if (label === "雷杀") card.nature = "thunder";
        var next = player.chooseUseTarget({
            card: card,
            cards: [],
            addCount: false,
            nodistance: true,
            prompt: "机制台：请选择" + label + "的合法目标（忽略距离与次数）",
            logSkill: "mechanism_test_console",
        });
        var result = await next.forResult();
        if (!result || !result.bool) {
            return appendRecord(player, "取消或无合法目标：" + label + "（无实体材料、忽略距离次数）");
        }
        appendRecord(player, "使用" + label + "（无实体材料、忽略距离次数且不计次数）");
    }

    async function dealSpecifiedDamage(player) {
        var source = await chooseLivingTarget(player, "机制台：选择伤害来源", false);
        if (!source) return appendRecord(player, "取消：指定来源伤害（未选择来源）");
        var target = await chooseLivingTarget(player, "机制台：选择受伤角色", false);
        if (!target) return appendRecord(player, "取消：指定来源伤害（未选择目标）");
        var natureLabel = await chooseControl(player, ["普通伤害", "火焰伤害", "雷电伤害"], "机制台：选择伤害属性");
        if (!natureLabel) return appendRecord(player, "取消：指定来源伤害（未选择属性）");
        var amount = await choosePositiveInteger(player, "机制台：输入伤害点数");
        if (!amount) return appendRecord(player, "取消：指定来源伤害（数值未完成）");
        var nature = natureLabel === "火焰伤害" ? "fire" : natureLabel === "雷电伤害" ? "thunder" : undefined;
        appendRecord(player, "执行：" + translated(source) + "对" + translated(target) + "造成" + amount + "点" + natureLabel);
        await target.damage({ source: source, num: amount, nature: nature, nocard: true });
    }

    async function changeHealthOrShield(player) {
        var target = await chooseLivingTarget(player, "机制台：选择体力/护盾操作目标", false);
        if (!target) return appendRecord(player, "取消：体力与护盾（未选择目标）");
        var operation = await chooseControl(player, ["回复体力", "失去体力", "增加护盾", "减少护盾"], "机制台：选择操作");
        if (!operation) return appendRecord(player, "取消：体力与护盾（未选择操作）");
        var amount = await choosePositiveInteger(player, "机制台：输入数值");
        if (!amount) return appendRecord(player, "取消：体力与护盾（数值未完成）");

        if (operation === "回复体力") {
            appendRecord(player, "执行：令" + translated(target) + "回复" + amount + "点体力");
            await target.recover(amount);
        } else if (operation === "失去体力") {
            appendRecord(player, "执行：令" + translated(target) + "失去" + amount + "点体力");
            await target.loseHp(amount);
        } else if (operation === "增加护盾") {
            appendRecord(player, "执行：令" + translated(target) + "增加" + amount + "点护盾");
            await target.changeHujia(amount);
        } else {
            var actual = Math.min(amount, Math.max(0, target.hujia || 0));
            if (!actual) return appendRecord(player, "未执行：" + translated(target) + "当前没有护盾");
            appendRecord(player, "执行：令" + translated(target) + "减少" + actual + "点护盾");
            await target.changeHujia(-actual);
        }
    }

    async function moveFieldCard(player) {
        var result = await player.moveCard({
            forced: false,
            canReplace: false,
            prompt: "机制台：依次选择来源、目标及要移动的装备区/判定区实体牌",
        }).forResult();
        if (!result || !result.bool || !result.card || !result.targets || result.targets.length !== 2) {
            return appendRecord(player, "取消或无合法目标：移动场上牌");
        }
        appendRecord(
            player,
            "移动场上牌：将" + translated(result.targets[0]) + "的" + translated(result.card) + "移至" + translated(result.targets[1]),
        );
    }

    async function stackGeneratedCards(player) {
        var amount = await choosePositiveInteger(player, "机制台：输入置于牌堆顶的牌数");
        if (!amount) return appendRecord(player, "取消：控牌堆顶（数值未完成）");
        var specs = [];
        for (var i = 0; i < amount; i++) {
            var spec = await chooseCardSpec(player, "机制台：选择从顶向下第" + (i + 1) + "张牌");
            if (!spec) return appendRecord(player, "取消：控牌堆顶（尚未创建或移动任何牌）");
            if (!lib.card[spec.name]) return appendRecord(player, "拒绝：未知或未注册牌 " + spec.name);
            specs.push(spec);
        }
        var cards = specs.map(function (spec) {
            return game.createCard2(spec.name, spec.suit, spec.number, spec.nature);
        });
        await game.cardsGotoPile(cards.slice().reverse(), "insert");
        appendRecord(player, "控牌堆顶（从顶向下）：" + specs.map(function (spec) { return spec.display; }).join(" → "));
    }

    async function gainExistingCard(player) {
        var target = await chooseLivingTarget(player, "机制台：选择被获得牌的角色", true);
        if (!target) return appendRecord(player, "取消：获得现有牌（未选择目标）");
        if (!target.countCards("he")) return appendRecord(player, "未执行：" + translated(target) + "的手牌区和装备区没有牌");
        var result = await player.gainPlayerCard({ target: target, position: "he", forced: false }).forResult();
        if (!result || !result.bool) return appendRecord(player, "取消：获得" + translated(target) + "的现有牌");
        appendRecord(player, "获得" + translated(target) + "的一张现有牌");
    }

    async function discardExistingCard(player) {
        var target = await chooseLivingTarget(player, "机制台：选择被弃置牌的角色", false);
        if (!target) return appendRecord(player, "取消：弃置现有牌（未选择目标）");
        if (!target.countCards("he")) return appendRecord(player, "未执行：" + translated(target) + "的手牌区和装备区没有牌");
        var result = await player.discardPlayerCard({ target: target, position: "he", forced: false }).forResult();
        if (!result || !result.bool) return appendRecord(player, "取消：弃置" + translated(target) + "的现有牌");
        appendRecord(player, "弃置" + translated(target) + "的一张现有牌");
    }

    async function giveExistingCard(player) {
        if (!player.countCards("h")) return appendRecord(player, "未执行：没有可交给的手牌");
        var target = await chooseLivingTarget(player, "机制台：选择接收手牌的其他角色", true);
        if (!target) return appendRecord(player, "取消：交给手牌（未选择目标）");
        var result = await player
            .chooseCard("h", false, "机制台：选择交给" + translated(target) + "的一张手牌")
            .set("ai", function () { return 0; })
            .forResult();
        if (!result || !result.bool || !result.cards || !result.cards.length) {
            return appendRecord(player, "取消：交给" + translated(target) + "手牌");
        }
        await player.give(result.cards, target, "give");
        appendRecord(player, "交给" + translated(target) + "一张现有手牌");
    }

    var skills = {
        mechanism_test_console: {
            enable: "phaseUse",
            async content(event, trigger, player) {
                var operation = await chooseControl(
                    player,
                    ["生成实体牌", "使用无材料杀", "指定来源伤害", "体力与护盾", "移动场上牌", "控牌堆顶", "获得现有牌", "弃置现有牌", "交给手牌"],
                    "机制台：选择场景准备操作",
                );
                if (!operation) return appendRecord(player, "取消：机制台主菜单");
                if (operation === "生成实体牌") return generatePhysicalCard(player);
                if (operation === "使用无材料杀") return useMateriallessSlash(player);
                if (operation === "指定来源伤害") return dealSpecifiedDamage(player);
                if (operation === "体力与护盾") return changeHealthOrShield(player);
                if (operation === "移动场上牌") return moveFieldCard(player);
                if (operation === "控牌堆顶") return stackGeneratedCards(player);
                if (operation === "获得现有牌") return gainExistingCard(player);
                if (operation === "弃置现有牌") return discardExistingCard(player);
                if (operation === "交给手牌") return giveExistingCard(player);
            },
            ai: {
                order: 0.01,
                result: { player: 0 },
            },
        },
        mechanism_test_history: {
            charlotte: true,
            mark: true,
            marktext: "测",
            intro: {
                content: function (storage) {
                    if (!Array.isArray(storage) || !storage.length) return "尚无机制台操作记录";
                    return storage.map(function (item, index) {
                        return (index + 1) + ". " + item;
                    }).join("<br>");
                },
            },
        },
    };

    return {
        name: "mechanism_test",
        connect: true,
        character: {
            mechanism_test_actor: [
                "male",
                "qun",
                4,
                ["mechanism_test_console", "mechanism_test_history"],
                ["ext:" + extensionName + "/image/character/mechanism_test_actor.svg"],
            ],
        },
        skill: skills,
        translate: {
            mechanism_test: "机制测试",
            mechanism_test_main: "机制测试",
            mechanism_test_actor: "机制测试员",
            mechanism_test_actor_prefix: "机制",
            mechanism_test_console: "机制台",
            mechanism_test_console_info: "出牌阶段，你可以执行公开场景准备：生成任意已注册实体牌；使用忽略距离和次数且不计次数的无材料普通/火/雷【杀】；输入任意正整数伤害、体力或护盾值；移动场上装备/判定牌；按顺序生成并置顶实体牌；获得、弃置或交给现有牌。目标禁止与原生结算仍生效。",
            mechanism_test_history: "测试记录",
            mechanism_test_history_info: "公开显示最近五十条机制台操作记录。",
        },
        characterSort: {
            mechanism_test: {
                mechanism_test_main: ["mechanism_test_actor"],
            },
        },
        characterIntro: {
            mechanism_test_actor: "独立场景准备测试武将。其操作记录不是被测技能通过证据。",
        },
    };
});
