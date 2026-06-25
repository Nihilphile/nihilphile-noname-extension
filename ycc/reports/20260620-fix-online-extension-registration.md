# Fix Online Extension Registration — Implementation Report

**Date**: 2026-06-20
**Role**: Coder (ycc group)
**Task Brief**: `F:\AI_project\nameless_game\nihilphile\ycc\briefs\20260620-fix-online-extension-registration.md`

---

## Verdict

**Online discovery is FIXED.** `lib.connectCharacterPack` now includes `"ycc"`, `lib.configOL.characterPack` includes `"ycc"` in connect mode, and `get.charactersOL()` returns `ycc_yuchengchen`. All fresh boot and online-mode checks pass.

---

## Files Changed

| File | Change |
|------|--------|
| `noname/apps/core/extension/yuchengchen/main/precontent.js` | Replaced ~120 lines of direct data injection with ~18 lines: side-effect `import "../character/index.js"` + fu group init. Removed all manual `lib.character`, `lib.skill`, `lib.translate`, `lib.characterFilter`, `lib.dynamicTranslate`, `lib.characterIntro`, `lib.pinyins`, `lib.characterSort`, `lib.characterTitle` injection. |
| `game/noname/resources/app/extension/yuchengchen/main/precontent.js` | Identical replacement (packaged runtime copy). |
| `noname/apps/core/extension/yuchengchen/extension.js` | Added `connect: true` at top level of `extensionPackage`. |
| `game/noname/resources/app/extension/yuchengchen/extension.js` | Identical addition (packaged runtime copy). |

---

## Verification Evidence

### Session: `ycc-verify`

Tool: `tools/noname-test-cli` (`node bin/cli.js`)

#### 1. Fresh Boot Check

```
node bin/cli.js start --session ycc-verify --port 9222 --hidden
node bin/cli.js watch --session ycc-verify --seconds 12 --dialog accept
node bin/cli.js eval --session ycc-verify "(async () => { const m = await import('./noname.js'); return { extensions: m.lib.config.extensions.includes('yuchengchen'), characters: m.lib.config.characters.includes('ycc'), ycc_pack: !!m.lib.characterPack.ycc, ycc_yuchengchen: !!m.lib.character.ycc_yuchengchen, connectCharPack: m.lib.connectCharacterPack.includes('ycc') }; })()"
```

Result:
```json
{"value":{"extensions":true,"characters":true,"ycc_pack":true,"ycc_yuchengchen":true,"connectCharPack":true}}
```

All five assertions: **PASS**.

#### 2. Online Mode Check

```
node bin/cli.js online-local-entry --session ycc-verify --mode identity --seconds 20
```

Result: `"ok":true,"status":"local_entry_success","connectMode":true,"characterCandidateCount":19`

`ycc_yuchengchen` (御承宸 4 福) appears in character candidates list.

```
node bin/cli.js eval --session ycc-verify "(async () => { const m = await import('./noname.js'); return { configOL_charPack_ycc: m.lib.configOL.characterPack.includes('ycc'), connectMode: m._status.connectMode, connectCharPack_ycc: m.lib.connectCharacterPack.includes('ycc'), charactersOL_includes_ycc: (() => { const list = m.get.charactersOL(); return list.includes('ycc_yuchengchen'); })() }; })()"
```

Result:
```json
{"value":{"configOL_charPack_ycc":true,"connectMode":true,"connectCharPack_ycc":true,"charactersOL_includes_ycc":true}}
```

All four online assertions: **PASS**.

#### 3. Cleanup

```
node bin/cli.js stop --session ycc-verify
```

Session stopped clean. No orphaned processes.

---

## What Changed and Why

### Root Cause (from prior explorer reports)

The old `precontent.js` directly imported and injected character/skill/translate data into `lib.*` objects. This bypassed `game.import("character")` → `loadCharacter()` pipeline, so `lib.connectCharacterPack` never received `"ycc"`. Without that entry, online mode's `configOL.characterPack` didn't include `"ycc"`, and `charactersOL()` couldn't discover ycc characters.

### Fix

1. **`precontent.js`**: Replaced all manual injection with `import "../character/index.js"` — this triggers `game.import("character", fn)` which stores data in `lib.imported.character.ycc`. The boot sequence (verified by prior research) awaits `_status.importing` before calling `loadCharacter`, which processes the ycc pack including its `connect: true` flag, pushing `"ycc"` to `lib.connectCharacterPack`.

2. **`extension.js`**: Added top-level `connect: true` to `extensionPackage` (was missing — only existed inside `package` from `info.json`). This satisfies the `loadExtension` connect-mode gate check.

### What Was Removed

~100 lines of manual direct injection: `lib.characterPack`, `lib.character`, `lib.skilllist`/`lib.skill`, `lib.translate` (from characters, skills, voices, sort), `lib.characterFilter`, `lib.dynamicTranslate`, `lib.characterIntro`, `lib.pinyins`, `lib.characterSort`, `lib.characterTitle`. All are now handled automatically by `loadCharacter`.

### What Was Preserved

- `lib.config.characters.push("ycc")` — still needed to pass `loadCharacter` gate
- `lib.translate.ycc_character_config` — config menu label
- Fu group registration (`lib.group`, `lib.groupnature`, `lib.translate.fu*`) — independent custom group
- All character/skill/translate data in `character/*.js` files — unchanged, loaded through normal pipeline

---

## Remaining Risk

| Risk | Assessment |
|------|------------|
| `lib.config.characters` persistence | `push()` runs every boot in precontent. Not persisted to IndexedDB — same behavior as before. Low risk. |
| Smoker session compatibility | No mutation of any other extension or engine code. Single-player behavior should be identical (old code used direct injection; new code uses the equivalent pipeline). |
| Character portrait/images | Set in `character/character.js` via `img` property — unchanged. |
| `dieAudios` | Not set in original; still not set. Out of scope. |

---

## Report Path

`F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-fix-online-extension-registration.md`