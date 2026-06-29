game.import("extension", function (lib, game, ui, get, ai, _status) {
    const EXT_DISPLAY_NAME = "Nihilphile";
    const EXT_NAME = (_status && _status.extension) || EXT_DISPLAY_NAME;
    const MODULE_FILES = ["tia", "ycc", "guanyu"];
    const CHAR_FILES = ["pinyin", "intro", "index"];

    return {
        name: EXT_DISPLAY_NAME,
        editable: true,
        connect: true,

        precontent: function () {
            const base = lib.assetURL + "extension/" + EXT_NAME + "/";
            window.NIHIL_EXTENSION_NAME = EXT_NAME;
            window.nihilModules = {};

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
                            lib.init.js(base + "module", MODULE_FILES[idx], function () {
                                loadModule(idx + 1);
                            });
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
