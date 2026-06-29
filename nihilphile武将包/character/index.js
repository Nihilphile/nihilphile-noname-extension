game.import("character", function (lib, game, ui, get, ai, _status) {
    window.nihilModules = window.nihilModules || {};

    var modules = window.nihilModules;
    var keys = Object.keys(modules);
    var character = {};
    var skill = {};
    var card = {};
    var translate = {
        nihilphile: "Nihilphile",
        nihilphile_main: "Nihilphile",
    };
    var characterTitle = {};
    var characterIntro = {};
    var pinyins = {};
    var mainList = [];

    for (var i = 0; i < keys.length; i++) {
        var mod = modules[keys[i]];
        if (!mod) continue;
        if (typeof mod.init == "function") {
            try {
                mod.init(lib, game, ui, get, ai, _status);
            } catch (e) {
                if (game && game.print) game.print("nihilphile module init failed: " + keys[i] + " " + (e && e.message || e));
            }
        }
        if (mod.character) Object.assign(character, mod.character);
        if (mod.skill) Object.assign(skill, mod.skill);
        if (mod.card) Object.assign(card, mod.card);
        if (mod.translate) Object.assign(translate, mod.translate);
        if (mod.title) Object.assign(characterTitle, mod.title);
        if (Array.isArray(mod.sort)) {
            for (var j = 0; j < mod.sort.length; j++) {
                mainList.push(mod.sort[j]);
            }
        }
    }

    // Load pinyin and intro from window globals (set by pinyin.js / intro.js)
    if (window.nihilPinyins) Object.assign(pinyins, window.nihilPinyins);
    if (window.nihilCharacterIntro) Object.assign(characterIntro, window.nihilCharacterIntro);

    return {
        name: "nihilphile",
        connect: true,
        character: character,
        skill: skill,
        card: card,
        translate: translate,
        characterTitle: characterTitle,
        characterIntro: characterIntro,
        characterSort: {
            nihilphile: {
                nihilphile_main: mainList,
            },
        },
        pinyins: pinyins,
    };
});
