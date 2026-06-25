import { lib, game, ui, get, ai, _status } from "noname";

/** @type { importCharacterConfig['character'] } */
const characters = {
    tia4_tiya: {
        sex: "female",
        group: "western",
        hp: 3,
        skills: ["tia4_qiangli", "tia4_rongguang", "tia4_daowu"],
    },
};

for (let i in characters) {
    characters[i].img = "extension/tia_ver4/image/character/" + i + ".png";
}

export default characters;
