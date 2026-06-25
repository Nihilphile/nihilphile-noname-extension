# Brief: Runtime Test Route For Huangming

## Role

Explorer. Do not edit project files.

## Objective

Find the smallest reliable route to runtime-test 御承宸 skill 【皇命】 with
`tools/noname-test-cli`. The orchestrator needs an executable plan, not an
implementation.

## Scope

Answer these questions:

1. Which `noname-test-cli` commands and session flow can load the game with the
   `yuchengchen` extension enabled?
2. Can the CLI reach a controlled state where `ycc_yuchengchen` uses 【皇命】 in
   response to another player using `sha`?
3. If yes, what exact command sequence or test-script shape should a coder use?
4. If no, what is the narrow blocker, and what smaller runtime check is still
   feasible now?

## Required Reading

Read only what is needed to avoid duplicate work:

- `F:\AI_project\nameless_game\nihilphile\ycc\README.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\refs.md`
- `F:\AI_project\nameless_game\AGENTS\explorer\ROLE.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\README.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\docs\LLM_GAMEPLAY_PROTOCOL.md`
- `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen\character\skill.js`

Historical result paths for provenance only:

- `F:\AI_project\Claude_worker_ver1\store\ycc-test-worker\results\20260614-064856-617.result.md`
- `F:\AI_project\Claude_worker_ver1\store\ycc-huangming-reviewer\results\20260614-065312-475.result.md`
- `F:\AI_project\Claude_worker_ver1\store\ycc-huangming-explorer\results\20260614-063547-210.result.md`

Do not summarize these historical reports unless they directly affect the new
test route.

## Output

Write one new incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-runtime-huangming-explorer.md`

The report should contain:

- Confirmed facts with file paths and, where useful, line references.
- Minimal command sequence attempted or proposed.
- Whether a controlled 【皇命】 runtime test is currently reachable.
- Any blocker precise enough for an orchestrator to route to coder or explorer.
- A short "next worker task" suggestion.

Also put the report path in your final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code or coordination docs except for your single report.
- Do not duplicate old findings; cite old result paths instead.
- Prefer command-level evidence over broad architectural description.
