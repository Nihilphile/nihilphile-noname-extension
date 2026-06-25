# Brief: Online Selection Pool Does Not Offer YCC

## Role

Explorer. Do not edit project files.

## Objective

Find why `ycc_yuchengchen` is visible in the online room's character-pack
settings but never appears in the online character selection dialog, even when
the enabled pool is smaller than the offered choice count.

## User Observation

Manual smoke evidence from 2026-06-20:

- Online room settings show the `御承宸` character pack.
- The `御承宸` pack is enabled.
- The pack card preview shows `御承宸`.
- In the online character selection dialog, repeated refreshes never offer
  `ycc_yuchengchen`.
- The enabled pool is already smaller than the available choice count, so this
  is unlikely to be random chance.

Screenshot paths, for context only:

- `C:\Users\DREAMJ~1\AppData\Local\Temp\codex-clipboard-eebef2aa-9389-4b6a-8cec-dde57b7ce08d.png`
- `C:\Users\DREAMJ~1\AppData\Local\Temp\codex-clipboard-27bbe3cd-fc16-4383-8031-d775c209ee68.png`

Do not rely on image OCR. Treat the bullets above as the authoritative user
observation.

## Recent Reports To Read

- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-fix-online-extension-registration.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-online-extension-not-active.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-extension-registration-research.md`

## Questions

1. Which list is used to generate the online character selection dialog after
   the room has already entered character selection?
2. Does that list include `ycc_yuchengchen` immediately before candidate buttons
   are generated?
3. If it includes ycc earlier but not in the final candidates, which filter,
   ban list, identity mode rule, group rule, rarity/rank rule, or random
   sampling path removes it?
4. If it does not include ycc by that point, which room/host setting list is out
   of sync with the visible pack-settings UI?
5. What is the smallest coder patch needed to make `ycc_yuchengchen` appear in
   the online selection dialog?

## Source Areas To Inspect

Start from these runtime paths:

- `F:\AI_project\nameless_game\game\noname\resources\app\noname\game\index.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\get\index.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\mode\identity`
- `F:\AI_project\nameless_game\game\noname\resources\app\noname\game\characterPackMenu.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\character\character.js`
- `F:\AI_project\nameless_game\game\noname\resources\app\extension\yuchengchen\character\characterFilter.js`

Compare against characters that do appear in the user's screenshot if useful.

## Probe Rules

- You may start your own uniquely named CLI session if needed.
- Do not inspect, wait, stop, or mutate any user-owned live smoke/session.
- Do not edit source code.
- Clean up any sessions/processes you start, or report leftovers.
- Prefer source-chain evidence plus one runtime probe near selection generation.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-online-selection-pool-missing-ycc.md`

Include:

- Root cause or best-supported hypothesis.
- Exact source paths/line references.
- Runtime probe commands and parsed results, if used.
- The exact list/filter stage where `ycc_yuchengchen` disappears.
- Minimal coder patch plan.
- Verification plan.

Also put the report path and one-sentence verdict in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code.
- Do not run broad gameplay smoke testing.
