# Online Extension Not Active — Root Cause Analysis

**Date**: 2026-06-20  
**Role**: Explorer  
**Task Brief**: `F:\AI_project\nameless_game\nihilphile\ycc\briefs\20260620-online-extension-not-active.md`

---

## Verdict (One Sentence)

**The ycc `precontent.js` never imports `../character/index.js`, so `game.import("character")` never fires, `lib.connectCharacterPack` never receives `"ycc"`, and online mode can't discover ycc characters through its `configOL.characterPack` / `charactersOL()` pipeline — single-player works because it uses `Object.keys(lib.character)` directly (which the manual injection populates).**

---

## 1. Questions Investigated

| # | Question | Status |
|---|----------|--------|
| 1 | Exact loading path for extension character packs in online/connect mode? | **Answered** |
| 2 | Is `lib.config.characters.push("ycc")` sufficient for online mode? | **Answered: NO** |
| 3 | Does `character/index.js` with `connect: true` correctly populate the online candidate pool? | **Answered: YES, if imported** |
| 4 | Is ycc enabled only in local config but not in online config? | **Answered: YES, missing from connectCharacterPack** |
| 5 | Online-capable extension pattern (Zusfylri武将包 or other)? | **Answered** |
| 6 | Minimal coder task? | **Answered** |

---

## 2. Confirmed Facts with Evidence

### 2.1 Online Mode Character Discovery Is Fundamentally Different from Single-Player

**Evidence**: `F:\AI_project\nameless_game\game\noname\resources\app\noname\game\index.js` L146-152

```javascript
initCharacterList(filter) {
    let list;
    if (_status.connectMode) {
        list = get.charactersOL();          // ← ONLINE PATH
    } else {
        list = Object.keys(lib.character).filter(...);  // ← SINGLE-PLAYER PATH
    }
    ...
}
```

- **Single-player**: Uses `Object.keys(lib.character)` — any character in `lib.character` appears. Direct injection works.
- **Online**: Uses `get.charactersOL()` — a completely different discovery mechanism.

### 2.2 `charactersOL()` Iterates `configOL.characterPack`, NOT `lib.character`

**Evidence**: `F:\AI_project\nameless_game\game\noname\resources\app\noname\get\index.js` L1785-1809

```javascript
charactersOL(func) {
    let list = [];
    let libCharacter = {};
    for (let i = 0; i < lib.configOL.characterPack.length; i++) {
        const pack = lib.characterPack[lib.configOL.characterPack[i]];
        for (let j in pack) {
            if (typeof func == "function" && func(j)) continue;
            if (lib.connectBanned.includes(j)) continue;
            if (lib.character[j]) {
                libCharacter[j] = pack[j];
            }
        }
    }
    for (let i in libCharacter) {
        if (lib.filter.characterDisabled(i, libCharacter)) continue;
        list.push(i);
    }
    return list;
}
```

This iterates `lib.configOL.characterPack` (an array of **character pack names**, e.g., `["standard", "shenhua", ..., "zusfylri"]`), looks up each pack in `lib.characterPack`, and returns characters from those packs that also exist in `lib.character`.

**If `"ycc"` is not in `lib.configOL.characterPack`, ycc characters will never be discovered**, regardless of whether `lib.character` contains them.

### 2.3 `configOL.characterPack` Is Populated from `lib.connectCharacterPack`

**Evidence**: `F:\AI_project\nameless_game\game\noname\resources\app\noname\game\index.js` L7388

```javascript
lib.configOL.characterPack = lib.connectCharacterPack.slice(0);
```

This runs when entering connect mode (via `switchMode`). It snapshots the current `lib.connectCharacterPack` array. The contents at this moment become the definitive list of available online character packs.

### 2.4 `lib.connectCharacterPack` Is Populated Only by `loadCharacter`

**Evidence**: `F:\AI_project\nameless_game\game\noname\resources\app\noname\init\loading.js` L93-112

```javascript
function loadCharacter(character) {
    let name = character.name;
    ...
    for (let key in character) {
        ...
        case "connect":
            lib.connectCharacterPack.push(name);   // ← ONLY PATH TO ADD TO connectCharacterPack
            break;
        ...
    }
}
```

`lib.connectCharacterPack` is pushed ONLY during `loadCharacter` processing, for character packs that declare `connect: true`. **There is no other code path that adds entries to `lib.connectCharacterPack`.**

### 2.5 YCC's `character/index.js` Has `connect: true` — But Is Never Imported

**Evidence — ycc `character/index.js`** L13-17:
`F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\character\index.js`

```javascript
game.import("character", function () {
    return {
        name: "ycc",
        connect: true,    // ← CORRECT: would populate connectCharacterPack IF imported
        ...
    };
});
```

**Evidence — ycc `precontent.js`**:
`F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\main\precontent.js`

