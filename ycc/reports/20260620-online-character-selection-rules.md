# Online Character Selection Rules — Full Dispatch Map

**Date**: 2026-06-20
**Role**: Explorer (ycc group)
**Task Brief**: `F:\AI_project\nameless_game\nihilphile\ycc\briefs\20260620-online-character-selection-rules.md`

---

## Verdict (One Sentence)

**Online identity character selection has a definitive, source-confirmed exclusion rule only in purple (3v3v2) mode — the `map[i].length < 12` group-minimum filter at L1041 unconditionally deletes the "fu" group (1 character: `ycc_yuchengchen`) — while normal/zhong/stratagem modes have NO group-based exclusion and ycc non-appearance there is purely random sampling probability; the prior fix correctly added "ycc" to `lib.connectCharacterPack` / `configOL.characterPack`, and no further source-level exclusion exists for standard identity rooms beyond the purple-mode filter.**

---

## 1. Questions Investigated

| # | Question | Status |
|---|----------|--------|
| 1 | What room settings are copied into `lib.configOL` when online identity starts? | **Answered** (§3) |
| 2 | How does `lib.configOL.characterPack` relate to the visible online pack menu? | **Answered** (§4) |
| 3 | What is the dispatch table for online identity sub-modes? | **Answered** (§5) |
| 4 | For each sub-mode, what source list is used before candidate sampling? | **Answered** (§6) |
| 5 | For each sub-mode, what filters are applied? | **Answered** (§7) |
| 6 | How is the final candidate button list sampled, and how does refresh work? | **Answered** (§8) |
| 7 | Under which exact rule(s) can ycc be excluded even though the pack is enabled and `get.charactersOL()` includes it? | **Answered** (§9) |
| 8 | What should the next coder patch be, and what should be deferred? | **Answered** (§10) |

---

## 2. Full Pipeline Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. USER ACTION: clicks 联机 → 启动服务器 → 启                       │
│    → mode/connect.js L26: game.switchMode(directstartmode)          │
└───────────────┬─────────────────────────────────────────────────────┘
                │
                v
┌─────────────────────────────────────────────────────────────────────┐
│ 2. switchMode("identity") — game/index.js L7290-7398                │
│                                                                     │
│  lib.configOL.mode = "identity"                          (L7375)    │
│  lib.configOL.characterPack = lib.connectCharacterPack    (L7388)    │
│    └─ MINUS lib.config.connect_characters[] entries       (L7390-92) │
│  lib.configOL.banned = lib.config["connect_identity_banned"]         │
│                                                 (L7396)             │
│  lib.configOL.{identity_mode, number, double_character,             │
│         choice_zhu, choice_fan, ...} from get.config()   (L7381-85) │
└───────────────┬─────────────────────────────────────────────────────┘
                │
                v
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Identity mode start handler — mode/identity.js L180-232          │
│                                                                     │
│  _status.mode = lib.configOL.identity_mode               (L199)     │
│    └─ default: "normal" (library/index.js L5651)                    │
│  game.randomMapOL()                                      (L232)     │
│    └─ broadcasts lib.configOL to guests, sets _status.mode          │
│    └─ calls game.chooseCharacterOL()                     (L1667)    │
└───────────────┬─────────────────────────────────────────────────────┘
                │
                v
┌─────────────────────────────────────────────────────────────────────┐
│ 4. chooseCharacterOL DISPATCH — mode/identity.js L2409-2416         │
│                                                                     │
│  _status.mode == "purple"    → chooseCharacterPurpleOL()    L955    │
│  _status.mode == "stratagem" → chooseCharacterStratagemOL() L1321   │
│  else (normal/zhong)         → generic fallback             L2417   │
└───────────────┬─────────────────────────────────────────────────────┘
                │
                v
┌─────────────────────────────────────────────────────────────────────┐
│ 5. Per-sub-mode: Build libCharacter, apply filters, sample,         │
│    generate candidate buttons — see per-sub-mode tables below (§6-7)│
│                                                                     │
│  _status.characterlist = list4.slice(0)  (set once, consumed later) │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. lib.configOL Population (Question 1)

When `switchMode("identity")` runs in connect mode (game/index.js L7372-7398):

