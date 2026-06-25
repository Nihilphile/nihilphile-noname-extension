import { lib, game, ui, get, ai, _status } from "noname";
import { content } from "./main/content.js";
import { precontent } from "./main/precontent.js";

const extensionInfo = await lib.init.promises.json(`${lib.assetURL}extension/nihilphile/info.json`);
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

Object.keys(extensionInfo)
    .filter(key => key !== "name")
    .forEach(key => {
        extensionPackage.package[key] = extensionInfo[key];
    });

export let type = "extension";
export default extensionPackage;
