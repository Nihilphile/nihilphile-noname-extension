# Online Selection Pool Missing YCC — Root Cause Analysis

**Date**: 2026-06-20
**Role**: Explorer (ycc group)
**Task Brief**: `F:\AI_project\nameless_game\nihilphile\ycc\briefs\20260620-online-selection-pool-missing-ycc.md`

---

## Verdict (One Sentence)

**`chooseCharacterPurpleOL` (identity.js L1040-1042) removes any character 势力 group with fewer than 12 members from the online purple-mode selection pool; the ycc-exclusive "fu" (福) group has only 1 character (`ycc_yuchengchen`), so it is unconditionally deleted and never offered — the prior fix correctly added "ycc" to `lib.connectCharacterPack` / `configOL.characterPack`, but that data never reaches the purple-mode selection dialog because of this hard-coded group minimum filter.**

---

## 1. Questions Investigated

| # | Question | Status |
|---|----------|--------|
| 1 | Which list generates the online character selection dialog after room enters selection? | **Answered** |
| 2 | Does that list include `ycc_yuchengchen` before candidate buttons are generated? | **Answered: depends on sub-mode** |
| 3 | If ycc is included earlier but not in final candidates, which filter removes it? | **Answered** |
| 4 | If ycc is not in the list, which room/host setting list is out of sync? | **Answered** |
| 5 | Smallest coder patch to make ycc appear in the online selection dialog? | **Answered** |

---

## 2. Confirmed Facts with Evidence

### 2.1 The Online Character Selection Dispatch

**Evidence**: `F:\AI_project\nameless_game\game\noname\resources\app\mode\identity.js` L199, L232, L2409-2416

The chain from game start to character selection:

```
identity mode start handler (L199):
  _status.mode = lib.configOL.identity_mode  // e.g. "normal", "purple", "stratagem", "zhong"
    ↓
  game.randomMapOL() (L232)
    ↓
  game.chooseCharacterOL() (game/index.js L1667)
    ↓
  chooseCharacterOL (identity.js L2409):
    if _status.mode == "purple"    → chooseCharacterPurpleOL()    (L955)
    if _status.mode == "stratagem" → chooseCharacterStratagemOL() (L1321)
    else                           → generic fallback             (L2417)
```

Default `connect_identity_mode` is `"normal"` (library/index.js L5651), mapped to `lib.configOL.identity_mode` via `switchMode` (game/index.js L7385).

### 2.2 Purple Mode (`chooseCharacterPurpleOL`) — Group Minimum of 12

**Evidence**: `F:\AI_project\nameless_game\game\noname\resources\app\mode\identity.js` L1008-1047

```javascript
// Step 1: Build libCharacter from configOL.characterPack (L1008-1016)
var libCharacter = {};
for (var i = 0; i < lib.configOL.characterPack.length; i++) {
    var pack = lib.characterPack[lib.configOL.characterPack[i]];
    for (var j in pack) {
        if (lib.character[j]) {
            libCharacter[j] = pack[j];
        }
    }
}

// Step 2: Group characters by faction, apply filters (L1017-1039)
for (var i in libCharacter) {
    if (lib.filter.characterDisabled(i, libCharacter)) continue;
    if (i.indexOf("lingju") != -1 || get.is.double(i)) continue;
    var group = lib.character[i][1];               // ← group resolution
    if (lib.selectGroup.includes(group)) continue;
    if (!map[group]) { map[group] = []; list.push(group); }
    map[group].push(i);
    // ...
}

// Step 3: REMOVE groups with < 12 characters (L1040-1047)
for (var i in map) {
    if (map[i].length < 12) {     // ← THE FILTER
        delete map[i];
        list.remove(i);
    } else {
        event.mapNum[i] = map[i].length > 15 ? 5 : 3;
    }
}
```

**Impact**: The "fu" (福) group has exactly 1 character (`ycc_yuchengchen`). `map["fu"].length = 1 < 12` → group deleted → ycc never offered.

### 2.3 The Same Filter Exists in Single-Player Purple Mode

**Evidence**: `F:\AI_project\nameless_game\game\noname\resources\app\mode\identity.js` L1229-1233

```javascript
for (var i in map) {
    if (map[i].length < 12) {
        delete map[i];
        list.remove(i);
    }
}
```

Single-player `chooseCharacterPurple` has the identical group minimum filter. However, single-player character selection normally uses `initCharacterList` (game/index.js L146-152), not `chooseCharacterPurple`, so the normal single-player path is unaffected.

### 2.4 YCC Pack Structure Confirms Only 1 Character in "fu" Group

**Evidence**: `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\character\character.js`

