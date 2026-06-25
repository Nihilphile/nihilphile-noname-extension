# Online YCC Bug Smoke Retry — PASS (No YCC-Specific Bugs Found)

**Date**: 2026-06-21
**Role**: Smoker (ycc group)
**Task Brief**: `F:\AI_project\nameless_game\nihilphile\ycc\briefs\20260621-online-ycc-bug-smoke-retry.md`
**Previous Attempt**: `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260621-online-ycc-bug-smoke.md` (BLOCKED — port 8089 occupied)

---

## Verdict

**PASS — No actionable ycc bug found.** ycc_yuchengchen was selectable in online connect mode. All three skills (亲征, 御策, 龙殛) executed correctly through multiple decision loops. 龙殛 detain/return mechanics, 御策 virtual 杀 trigger, and 亲征 permanent transformation all worked as specified.

---

## Session Details

| Field | Value |
|-------|-------|
| Session name | `ycc-smoke-retry` |
| CDP port | 9224 |
| Session PID | 33088 |
| Server PID | 29180 |
| Cleanup status | Stopped clean |

---

## Environment

| Field | Value |
|-------|-------|
| Game HTTP port 8089 | Free (previous blocker resolved) |
| Node.js | v24.14.1 |
| Game exe | `F:\AI_project\nameless_game\game\noname\noname.exe` (201.1 MB) |
| CLI tool | `tools/noname-test-cli` |
| Browser | Chrome/142.0.7444.265 |

---

## Workflow Executed

### Step 1: Environment Check

```powershell
node bin/cli.js doctor
```

Result: All critical checks passed. Port 8089 free.

### Step 2: Game Launch

```powershell
node bin/cli.js start --session ycc-smoke-retry --port 9224 --hidden
```

Result: PID 33088, CDP on 9224, success. (Port 9223 was in TIME_WAIT; used 9224 instead.)

### Step 3: Online Mode Entry (manual fallback)

The `online-local-entry` command failed at the `click_system_button` step:

```powershell
node bin/cli.js online-local-entry --session ycc-smoke-retry --mode identity --seconds 30
# Result: timeout — system_button_not_found
```

**Root cause**: The command expects `.menubutton` elements inside `#system2`, but the UI uses plain `<div>` children. This is a CLI tool limitation, NOT a ycc bug.

**Workaround**: Manual eval clicks:
```javascript
// Click "启动服务器" div in #system2
document.querySelector('#system2 div').click()

// Click "启" button
document.querySelector('.menubutton.round.highlight').click()
```

Both clicks succeeded. Character selection reached with 21 candidates including ycc_yuchengchen.

### Step 4: Character Selection

ycc_yuchengchen (御承宸 4HP 群) visible. Skill IDs: ycc_huangming, ycc_yuce, ycc_qinzheng. Group: qun.

```powershell
node bin/cli.js action --session ycc-smoke-retry --json '{"type":"selectButton","buttonId":"2850003424"}'
```

Result: Selected. Game started with 8 players. Identity: 反 (fan). Seat: 4.

### Step 5: Observer Server

```powershell
node bin/cli.js server-start --session ycc-smoke-retry --choice-timeout-sec 120
```

Result: Server PID 29180, connected.

### Step 6: Gameplay — 亲征 (qinzheng) Activation

Activated 亲征 ultimate skill. HP 4/4 → 3/3. Skills changed: ycc_huangming + ycc_qinzheng → ycc_handlimit + ycc_longji. Control button removed after use.

Verdict: **PASS**

### Step 7: Gameplay — 杀 + 龙殛 (longji) Trigger

Used 杀 (heart 7) on zus_change at seat 5. 龙殛 triggered: target showed all 4 hand cards. Detained diamond2tao. Fire damage dealt (heart 杀 = fire). Target HP 3→2.

Verdict: **PASS**

### Step 8: Gameplay — 御策 (yuce) at End of Play Phase

Ended play phase. 御策 triggered because hand count (5) was highest. Offered virtual 杀. Confirmed.

Verdict: **PASS**

### Step 9: Gameplay — Virtual 杀 + 龙殛 Re-trigger

Virtual 杀 (colorless, no suit) targeted same player. 龙殛 triggered again. Target showed remaining 3 cards. Detained spade1shandian. Target HP 2→1.

Verdict: **PASS**

### Step 10: Turn End — 龙殛 Card Return

Discard phase: discarded huogong. End phase: 龙殛 return triggered. Both detained cards (diamond2tao, spade1shandian) returned to target.

Verdict: **PASS**

### Step 11: Ongoing Game

Responded to 南蛮入侵 with 杀. Game progressed to round 2. Character dying event triggered (unrelated to ycc). No ycc-specific issues observed.

---

## Bug Assessment

### No YCC-Specific Bugs Found

| Skill | Verification | Status |
|-------|-------------|--------|
| 亲征 (ycc_qinzheng) | Lost 1 max HP, lost 皇命, gained 龙殛 + hand limit +1 | PASS |
| 御策 (ycc_yuce) | Triggered at end of play phase; offered virtual 杀 when hand count was highest | PASS |
| 龙殛 (ycc_longji) | Triggered on 杀 use; target showed hand; card detained; returned at turn end | PASS |
| 龙殛 on virtual 杀 | Correctly triggered on 御策 virtual 杀 | PASS |
| 龙殛 return timing | Cards returned during end phase of current turn | PASS |
| Online selection | ycc_yuchengchen appeared in connect mode character selection (group=qun) | PASS |

### Non-YCC Issue: CLI online-local-entry command

`online-local-entry` failed at `click_system_button` step: `system_button_not_found`. The game's `#system2` uses plain `<div>` elements, not `.menubutton` class elements. This is a CLI tool limitation.

**Impact**: Requires manual eval clicks. `online-reroll-character` may encounter the same issue.

---

## Coverage Summary

| Test Goal | Reached? | Evidence |
|-----------|----------|----------|
| Start online/connect-mode smoke | Yes | Game started on port 9224 |
| ycc selectable and selected | Yes | First draw included ycc (qun group fix working) |
| Gameplay reached | Yes | 5+ decision loops across 2 rounds |
| ycc skill runtime errors | None found | All 3 skills executed without errors |
| Stuck prompts / unusable actions | None found | All prompts actionable |
| Incorrect visible skill behavior | None found | All behaviors matched spec |
| Online selection/restart failures | Minor | CLI command issue, not ycc |
| Extension/character load regressions | None found | ycc loaded correctly in connect mode |

---

## Cleanup Status

- Observer server stopped (PID 29180)
- Game process stopped (PID 33088)
- State file cleaned
- No orphaned processes
- User-owned sessions: not touched

---

## Recommended Next Task

1. Accept this smoke as PASS for ycc skills in online mode.
2. Fix `online-local-entry` `click_system_button` to support plain `<div>` buttons in `#system2`.
3. Future smoke: test 皇命 (ycc_huangming) before 亲征 activation.
4. Test ycc in purple mode (3v3v2) gameplay.

---

## Report Path

`F:\AI_project\nameless_game\nihilphile\ycc\reports\20260621-online-ycc-bug-smoke-retry.md`
