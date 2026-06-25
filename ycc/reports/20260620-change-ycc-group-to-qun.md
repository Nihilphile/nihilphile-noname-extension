# Change YCC Group To Qun — Implementation Report

**Date**: 2026-06-20
**Role**: Coder (ycc group)
**Task Brief**: `F:\AI_project\nameless_game\nihilphile\ycc\briefs\20260620-change-ycc-group-to-qun.md`

---

## Verdict

**Group changed from `fu` to `qun`.** Both source and runtime files updated. Runtime verification confirms `lib.character.ycc_yuchengchen[1] === "qun"`. This moves ycc from a 1-character custom group into the built-in `qun` group (~67 characters), which should bypass the purple-mode `< 12` group-minimum filter and improve normal-mode selection probability.

---

## Files Changed

| File | Change |
|------|--------|
| `noname/apps/core/extension/yuchengchen/character/character.js` | Line 7: `group: "fu"` → `group: "qun"` |
| `game/noname/resources/app/extension/yuchengchen/character/character.js` | Line 7: `group: "fu"` → `group: "qun"` |

No other files modified. The `fu` group registration in `precontent.js` was not removed per task constraints.

---

## Verification Evidence

### Static Checks (Both Files)

```
noname/apps/core/extension/yuchengchen/character/character.js L7: group: "qun"
game/noname/resources/app/extension/yuchengchen/character/character.js L7: group: "qun"
```

Both files confirmed identical and correct.

### Runtime Verification

**Session**: `ycc-qun-v3` (port 9227, PID 28940)
**Tool**: `tools/noname-test-cli` (`node bin/cli.js`)

**Step 1: Start and bootstrap**
```powershell
node bin/cli.js start --session ycc-qun-v3 --port 9227 --hidden --allow-occupied-game-port
node bin/cli.js watch --session ycc-qun-v3 --seconds 30 --dialog accept
```
Result: Game loaded on `http://localhost:8089/index.html`. No dialogs captured.

**Step 2: Enter connect mode** (characters only load after mode entry)
```powershell
node bin/cli.js online-local-entry --session ycc-qun-v3 --mode identity --seconds 20
```
Result: Entered connect mode (`connectMode: true`). Character data loaded (2431 characters).

**Step 3: Verify ycc group**
```javascript
const m = await import('./noname.js');
const ycc = m.lib.character.ycc_yuchengchen;
return { ycc_exists: !!ycc, ycc_group: ycc[1], char_count: Object.keys(m.lib.character).length, pack_has_ycc: !!m.lib.characterPack.ycc };
```

Result:
```json
{"ycc_exists":true,"ycc_group":"qun","char_count":2431,"pack_has_ycc":true}
```

- **`ycc_group: "qun"`** — **PASS**
- **`ycc_exists: true`** — **PASS**
- **`pack_has_ycc: true`** — **PASS**

**Step 4: `get.charactersOL()` check** — NOT REACHABLE

`get.charactersOL()` requires `lib.configOL` which is populated only after full identity room entry (`switchMode("identity")`). The CLI's `online-local-entry` failed to complete the UI navigation (system button not found). This is a test infrastructure limitation, not a code defect. The explorer report confirms that `charactersOL` uses the same source as the selection dialog (`lib.configOL.characterPack`), which derives from `lib.connectCharacterPack` — already confirmed to include `"ycc"`.

**Step 5: Cleanup**
```powershell
node bin/cli.js stop --session ycc-qun-v3
```
Session stopped cleanly. No orphaned processes.

---

## What Changed and Why

### Hypothesis

The prior explorer report (`20260620-online-character-selection-rules.md`) identified:

1. **Purple mode**: The group-minimum filter (`map[i].length < 12`) deletes the 1-character `fu` group entirely → ycc never appears.
2. **Normal/zhong/stratagem modes**: No group-based filter exists, but ycc non-appearance is random sampling probability (~15% per 8-player game from a ~200+ character pool).

Moving ycc to `qun` (a built-in group with ~67 characters) addresses both:
- Purple mode: `qun` group has `length >> 12` → passes the filter
- Normal mode: being grouped as `qun` may affect faction-based sampling; in the worst case, ycc remains a random-probability entry but is no longer isolated in a 1-character group

### Delta from Prior Fix

The prior coder fix (`20260620-fix-online-extension-registration.md`) ensured ycc was in `lib.connectCharacterPack` and `lib.configOL.characterPack`. That fix was necessary but insufficient for purple mode. This change addresses the group isolation root cause.

---

## Remaining Risk

| Risk | Assessment |
|------|------------|
| `fu` group registration still exists | `precontent.js` still creates the `fu` group. This is harmless — it's an unused group definition with no members. Can be cleaned up later if the experiment becomes final. |
| Gameplay semantics | Changing group from `fu` to `qun` may affect faction-specific mechanics (if any rely on `lib.character[i][1]`). No such mechanics were identified for `fu` in the source; `qun` is the standard neutral faction. |
| `qun` group membership | ycc will now appear alongside standard qun characters in faction UI. This is the intended experimental behavior. |
| Purple mode filter | The `< 12` threshold in identity.js L1041/L1230 still exists. With ycc now in `qun` (~67 chars), this filter is a non-issue. However, if other extension characters are in small groups, the same problem recurs. Consider the explorer's recommendation to change `< 12` → `< 1` in a separate task. |

---

## Recommendation for User Smoke Test

1. **Refresh/recreate online room** — start a fresh online identity room.
2. **Check selection dialog** — verify ycc_yuchengchen (御承宸) appears in the character selection candidates.
3. **Test purple mode** — if possible, switch identity mode to purple (3v3v2) and confirm ycc appears as a `qun` faction character.
4. **Test normal mode** — standard identity room with 主/反 identities; confirm ycc appears at reasonable frequency (may need multiple games due to random sampling of ~200+ pool).

---

## Report Path

`F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-change-ycc-group-to-qun.md`
