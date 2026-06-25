import { lib, game, ui, get, ai, _status } from "noname";
import characters from "./character.js";
import cards from "./card.js";
import pinyins from "./pinyin.js";
import skills from "./skill.js";
import translates from "./translate.js";
import characterIntros from "./intro.js";
import characterFilters from "./characterFilter.js";
import dynamicTranslates from "./dynamicTranslate.js";
import voices from "./voices.js";
import { characterSort, characterSortTranslate } from "./sort.js";

game.import("character", function () {
    return {
        name: "tia_ver6",
        connect: true,
        character: { ...characters },
        characterSort: {
            tia_ver6: characterSort,
        },
        characterFilter: { ...characterFilters },
        characterTitle: {
            tia6_tiya: "#g黑纱鸣礼",
        },
        dynamicTranslate: { ...dynamicTranslates },
        characterIntro: { ...characterIntros },
        card: { ...cards },
        skill: { ...skills },
        translate: { ...translates, ...voices, ...characterSortTranslate },
        pinyins: { ...pinyins },
    };
});
