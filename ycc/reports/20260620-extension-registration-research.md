# Extension Registration Research — yuchengchen (ycc)

**Date**: 2026-06-20  
**Role**: Explorer  
**Task Brief**: `F:\AI_project\nameless_game\nihilphile\ycc\briefs\20260620-extension-registration-research.md`

---

## Questions Investigated

1. What do upstream/official noname docs or source say about extension package structure and registration?
2. How does a normal extension become enabled in `lib.config.extensions`?
3. How should an extension expose a custom character pack so its characters are loaded normally?
4. What local files make `Zusfylri武将包` work in this packaged runtime?
5. What should be changed in ycc to match that pattern with minimal risk?
6. Which parts of the prior direct-injection fix should be reverted or avoided?

---

## 1. Confirmed Facts with Evidence

### 1.1 Extension Package Structure — Two Formats

The noname engine supports two extension authoring formats:

#### Old Style (Zusfylri武将包)
**Evidence**: `game/noname/resources/app/extension/Zusfylri武将包/extension.js`

Uses `game.import("extension", fn)` as a side-effect (not ES module export).
Character data loaded via `lib.init.js()` + separate `character/index.js` calling `game.import("character", fn)`.
Skills/translates loaded per-file via `lib.init.js()` calls in precontent.

#### New Style (英雄杀, 玩点论杀, yuchengchen)
**Evidence**: `game/noname/resources/app/extension/英雄杀/extension.js`

Uses `import { ... } from "noname"` + `export let type = "extension"` + `export default extensionPackage`.
`info.json` loaded at import time via `lib.init.promises.json()`.
`precontent` and `content` are separate ES module imports from `main/` directory.

**Key difference**: Old-style is procedural (side-effect based), new-style is declarative (ES module based).

### 1.2 Extension Discovery & Loading Mechanism

**Evidence**: `game/noname/resources/app/noname/init/index.js` (lines 543-591), `init/import.js`

```
boot()
  -> getExtensionList()
      Reads lib.config.extensions from IndexedDB
      Auto-import: scans extension/ folder for directories containing extension.js
      New extensions: extension_${name}_enable = false (disabled by default)
  -> importExtension(name) for each enabled extension
      -> importFunction("extension", `/extension/${name}/extension`)
          Dynamic import() of extension.js
          Checks moduleContent.type === "extension"
          calls game.import("extension", moduleContent.default)
  -> game.import("extension", object)
      -> game.loadExtension(object)
          Stores in lib.extensionPack[name]
          Calls precontent(config, pack)  <- awaited
          Pushes [name, content, config, ...] to lib.extensions
  -> await Promise.all(_status.extensionLoading)
  -> await Promise.allSettled(toLoad)  // built-in character/card packs
  -> await Promise.allSettled(_status.importing)  // ALL game.import promises!
  -> loadMode(currentMode)
  -> Object.values(lib.imported.character).forEach(loadCharacter)  <- line 465-467
  -> lib.extensions.map(loadExtension)  <- line 521-523
```

**Critical finding**: `_status.importing` promises are all awaited (line 312-318 of init/index.js) BEFORE `loadCharacter` runs (line 465). Therefore `game.import("character", fn)` calls from `character/index.js` will have resolved by the time `loadCharacter` processes `lib.imported.character`.

### 1.3 Character Pack Loading Flow

**Evidence**: `game/noname/resources/app/noname/init/loading.js` (function `loadCharacter`, lines 93-193)

```javascript
function loadCharacter(character) {
    let name = character.name;   // e.g., "ycc"
    
    // Step 1: Store in characterPack
    if (character.character) {
        lib.characterPack[name] ??= {};
        Object.assign(lib.characterPack[name], character.character);
    }
    
    // Step 2: Gate check
    case "character":
        if (!lib.config.characters.includes(name) && lib.config.mode !== "connect") {
            break;  // <- SKIPS character data if pack not enabled
        }
    // Falls through to default:
    default:
        for (let key2 in value) {
            if (key === "character") { lib.character[key2] = value2; }
            else { Object.defineProperty(lib[key], key2, ...); }
        }
}
```

Key findings:
- Character data ONLY written to `lib.character` if pack name is in `lib.config.characters` (or connect mode)
- Skill data (`character.skill`) auto-loaded to `lib.skill` in same pass
- Translate data (`character.translate`) auto-loaded to `lib.translate` in same pass
- Character filter, intro, pinyin, sort, voice, title — ALL auto-loaded in same loop
- Image path set directly on character object in `character.js`

### 1.4 Auto-Character-Pack Registration (Old-Style Only)

**Evidence**: `loading.js` lines 282-290

For old-style extensions where `extension[4].character?.character` is an object:
```javascript
if (!lib.config[`@Experimental.extension.${extension[0]}.character`]) {
    game.saveConfig(`@Experimental.extension.${extension[0]}.character`, true);
    lib.config.characters.add(extension[0]);
    await game.promises.saveConfigValue("characters");
}
loadCharacter(content);
```

### 1.5 New-Style Extension Character Registration

