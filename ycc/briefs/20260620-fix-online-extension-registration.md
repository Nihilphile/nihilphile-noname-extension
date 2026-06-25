# Brief: Fix YCC Online Extension Registration

## Role

Coder. Make the smallest source/runtime change that makes ycc register through
the normal noname character-pack pipeline and become discoverable in online mode.

## Objective

Replace the current direct-injection workaround with normal extension behavior:

- `precontent.js` imports `../character/index.js`
- `game.import("character") -> loadCharacter()` processes the ycc pack
- `lib.connectCharacterPack` includes `"ycc"`
- online mode can discover ycc through `configOL.characterPack` / `charactersOL()`

## Required Reading

- `F:\AI_project\nameless_game\AGENTS\coder\ROLE.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-online-extension-not-active.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-extension-registration-research.md`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\英雄杀\main\precontent.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\玩点论杀\main\precontent.js`

## Files To Change

Update both authoring source and packaged runtime copy:

- `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen\main\precontent.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\main\precontent.js`

Also add the top-level extension connect flag in both copies:

- `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen\extension.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\extension.js`

## Implementation

Replace direct manual injection in `precontent.js` with the minimal pattern:

```js
import { lib, game, ui, get, ai, _status } from "noname";
import "../character/index.js";

export async function precontent(config, pack) {
    lib.translate.ycc_character_config = "御承宸";

    if (!lib.config.characters.includes("ycc")) {
        lib.config.characters.push("ycc");
    }

    if (!lib.group.includes("fu")) {
        lib.group.add("fu");
    }
    lib.groupnature.fu = "kami";
    lib.translate.fu = "福";
    lib.translate.fu_short = "福";
    lib.translate.fu_config = "福势力";
}
```

Add top-level `connect: true` to `extensionPackage` in `extension.js`:

```js
let extensionPackage = {
    name: "yuchengchen",
    connect: true,
    ...
};
```

Do not manually assign `lib.character`, `lib.skill`, `lib.translate`,
`lib.characterPack`, or related character data structures.

## Verification

Use `tools/noname-test-cli` with uniquely named sessions. Do not touch any
manually controlled smoke session.

Minimum verification:

1. Fresh boot check:
   - `lib.config.extensions.includes("yuchengchen")`
   - `lib.config.characters.includes("ycc")`
   - `!!lib.characterPack.ycc`
   - `!!lib.character.ycc_yuchengchen`
   - `lib.connectCharacterPack.includes("ycc")`
2. Online/connect check if CLI route is available:
   - enter online/connect mode or use `online-local-entry`
   - verify `lib.configOL.characterPack.includes("ycc")`
   - verify `get.charactersOL().includes("ycc_yuchengchen")`

If the online entry CLI route is blocked by selector/UI issues, still report the
fresh boot `connectCharacterPack` result and state the exact online verification
blocker.

Stop or report every session/process you start.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-fix-online-extension-registration.md`

Include:

- Files changed.
- Exact verification commands and parsed results.
- Whether online discovery is fixed, partially fixed, or blocked by UI route.
- Any remaining smoker-facing risk.

Also put the report path and concise verdict in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not inspect/wait/stop/mutate any user-owned smoker session.
- Do not run broad gameplay smoke testing.
