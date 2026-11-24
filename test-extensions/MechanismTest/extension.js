game.import("extension", function (lib, game, ui, get, ai, _status) {
    "use strict";

    var DISPLAY_NAME = "MechanismTest";
    var PACK_ID = "mechanism_test";
    var extensionName = (_status && _status.extension) || DISPLAY_NAME;

    return {
        name: DISPLAY_NAME,
        editable: false,
        connect: true,
        precontent: function () {
            window.MECHANISM_TEST_EXTENSION_NAME = extensionName;
            if (!Array.isArray(lib.config.characters)) lib.config.characters = [];
            if (!lib.config.characters.includes(PACK_ID)) {
                lib.config.characters.push(PACK_ID);
            }
            lib.translate.mechanism_test_character_config = "机制测试";

            var base = lib.assetURL + "extension/" + extensionName + "/";
            if (lib.init.jsSync) {
                lib.init.jsSync(base, "character");
            } else {
                lib.init.js(base, "character");
            }
        },
        content: function () {},
        config: {},
        package: {
            intro: "独立的联机场景准备测试武将；不属于任何正式武将包。",
            author: "Nihilphile testing",
            version: "0.2.0",
            diskURL: "",
            forumURL: "",
        },
        files: {
            character: ["mechanism_test_actor.svg"],
            card: [],
            skill: [],
            audio: [],
        },
    };
});
