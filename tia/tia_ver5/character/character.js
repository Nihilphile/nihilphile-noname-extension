import { lib, game, ui, get, ai, _status } from "noname";

/** @type { importCharacterConfig['character'] } */
const characters = {
    tia5_tiya: {
        sex: "female",
        group: "western",
        hp: 3,
        skills: ["tia5_qiangli", "tia5_rongguang", "tia5_daowu"],
    },
};

for (let i in characters) {
    characters[i].img = "extension/tia_ver5/image/character/" + i + ".png";
}

export default characters;
