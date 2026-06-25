# Brief: Map Current Online Local Entry UI

## Role

Explorer. Do not edit project files.

## Objective

Map the current noname game UI path needed by
`tools/noname-test-cli/src/online-local-entry.js` so a later coder can fix the
selector mismatch without guessing.

## Background

The previous runtime explorer report found that 【皇命】 runtime testing is
blocked before gameplay:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-runtime-huangming-explorer.md`

Observed failure:

- Clicking "联机" succeeds.
- `#system2` is not found.
- `.menubutton` with "启" is not found.
- The game appears to enter a simple/local room instead of the expected connect
  character-selection flow.

## Questions

1. What is the current DOM/state flow from a fresh game page to the online local
   room or connect-mode character selection?
2. Which visible elements should replace the old selectors in
   `online-local-entry.js`?
3. Is there still a route from current UI to character selection where
   `ycc_yuchengchen` can be selected?
4. If the route no longer exists, what is the smallest reliable alternative for
   loading a room/game state with connect-only characters?

## Required Reading

- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-runtime-huangming-explorer.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\README.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\docs\LLM_GAMEPLAY_PROTOCOL.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\src\online-local-entry.js`
- `F:\AI_project\nameless_game\AGENTS\explorer\ROLE.md`

## Suggested Probe Route

Use `node bin/cli.js start`, `server-start`, `online-local-entry`, `eval`, and
DOM snapshots as needed. Prefer command-level evidence and concise DOM excerpts
over broad screenshots.

Do not leave long-running sessions behind if you start them.

## Output

Write one new incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-online-local-entry-ui-map.md`

The report should include:

- Exact commands run.
- DOM/state observations for each navigation step.
- Selector mapping candidates with evidence.
- Whether `ycc_yuchengchen` selection is reachable.
- A minimal patch plan for a coder, if reachable.
- A precise blocker and next task, if not reachable.

Also put the report path in your final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code or coordination docs except for your single report.
- Do not duplicate the previous runtime report; cite it and only add new UI
  mapping evidence.