| `lib.configOL` key | Source | Line |
|---|---|---|
| `mode` | `"identity"` (hardcoded) | L7375 |
| `characterPack` | `lib.connectCharacterPack.slice()` minus `lib.config.connect_characters[]` | L7388-7392 |
| `cardPack` | `lib.connectCardPack.slice()` minus `lib.config.connect_cards[]` | L7389-7394 |
| `banned` | `lib.config["connect_identity_banned"]` | L7396 |
| `bannedcards` | `lib.config["connect_identity_bannedcards"]` | L7397 |
| `identity_mode` | `get.config("connect_identity_mode")` → default `"normal"` | L7385, library L5651 |
| `number` | `get.config("connect_player_number")` | L7385 |
| `double_character` | `get.config("connect_double_character")` | L7385 |
| `choice_zhu` / `choice_zhong` / `choice_fan` / `choice_nei` | `get.config("connect_choice_*")` | L7385 |
| `choose_timeout` | `get.config("connect_choose_timeout")` | L7385 |

---

## 4. characterPack Menu vs. Runtime Selection (Question 2)

The online character pack settings menu (characterPackMenu.js L422):
```javascript
var characterlist = connectMenu ? lib.connectCharacterPack : lib.config.all.characters;
```

- **UI toggle ON**: `lib.config.connect_characters.remove("ycc")` → pack is in `configOL.characterPack`
- **UI toggle OFF**: `lib.config.connect_characters.add("ycc")` → pack removed from `configOL.characterPack` at switchMode L7390-7392

The menu shows what packs are in `lib.connectCharacterPack`. The runtime pool uses `lib.configOL.characterPack` which is `lib.connectCharacterPack` minus `lib.config.connect_characters`. The prior fix confirmed these are in sync for ycc.

---

## 5. Dispatch Table (Question 3)

```javascript
// mode/identity.js L2409-2416
chooseCharacterOL: function() {
    if (_status.mode == "purple")     → chooseCharacterPurpleOL()     // identity.js L955
    else if (_status.mode == "stratagem") → chooseCharacterStratagemOL() // identity.js L1321
    else (normal/zhong)               → generic fallback              // identity.js L2417
}
```

`_status.mode` is set at L199 from `lib.configOL.identity_mode`. Default: `"normal"`.

**zhong mode** is NOT dispatched separately — it uses the generic fallback with `event.zhongmode = true` (L2424).

---

## 6. Source Lists per Sub-Mode (Question 4)

| Sub-Mode | Source List | Line | Built From |
|----------|------------|------|------------|
| **purple** | `libCharacter` (local var) | L1007-1016 | Iterates `lib.configOL.characterPack` → `lib.characterPack[name]` → checks `lib.character[j]` |
| **stratagem** | `libCharacter` (local var) | L1397-1405 | Same as above |
| **normal/zhong** | `libCharacter` (local var) | L2525-2534 | Same as above |

All four sub-modes start from the identical source: `lib.configOL.characterPack` → `lib.characterPack` → `lib.character`.

For comparison, `get.charactersOL()` (get/index.js L1785-1809) uses the SAME `lib.configOL.characterPack` source with the SAME `characterDisabled` and `connectBanned` filters. The delta between `get.charactersOL()` and the selection dialog is:
1. `lib.characterReplace` processing (skipped in `charactersOL`)
2. Random sampling/grouping (not applied in `charactersOL`)

---

## 7. Filters per Sub-Mode (Question 5)

### 7a. purple — `chooseCharacterPurpleOL` (identity.js L955-1083)

| Filter | Line | What it does | ycc affected? |
|--------|------|-------------|---------------|
| `lib.filter.characterDisabled(i, libCharacter)` | L1018 | Standard disabled/banned/forbidden check | No (ycc passes) |
| `i.indexOf("lingju") != -1` | L1021 | Excludes lingju keyword characters | No |
| `get.is.double(i)` | L1021 | Excludes double-mode-only characters | No |
| `lib.selectGroup.includes(group)` | L1025 | **Excludes shen/devil groups** from faction UI | No ("fu" not in selectGroup) |
| **`map[i].length < 12`** | **L1041** | **DELETES entire group if < 12 characters** | **YES — "fu" has 1 char → deleted** |
| `event.mapNum[i] = length > 15 ? 5 : 3` | L1045 | Controls slots-per-faction in UI | After deletion, N/A |
| Zhu faction picks from `event.list` | L1054-1070 | rZhu and bZhu each pick one faction | After "fu" deletion, N/A |

