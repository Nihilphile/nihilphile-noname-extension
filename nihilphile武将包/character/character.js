import { lib, game, ui, get, ai, _status } from "noname";

/** @type { importCharacterConfig['character'] } */
const characters = {
    ycc_yuchengchen: {
        sex: "male",
        group: "qun",
        hp: 4,
        skills: ["ycc_huangming", "ycc_yuce", "ycc_qinzheng"],
    },
    tia_tiya: {
        sex: "female",
        group: "western",
        hp: 3,
        skills: ["tia_qiangli", "tia_rongguang", "tia_daowu"],
    },
};

for (let i in characters) {
    characters[i].img = "extension/nihilphile/image/character/" + i + ".jpg";
}

characters.tia_tiya.img = "extension/nihilphile/image/character/tia_tiya.png";

export default characters;
