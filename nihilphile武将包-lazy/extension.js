import { lib, game, ui, get, ai, _status } from "../../noname.js";
import { content } from "./main/content.js";
import { precontent } from "./main/precontent.js";

let extensionPackage = {
    name: "nihilphile",
    editable: true,
    connect: true,
    config: {},
    content,
    help: {},
    package: {},
    precontent,
    files: { character: [], card: [], skill: [], audio: [] },
};

extensionPackage.package.author = "Nihilphile";
extensionPackage.package.version = "1.0";
extensionPackage.package.connect = true;
extensionPackage.package.intro = "Nihilphile custom character pack ";
extensionPackage.package.diskURL = "";
extensionPackage.package.forumURL = "";

export let type = "extension";
export default extensionPackage;
