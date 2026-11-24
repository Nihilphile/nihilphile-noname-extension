const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");

async function verify(release, version) {
  const origin = "https://ziqi.198-44-109-93.sslip.io";
  const prefix = "/extension/nihil-releases/" + version + "/";
  const browser = await chromium.launch({
    chromiumSandbox: true,
    args: [
      "--disable-dev-shm-usage",
      "--host-resolver-rules=MAP ziqi.198-44-109-93.sslip.io 127.0.0.1",
    ],
  });
  try {
    const page = await browser.newPage();
    // Boot the real engine without taking a seat in the public hall.
    await page.routeWebSocket("**/socket", () => {});
    await page.addInitScript(() => {
      localStorage.gplv3_noname_alerted = "true";
      sessionStorage.ziqiAction = JSON.stringify({
        id: "ci",
        name: "发布校验",
        seats: "2",
      });
    });
    await page.goto(origin + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#arena", { state: "attached", timeout: 60000 });
    const catalog = await page.evaluate(
      async ({ prefix, version }) => {
        const env = await import("/noname.js");
        const { lib, game, get } = env;
        const { loadCharacter } = await import("/noname/init/loading.js");
        const { install } = await import(prefix + "plugin.js");
        lib.configOL.mode = "identity";
        lib.configOL.banned = [];
        lib.config.characters.add("nihilphile");
        lib.config.extensions.add("Nihilphile");
        lib.config.extension_Nihilphile_enable = true;
        const pack = install(env, loadCharacter);
        if (pack.name !== "nihilphile") throw Error("Nihil 包标识错误");
        Object.keys(pack.card || {}).forEach((id) => game.finishCard(id));
        Object.keys(pack.skill || {}).forEach((id) => game.finishSkill(id));
        const ids = Object.keys(lib.characterPack.nihilphile);
        if (!ids.length) throw Error("没有注册武将");
        for (const id of ids) {
          const info = lib.character[id];
          if (!info) throw Error("武将未载入 " + id);
          for (const skill of info.skills) {
            if (!lib.skill[skill]) throw Error(id + " 缺少技能 " + skill);
          }
          if (info.img && info.img.startsWith("extension/")) {
            const image = new Image();
            image.src = "/" + info.img;
            await image.decode();
          }
        }
        return {
          version,
          names: Object.fromEntries(ids.map((id) => [id, get.translation(id)])),
          unavailable: ids.filter((id) => lib.filter.characterDisabled(id)),
        };
      },
      { prefix, version },
    );
    const images = [];
    async function list(directory) {
      for (const entry of await fs.readdir(directory, {
        withFileTypes: true,
      })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await list(file);
        else if (/\.(png|webp|jpe?g|gif)$/i.test(file))
          images.push(path.relative(release, file));
      }
    }
    await list(path.join(release, "image"));
    if (!images.length) throw Error("缺少图片");
    await page.evaluate(
      async ({ prefix, images }) => {
        for (const file of images) {
          const img = new Image();
          img.src = prefix + file.split("/").map(encodeURIComponent).join("/");
          try {
            await img.decode();
          } catch {
            throw Error("图片无法解码 " + file);
          }
        }
      },
      { prefix, images },
    );
    await fs.writeFile(
      path.join(release, "catalog.next"),
      JSON.stringify(catalog),
    );
    await fs.rename(
      path.join(release, "catalog.next"),
      path.join(release, "catalog.json"),
    );
    console.log(
      version,
      Object.keys(catalog.names).length,
      "characters,",
      images.length,
      "images",
    );
  } finally {
    await browser.close();
  }
}
verify(...process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