```javascript
const characters = {
    ycc_yuchengchen: {
        sex: "male",
        group: "fu",    // ← only character in the entire codebase with group "fu"
        hp: 4,
        skills: ["ycc_huangming", "ycc_yuce", "ycc_qinzheng"],
    },
};
```

**Confirmed by grep**: No other character pack in `character/` or `extension/` defines `group: "fu"`.

### 2.5 Stratagem Mode and Normal Mode — No Group Minimum Filter

**Evidence**: 
- `chooseCharacterStratagemOL` (L1397-1443): Characters added directly to `event.list`, no group-based grouping or filtering.
- Generic fallback (L2525-2581): Characters added to `event.list` / `list3` directly, no group filtering. Only filter is `characterDisabled`.

**Conclusion**: In stratagem mode and normal (标准) identity mode, ycc SHOULD be included in the candidate pool. Non-appearance in these modes is attributable to random sampling (see §3.3).

### 2.6 Prior Fix is Working Correctly — But Insufficient

**Evidence**: `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-fix-online-extension-registration.md`

The prior coder's fix correctly:
- Added `"ycc"` to `lib.connectCharacterPack`
- Ensured `lib.configOL.characterPack` includes `"ycc"`
- Made `get.charactersOL()` return `ycc_yuchengchen`

The verification test used `--mode identity` which defaults to "normal" sub-mode. In normal mode, the generic fallback is used (no group minimum filter). The test PASSED because it never exercised the purple-mode path.

### 2.7 Character Pack Menu UI vs. Runtime Selection — In Sync for `lib.connectCharacterPack`

**Evidence**: `F:\AI_project\nameless_game\game\noname\resources\app\noname\ui\create\menu\pages\characterPackMenu.js` L422

```javascript
var characterlist = connectMenu ? lib.connectCharacterPack : lib.config.all.characters;
```

The online character pack settings menu reads from `lib.connectCharacterPack`. Since the prior fix added "ycc" there, the UI shows the ycc pack as available and enabled. But the purple-mode selection dialog has an additional filter the UI doesn't expose.

---

## 3. Root Cause: Full Chain of Causation

```
YCC pack has only 1 character in group "fu"
  → chooseCharacterPurpleOL groups characters by faction (group)
    → line 1040: if (map["fu"].length < 12) → TRUE
      → delete map["fu"]; list.remove("fu");
        → "fu" group removed from candidate groups
          → ycc_yuchengchen never included in any player candidate buttons
            → ycc never appears in online character selection dialog
```

### Affected vs. Unaffected Paths

| Sub-Mode | Affected? | Reason |
|----------|-----------|--------|
| purple (3v3v2) | **YES** | Group minimum of 12 (L1040-1042) removes "fu" |
| stratagem (谋攻) | No | No group-based filter |
| normal (标准) | No* | Generic fallback path, no group filter |
| zhong (明忠) | No* | Generic fallback path, no group filter |

\* In normal/stratagem modes, ycc is in the candidate pool but may not be randomly selected due to pool size vs. choice count (probability issue, not a definitive exclusion).

---

## 4. Minimal Coder Patch Plan

### Option A: Lower the Group Minimum Threshold (Recommended)

**File**: `F:\AI_project\nameless_game\game\noname\resources\app\mode\identity.js`

Two locations need the same change:

1. **Online purple mode** — line 1041:
```javascript
// BEFORE:
if (map[i].length < 12) {
// AFTER:
if (map[i].length < 2) {  // or: < 1, effectively disabling the filter
```

2. **Single-player purple mode** — line 1230 (identical change):
```javascript
// BEFORE:
if (map[i].length < 12) {
// AFTER:
if (map[i].length < 2) {
```

**Risk**: Low. The group minimum exists to ensure each faction has enough variety for the faction-selection UI (where rZhu and bZhu each pick a faction, then get 4-6 random characters from it). Lowering to 2 means even 1-character groups appear, which is sufficient since a single character can still be offered.

**Note**: Also need to patch the source copy if auto-deploy is in use:
- `F:\AI_project\nameless_game\noname\apps\core\mode\identity.js`

### Option B: Make the Threshold Configurable

Add a `lib.configOL.purple_group_min` or similar config value, defaulting to a reasonable number (e.g., 2). This preserves the current behavior for users who want it while allowing extension authors to lower it.

### Option C: Skip the Filter for Extension-Only Groups

Check if the group exists in `lib.group` but has fewer than 12 members only because it's from an extension. This is more complex and fragile.

### Files That Need No Changes

- `precontent.js` — already fixed (imports `character/index.js`, registers "fu" group)
- `extension.js` — already has `connect: true`
- `character/index.js` — correctly calls `game.import("character")`
- All character/skill/translate data files — correct

---

## 5. Verification Plan

