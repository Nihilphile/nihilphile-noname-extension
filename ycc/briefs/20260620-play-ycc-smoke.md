# Brief: Play YCC Runtime Smoke

## Role

Smoker. Run the smallest real gameplay smoke after the runtime registration task
has succeeded.

## Objective

Start the game through `tools/noname-test-cli`, actually place or select
`ycc_yuchengchen` into a game if reachable, play until at least one meaningful
turn/interaction is observed, and report bugs or blockers.

## Prerequisite

Do not start until this report exists and says runtime registration succeeded:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-register-ycc-runtime.md`

## Questions

1. Can a fresh CLI-launched game see `ycc_yuchengchen`?
2. Can `ycc_yuchengchen` be selected or otherwise placed into play through the
   current available UI/test route?
3. Once in play, what visible/runtime bugs appear?
4. If ycc cannot be selected, what is the narrow blocker and what exact route
   should the next worker explore or implement?

## Required Reading

- `F:\AI_project\nameless_game\AGENTS\smoker\ROLE.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-register-ycc-runtime.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\README.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\docs\LLM_GAMEPLAY_PROTOCOL.md`
- `F:\AI_project\nameless_game\noname\docs\yuchengchen-online-spec.md`

## Suggested Route

Use the CLI gameplay server loop where possible:

- `start`
- `server-start`
- `server-loop`
- `server-act`
- `server-context`
- `agent-events`

Prefer real UI/gameplay interaction over direct JS mutation. If direct mutation
is the only route to place ycc in play, clearly mark it as a debug-only smoke
and explain why normal selection is blocked.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-play-ycc-smoke.md`

Include:

- Exact commands run.
- Whether ycc was visible, selected, and in play.
- Any observed bugs with reproduction steps.
- Any screenshots/log paths only if they are actually useful.
- Cleanup status for sessions/processes.

Also put the report path in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code.
- Stop or report any sessions you start.
