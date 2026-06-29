import { lib, game, ui, get, ai, _status } from "../../../noname.js";

/** @type { importCharacterConfig['character'] } */
const characters = {
    ycc_yuchengchen: ["male", "fu", 4, ["ycc_huangming", "ycc_yuce", "ycc_qinzheng"]],
    tia_tiya: ["female", "western", 3, ["tia_qiangli", "tia_rongguang", "tia_daowu"]],
};

for (let i in characters) {
    characters[i][4] = characters[i][4] || [];
    characters[i][4].push("ext:nihilphile/image/character/" + i + ".jpg");
}

characters.tia_tiya[4] = ["ext:nihilphile/image/character/tia_tiya.png"];

export default characters;