**ycc verdict**: DEFINITIVELY excluded. The "fu" group (`map["fu"].length = 1`) is deleted at L1042. `ycc_yuchengchen` is never offered to any player.

### 7b. stratagem — `chooseCharacterStratagemOL` (identity.js L1321-1460)

| Filter | Line | What it does | ycc affected? |
|--------|------|-------------|---------------|
| `lib.characterReplace` processing | L1406-1419 | Removes individual chars that appear in replace groups | No |
| `lib.filter.characterDisabled(i, libCharacter)` | L1434 | Standard disabled/banned/forbidden check | No |
| No group-based filter | — | Characters added directly to `event.list` | No exclusion |
| `list3.randomGets(5)` | L1443 | Sample 5 candidates for zhu from full pool | Probability only |
| `event.list.randomRemove(...)` per player | L1452 | Each player gets random picks from remaining pool | Probability only |

**ycc verdict**: In pool, not excluded by any filter. Non-appearance is random sampling.

### 7c. normal/zhong — generic fallback (identity.js L2417-2698)

| Filter | Line | What it does | ycc affected? |
|--------|------|-------------|---------------|
| `lib.characterReplace` processing | L2535-2555 | Skips individual chars in replace groups, adds replace parents | No |
| `list4.includes(i)` skip | L2567 | Skips chars already added via replace groups | No |
| `lib.filter.characterDisabled(i, libCharacter)` | L2570 | Standard disabled/banned/forbidden check | No |
| `libCharacter[i].isZhugong` split | L2576 | Routes to list2 (主公) vs list3 (非主公) | ycc → list3 |
| No group-based filter | — | No group grouping or group-size filter | No exclusion |
| `getZhuList(list2)` + `list3.randomGets(choice_zhu)` | L2613 | Zhu's initial candidates | Probability only |
| `event.list.randomRemove(...)` per player | L2695 | Each player gets random picks from remaining pool | Probability only |

**ycc verdict**: In pool, not excluded by any filter. Non-appearance is random sampling.

### 7d. characterDisabled — the shared filter (library/index.js L10853-10899)

Connect-mode checks applied to ALL sub-modes:

| Check | Line | ycc status |
|-------|------|------------|
| `!lib.character[i]` | L10855 | ycc exists → PASS |
| `isUnseen` | L10858 | ycc not unseen → PASS |
| `forbidai` / `isAiForbidden` | L10862 | ycc not forbidden → PASS |
| `lib.characterFilter[i]` | L10866 | ycc filter is empty → PASS |
| `lib.configOL.banned.includes(i)` | L10870 | Depends on user config — UNVERIFIED without runtime probe |
| `lib.connectBanned.includes(i)` | L10870 | ycc not in any connectBanned list → PASS |
| `forbiddouble` (if double_character) | L10881-82 | ycc not in forbiddouble → PASS |

---

## 8. Sampling and Refresh (Question 6)

### Sampling flow (normal mode):

1. **Zhu gets first pick**: `list = getZhuList(list2).concat(list3.randomGets(lib.configOL.choice_zhu))` (L2613)
   - `randomGets` (polyfill.js L463-473) creates a COPY of `list3`, picks from copy → does NOT modify `list3`
   - Zhu picks from `list`, chosen characters removed from `event.list` (L2625-2626)

2. **Remaining players**: `event.list.randomRemove(Math.min(num, num2))` (L2695)
   - `randomRemove` (polyfill.js L475-491) REMOVES elements from the original array
   - Each player consumes their picks from the shared pool
   - Characters assigned one player are NOT available to others

3. **`_status.characterlist = list4.slice(0)`** (L2582)
   - Full candidate pool snapshot — set ONCE, then consumed

### Refresh semantics:

