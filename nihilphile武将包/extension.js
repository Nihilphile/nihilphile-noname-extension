game.import("extension", function (lib, game, ui, get, ai, _status) {
    const EXT_DISPLAY_NAME = "Nihilphile";
    const EXT_NAME = (_status && _status.extension) || EXT_DISPLAY_NAME;
    const MODULE_FILES = [
        "ai_cards",
        "tia",
        "ycc",
        "guanyu",
        "binglangwei",
        "moxuluo",
        "yinhua",
        "xianxueyinhua",
        "huojing_rewrite",
        "luofei",
        "mikasa",
        "wujizi",
        "mabaoguo",
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

            // 赤色残花版的人机逻辑尚未完成，暂时排除 AI 选将。
            if (!lib.config.forbidai) lib.config.forbidai = [];
            ["nihil_yinhua"].forEach(function (id) {
                if (!lib.config.forbidai.includes(id)) {
                    lib.config.forbidai.push(id);
                }
            });
            // 旧版本曾临时禁用鲜血仪葬版；加载新版时解除该运行时禁用。
            while (lib.config.forbidai.includes("nihil_xianxueyinhua")) {
                lib.config.forbidai.splice(
                    lib.config.forbidai.indexOf("nihil_xianxueyinhua"),
                    1,
                );
            }

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

        content: function () {},

        config: {},
        package: {
            intro: "Nihilphile custom character pack",
            author: "Nihilphile",
            version: "1.0",
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
