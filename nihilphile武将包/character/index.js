import { lib, game, ui, get, ai, _status } from "noname";
import { character as tiaChar, cards as tiaCards, skills as tiaSkills, title as tiaTitle, translates as tiaTranslates, sort as tiaSort } from "../module/tia.js";
import { character as yccChar, skills as yccSkills, title as yccTitle, translates as yccTranslates, sort as yccSort } from "../module/ycc.js";
import { character as gyChar, skills as gySkills, title as gyTitle, translates as gyTranslates, sort as gySort } from "../module/guanyu.js";
import pinyins from "./pinyin.js";
import characterIntro from "./intro.js";

const characterSort = {
    nihilphile_main: [...(gySort || []), ...(yccSort || []), ...(tiaSort || [])],
};
const characterSortTranslate = {
    nihilphile_main: "Nihilphile",
};

const mainList = [...(gySort || []), ...(yccSort || []), ...(tiaSort || [])];

game.import("character", function () {
    return {
        name: "nihilphile",
        connect: true,
        character: { ...gyChar, ...yccChar, ...tiaChar },
        characterSort: {
            nihilphile: {
                nihilphile_main: mainList,
            },
        },
        characterTitle: { ...gyTitle, ...yccTitle, ...tiaTitle },
        characterIntro: { ...characterIntro },
        card: { ...tiaCards },
        skill: { ...gySkills, ...yccSkills, ...tiaSkills },
        translate: { ...gyTranslates, ...yccTranslates, ...tiaTranslates, ...characterSortTranslate },
        pinyins: { ...pinyins },
    };
});
