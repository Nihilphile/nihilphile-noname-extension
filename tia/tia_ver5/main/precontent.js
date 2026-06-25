import { lib, game, ui, get, ai, _status } from "noname";
import "../character/index.js";

export async function precontent(config, pack) {
    lib.translate.tia_ver5_character_config = "黑纱鸣礼";

    if (lib.config.all?.characters && !lib.config.all.characters.includes("tia_ver5")) {
        lib.config.all.characters.push("tia_ver5");
    }

    if (!lib.config.characters.includes("tia_ver5")) {
        lib.config.characters.push("tia_ver5");
    }
}
