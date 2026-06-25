import { lib, game, ui, get, ai, _status } from "noname";

/** @type { importCharacterConfig['character'] } */
const characters = {
    tia6_tiya: {
        sex: "female",
        group: "western",
        hp: 3,
        skills: ["tia6_qiangli", "tia6_rongguang", "tia6_daowu"],
    },
};

for (let i in characters) {
    characters[i].img = "extension/tia_ver6/image/character/" + i + ".png";
}

export default characters;