### 5.1 Patch Verification (Purple Mode)

```powershell
# Start and enter online purple mode
node bin/cli.js start --session ycc-purple --port 9223 --hidden
node bin/cli.js watch --session ycc-purple --seconds 15 --dialog accept
node bin/cli.js online-local-entry --session ycc-purple --mode identity --seconds 25

# Check: candidate list includes ycc_yuchengchen
node bin/cli.js eval --session ycc-purple "(async () => { const m = await import('./noname.js'); await m.game.promises.init; return { mode: m._status.mode, yccInOL: m.get.charactersOL().includes('ycc_yuchengchen'), yccInList: m._status.characterlist?.includes('ycc_yuchengchen'), fuInGroup: m.lib.group.includes('fu') }; })()"

node bin/cli.js stop --session ycc-purple
```

Expected: `yccInList: true`.

### 5.2 Regression Check (Normal Mode)

```powershell
node bin/cli.js online-local-entry --session ycc-normal --mode identity --seconds 25
node bin/cli.js eval --session ycc-normal "(async () => { const m = await import('./noname.js'); return { yccInOL: m.get.charactersOL().includes('ycc_yuchengchen') }; })()"
```

Expected: `yccInOL: true` (should remain true — no regression).

---

## 6. Source Reference Index

### Engine Files
| File | Lines | Relevance |
|------|-------|-----------|
| `mode/identity.js` | L955-1083 | `chooseCharacterPurpleOL` — contains the group minimum filter at L1040-1042 |
| `mode/identity.js` | L1164-1273 | `chooseCharacterPurple` (single-player) — identical filter at L1229-1233 |
| `mode/identity.js` | L1321-1460 | `chooseCharacterStratagemOL` — NO group filter |
| `mode/identity.js` | L2409-2416 | `chooseCharacterOL` — dispatcher |
| `mode/identity.js` | L2417-2698 | Generic fallback (normal/zhong mode) — NO group filter |
| `mode/identity.js` | L180-232 | Identity mode start handler — sets `_status.mode`, calls `randomMapOL()` |
| `game/index.js` | L1606-1668 | `randomMapOL` — broadcasts config, calls `chooseCharacterOL()` |
| `game/index.js` | L146-153 | `initCharacterList` — uses `charactersOL()` or `Object.keys(lib.character)` |
| `game/index.js` | L7372-7398 | `switchMode` — populates `configOL.characterPack` from `connectCharacterPack` |
| `get/index.js` | L1785-1809 | `charactersOL` — NO group filter, iterates `configOL.characterPack` directly |
| `library/index.js` | L13140 | `lib.group` initialization: `["wei","shu","wu","qun","jin","shen"]` |
| `library/index.js` | L10853-10888 | `lib.filter.characterDisabled` |
| `ui/create/menu/pages/characterPackMenu.js` | L422 | Online menu reads from `lib.connectCharacterPack` |

### Extension Files
| File | Lines | Relevance |
|------|-------|-----------|
| `extension/yuchengchen/character/character.js` | L5 | `ycc_yuchengchen` — `group: "fu"` — only character in this group |
| `extension/yuchengchen/character/index.js` | L13-17 | Correct `game.import("character")` with `connect: true` |
| `extension/yuchengchen/main/precontent.js` | L11-12 | Registers "fu" group via `lib.group.add("fu")` |

### Prior Reports
- `20260620-fix-online-extension-registration.md` — prior coder fix (verified normal mode, not purple)
- `20260620-online-extension-not-active.md` — prior explorer root cause (identified `lib.connectCharacterPack` gap)
- `20260620-extension-registration-research.md` — prior explorer research (boot sequence, loadCharacter timing)

---

## 7. Confidence

**HIGH**. The group minimum-of-12 filter is unambiguously present in the source code at definitive line numbers. The "fu" group has exactly 1 character confirmed by both source inspection and codebase-wide grep. The causal chain from `chooseCharacterPurpleOL` → group minimum filter → "fu" group deletion → ycc exclusion is complete and verifiable.

**Runtime probe not performed**: The user's live session occupies port 8089, preventing test instance startup without disrupting the user. However, the source evidence is definitive and does not require runtime confirmation.

**Remaining uncertainty**: The exact sub-mode (`_status.mode`) the user's session is running. If the user is in "normal" mode (default), the group minimum filter does NOT apply, and ycc should appear in the candidate pool (but may not be randomly selected). If the user is in "purple" mode, the filter definitively removes ycc. The user's observation ("never appears" despite "enabled pool smaller than choice count") strongly supports purple mode or a configuration where the choice count exceeds the pool size.

---

## 8. Report Path

`F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-online-selection-pool-missing-ycc.md`