The file imports individual data files directly (`characters`, `skills`, `translates`, etc.) and manually injects them. It does **NOT** contain:

```javascript
import "../character/index.js";
```

Therefore `game.import("character", fn)` **never fires**, `lib.imported.character.ycc` **never exists**, and `loadCharacter` **never processes** the ycc pack.

### 2.6 The Working Reference Pattern: 英雄杀

**Evidence — 英雄杀 `precontent.js`**:
`F:\AI_project\nameless_game\game\noname\resources\app\extension\英雄杀\main\precontent.js`

```javascript
import { lib, game, ui, get, ai, _status } from "noname";
import "../character/index.js";   // ← TRIGGERS game.import("character") pipeline

export function precontent(config, pack) {
    lib.translate.yxs_character_config = "英雄杀";
}
```

**Evidence — 玩点论杀 `precontent.js`**:
`F:\AI_project\nameless_game\game\noname\resources\app\extension\玩点论杀\main\precontent.js`

```javascript
Promise.all([import("../card/index.js"), import("../character/index.js")])
    .then(() => { ... });
```

Both working new-style extensions import their `character/index.js`, triggering the normal pipeline.

### 2.7 The Boot Sequence Timing Guarantees Correctness

**Evidence**: `F:\AI_project\nameless_game\game\noname\resources\app\noname\init\index.js` L302-466

```
precontent runs (L2817, awaited) → game.import("character") stores promise in _status.importing
  ↓
lib.extensions.push (L2833) — character/index.js static import runs now if present
  ↓
await Promise.allSettled(toLoad) (L311) — waits for built-in packs
  ↓
await Promise.allSettled(_status.importing promises) (L312-318) — resolves all game.import promises
  ↓
lib.connectCharacterPack = [] (L459) — RESET
  ↓
loadCharacter processes lib.imported.character entries (L465-466) — repopulates connectCharacterPack
```

The `_status.importing` await at L312-318 **guarantees** that `lib.imported.character.ycc` exists **before** `loadCharacter` runs at L465. Prior concerns about async timing are invalid (confirmed by prior research §3.1).

### 2.8 Character Pack Connect Menu Also Uses `lib.connectCharacterPack`

**Evidence**: `F:\AI_project\nameless_game\game\noname\resources\app\noname\game\characterPackMenu.js` L422

```javascript
var characterlist = connectMenu ? lib.connectCharacterPack : lib.config.all.characters;
```

### 2.9 Secondary: Extension-Level `connect` Flag Missing from Top Level

**Evidence — ycc `extension.js`**:
`F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\extension.js`

The `connect: true` from `info.json` is placed inside `extensionPackage.package`, NOT at the top level as `extensionPackage.connect`.

**Evidence — loading.js** L194-196:

```javascript
async function loadExtension(extension) {
    if (!extension[5] && lib.config.mode === "connect") {
        return;   // ← checks extension[5] = object.connect (top-level), NOT package.connect
    }
```

`extension[5]` = `object.connect` (top-level property). ycc only sets `package.connect`, so `extension[5]` is `undefined`.

**Impact**: In normal single-player boot (`lib.config.mode !== "connect"`), the gate doesn't fire. For new-style extensions, character loading happens through `loadCharacter` (before `loadExtension`), so the early return doesn't affect character data. **Not the primary blocker**, but a latent issue.

---

## 3. Root Cause (Full Chain of Causation)

```
precontent.js does NOT import "../character/index.js"
  → game.import("character", fn) never fires
    → lib.imported.character.ycc never exists
      → loadCharacter() never processes the ycc pack
        → lib.connectCharacterPack.push("ycc") never happens (loading.js L111)
          → lib.configOL.characterPack does not include "ycc" (game/index.js L7388)
            → get.charactersOL() iterates configOL.characterPack — ycc not found
              → initCharacterList() returns empty list for ycc characters in connect mode
                → ycc characters do not appear in online character selection
```

**Single-player works** because `initCharacterList()` in non-connect mode uses `Object.keys(lib.character)` (L151 of game/index.js), and the direct injection in precontent populates `lib.character` regardless of `lib.connectCharacterPack`.

---

## 4. What the Current Direct Injection Does

The current precontent (~120 lines):
- Directly imports `character.js`, `skill.js`, `translate.js`, etc.
- Manually writes all data to `lib.character`, `lib.skill`, `lib.translate`, etc.
- Pushes `"ycc"` to `lib.config.characters`
- Registers the `"fu"` group

**What it gets RIGHT**: Character data in `lib.character` → single-player works.

**What it MISSES**: Never populates `lib.connectCharacterPack` → online mode fails.

**What it does UNNECESSARILY**: ~100 lines of manual injection. All handled automatically by `loadCharacter`.

---

## 5. Minimal Patch Plan for Coder

### Files to Change

