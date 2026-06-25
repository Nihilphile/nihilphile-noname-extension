import { lib, game, ui, get, ai, _status } from "noname";
import "../character/index.js";

export async function precontent(config, pack) {
    lib.translate.tia_ver2_character_config = "黑纱鸣礼";

    if (lib.config.all?.characters && !lib.config.all.characters.includes("tia_ver2")) {
        lib.config.all.characters.push("tia_ver2");
    }

    if (!lib.config.characters.includes("tia_ver2")) {
        lib.config.characters.push("tia_ver2");
    }
}
