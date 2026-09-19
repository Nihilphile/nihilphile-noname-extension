/* biome-ignore-all noUnusedVariables: 无名杀技能框架按位置注入回调参数（filter/content/chooseTarget 等），
   部分参数在函数体内未被引用属于框架固定签名，非真正死代码。 */
(() => {
    window.nihilModules = window.nihilModules || {};
    var EXT_NAME = window.NIHIL_EXTENSION_NAME || "nihilphile武将包";

    function image(id, ext) {
        return (
            "extension/" +
            EXT_NAME +
            "/image/character/" +
            id +
            "." +
            (ext || "png")
        );
    }

    // ============================================================
    //  孤旌继烈 霍旌 — 战卒·协攻·军赏·遗忠
    // ============================================================

    // 帅标记的显示技能 key
    var SHUAI_MARK = "nihil_shuai";

    // 读取“当前帅”：优先全局变量，其后备查带帅标记的角色。
    // “帅”必须是处于游戏中的角色（含濒死/已死亡但场上仍在的角色），
    // 因此用 isIn() 判定；但接管“作为帅”时要求活的角色（isAlive）。
    function getShuai(player) {
        if (_status.nihil_shuai && _status.nihil_shuai.isIn()) {
            return _status.nihil_shuai;
        }
        var found = game.findPlayer(
            (current) => current !== player && current.hasMark(SHUAI_MARK),
        );
        if (found) {
            _status.nihil_shuai = found;
            return found;
        }
        return null;
    }

    // 设置“帅”为指定角色（全局唯一）：清理旧标记 -> 更新全局 -> 给新帅加显示标记。
    // 仅当新帅存活时挂标记；旧帅若已不在场也一并清理其标记。
    function setShuai(newShuai) {
        if (_status.nihil_shuai) {
            var old = _status.nihil_shuai;
            if (old.isIn() && old.hasMark(SHUAI_MARK)) {
                old.removeMark(SHUAI_MARK, old.countMark(SHUAI_MARK));
            }
            if (old.isIn() && old.hasSkill(SHUAI_MARK)) {
                old.removeSkill(SHUAI_MARK);
            }
        }
        _status.nihil_shuai = newShuai || null;
        if (newShuai && newShuai.isAlive() && newShuai.isIn()) {
            newShuai.addMark(SHUAI_MARK, 1);
            if (!newShuai.hasSkill(SHUAI_MARK, null, null, false)) {
                newShuai.addSkill(SHUAI_MARK);
            }
        }
    }

    // 清理帅标记（霍旌作为帅死亡时调用，场上将无帅）
    function clearShuai() {
        if (_status.nihil_shuai && _status.nihil_shuai.isIn()) {
            var old = _status.nihil_shuai;
            if (old.hasMark(SHUAI_MARK)) {
                old.removeMark(SHUAI_MARK, old.countMark(SHUAI_MARK));
            }
            if (old.hasSkill(SHUAI_MARK)) {
                old.removeSkill(SHUAI_MARK);
            }
        }
        _status.nihil_shuai = null;
    }

    var character = {
        nihil_huojing: {
            sex: "male",
            group: "fu",
            hp: 4,
            skills: [
                "nihil_zhansu",
                "nihil_xiegong",
                "nihil_junshang",
                "nihil_yizhong",
            ],
            img: image("nihil_huojing"),
        },
    };

    var skills = {
        // ========== 战卒（开局选帅，准备阶段可改帅） ==========
        nihil_zhansu: {
            audio: 2,
            trigger: { player: "enterGame", global: "gameStart" },
            // 使用 global 触发，保证在一局开始时先确保有帅；filter 只在霍旌自己的 enterGame 里执行一次
            filter(_event, player) {
                // 仅在霍旌自身身上生效
                return player.hasSkill("nihil_zhansu", null, null, false);
            },
            // 开局选帅为强制行为
            async content(_event, _trigger, player) {
                // 开局若已存在帅（例如重开/其它来源），则不强选
                if (_status.nihil_shuai && _status.nihil_shuai.isIn()) {
                    return;
                }
                var candidates = game.filterPlayer(
                    (current) => current !== player && current.isAlive(),
                );
                if (candidates.length === 0) {
                    // 无人可选时，跳过选帅
                    return;
                }
                var result = await player
                    .chooseTarget(
                        get.prompt("nihil_zhansu"),
                        "选择一名其他角色作为" + get.translation(SHUAI_MARK),
                        (_card, p, target) => target !== p && target.isAlive(),
                    )
                    .set("ai", (target) => {
                        // 倾向选敌方作为帅，便于触发协攻
                        var att = get.attitude(player, target);
                        return att < 0 ? 10 : -1;
                    })
                    .set("forced", true)
                    .forResult();
                if (result.bool && result.targets && result.targets[0]) {
                    setShuai(result.targets[0]);
                }
            },
            // 准备阶段“可以”改帅（可选）
            group: "nihil_zhansu_change",
        },

        // 战卒·子技：准备阶段可改帅
        nihil_zhansu_change: {
            charlotte: true,
            trigger: { player: "phaseZhunbeiBegin" },
            filter(_event, player) {
                return player.hasSkill("nihil_zhansu", null, null, false);
            },
            async content(_event, _trigger, player) {
                var result = await player
                    .chooseBool()
                    .set("prompt", get.prompt("nihil_zhansu", "change"))
                    .set(
                        "prompt2",
                        "是否更换当前的" + get.translation(SHUAI_MARK) + "？",
                    )
                    .set("ai", () => {
                        // 若当前帅已死/不在场，倾向重选；否则可保持
                        return _status.nihil_shuai && _status.nihil_shuai.isIn()
                            ? false
                            : true;
                    })
                    .forResult();
                if (!result.bool) return;

                var result2 = await player
                    .chooseTarget(
                        get.prompt("nihil_zhansu", "change"),
                        "重新选择一名其他角色作为" +
                            get.translation(SHUAI_MARK),
                        (_card, p, target) => target !== p && target.isAlive(),
                    )
                    .set("ai", (target) => {
                        var att = get.attitude(player, target);
                        return att < 0 ? 10 : -1;
                    })
                    .forResult();
                if (result2.bool && result2.targets && result2.targets[0]) {
                    setShuai(result2.targets[0]);
                }
            },
        },

        // ========== 协攻（帅使用杀后，持有者跟进杀或交牌） ==========
        nihil_xiegong: {
            audio: 2,
            trigger: { global: "useCardAfter" },
            // 非锁定，让玩家（或AI）自主决定跟进杀还是交牌
            // 需要玩家选择，故用 chooseControl 给出路
            filter(event, player) {
                if (!event.card || event.card.name !== "sha") return false;
                // 使用者必须是当前帅
                var shuai = getShuai(player);
                if (!shuai) return false;
                if (event.player !== shuai) return false;
                if (!player.isAlive()) return false;
                // 拥有协攻技能者才触发（可能是霍旌，也可能是遗忠继承者）
                if (!player.hasSkill("nihil_xiegong", null, null, false))
                    return false;
                // 必须有目标
                if (!event.targets || event.targets.length === 0) return false;
                // 没有手牌则不触发（无牌则既不交牌也无法出杀）
                return player.countCards("h") > 0;
            },
            async content(_event, trigger, player) {
                var shuai = getShuai(player);
                if (!shuai) return;
                var originalTargets = trigger.targets;
                if (!originalTargets || originalTargets.length === 0) return;

                player.logSkill("nihil_xiegong");

                // 让玩家选择：出杀 or 交牌
                var canSha = player.hasCard(
                    (card) => get.name(card, player) === "sha",
                    "h",
                );
                var canGive = player.countCards("h") > 0;

                var choiceList = [];
                if (canSha) {
                    choiceList.push(
                        "对" +
                            get.translation(SHUAI_MARK) +
                            "【杀】的一个目标使用一张【杀】（无视距离和次数限制）",
                    );
                }
                if (canGive) {
                    choiceList.push(
                        "交给" + get.translation(SHUAI_MARK) + "一张手牌",
                    );
                }
                if (choiceList.length === 0) return;

                var controlResult = await player
                    .chooseControl()
                    .set("choiceList", choiceList)
                    .set("prompt", get.prompt("nihil_xiegong"))
                    .set("forced", true)
                    .set("ai", () => {
                        // 有杀时优先出杀（出杀有进攻收益），否则交牌
                        return canSha ? 0 : canGive ? 1 : 0;
                    })
                    .forResult();

                // 出杀分支（index 0 为杀，若含交牌则 index 1）
                if (controlResult.index === 0 && canSha) {
                    await execXiegongSha(player, originalTargets);
                } else if (canGive) {
                    // 交牌给帅
                    await execXiegongGive(player, shuai);
                }
            },
            ai: {
                order: 6,
                result: {
                    player: (player) => {
                        // 有杀且有敌方目标时收益高
                        return player.countCards("h") > 0 ? 2 : 0;
                    },
                },
            },
        },

        // ========== 军赏（因协攻造成伤害或交牌时，摸一张牌） ==========
        nihil_junshang: {
            audio: 2,
            trigger: { player: "damage" },
            filter(event, _player) {
                // 仅认可由协攻子事件产生的伤害：
                // 沿事件链找到最近的 useCard 事件，检查其技能标记是否为协攻
                var useCardEvent = event.getParent("useCard");
                if (!useCardEvent) return false;
                return useCardEvent.skill === "nihil_xiegong";
            },
            async content(_event, _trigger, player) {
                player.logSkill("nihil_junshang");
                await player.draw(1);
            },
        },

        // ========== 遗忠（霍旌死亡传协攻；帅死亡霍旌作帅） ==========
        nihil_yizhong: {
            audio: 2,
            trigger: { player: "die", global: "die" },
            // 注意：技能 filter 的签名为 filter(event, player, triggername)
            // 第二个参数才是技能拥有者（player）；死亡者通过 event.player 访问。
            filter(event, player) {
                // 只在霍旌本人身上有效
                if (!player.hasSkill("nihil_yizhong", null, null, false))
                    return false;
                // 情况1：霍旌自己死亡 -> 传协攻
                if (event.player === player) return true;
                // 情况2：帅死亡 -> 霍旌作为帅（且霍旌还活着）
                var shuai = getShuai(player);
                if (shuai && event.player === shuai && player.isAlive())
                    return true;
                return false;
            },
            async content(_event, trigger, player) {
                // 霍旌作为帅死亡时：帅已死，场上将无帅
                var isShuaiSelfDead =
                    trigger.player === player && _status.nihil_shuai === player;
                // 霍旌自己死亡：将协攻交给另一名角色
                if (trigger.player === player) {
                    var candidates = game.filterPlayer(
                        (current) =>
                            current !== player &&
                            current.isAlive() &&
                            !current.hasSkill(
                                "nihil_xiegong",
                                null,
                                null,
                                false,
                            ),
                    );
                    if (candidates.length === 0) return;
                    var result = await player
                        .chooseTarget(
                            "遗忠：选择一名其他角色获得【协攻】",
                            (_card, p, target) =>
                                target !== p &&
                                target.isAlive() &&
                                !target.hasSkill(
                                    "nihil_xiegong",
                                    null,
                                    null,
                                    false,
                                ),
                        )
                        .set("ai", (target) => {
                            // 倾向选还能联动帅的角色（无敌意即可）
                            return get.attitude(player, target) > 0 ? 4 : 2;
                        })
                        .forResult();
                    if (result.bool && result.targets && result.targets[0]) {
                        var heir = result.targets[0];
                        heir.addSkill("nihil_xiegong");
                        game.log(player, "将【协攻】传给了", heir);
                    }
                    // 若霍旌本人正是帅：帅已死，清理帅标记，场上无帅
                    if (isShuaiSelfDead) {
                        clearShuai();
                    }
                    return;
                }
                // 帅死亡：霍旌作帅（仅当霍旌存活时）
                if (player.isAlive()) {
                    setShuai(player);
                }
            },
        },
    };

    // ==================== 协攻的两个执行函数 ====================
    // 跟进杀（视为协攻子事件）
    // 合并为一步 chooseToUse：选杀 + 选目标在同一界面一次完成
    async function execXiegongSha(player, originalTargets) {
        // chooseToUse：从手牌选一张杀，对帅杀的一个目标使用（无视距离、不计次数）
        var useResult = await player
            .chooseToUse({
                prompt: "协攻：对“帅”【杀】的一个目标使用一张【杀】（无视距离和次数限制）",
                filterCard: (card, p) => get.name(card, p) === "sha",
                filterTarget: (_card, _p, tgt) =>
                    originalTargets.includes(tgt) && tgt.isAlive(),
                selectTarget: 1,
                forced: true,
                addCount: false,
                nodistance: true,
            })
            .set("logSkill", "nihil_xiegong")
            .forResult();

        if (!useResult.bool) return;
        // 军赏识别“因协攻伤害”通过 useCard 事件的 skill === "nihil_xiegong"
        // （chooseToUse 的 logSkill 已设置），无需额外事件标记。
    }

    // 交牌给帅（军赏：仅当持有者拥有军赏技能时，因协攻交牌才摸一张牌）
    async function execXiegongGive(player, shuai) {
        if (player.countCards("h") === 0) return;
        // 帅即自己：不真正转移，但“因协攻给帅一张牌”仍记军赏
        if (shuai === player) {
            if (player.hasSkill("nihil_junshang", null, null, false)) {
                player.logSkill("nihil_junshang");
                await player.draw(1);
            }
            return;
        }
        var giveResult = await player
            .chooseCard(
                "h",
                true,
                "协攻：请交给" + get.translation(shuai) + "一张手牌",
            )
            .set("ai", (card) => {
                // 交价值低的牌给帅
                return -get.value(card);
            })
            .forResult();
        if (giveResult.bool && giveResult.cards && giveResult.cards.length) {
            var next = player.give(giveResult.cards, shuai);
            next.giver = player;
            await next;
            // 因协攻交牌：军赏摸一张
            if (player.hasSkill("nihil_junshang", null, null, false)) {
                player.logSkill("nihil_junshang");
                await player.draw(1);
            }
        }
    }

    var translates = {
        nihil_huojing: "霍旌",
        nihil_huojing_prefix: "孤旌继烈",

        nihil_zhansu: "战卒",
        nihil_zhansu_info:
            "<b>游戏开始时，</b>选择一名其他角色作为“帅”。<b>你的准备阶段，</b>你可以更改“帅”为任意一名不为你的角色。",
        nihil_zhansu_change: "战卒",

        nihil_xiegong: "协攻",
        nihil_xiegong_info:
            "当“帅”使用【杀】后，你须对此【杀】的一个目标使用一张无视距离和次数限制的【杀】，否则交给“帅”一张手牌（无牌则不交）。",

        nihil_junshang: "军赏",
        nihil_junshang_info:
            "每当你因“协攻”：1、造成一点伤害；2、给“帅”一张牌时；摸一张牌。",

        nihil_yizhong: "遗忠",
        nihil_yizhong_info:
            "你死亡时，另一名角色获得“协攻”；“帅”死亡时，你作为“帅”。",

        nihil_shuai: "帅",
        nihil_shuai_info: "当前被“战卒”指定的角色",
    };

    var title = {
        nihil_huojing: "#g将旗未倒，何言此阵无帅！",
    };

    var sort = ["nihil_huojing"];

    // 帅标记显示技能：挂在帅角色身上，显示“帅”字
    skills[SHUAI_MARK] = {
        charlotte: true,
        marktext: "帅",
        intro: {
            name: "帅",
            content: "mark",
        },
    };

    window.nihilModules["huojing"] = {
        character: character,
        skill: skills,
        translate: translates,
        title: title,
        sort: sort,
    };
})();
