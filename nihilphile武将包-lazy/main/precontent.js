import { lib, game, ui, get, ai, _status } from "../../../noname.js";
import "../character/index.js";

export async function precontent(config, pack) {
    lib.translate.nihilphile_character_config = "Nihilphile";

    if (lib.config.all?.characters && !lib.config.all.characters.includes("nihilphile")) {
        lib.config.all.characters.push("nihilphile");
    }

    if (!lib.config.characters.includes("nihilphile")) {
        lib.config.characters.push("nihilphile");
    }

    if (!lib.group.includes("fu")) {
        lib.group.add("fu");
    }
    lib.groupnature.fu = "kami";
    lib.translate.fu = "福";
    lib.translate.fu_short = "福";
    lib.translate.fu_config = "福势力";
}
