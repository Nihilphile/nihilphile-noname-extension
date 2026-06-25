import { lib, game, ui, get, ai, _status } from "noname";
import "../character/index.js";

export async function precontent(config, pack) {
    lib.translate.tia_character_config = "黑纱鸣礼·缇娅";

    if (lib.config.all?.characters && !lib.config.all.characters.includes("tia")) {
        lib.config.all.characters.push("tia");
    }

    if (!lib.config.characters.includes("tia")) {
        lib.config.characters.push("tia");
    }

    // 注册 xi 势力
    if (!lib.group.includes("xi")) {
        lib.group.add("xi");
    }
    lib.translate.xi = "西";
    lib.translate.xi_short = "西";
    lib.translate.xi_config = "西势力";
    // 保守：不设置 lib.groupnature.xi，如需要颜色可在后续版本中补充
}