For new-style extensions (英雄杀, 玩点论杀, yuchengchen), `extension[4].character` is `undefined`.
The auto-add to `lib.config.characters` does NOT fire.
The character pack name must be added to `lib.config.characters` by other means.

---

## 2. Comparison Table

| Feature | Zusfylri武将包 | 英雄杀 | 玩点论杀 | yuchengchen (current) |
|---------|---------------|--------|----------|----------------------|
| **Format** | Old (`game.import`) | New (ES module export) | New (ES module export) | New (ES module export) |
| **extension.js** | Side-effect `game.import` | `export default` | `export default` | `export default` [OK] |
| **info.json** | `{name, version}` | Loaded in extension.js | `{name, author, intro}` | `{name, author, version, connect}` [OK] |
| **precontent** | Inline in extension.js | `main/precontent.js` | `main/precontent.js` | `main/precontent.js` [OK] |
| **content** | Inline in extension.js | `main/content.js` | Not present | `main/content.js` [OK] |
| **Character load** | `lib.init.js()` -> `character/index.js` | Side-effect import in precontent.js | `Promise.all([import(...)])` | **Overridden by direct injection** [FAIL] |
| **precontent body** | Utility fns + lib.init.js calls | 1 translate line | Promise.all imports | **~100 lines of manual injection** [FAIL] |
| **Skill registration** | Via loadCharacter pipeline | Via loadCharacter pipeline | Via loadCharacter pipeline | **Manual lib.skill[key] = data** [FAIL] |
| **Translate registration** | Via loadCharacter pipeline | Via loadCharacter pipeline | Via loadCharacter pipeline | **Manual lib.translate[key] = value** [FAIL] |
| **Group registration** | Built-in groups | Built-in groups | Built-in groups | Custom "fu" group [OK] |

---

## 3. Root Cause Analysis

### 3.1 The Prior Coder's Workaround and Why It Was Excessive

The prior coder (report `20260620-register-ycc-runtime.md`) added ~100 lines of direct data injection to `precontent.js`. The code comments claim:

> "game.import("character", fn) stores its result via .then() — an async microtask. By the time loadCharacter runs, the ycc entry may not be in lib.imported.character."

**This timing concern is invalid.** The boot function (init/index.js) awaits `_status.importing` at line 312-318 BEFORE `loadCharacter` at line 465. The `game.import("character", fn)` promise from `character/index.js` is stored in `_status.importing.character`, guaranteeing resolution before `loadCharacter` runs.

### 3.2 The Real Single Gate

`loadCharacter` checks `lib.config.characters.includes(name)` at line 114 of loading.js. If "ycc" is NOT in `lib.config.characters`, character data (and all downstream skill/translate/filter/intro/pinyin/sort/voice/title data) is skipped. This is the ONLY gate.

**The direct injection of skills, translates, filters, intros, pinyins, sorts, and voices was unnecessary.** All this data flows through the normal `game.import("character")` -> `_status.importing` -> `loadCharacter` pipeline and is handled by existing engine code.

---

## 4. Inferences & Remaining Unknowns

### Confirmed Inference: Minimal precontent suffices

1. ✅ Side-effect import `"../character/index.js"` triggers `game.import("character")` -> stores in `lib.imported.character.ycc`
2. ✅ `lib.config.characters.push("ycc")` passes the `loadCharacter` gate check
3. ✅ `loadCharacter` writes ALL character/skill/translate/filter/intro/pinyin/sort/voice/title data
4. ✅ Only manually needed: `lib.translate.ycc_character_config` and fu group registration

### Remaining Unknowns

1. **Persistence**: `lib.config.characters` modifications via `push()` are runtime-only. The orchestrator should decide whether to call `game.saveConfig("characters", lib.config.characters)` for persistence.
2. **Character portrait**: Current `img` path is `"extension/yuchengchen/image/character/" + i + ".jpg"` — set in `character.js`. Verified working in prior coder test. The `loadExtension` function (loading.js lines 258-275) auto-generates `img` and `dieAudios` for old-style extensions, but new-style extensions manage their own `img` property.
3. **connect mode nuances**: `loadCharacter` auto-pushes to `lib.connectCharacterPack` for `connect: true` packs. The ycc character pack already has `connect: true`. `precontent` function MUST be `async` for ES module style (same as 英雄杀).

---

## 5. Recommended Patch Plan for Coder

### Files to Change

Only one file: `main/precontent.js` (both source and runtime copies).

**Source**: `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen\main\precontent.js`  
**Runtime**: `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\main\precontent.js`

### Proposed Replacement (from ~120 lines down to ~25 lines)

