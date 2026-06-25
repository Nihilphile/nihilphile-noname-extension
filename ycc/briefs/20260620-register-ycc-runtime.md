# Brief: Register YCC Into Runtime Game

## Role

Coder. Implement only the minimum needed to make `ycc_yuchengchen` available in
the game launched by `tools/noname-test-cli`.

If the path is ambiguous or the implementation risk is higher than a small
deployment/registration change, stop and report the blocker instead of guessing.

## Objective

Make the current packaged game runtime load the `yuchengchen` extension so a
fresh `noname-test-cli` session can observe:

```js
lib.character.ycc_yuchengchen === true
```

## Known Facts

- Authoring source:
  `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen`
- The CLI launches:
  `F:\AI_project\nameless_game\game\noname\noname.exe`
- The served app root observed by the orchestrator is:
  `F:\AI_project\nameless_game\game\noname\resources\app`
- A previous probe found the clean runtime had:
  `lib.config.characters=["zusfylri"]`,
  `lib.characterPack.ycc=false`,
  `lib.character.ycc_yuchengchen=false`.

## Required Reading

- `F:\AI_project\nameless_game\AGENTS\coder\ROLE.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\README.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\refs.md`
- `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen\extension.js`
- `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen\main\precontent.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\英雄杀\extension.js`

## Implementation Guidance

Prefer a reversible deployment/registration step over invasive game engine
changes. Treat the authoring extension directory as the source of truth.

Likely useful target area:

`F:\AI_project\nameless_game\game\noname\resources\app\extension\`

Do not modify unrelated extensions or user config except where strictly needed
to enable `yuchengchen`.

## Verification

Use `tools/noname-test-cli` to run a fresh session and verify runtime state.

Minimum acceptable verification:

1. Start a fresh CLI session.
2. Evaluate through `import('./noname.js')`.
3. Report:
   - `lib.config.extensions`
   - `lib.config.characters`
   - `!!lib.characterPack.ycc`
   - `!!lib.character.ycc_yuchengchen`
   - ycc-related skill presence if easy.
4. Stop the session you started.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-register-ycc-runtime.md`

Include:

- Files changed.
- Exact verification commands.
- Verification JSON or concise parsed result.
- Any remaining risk for the smoker.

Also put the report path in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not duplicate older reports.
- Do not perform gameplay smoke testing in this task.
- If blocked, list the blocker and the exact question for the orchestrator.
