# Brief: Online YCC Bug Smoke Retry

## Role

Smoker. Do not edit source code.

## Objective

Retry the online ycc gameplay smoke now that the user asked to continue. Use the
updated `tools/noname-test-cli` docs, especially the online fast restart route,
to select `ycc_yuchengchen`, enter gameplay, and identify the first actionable
ycc bug.

## Context

Previous attempt:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\20260621-online-ycc-bug-smoke.md`

It was blocked because port 8089 was occupied by a user-owned noname process.
Try again from scratch. If 8089 is still occupied by a user-owned session, report
blocked again and do not touch that session.

## Required Reading

- `F:\AI_project\nameless_game\AGENTS\smoker\ROLE.md`
- Updated docs under `F:\AI_project\nameless_game\tools\noname-test-cli`
- `F:\AI_project\nameless_game\noname\docs\yuchengchen-online-spec.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-fix-online-extension-registration.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-change-ycc-group-to-qun.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-online-character-selection-rules.md`

## Test Goals

1. Start online/connect-mode smoke using the current documented CLI workflow.
2. Use the fast restart/reroll feature as needed until `ycc_yuchengchen` is
   selectable by the controlled player.
3. Select `ycc_yuchengchen`.
4. Enter actual gameplay and advance several decision loops.
5. Capture the first actionable bug, prioritizing:
   - ycc skill runtime errors
   - stuck prompts or unusable actions
   - incorrect visible skill behavior
   - online selection/restart failures
   - extension/character load regressions

## Probe Rules

- Use a uniquely named CLI session.
- Do not inspect, wait, stop, or mutate any user-owned live session outside your
  own test session.
- Clean up any sessions/processes you start, or explicitly report leftovers.
- Do not edit source code.
- If blocked, clearly state the blocking process/port and what was attempted.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260621-online-ycc-bug-smoke-retry.md`

Include:

- CLI commands/workflow used, especially fast restart/reroll.
- Whether ycc was selectable and selected.
- Whether gameplay was reached.
- First observed bug(s), with reproduction steps and logs/events.
- If no bug was found, exact smoke coverage.
- Cleanup status.
- Recommended next worker task.

Also put the report path and concise verdict in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code.
- Do not duplicate older reports except to cite prerequisites.
