# Brief: Online YCC Bug Smoke

## Role

Smoker. Do not edit source code.

## Objective

Use the updated `tools/noname-test-cli` and the new online extension behavior to
actually select `ycc_yuchengchen`, enter an online game, and identify the first
actionable ycc bug(s).

## Current Context

The user has made two important updates after the previous reports:

- A new online extension is enabled by default. When online is allowed, the
  character pool is changed to all available characters.
- `noname-test-cli` now has a fast online-mode restart feature. Its usage is
  documented in the CLI docs.
- With those changes, ycc can basically be selected. If ycc is taken by the lord
  or random luck is bad, use the fast restart route.

The orchestrator intentionally has not read the updated CLI docs. You should read
the current CLI documentation yourself and use the documented updated workflow.

## Required Reading

- `F:\AI_project\nameless_game\AGENTS\smoker\ROLE.md`
- Updated docs under `F:\AI_project\nameless_game\tools\noname-test-cli`
- `F:\AI_project\nameless_game\noname\docs\yuchengchen-online-spec.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-fix-online-extension-registration.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-change-ycc-group-to-qun.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-online-character-selection-rules.md`

## Test Goals

1. Start online/connect-mode smoke using the updated CLI workflow.
2. Use the fast restart feature as needed until `ycc_yuchengchen` is selectable
   by the controlled player.
3. Select `ycc_yuchengchen`.
4. Enter actual gameplay and advance enough to observe ycc behavior.
5. Prioritize actionable bug discovery:
   - extension/character load bugs
   - online selection or restart bugs
   - ycc skill runtime errors
   - stuck prompts / unusable actions
   - incorrect visible skill behavior
6. If a bug appears, capture the shortest reproduction sequence.

## Suggested Focus

Do not spend the whole task proving registration again. Assume the recent
registration fixes are mostly correct unless runtime contradicts them.

Focus on the first real gameplay blocker or skill bug. If no bug appears quickly,
play/advance several decision loops and report that baseline online ycc smoke
passed for the covered scope.

## Probe Rules

- Use a uniquely named CLI session.
- Do not inspect, wait, stop, or mutate any user-owned live session outside your
  own test session.
- Clean up any sessions/processes you start, or explicitly report leftovers.
- Do not edit source code.
- If the CLI's new fast restart docs are unclear, report the doc ambiguity and
  use the nearest safe documented command route.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260621-online-ycc-bug-smoke.md`

Include:

- CLI commands/workflow used, especially the new fast restart route.
- Whether ycc was selectable and selected.
- Whether the game entered actual gameplay.
- First observed ycc bug(s), with reproduction steps and logs/events.
- If no bug was found, exact smoke coverage.
- Cleanup status.
- Recommended next worker task: coder, explorer, or smoker.

Also put the report path and concise verdict in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code.
- Do not duplicate older registration reports except to cite prerequisites.
