# Brief: Map Noname Online Character Selection Rules

## Role

Explorer. Do not edit project files.

## Objective

Build a decision-grade map of noname online/connect-mode character selection
rules. This is broader than ycc: explain how room settings and identity sub-modes
produce the final selectable character buttons, then identify where ycc can be
excluded.

## Background

Current ycc state:

- Online room settings can show and enable the `御承宸` pack.
- `get.charactersOL()` was previously verified to include `ycc_yuchengchen` after
  the online registration fix.
- Manual smoke still found `ycc_yuchengchen` never appears in the actual online
  selection dialog, even after repeated refreshes.
- A previous explorer found a purple-mode group-minimum filter (`map[i].length <
  12`) that removes small groups like `fu`, but the user's screenshot appears
  closer to a standard identity room (`主`/`反`), so do not assume purple mode is
  the whole answer.

## Required Reading

- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-fix-online-extension-registration.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-online-selection-pool-missing-ycc.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\README.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\docs\LLM_GAMEPLAY_PROTOCOL.md`

Primary source files:

- `F:\AI_project\nameless_game\game\noname\resources\app\mode\identity.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\game\index.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\get\index.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\library\index.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\ui\create\menu\pages\characterPackMenu.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\character\character.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\character\characterFilter.js`

## Questions

1. What room settings are copied into `lib.configOL` when online identity mode starts?
2. How does `lib.configOL.characterPack` relate to the visible online pack menu?
3. What is the dispatch table for online identity sub-modes?
   - `normal`
   - `zhong`
   - `stratagem`
   - `purple`
   - any other relevant sub-mode
4. For each sub-mode, what source list is used before candidate sampling?
5. For each sub-mode, what filters are applied?
   - `characterDisabled`
   - ban lists
   - group/势力 filters
   - double character filters
   - lord/identity-specific filters
   - rank/sort/rarity filters if any
6. How is the final candidate button list sampled, and how does refresh work?
7. Under which exact rule(s) can `ycc_yuchengchen` be excluded even though the
   pack is enabled and `get.charactersOL()` includes it?
8. What should the next coder patch be, and what should be deferred?

## Runtime Probe

You may start your own uniquely named CLI sessions if needed. Do not touch any
user-owned live session or older smoker.

Useful probes may include:

- fresh online-local-entry
- eval of `_status.mode`, `lib.configOL`, `get.charactersOL()`
- event/current selection state near the selection dialog if reachable

Clean up any sessions/processes you start, or report leftovers.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-online-character-selection-rules.md`

The report should contain:

- A concise flow diagram or numbered pipeline.
- A per-sub-mode table of source list, filters, sampling, and ycc risk.
- The most likely explanation for the user's manual smoke result.
- Exact source references.
- A minimal next patch recommendation.
- A verification plan for that patch.

Also put the report path and one-sentence verdict in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code.
- Do not run broad unrelated gameplay smoke testing.
- Avoid duplicating older reports; cite them and add the missing rule map.
