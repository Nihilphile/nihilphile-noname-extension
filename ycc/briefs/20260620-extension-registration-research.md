# Brief: Research Official Noname Extension Registration

## Role

Explorer. Do not edit project files.

## Objective

Find the correct way to register `yuchengchen` as a normal noname extension
package, preferably matching how `Zusfylri武将包` is registered, rather than
using direct runtime injection into `lib.character`/`lib.skill`.

## Context

Current problem:

- The authoring source lives at:
  `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen`
- The packaged game used by `noname-test-cli` serves:
  `F:\AI_project\nameless_game\game\noname\resources\app`
- A prior coder copied ycc into:
  `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen`
- That coder also modified `precontent.js` to directly inject character data.
- The user wants ycc registered as an extension package like `Zusfylri武将包`,
  not as an ad-hoc direct injection.

## Research Questions

1. What do upstream/official noname GitHub docs or extension tutorials say about
   extension package structure and registration?
2. How does a normal extension become enabled in `lib.config.extensions`?
3. How should an extension expose a custom character pack so its characters are
   loaded normally?
4. What local files make `Zusfylri武将包` work in this packaged runtime?
5. What should be changed in ycc to match that pattern with minimal risk?
6. Which parts of the prior direct-injection fix should be reverted or avoided?

## Required Reading And Evidence Sources

Use web/GitHub research where possible. Prefer upstream repository docs, source,
or widely referenced extension tutorials over random snippets.

Local evidence to compare:

- `F:\AI_project\nameless_game\game\noname\resources\app\extension\`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\Zusfylri武将包` if present
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\英雄杀`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\玩点论杀`
- `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-register-ycc-runtime.md`

If `Zusfylri武将包` is not present as a normal extension directory, state that
explicitly and find where it is coming from.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-extension-registration-research.md`

Include:

- Source links or local paths used as evidence.
- The extension package structure expected by noname.
- The exact registration/enabling mechanism as best as you can confirm.
- A comparison table: `Zusfylri武将包` / `英雄杀` / current `yuchengchen`.
- A concrete recommended patch plan for a coder.
- Any uncertainty that requires an implementation experiment.

Also put the report path in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code.
- Do not run gameplay smoke testing.
- Avoid duplicating older ycc reports; cite them only when needed.
