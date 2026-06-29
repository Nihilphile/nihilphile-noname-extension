import { lib, game, ui, get, ai, _status } from "../../../noname.js";
import { character as tiaChar, cards as tiaCards, skills as tiaSkills, title as tiaTitle, translates as tiaTranslates, sort as tiaSort } from "../module/tia.js";
import { character as yccChar, skills as yccSkills, title as yccTitle, translates as yccTranslates, sort as yccSort } from "../module/ycc.js";
import pinyins from "./pinyin.js";
import characterIntro from "./intro.js";

const characterSort = {
    nihilphile_main: [...(yccSort || []), ...(tiaSort || [])],
};
const characterSortTranslate = {
    nihilphile_main: "Nihilphile",
};

const mainList = [...(yccSort || []), ...(tiaSort || [])];

game.import("character", function () {
    return {
        name: "nihilphile",
        connect: true,
        character: { ...yccChar, ...tiaChar },
        characterSort: {
            nihilphile: {
                nihilphile_main: mainList,
            },
        },
        characterTitle: { ...yccTitle, ...tiaTitle },
        characterIntro: { ...characterIntro },
        card: { ...tiaCards },
        skill: { ...yccSkills, ...tiaSkills },
        translate: { ...yccTranslates, ...tiaTranslates, ...characterSortTranslate },
        pinyins: { ...pinyins },
    };
});
