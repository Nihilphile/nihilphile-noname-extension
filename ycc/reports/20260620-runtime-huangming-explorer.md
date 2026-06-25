# Exploration Report — 【皇命】 Runtime Test Route

**Date**: 2026-06-20
**Based on**: Brief `20260620-runtime-huangming-explorer.md`, Historical results HM-E1/HM-R2/B6/B7, CLI source `online-local-entry.js`, Runtime probes with `noname-test-cli`

---

## Questions Investigated

1. Which `noname-test-cli` commands can load the game with yuchengchen extension enabled?
2. Can the CLI reach a controlled state for `ycc_huangming` skill testing?
3. If yes, what exact command sequence?
4. If no, what is the narrow blocker, and what smaller check is feasible?

---

## Confirmed Facts

### Fact 1: Extension loads automatically — no CLI flags needed

**Evidence**: `precontent.js` (line 12-14) pushes `"ycc"` into `lib.config.characters` at boot, before `loadCharacter` runs. This was "方案 A" (R3/B5). The character index (`character/index.js`) uses `game.import("character", { name: "ycc", connect: true, ... })`.

Prior result B6 (`20260614-062228-400`) confirmed 7/7 gate checks passed: `ycc: true` (character in `lib.character`), `skills: true` (4 skills loaded), `fu: true` (fu group registered).

CLI path for extension load verification works:
```powershell
node bin/cli.js start --session test --port 9222
node bin/cli.js game-info --session test
# ESM bridge succeeds — confirms lib/game/get/ui accessible
```

### Fact 2: `connect: true` restricts ycc to connect-mode character selection

**Evidence**: Runtime probe `server-setup-mode --mode identity` → `server-loop` showed character candidates exclusively as `zus_*` characters (嬴政, 嘎子, 马孔, 科比 etc.). After clicking "自由选将", different zus_* characters appeared but STILL no ycc_yuchengchen.

Root cause: `character/index.js:16` — `connect: true`. Noname engine filters connect-only packs from single-player character selection UI. Character IS in `lib.character` (B6 gates), but UI hides it.

### Fact 3: `online-local-entry` selectors mismatched with current game UI

**Evidence**: Runtime probe with fresh game session on port 9225:
```
Step 1: enter_connect_mode → connect_clicked, matched: true  ✅
Step 2: click_system_button → system_button_not_found,
        #system2 container not found, waitedMs: 2000  ❌
Step 3: click_menu_start → menu_start_button_not_found,
        No visible .menubutton elements found  ❌
```

Post-polling: `connectMode: true`, 3 character candidates (lijue, litong, mb_dilu) — simple/local room, NOT connect-mode character selection. System bar: ["退出房间", "房间设置", "聊天"].

**Source analysis** (`online-local-entry.js`):
- Line 170: `#system2` selector — NOT found by `_waitForSelector`
- Line 99-107: `.menubutton.large` with text "联机" — FOUND (Step 1 succeeded)
- Via `clickMenuStartButton`: `.menubutton` for "启" — NOT found

The click on "联机" entered a simple room rather than old connect-mode flow. Game UI has changed.

### Fact 4: No scenario/card manipulation in CLI

`scenario-prepare` only patches `mode_config` keys: free_choose, change_identity, change_choice, player_number, identity_mode. No card manipulation, phase control, or event triggering.

### Fact 5: 【皇命】 skill code is ready and reviewed

HM-R2 (`20260614-065312-475`) accepted all 3 fixes. Skill trigger: `{ player: "useCardToPlayered" }`, filter `card.name === "sha"`, `direct: true`. Flow: derive target → chooseCharacter → chooseControl (option 1: sha+give, option 2: discard). Engine paths verified against `content.js:2569-2718` and `index.js:11336-11343`.

### Fact 6: Prior B6 test only verified load, not gameplay

B6 exitCode=0, 7/7 gates passed, but zero gameplay interaction. Manifest §6.2: "缺少对局控制能力".

---

## Inferences

### I1: Connect mode is the only path to select ycc_yuchengchen

`connect: true` filters ycc out of single-player selection. `online-local-entry` (or fixed variant) is mandatory.

### I2: `online-local-entry` needs selector updates

Old flow: Menu → "联机" → "启动服务器" → "启" → connect mode characters.
Current behavior: Menu → "联机" → enters simple room directly (no intermediate buttons).
Diagnostic framework in the code can guide fix — failed selectors are logged.

### I3: Controlled sha-trigger is not programmable

CLI has no API to give cards, force phases, or force targets. Only "passive fishing" works: start game with ycc, let AI play, poll for huangming prompts. Probabilistic and timing-dependent.

### I4: `eval`-based workaround is fragile

`eval` can execute arbitrary JS but bypasses normal UI path. Debug hack, not reliable test.

---

## Remaining Unknowns

1. **Current game UI structure for connect mode** — exact DOM selectors for entering character selection. Needs UI mapping explorer.
2. **`server-loop` detection of `direct` skill prompts** — does it expose `chooseBool()` as `awaitingInput` with correct `actions[]`? Not verified (never reached trigger state).
3. **AI auto-play disable reliability** — `server-act --json '{"type":"auto","enable":false}'` should work but untested in huangming context.
4. **Two-client approach viability** — legacy B6 Puppeteer script may bypass selector issue.

---

## Feasible Options

### Option A: Fix `online-local-entry` selectors (Recommended)

Update selectors in `online-local-entry.js` for current game UI. Effort: explorer maps DOM → coder updates selectors. Risk: Low — diagnostic framework exists, Phase 2 polling verifies target state.

### Option B: Revive legacy dual-client Puppeteer test

Use B6 `dual-online-test.cjs` which navigates UI via Puppeteer CDP. Effort: verify it works, add huangming interaction. Risk: Medium — fragile to game UI changes.

### Option C: `eval`-based gameplay simulation

Use `eval` to manipulate game state directly. Effort: understand internal APIs → script trigger. Risk: High — bypasses normal UI, fragile.

### Option D: Passive polling (immediate, no code changes)

Accept current simple-room state, poll `event.changed` via `server-loop`/`agent-events` to observe useCard events. Confirms CLI observation pipeline works. Risk: Low — won't test huangming but validates infrastructure.

---

## Decision Inputs for Orchestrator

1. **`online-local-entry` is the narrow bottleneck.** Selector fix would unlock ycc character selection and 【皇命】 testing.
2. **Two-phase approach recommended:** Phase 1: fix selectors → verify ycc candidates → select ycc. Phase 2: passive 【皇命】 detection via server-loop polling.
3. **Controlled trigger is NOT achievable with current CLI.** Even after selector fix, testing stays passive/polling-based. Full control needs game-state manipulation that does not exist.
4. **Immediate feasible check:** Option D — monitor `event.changed` in simple room, verify CLI observation pipeline. Zero code changes, zero false positives.

---

## Next Worker Task Suggestion

**Role**: Explorer (UI mapping)

**Task**: Map the current noname game UI flow from main menu → connect mode → character selection. Identify correct DOM selectors (element types, classes, link attributes, text content) for each step. Deliverable: selector → click target mappings for `online-local-entry.js`.

**Input needed**: Start game session, use `server-start`, navigate UI, document DOM at each step.

**Based on prior**: HM-E1, this report, `online-local-entry.js` source line 29-239.