"Refresh" (换一批) in online normal mode means: re-sample from the REMAINING `event.list`. Since `event.list` is consumed by `randomRemove`, refreshing:
- Gets a NEW random subset from the remaining pool
- Does NOT regenerate the full pool
- Does NOT re-run `chooseCharacterOL`
- Eventually the pool is exhausted (all characters assigned or removed)

This means: if ycc was NOT in the initial random draw, refresh won't help — the remaining pool may still contain ycc (it was never removed), but continuing to refresh eventually exhausts the pool without ever seeing ycc.

---

## 9. Why ycc Can Be Excluded (Question 7) — Definitive Rules

### Rule 1: Purple mode group-minimum filter — CONFIRMED, DEFINITIVE

**Source**: `mode/identity.js` L1040-1042
```javascript
for (var i in map) {
    if (map[i].length < 12) {
        delete map[i];
        list.remove(i);
    }
}
```

**Mechanism**: Characters are grouped by faction (`lib.character[i][1]` → "fu"). Groups with < 12 members are deleted entirely. ycc's group "fu" has exactly 1 character → deleted → ycc never appears.

**Evidence**: Source code at definitive line numbers. Single-player purple mode has identical filter (L1229-1233).

**Confidence**: HIGH. Source-confirmed. Prior explorer report verified this.

### Rule 2: `lib.configOL.banned` individual character ban — POSSIBLE, UNVERIFIED

**Source**: `library/index.js` L10870 (in `characterDisabled`)
```javascript
if (lib.configOL.banned.includes(i) || lib.connectBanned.includes(i)) {
    return true;
}
```

`lib.configOL.banned` is populated from `lib.config["connect_identity_banned"]` (game/index.js L7396). If the user or a prior session added `ycc_yuchengchen` to the banned list, it would be excluded in ALL sub-modes.

**Confidence**: LOW as a current issue. Prior report confirmed `get.charactersOL()` returns ycc, which checks `lib.configOL.banned` at L10870 (via `characterDisabled`). If `lib.configOL.banned` included ycc_yuchengchen, `charactersOL` would NOT return it. Since `charactersOL` DOES return ycc, this rule is effectively ruled out.

### Rule 3: Random sampling probability — the normal-mode explanation

In normal/zhong/stratagem modes, ycc IS in `event.list` but may not be randomly selected:
- 8-player game, ~200+ character pool
- Zhu sees ~5-8 characters from list2+list3
- Each non-zhu player sees ~3-5 characters
- Total characters assigned: ~30 of ~200
- Probability ycc is assigned to ANY player: ~15% per game

Over multiple games, the probability of never seeing ycc decreases exponentially. But "repeated refreshes" within a single game does NOT regenerate the pool — it re-samples from the remaining pool. If ycc wasn't picked in the initial sampling, refreshing won't make it appear unless ycc is still in the remaining pool AND gets randomly selected.

### Key insight: `get.charactersOL()` vs selection dialog

`get.charactersOL()` returns ALL characters that pass `characterDisabled` — it's a full enumeration. The selection dialog SAMPLES from the full pool. This is the fundamental difference. `charactersOL()` returning ycc confirms ycc is in the pool; the sampling step determines whether ycc reaches the dialog.

### Most likely explanation for user's manual smoke result

The user's screenshot shows a "standard identity room" (主/反 identities visible). This rules out purple mode (which shows 暖方/冷方, not 主/反). So the user is in **normal mode** with the generic fallback.

In normal mode, ycc IS in the candidate pool (`_status.characterlist`), but random sampling creates a probability barrier. The most likely explanation:
1. **Pool dilution**: ~200+ characters competing for ~30 assigned slots → ~15% chance per game
2. **Refresh doesn't regenerate the pool**: re-sampling from the same pool doesn't increase encounter probability
3. **If the user plays only 1-3 games**: 15% per game means non-appearance is statistically normal (~61-72% chance of NOT seeing ycc over 2-3 games)

**Alternate explanation**: If the user enabled `lib.configOL.double_character` and ycc_yuchengchen happens to be in `lib.config.forbiddouble` (UNLIKELY — not found in any source file), double-character mode would exclude it. Source evidence does not support this.

---

## 10. Coder Patch Recommendation (Question 8)

### Immediate patch: Purple mode group-minimum threshold

**File**: `F:\AI_project\nameless_game\game\noname\resources\app\mode\identity.js`