**One file**: `main/precontent.js` (both source and runtime copies).

- **Source**: `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen\main\precontent.js`
- **Runtime**: `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\main\precontent.js`

### Proposed Replacement (~120 lines → ~25 lines)

```javascript
import { lib, game, ui, get, ai, _status } from "noname";
import "../character/index.js"; // Triggers game.import("character") → loadCharacter pipeline

export async function precontent(config, pack) {
    // Extension config translate label
    lib.translate.ycc_character_config = "御承宸";

    // Ensure ycc character pack is in lib.config.characters so
    // loadCharacter writes character/skill/translate data during boot.
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

All manual data injection (100+ lines): `lib.characterPack.ycc`, `lib.character[charaName]`, `lib.skill[skillName]`, `lib.translate[transKey]`, `lib.characterFilter`, `lib.dynamicTranslate`, `lib.characterIntro`, `lib.pinyins`, `lib.characterSort`, `lib.characterTitle`. All handled by the `loadCharacter` pipeline.

### Optional Enhancement: Extension-Level `connect` Flag

In `extension.js` (both source and runtime), add `connect: true` at the top level:

```javascript
let extensionPackage = {
    name: "yuchengchen",
    connect: true,        // ← ADD (in addition to package.connect from info.json)
    config: {},
    content,
    help: {},
    package: {},
    precontent,
    files: { character: [], card: [], skill: [], audio: [] },
};
```

This satisfies the `loadExtension` connect-mode gate (loading.js L194-196). Not strictly required — character loading for new-style extensions goes through `loadCharacter` before `loadExtension` — but it's the canonical form.

---

## 6. Verification Plan

### 6.1 Single-Player Regression Check

```powershell
node bin/cli.js start --session ycc-sp --port 9222 --hidden
node bin/cli.js watch --session ycc-sp --seconds 15 --dialog accept
node bin/cli.js eval --session ycc-sp "(async () => { const m = await import('./noname.js'); return { extensions: m.lib.config.extensions.includes('yuchengchen'), characters: m.lib.config.characters.includes('ycc'), ycc_pack: !!m.lib.characterPack.ycc, ycc_yuchengchen: !!m.lib.character.ycc_yuchengchen, connectCharPack: m.lib.connectCharacterPack.includes('ycc') }; })()"
node bin/cli.js stop --session ycc-sp
```

Expected: All true, including `connectCharPack: true`.

### 6.2 Online Mode Verification

```powershell
node bin/cli.js start --session ycc-online --port 9222 --hidden
node bin/cli.js watch --session ycc-online --seconds 15 --dialog accept
node bin/cli.js online-local-entry --session ycc-online --mode identity --seconds 20
node bin/cli.js eval --session ycc-online "(async () => { const m = await import('./noname.js'); return { configOL_charPack: m.lib.configOL.characterPack, ycc_in_OL: m.lib.configOL.characterPack.includes('ycc'), connectMode: m._status.connectMode }; })()"
node bin/cli.js stop --session ycc-online
```

Expected: `ycc_in_OL: true`.

---

## 7. Source Reference Index

### Engine Files
- `game/noname/resources/app/noname/init/index.js` L263-274, L302-318, L459, L465-467, L483, L521-523
- `game/noname/resources/app/noname/init/loading.js` L93-193 (`loadCharacter`), L194-358 (`loadExtension`)
- `game/noname/resources/app/noname/game/index.js` L146-163 (`initCharacterList`), L2633-2670 (`game.import`), L2672-2834 (`game.loadExtension`), L7372-7404 (connect mode entry)
- `game/noname/resources/app/noname/get/index.js` L1785-1809 (`charactersOL`)
- `game/noname/resources/app/noname/game/characterPackMenu.js` L422

### Extension Files
- `game/noname/resources/app/extension/yuchengchen/extension.js` — missing top-level `connect`
- `game/noname/resources/app/extension/yuchengchen/main/precontent.js` — no `import "../character/index.js"`
- `game/noname/resources/app/extension/yuchengchen/character/index.js` — correct, has `connect: true`
- `game/noname/resources/app/extension/yuchengchen/info.json` — `connect: true` inside `package` only
- `game/noname/resources/app/extension/英雄杀/main/precontent.js` — reference: uses `import "../character/index.js"`
- `game/noname/resources/app/extension/玩点论杀/main/precontent.js` — reference: uses `Promise.all([...import("../character/index.js")])`

### Prior Reports
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-extension-registration-research.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-register-ycc-runtime.md`

---

## 8. Confidence

**HIGH**. All claims verified against engine source code with exact file paths and line numbers. The causal chain from missing `import "../character/index.js"` to empty `charactersOL()` output is confirmed. The distinction between single-player `initCharacterList` (uses `Object.keys(lib.character)`) and online `charactersOL` (uses `configOL.characterPack`) explains why single-player works but online does not.