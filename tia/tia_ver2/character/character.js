import { lib, game, ui, get, ai, _status } from "noname";

/** @type { importCharacterConfig['character'] } */
const characters = {
    tia2_tiya: {
        sex: "female",
        group: "western",
        hp: 3,
        skills: ["tia2_qiangli", "tia2_rongguang", "tia2_daowu"],
    },
};

for (let i in characters) {
    characters[i].img = "extension/tia_ver2/image/character/" + i + ".png";
}

export default characters;