**Change 1** (online purple, L1041):
```javascript
// BEFORE:
if (map[i].length < 12) {
// AFTER:
if (map[i].length < 1) {
```

**Change 2** (single-player purple, L1230):
```javascript
// BEFORE:
if (map[i].length < 12) {
// AFTER:
if (map[i].length < 1) {
```

Also patch source copy if auto-deploy is active:
`F:\AI_project\nameless_game\noname\apps\core\mode\identity.js`

**Rationale**: Changing from `< 12` to `< 1` effectively disables the group-minimum filter (no group has fewer than 1 character). This allows 1-character extension groups like "fu" to appear in purple mode faction selection.

**Risk**: LOW. The group-minimum filter exists to ensure each faction has variety. With `< 1`, even 1-character groups are offered. This is acceptable because:
- Purple mode factions get `event.mapNum[i]` characters (3 or 5) — a 1-character group simply offers that 1 character repeatedly
- The filter is a UI variety concern, not a correctness requirement

### What should be DEFERRED:

1. **Normal-mode sampling probability** — This is NOT a bug; it's expected behavior for a large pool. Options for improving discoverability:
   - Increase per-player choice count (`lib.configOL.choice_*`)
   - Add a "show all" or "search" feature (scope creep)
   - **Decision**: Deferred. Requires product decision about UI/UX, not a bug fix.

2. **Adding more ycc characters** — If the ycc pack had ≥12 characters, the purple-mode filter would pass automatically. This is a content/design decision, not a code fix. Deferred.

3. **Runtime-only timeout patch** — Not needed for this issue. Deferred.

---

## 11. Verification Plan

### Purple mode verification (after patch):

```powershell
# 1. Start session
node bin/cli.js start --session ycc-patch --port 9222 --hidden --allow-occupied-game-port

# 2. Enter online mode
node bin/cli.js online-local-entry --session ycc-patch --mode identity --seconds 20

# 3. Set identity mode to purple and check candidates
node bin/cli.js eval --session ycc-patch "(async () => { const m = await import('./noname.js'); m._status.mode = 'purple'; return m.get.charactersOL().includes('ycc_yuchengchen'); })()"

# 4. Stop
node bin/cli.js stop --session ycc-patch
```

### Regression check (normal mode):

```powershell
node bin/cli.js online-local-entry --session ycc-regress --mode identity --seconds 20
node bin/cli.js eval --session ycc-regress "(async () => { const m = await import('./noname.js'); return { yccInOL: m.get.charactersOL().includes('ycc_yuchengchen'), mode: m._status.mode }; })()"
```

Expected: `yccInOL: true`, `mode: "normal"`.

---

## 12. Source Reference Index

