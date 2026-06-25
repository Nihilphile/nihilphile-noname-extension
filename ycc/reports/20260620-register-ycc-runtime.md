# Register YCC Into Runtime Game — Incremental Work Report

**Date**: 2026-06-20  
**Role**: Coder  
**Task Brief**: `F:\AI_project\nameless_game\nihilphile\ycc\briefs\20260620-register-ycc-runtime.md`

## Summary

Deployed the yuchengchen extension into the runtime game and modified `precontent.js` to directly inject character data into `lib.characterPack` and `lib.character` during boot, satisfying all acceptance criteria.

## Files Changed

1. **Deployed**: Copied `noname/apps/core/extension/yuchengchen/` → `game/noname/resources/app/extension/yuchengchen/` (16 files)

2. **Modified**: `noname/apps/core/extension/yuchengchen/main/precontent.js` (and its runtime copy)
   - Added direct imports of character data, skills, translates, filters, dynamic translations, character intros, pinyin, voices, sort.
   - Added synchronous injection of all ycc data into `lib.characterPack`, `lib.character`, `lib.skill`, `lib.translate`, `lib.characterFilter`, `lib.dynamicTranslate`, `lib.characterIntro`, `lib.pinyins`, `lib.characterSort`, `lib.characterTitle`, `lib.skilllist`.
   - Preserved all existing behavior (fu group registration, config.characters push).

3. **Registered**: Added `"yuchengchen"` to `lib.config.extensions` via `game.promises.saveConfig()` so the extension persists across restarts.

## Root Cause

The game engine's `loadCharacter` batch (init/index.js L465-466) processes `lib.imported.character` entries during boot. However, `game.import("character", fn)` in `character/index.js` stores its result via `.then()` — an async microtask. By the time `loadCharacter` runs, the ycc entry may not be in `lib.imported.character`. Even when present, the engine defers full character materialization until mode entry.

The fix bypasses both issues: `precontent.js` now directly imports and injects all character/skill/translate data synchronously, guaranteeing availability immediately after boot.

## Verification

### Commands

```powershell
# Start fresh session
node bin/cli.js start --session ycc-final --port 9222 --hidden

# Wait for boot
node bin/cli.js watch --session ycc-final --seconds 15 --dialog accept

# Evaluate runtime state
node bin/cli.js eval --session ycc-final "(async () => { const m = await import('./noname.js'); return { extensions: m.lib.config.extensions, characters: m.lib.config.characters, ycc_pack: !!m.lib.characterPack.ycc, ycc_yuchengchen: !!m.lib.character.ycc_yuchengchen, ycc_skills_huangming: !!m.lib.skill.ycc_huangming, ycc_skills_yuce: !!m.lib.skill.ycc_yuce, ycc_skills_qinzheng: !!m.lib.skill.ycc_qinzheng }; })()"

# Stop session
node bin/cli.js stop --session ycc-final
```

### Results

```json
{
  "extensions": ["Zusfylri武将包", "yuchengchen"],
  "characters": ["zusfylri", "ycc"],
  "ycc_pack": true,
  "ycc_yuchengchen": true,
  "ycc_skills_huangming": true,
  "ycc_skills_yuce": true,
  "ycc_skills_qinzheng": true
}
```

| Criterion | Expected | Actual | Pass |
|-----------|----------|--------|------|
| lib.config.extensions includes yuchengchen | present | yes | ✓ |
| lib.config.characters includes ycc | present | yes | ✓ |
| !!lib.characterPack.ycc | true | true | ✓ |
| !!lib.character.ycc_yuchengchen | true | true | ✓ |
| !!lib.skill.ycc_huangming | present | true | ✓ |
| !!lib.skill.ycc_yuce | present | true | ✓ |
| !!lib.skill.ycc_qinzheng | present | true | ✓ |

## Remaining Risks

1. **smoker**: Implementation covers static registration and boot-time character data injection. Actual runtime skill interaction (especially huangming forced target flow and filtering chain) still needs controlled gameplay tests.
2. **portrait/image paths**: Character portrait path is set via character data's explicit `img` property, matching the precontent module load path. If the game changes its asset resolution scheme, the path may need updating.
3. **duplicate registration**: The precontent now injects data directly AND `character/index.js` still calls `game.import("character", fn)` for the extension system's own tracking. The null-checks in the injection code prevent overwrites.
4. **connect-mode character pack**: The ycc pack has `connect: true`. Direct injection makes characters available at main menu, but mode-specific behaviors may differ.
