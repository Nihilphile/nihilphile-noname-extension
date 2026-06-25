# Brief: Verify Normal Online Selection Missing YCC

## Role

Explorer. Do not edit project files.

## Objective

Resolve the remaining uncertainty from the previous report: the user's screenshot
shows a standard-looking online identity room (`主`/`反`), but the previous
explorer root cause applies specifically to `chooseCharacterPurpleOL`.

Find the actual filter/sampling path for the user's visible online selection
dialog and determine why `ycc_yuchengchen` does not appear there.

## Context

Previous report:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-online-selection-pool-missing-ycc.md`

It found:

- Purple mode removes groups with fewer than 12 characters.
- `fu` has only 1 character, so ycc is removed in `chooseCharacterPurpleOL`.
- However, the report explicitly says normal/zhong generic fallback has no such
  group-minimum filter.

User manual smoke:

- Online settings show `御承宸` pack enabled.
- Character selection dialog still never shows `ycc_yuchengchen`.
- User says enabled pool is smaller than the offered choice count.
- Screenshot appears to show standard identity roles (`主`/`反`), not obviously
  purple mode.

## Questions

1. Based on the screenshot/UI state and source paths, is the user likely in
   normal identity mode, purple mode, or another sub-mode?
2. In normal online identity selection (`chooseCharacterOL` generic fallback),
   what exact list is used to generate candidate buttons?
3. Does that generic fallback apply additional filters beyond
   `get.charactersOL()` and `characterDisabled()`?
4. Could `ycc_yuchengchen` be filtered because of group `fu`, missing rank,
   missing sort, `lib.configOL.banned`, `lib.configOL.characterPack`, double
   character logic, `limit_zhu`, identity role, or another host setting?
5. What is the smallest patch if the user's path is normal mode?
6. Should the purple-mode `<12` patch still be applied, deferred, or scoped?

## Required Reading

- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-online-selection-pool-missing-ycc.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-fix-online-extension-registration.md`
- `F:\AI_project\nameless_game\game\noname\resources\app\mode\identity.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\game\index.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\get\index.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\character\character.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\character\characterFilter.js`

## Probe Rules

- You may start your own uniquely named CLI session if needed.
- Do not inspect, wait, stop, or mutate any user-owned live smoke/session.
- Do not edit source code.
- Clean up any sessions/processes you start, or report leftovers.
- Prefer source evidence; use runtime probe only if it disambiguates mode/list
  generation.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-normal-online-selection-missing-ycc.md`

Include:

- Whether the purple-mode root cause applies to the user's screenshot.
- The exact normal-mode candidate generation path.
- The specific stage where ycc is included or removed.
- Minimal coder patch plan.
- Whether to patch purple `<12`, normal path, both, or neither.

Also put the report path and one-sentence verdict in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code.
- Do not run broad gameplay smoke testing.