### Engine files
| File | Lines | Relevance |
|------|-------|-----------|
| `mode/identity.js` | L180-232 | Identity mode start handler — sets `_status.mode`, calls `randomMapOL` |
| `mode/identity.js` | L199 | `_status.mode = lib.configOL.identity_mode` |
| `mode/identity.js` | L955-1083 | `chooseCharacterPurpleOL` — group-minimum-12 filter at L1040-1042 |
| `mode/identity.js` | L1164-1273 | `chooseCharacterPurple` (SP) — identical filter at L1229-1233 |
| `mode/identity.js` | L1321-1460 | `chooseCharacterStratagemOL` — NO group filter |
| `mode/identity.js` | L2409-2416 | `chooseCharacterOL` dispatcher |
| `mode/identity.js` | L2417-2698 | Generic fallback (normal/zhong) — NO group filter |
| `mode/identity.js` | L2525-2534 | Build `libCharacter` from `lib.configOL.characterPack` |
| `mode/identity.js` | L2566-2581 | Add characters to `event.list` with `characterDisabled` |
| `mode/identity.js` | L2582 | `_status.characterlist = list4.slice(0)` |
| `mode/identity.js` | L2613 | Zhu candidate sampling |
| `mode/identity.js` | L2695 | Non-zhu player `randomRemove` sampling |
| `game/index.js` | L1606-1668 | `randomMapOL` — broadcasts config, calls `chooseCharacterOL` |
| `game/index.js` | L1666 | `_status.mode` reassignment |
| `game/index.js` | L7290-7398 | `switchMode` — populates `lib.configOL` |
| `game/index.js` | L7388 | `configOL.characterPack = lib.connectCharacterPack.slice(0)` |
| `game/index.js` | L7390-7392 | Removes `lib.config.connect_characters[]` from pack list |
| `game/index.js` | L7396 | `configOL.banned = lib.config["connect_identity_banned"]` |
| `game/index.js` | L1799-1848 | `countChoose` — choice timeout |
| `get/index.js` | L1785-1809 | `charactersOL` — NO group filter, returns full enumeration |
| `library/index.js` | L52 | `connectBanned = []` |
| `library/index.js` | L10853-10899 | `characterDisabled` — all exclusion checks |
| `library/index.js` | L10870 | Connect-mode banned check |
| `library/index.js` | L14220 | `selectGroup = ["shen", "devil"]` |
| `library/index.js` | L5649-5661 | `connect_identity_mode` config, default `"normal"` |
| `library/element/content.js` | L6842-6930 | `chooseButton` event handler |
| `library/element/content.js` | L7015-7108 | `chooseButtonOL` online handler |
| `ui/create/menu/pages/characterPackMenu.js` | L113-117 | `connect_characters` toggle |
| `ui/create/menu/pages/characterPackMenu.js` | L180 | Pack enable/disable check |
| `ui/create/menu/pages/characterPackMenu.js` | L422 | Menu reads from `lib.connectCharacterPack` |
| `ui/create/menu/pages/startMenu.js` | L63-66 | Start menu excludes `connect_characters` from pack list |
| `mode/connect.js` | L26 | `game.switchMode(directstartmode)` |
| `init/polyfill.js` | L455-473 | `randomGets` — copies array, picks without modifying original |
| `init/polyfill.js` | L475-491 | `randomRemove` — removes from original array |

### Extension files
| File | Lines | Relevance |
|------|-------|-----------|
| `extension/yuchengchen/character/character.js` | L5-10 | `ycc_yuchengchen`: `group: "fu"`, 4 HP, 3 skills |
| `extension/yuchengchen/character/characterFilter.js` | L1-3 | Empty filter — no exclusion |
| `extension/yuchengchen/character/index.js` | L13-17 | Correct `game.import("character")` with `connect: true` |
| `extension/yuchengchen/main/precontent.js` | L11-12 | Registers "fu" group via `lib.group.add("fu")` |

### Prior reports
- `20260620-fix-online-extension-registration.md` — prior coder fix (verified normal mode, not purple)
- `20260620-online-selection-pool-missing-ycc.md` — prior explorer RC analysis (identified purple filter)

---

## 13. Runtime Probe Attempt

Attempted to start a session (`ycc-rules`) on port 9222 and 9223. Both attempts failed with `start_failed_early_exit` — the Electron process exits because port 8089 (game HTTP server) is occupied by PID 33780 (another noname instance). This is the known Electron self-exit behavior documented in the CLI tool README.

No further runtime probes were attempted to avoid disrupting the user's live session on port 8089.

---

## 14. Confidence Assessment

| Finding | Confidence | Basis |
|---------|-----------|-------|
| Purple mode group-minimum-12 excludes ycc | **HIGH** | Source code at definitive line numbers, verified by prior explorer |
| Normal/zhong/stratagem modes have no group filter | **HIGH** | Full source trace of all three paths, no group-based filter found |
| `get.charactersOL()` vs selection dialog delta is sampling | **HIGH** | `charactersOL` returns full list; selection dialog uses `randomRemove`/`randomGets` |
| `lib.configOL.banned` is NOT the issue | **MEDIUM** | Prior report verified `charactersOL()` returns ycc, which checks the same `characterDisabled` with `configOL.banned`. If banned, `charactersOL` would NOT return ycc. |
| User's exact sub-mode | **UNKNOWN** | Cannot probe runtime. User screenshot suggests normal mode based on 主/反 identities. |
| Whether the user also encountered purple-mode exclusion | **UNKNOWN** | If the user ever tested purple mode, the group-minimum filter definitively explains non-appearance. |

---

## 15. Report Path

`F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-online-character-selection-rules.md`
