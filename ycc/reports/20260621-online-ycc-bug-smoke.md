# Online YCC Bug Smoke — Blocked

**Date**: 2026-06-21
**Role**: Smoker (ycc group)
**Task Brief**: `F:\AI_project\nameless_game\nihilphile\ycc\briefs\20260621-online-ycc-bug-smoke.md`

---

## Verdict

**BLOCKED.** Cannot start a game instance because port 8089 (game HTTP server) is occupied by a user-owned `noname.exe` (PID 21692). Electron self-exits on port conflict. Smoker rules prohibit touching user-owned sessions outside the test session.

---

## Session Details

| Field | Value |
|-------|-------|
| Session name | `ycc-bug-smoke` |
| CDP port attempted | 9223 |
| CC_Crew state | `blocked` |

---

## Blocker Description

### Environment

- **Game HTTP port 8089**: Occupied by PID 21692 (`noname.exe`), 8 established connections + 2 listeners. Actively serving.
- **Existing CDP port 9222**: Not accessible.
- **Node.js**: v24.14.1
- **Game exe**: Confirmed at `F:\AI_project\nameless_game\game\noname\noname.exe` (201.1 MB)

### What was tried

1. `node bin/cli.js doctor` — prerequisites pass; detected port 8089 occupied by PID 21692
2. `node bin/cli.js start --session ycc-bug-smoke --port 9223 --hidden --allow-occupied-game-port` (attempt 1, PID 41136)
   - Spawn succeeded, CDP DevTools briefly listening on ws://127.0.0.1:9223
   - stdout: "Server listening on port 8089"
   - Process self-exited within ~3s (exit code 0): `start_failed_early_exit`
3. `node bin/cli.js start --session ycc-bug-smoke --port 9223 --hidden --allow-occupied-game-port` (attempt 2, PID 27604)
   - Same result: brief CDP listen, early exit within ~3s

### Root Cause

`noname.exe` is an Electron app with a hardcoded HTTP server on port 8089. When another instance already owns port 8089, Electron detects the conflict and self-exits. The `--allow-occupied-game-port` flag bypasses the preflight check but cannot prevent the underlying Electron behavior. This is a known limitation documented in the CLI tool.

### Why unresolvable within scope

Per smoker probe rules: "Do not inspect, wait, stop, or mutate any user-owned live session outside your own test session." PID 21692 is a user-owned live session. Killing it would violate this constraint. Waiting indefinitely is not permitted.

---

## Intended Workflow (not executed)

Based on the updated `tools/noname-test-cli` docs (Path B + fast restart):

```powershell
# 1. Start game
node bin/cli.js start --session ycc-bug-smoke --port 9223

# 2. Fast online restart: reroll until ycc_yuchengchen appears
node bin/cli.js online-reroll-character --session ycc-bug-smoke --want ycc_yuchengchen --max-attempts 200 --seconds 20

# 3. Start observer server
node bin/cli.js server-start --session ycc-bug-smoke --choice-timeout-sec 120

# 4. Gameplay loop
node bin/cli.js server-loop --session ycc-bug-smoke --cursor 0 --compressed-level 4 --skill-detail on
node bin/cli.js server-act --session ycc-bug-smoke --json '...'

# 5. Cleanup
node bin/cli.js server-stop --session ycc-bug-smoke
node bin/cli.js stop --session ycc-bug-smoke
```

---

## Documents Reviewed

| Document | Key takeaway |
|----------|-------------|
| `tools/noname-test-cli/README.md` | Updated `online-reroll-character` (fast restart) docs; Path B workflow |
| `noname/docs/yuchengchen-online-spec.md` | ycc char spec: 御承宸, 4HP, skills 皇命/御策/亲征/龙殛, group now qun |
| `reports/20260620-fix-online-extension-registration.md` | Online discovery fix confirmed: ycc in connectCharacterPack + configOL.characterPack + charactersOL() |
| `reports/20260620-change-ycc-group-to-qun.md` | Group changed fu → qun; purple-mode filter bypassed |
| `reports/20260620-online-character-selection-rules.md` | Normal mode: ycc in pool, random-sampling probability determines appearance |

---

## Cleanup Status

- Stale session `ycc-smoke` state file cleaned
- No test session successfully started — no orphaned processes or state
- User session (PID 21692) not touched

---

## Recommended Next Task

**Orchestrator**: Resolve port 8089 conflict. Options: (a) coordinate with user to free port 8089, (b) enable CDP on existing session, (c) implement configurable HTTP port. Once resolved, re-run this smoke (smoker, ycc group).

---

## Report Path

`F:\AI_project\nameless_game\nihilphile\ycc\reports\20260621-online-ycc-bug-smoke.md`
