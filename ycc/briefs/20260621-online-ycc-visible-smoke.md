# Brief: Visible Online YCC Smoke

## Role

Smoker. Do not edit source code.

## Objective

Run another online ycc smoke with the game window visible so the user can watch
the operation. Verify whether the repaired CLI flow can enter online mode without
manual eval fallback, select `ycc_yuchengchen`, and advance gameplay.

## Context

The previous successful smoke:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\20260621-online-ycc-bug-smoke-retry.md`

It passed ycc gameplay but used eval fallback because `online-local-entry` failed
at the system button step. The user says this may now be fixed and wants a
visible run to observe how the workflow operates.

## Required Reading

- `F:\AI_project\nameless_game\AGENTS\smoker\ROLE.md`
- Updated docs under `F:\AI_project\nameless_game\tools\noname-test-cli`
- `F:\AI_project\nameless_game\noname\docs\yuchengchen-online-spec.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260621-online-ycc-bug-smoke-retry.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-change-ycc-group-to-qun.md`

## Test Goals

1. Start the game visibly. Use `--visible`; do not use `--hidden`.
2. Use the current documented online CLI workflow.
3. Prefer the repaired `online-local-entry` / fast restart / reroll commands.
4. Select or reroll until `ycc_yuchengchen` is available to the controlled player.
5. Select `ycc_yuchengchen` and advance gameplay for a few decision loops.
6. Note whether the fixed CLI path worked without eval fallback.

## Visibility Rules

- The game window must be visible.
- Add short waits between major UI-changing commands when practical so the user
  can see the flow.
- Do not intentionally hide, minimize, or kill the visible window until cleanup.
- Cleanup at the end unless the test is blocked or the user clearly wants to keep
  the window open. If unsure, clean up and report.

## Probe Rules

- Use a uniquely named CLI session.
- Do not inspect, wait, stop, or mutate any unrelated user-owned live session.
- Do not edit source code.
- If port 8089 is occupied by an unrelated user session, report blocked and do
  not kill it.
- If the repaired CLI path fails and eval fallback is needed, clearly label that
  as a CLI issue, not a ycc issue.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260621-online-ycc-visible-smoke.md`

Include:

- Visible workflow commands used.
- Whether `online-local-entry` / fast restart worked without eval fallback.
- Whether ycc was selectable, selected, and gameplay reached.
- Any ycc bug or CLI bug observed.
- Cleanup status.
- Recommended next task.

Also put the report path and concise verdict in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code.
- Do not duplicate older reports except to cite prerequisites.
