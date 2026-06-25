import { lib, game, ui, get, ai, _status } from "noname";

/** @type { importCharacterConfig['character'] } */
const characters = {
    tia_tiya: {
        sex: "female",
        group: "xi",
        hp: 3,
        skills: ["tia_qiangli", "tia_rongguang", "tia_daowu", "tia_test_startup_ammo"],
    },
};

for (let i in characters) {
    characters[i].img = "extension/tia/image/character/" + i + ".png";
}

export default characters;
