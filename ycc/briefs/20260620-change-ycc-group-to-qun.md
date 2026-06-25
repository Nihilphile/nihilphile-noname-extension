# Brief: Change YCC Group To Qun For Online Selection Experiment

## Role

Coder. Make a minimal experimental change: set `ycc_yuchengchen`'s faction group
from custom `fu` to built-in `qun`, then verify the data path.

## Objective

Test the hypothesis that the custom one-character `fu` group is responsible for
online selection issues. For this experiment, `ycc_yuchengchen` should behave as
a `qun` character.

## Files To Change

Update both authoring source and packaged runtime copy:

- `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen\character\character.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\character\character.js`

Only change the group for `ycc_yuchengchen` from `fu` to `qun`.

Do not remove the existing `fu` group registration in `precontent.js` in this
task. It is harmless for now and can be cleaned later if the experiment becomes
the final design.

## Required Reading

- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-online-character-selection-rules.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-fix-online-extension-registration.md`
- Current source/runtime `character.js` files listed above.

## Verification

Minimum checks:

1. Confirm both files now define `ycc_yuchengchen` with group `qun`.
2. If no live user session blocks `noname-test-cli`, start a uniquely named fresh
   session and verify:
   - `lib.character.ycc_yuchengchen[1] === "qun"` or equivalent object access
   - `get.charactersOL().includes("ycc_yuchengchen") === true`
3. If runtime verification is blocked because the user has a live game on port
   8089, do not kill it. Report that verification is limited to file/static
   checks.

Do not perform broad gameplay smoke testing.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-change-ycc-group-to-qun.md`

Include:

- Files changed.
- Exact verification commands/results, or why runtime verification was skipped.
- Recommendation for the user smoke: refresh/recreate online room and check if
  ycc enters the selection dialog.

Also put the report path and concise verdict in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not inspect/wait/stop/mutate any user-owned live smoke/session.
- Do not edit source code outside the two `character.js` files listed above and
  your report.