```javascript
import { lib, game, ui, get, ai, _status } from "noname";
import "../character/index.js"; // Triggers game.import("character") registration

export async function precontent(config, pack) {
    // Extension config translate label
    lib.translate.ycc_character_config = "御承宸";

    // Ensure ycc character pack is in lib.config.characters so
    // loadCharacter writes character/skill/translate data during boot.
    // Runs every boot; does not mutate repository config.json.
    if (!lib.config.characters.includes("ycc")) {
        lib.config.characters.push("ycc");
    }

    // Register independent "fu" group
    if (!lib.group.includes("fu")) {
        lib.group.add("fu");
    }
    lib.groupnature.fu = "kami";
    lib.translate.fu = "福";
    lib.translate.fu_short = "福";
    lib.translate.fu_config = "福势力";
}
```

### What Gets Removed

All of the following manual injection from the current precontent.js can be REMOVED:

| Current Injection | Handled By |
|-------------------|------------|
| `lib.characterPack.ycc = {}` + `Object.assign(...)` | `loadCharacter` lines 96-101 |
| `lib.character[charaName] = charaData` loop | `loadCharacter` line 169 |
| `lib.skilllist.add(skillName)` loop | `loadCharacter` lines 142-153 |
| `lib.skill[skillName] = skillData` loop | `loadCharacter` lines 162-171 |
| `lib.translate[key] = value` loop | `loadCharacter` default case |
| `lib.characterFilter[key] = data` loop | `loadCharacter` default case |
| `lib.dynamicTranslate[key] = data` loop | `loadCharacter` default case |
| `lib.characterIntro[key] = data` loop | `loadCharacter` default case |
| `lib.pinyins[key] = data` loop | `loadCharacter` default case |
| `lib.characterSort.ycc = sort` | `loadCharacter` default case |
| `lib.characterTitle.ycc_yuchengchen` | `loadCharacter` default case |
| `lib.character["ycc_yuchengchen"].img` | Set in `character/character.js` |

### Files That Need No Changes

- `extension.js` — correct new-style format
- `character/index.js` — correctly calls `game.import("character", ...)` with all data
- `character/character.js` — correctly defines character + img path
- `character/skill.js` — correctly defines all skills
- `character/translate.js` — correctly defines all translates
- `character/sort.js`, `filter.js`, `intro.js`, `pinyin.js`, `voices.js`, `dynamicTranslate.js`, `card.js` — all correct
- `info.json` — correct
- `main/content.js` — correct (empty function)
- Image files — no changes

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `lib.config.characters` not persisted across restarts | Low/Medium | `push` runs every boot; add `game.saveConfig("characters", lib.config.characters)` if persistence desired |
| `connect: true` character pack behavior | Low | `loadCharacter` lines 110-112 handle `connect` flag correctly |
| Async timing of `import "../character/index.js"` | Low | Boot awaits `_status.importing` (line 312-318) before `loadCharacter` (line 465) |
| Missing `dieAudios` / missing assets | None | Current implementation doesn't set these; unchanged |
| Duplicate registration with old data | None | Null-checks in `loadCharacter` (line 162) prevent overwrites |

---

## 6. Source Links & Evidence

### Local Extension Examples
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\Zusfylri武将包\extension.js` — old-style extension format
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\Zusfylri武将包\character\index.js` — old-style character pack registration
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\英雄杀\extension.js` — new-style extension format (best reference for ycc)
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\英雄杀\main\precontent.js` — minimal new-style precontent (1 translate + side-effect import)
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\英雄杀\character\index.js` — new-style character registration
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\玩点论杀\extension.js` — new-style with Promise.all pattern
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\玩点论杀\main\precontent.js` — new-style with Promise.all dynamic imports
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\extension.js` — ycc extension (correct new-style format)
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\main\precontent.js` — current (over-injected) precontent
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\character\index.js` — correct character registration

### Engine Source
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\init\index.js` — boot sequence (esp. lines 263-274 extension loading, 302-318 importing await, 465-467 loadCharacter)
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\init\import.js` — importExtension/importFunction implementation
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\init\loading.js` — loadCharacter (lines 93-193), loadExtension (lines 194-358)
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\game\index.js` — game.import (line 2633), game.loadExtension (line 2672)

### Prior Report
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-register-ycc-runtime.md` — prior coder work with test results

### Upstream Documentation
- `F:\AI_project\nameless_game\noname\docs\game-startup-flow.md` — official startup flow documentation
- `F:\AI_project\nameless_game\noname\docs\yuchengchen-online-spec.md` — ycc character specification

---

## 7. Verdict

**Recommendation**: Revert the direct-injection precontent and adopt a minimal precontent (modeled after 英雄杀). The ~100 lines of manual data injection in `precontent.js` are redundant — the engine's `game.import("character")` -> `loadCharacter` pipeline handles all character/skill/translate/filter/intro/pinyin/sort/voice/title data registration automatically. The only needed precontent actions are: (1) trigger `character/index.js` import, (2) push "ycc" to `lib.config.characters`, (3) register the "fu" group. This reduces the precontent from ~120 lines to ~25 lines and eliminates a maintenance burden with no loss of functionality.

**Confidence**: HIGH. Verified against engine source code (`loading.js`, `init/index.js`, `init/import.js`), three working extension examples (Zusfylri武将包, 英雄杀, 玩点论杀), and upstream documentation (`game-startup-flow.md`).
