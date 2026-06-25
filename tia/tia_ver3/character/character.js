import { lib, game, ui, get, ai, _status } from "noname";

/** @type { importCharacterConfig['character'] } */
const characters = {
    tia3_tiya: {
        sex: "female",
        group: "western",
        hp: 3,
        skills: ["tia3_qiangli", "tia3_rongguang", "tia3_daowu"],
    },
};

for (let i in characters) {
    characters[i].img = "extension/tia_ver3/image/character/" + i + ".png";
}

export default characters;
