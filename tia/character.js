import { lib, game, ui, get, ai, _status } from "noname";

/** @type { importCharacterConfig['character'] } */
const characters = {
    tia_tiya: {
        sex: "female",
        group: "xi",
        hp: 3,
        skills: ["tia_qiangli", "tia_rongguang", "tia_daowu"],
    },
};

for (let i in characters) {
    characters[i].img = "extension/nihilphile/image/character/" + i + ".jpg";
}

export default characters;
