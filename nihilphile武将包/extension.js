game.import("extension", function (lib, game, ui, get, ai, _status) {
    const EXT_DISPLAY_NAME = "Nihilphile";
    const EXT_NAME = (_status && _status.extension) || EXT_DISPLAY_NAME;
    const MODULE_FILES = [
        "ai_cards",
        "tia",
        "ycc",
        "zhao",
        "guanyu",
        "binglangwei",
        "moxuluo",
        "yinhua",
        "xianxueyinhua",
        "huojing_rewrite",
        "luofei",
        "jie_luofei_ai",
        "jie_luofei",
        "mikasa",
        "wujizi",
        "mabaoguo",
        "jianhua",
        "shencangfeng",
        "wuyou",
        "longyou_hp",
        "baichi",
    ];
    const CHAR_FILES = ["pinyin", "intro", "index"];

    return {
        name: EXT_DISPLAY_NAME,
        editable: true,
        connect: true,

        precontent: function () {
            const base = lib.assetURL + "extension/" + EXT_NAME + "/";
            window.NIHIL_EXTENSION_NAME = EXT_NAME;
            window.nihilModules = {};

            // 注册自定义“妖”势力，沿用键势力的粉紫色 nature。
            if (!lib.group.includes("yao")) {
                // 此版本的 addGroup 钩子会直接读取 config.color / config.image，
                // 因此即使复用已有 nature，也必须显式传入配置对象。
                game.addGroup("yao", "妖", "妖", {});
            }
            lib.groupnature.yao = "key";
            lib.translate.yao = "妖";
            lib.translate.yao2 = "妖";
            lib.translate.yao_short = "妖";
            lib.translate.yao_config = "妖势力";

            // 殷华保留临时 AI 禁选；forbidai 也会影响对决模式的玩家选将池。
            if (!lib.config.forbidai) lib.config.forbidai = [];
            ["nihil_yinhua"].forEach(function (id) {
                if (!lib.config.forbidai.includes(id)) {
                    lib.config.forbidai.push(id);
                }
            });
            // 清理旧版本给神落绯、鲜血仪葬版、剑华、沈藏锋和无忧添加的临时禁选。
            ["nihil_jie_luofei", "nihil_xianxueyinhua", "nihil_jianhua", "nihil_shencangfeng", "nihil_wuyou"].forEach(function (id) {
                while (lib.config.forbidai.includes(id)) {
                    lib.config.forbidai.splice(lib.config.forbidai.indexOf(id), 1);
                }
            });

            if (lib.init.jsSync) {
                // Load character helper files (pinyin, intro)
                lib.init.jsSync(base + "character", "pinyin");
                lib.init.jsSync(base + "character", "intro");

                // Load module files
                MODULE_FILES.forEach(function (file) {
                    lib.init.jsSync(base + "module", file);
                });

                // Load character index last (depends on modules + helpers)
                lib.init.jsSync(base + "character", "index");
            } else {
                // Async fallback
                lib.init.js(base + "character", "pinyin", function () {
                    lib.init.js(base + "character", "intro", function () {
                        function loadModule(idx) {
                            if (idx >= MODULE_FILES.length) {
                                lib.init.js(base + "character", "index");
                                return;
                            }
                            lib.init.js(
                                base + "module",
                                MODULE_FILES[idx],
                                function () {
                                    loadModule(idx + 1);
                                },
                            );
                        }
                        loadModule(0);
                    });
                });
            }
        },

        arenaReady: function () {
            function isYizhiCardChoice(event) {
                return event.name === "chooseButton" && event.getParent().buttoned === "nihil_yizhi";
            }

            function canCancel(event) {
                if (!event?.isMine?.()) return false;
                if (event.skill === "nihil_yizhi_backup") return true;
                if (event.forced) return false;
                if (event.nihilCanCancel) return true;
                if (isYizhiCardChoice(event)) return true;
                if (event.name === "chooseTarget") {
                    const parent = event.getParent();
                    return parent.name === "chooseUseTarget" && parent.logSkill === "ycc_yuce";
                }
                return false;
            }

            // 半选时保留取消。颐指选牌名、交牌和单目标杀选齐后由引擎提交。
            lib.hooks.checkEnd.unshift(function (event, selection) {
                if (!canCancel(event)) return;
                const basicCard = isYizhiCardChoice(event) && ui.selected.buttons.length === 1;
                const gift = event.skill === "nihil_yizhi_backup" && ui.selected.cards.length === 1;
                const slash = event.name === "chooseTarget" && event._get_card?.name === "sha" &&
                    get.select(event.selectTarget)[1] === 1;
                if (selection.ok && (basicCard || (ui.selected.targets.length === 1 && (gift || slash)))) {
                    selection.auto = true;
                    selection.autoConfirm = true;
                } else {
                    selection.auto = false;
                }
                ui.create.confirm(selection.ok ? "oc" : "c");
            });

            ui.window.addEventListener(lib.config.touchscreen ? "touchend" : "click", function (input) {
                if (!_status.paused || _status.paused2 || ui.intro || _status.dragged || _status.touchpopping ||
                    _status.mouseleft && _status.mousedragging || input.touches?.length || !canCancel(_status.event)) return;
                const node = input.target;
                if (node !== ui.window && !ui.arena.contains(node)) return;
                if (node.closest(".control, .menubutton, .roundarenabutton, .marks, .identity, input, select, button")) return;
                const item = node.closest(".button, .card, .player");
                if (item?.matches(".selectable, .selected")) return;
                // 让原生窗口继续清理本次点击，同时避免这次点击落到刚恢复的出牌询问上。
                _status.clicked = true;
                ui.click.cancel(ui.confirm?.lastChild);
            }, true);
        },

        content: function () {},

        config: {},
        package: {
            intro: "Nihilphile custom character pack",
            author: "Nihilphile",
            version: "2.3.2",
            diskURL: "",
            forumURL: "",
        },
        files: {
            character: [],
            card: [],
            skill: [],
            audio: [],
        },
    };
});
