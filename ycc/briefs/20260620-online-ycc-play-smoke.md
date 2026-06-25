# Brief: Online YCC Play Smoke After Registration Fix

## Role

Smoker. Run a focused online/connect-mode smoke test after ycc online discovery
was fixed.

## Objective

Use `tools/noname-test-cli` to enter online/local connect mode, select or place
`ycc_yuchengchen` through the available UI/test route if possible, start/advance
gameplay far enough to observe whether ycc is actually in play, then report bugs
or blockers.

## Prerequisite

Read and rely on:

- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-fix-online-extension-registration.md`

That report claims:

- `lib.connectCharacterPack.includes("ycc") === true`
- `lib.configOL.characterPack.includes("ycc") === true`
- `get.charactersOL().includes("ycc_yuchengchen") === true`
- `online-local-entry` reached local connect character selection and saw
  `ycc_yuchengchen`

## Required Reading

- `F:\AI_project\nameless_game\AGENTS\smoker\ROLE.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\README.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\docs\LLM_GAMEPLAY_PROTOCOL.md`
- `F:\AI_project\nameless_game\noname\docs\yuchengchen-online-spec.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-fix-online-extension-registration.md`

## Probe Rules

- Use a uniquely named CLI session.
- Do not inspect, wait, stop, or mutate any user-owned live smoker/session.
- Prefer real UI/test-route selection via `online-local-entry`, `server-loop`,
  `server-act`, `snapshot`, and `action`.
- Direct JS mutation is allowed only if normal UI selection is blocked; if used,
  label it clearly as debug-only and explain the blocker.
- Clean up all sessions/processes you start, or explicitly report leftovers.

## Questions

1. Is `ycc_yuchengchen` visible in the online/local character-selection route?
2. Can the smoker select or place `ycc_yuchengchen` into play?
3. Does the game progress after ycc is selected?
4. What runtime/UI/skill bugs appear first?
5. If selection or gameplay is blocked, what exact next coder/explorer task is
   needed?

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-online-ycc-play-smoke.md`

Include:

- Exact commands run.
- Whether ycc was visible, selected, and in play.
- First observed bug(s), with reproduction steps.
- Any relevant event/log snippets.
- Cleanup status.

Also put the report path and concise verdict in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code.
- Do not run broad unrelated gameplay tests.
