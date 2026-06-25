# Brief: Investigate YCC Not Active In Online Mode

## Role

Explorer. Do not edit project files.

## Objective

Find why `yuchengchen` appears registered/working in single-player runtime checks
but is not visible/effective in online mode. The orchestrator needs a precise
root cause and a minimal patch plan, not an implementation.

## Context

Recent work:

- `20260620-register-ycc-runtime.md` reported single-player boot checks passing:
  `lib.config.extensions` includes `yuchengchen`, `lib.config.characters`
  includes `ycc`, and `lib.character.ycc_yuchengchen` is truthy.
- `20260620-extension-registration-research.md` recommends reverting direct
  injection and relying on normal `game.import("character") -> loadCharacter`.
- User manually observed that the extension only appears in single-player mode;
  in online mode, 御承宸/ycc does not appear to take effect.

Important: The user is manually controlling an existing smoke run. Do not inspect,
wait on, stop, or mutate `ycc::play-ycc-smoke` or any user-owned live game session.

## Research Questions

1. In noname, what is the exact loading path for extension character packs in
   online/connect mode?
2. Is `lib.config.characters.push("ycc")` sufficient for online mode, or does
   online mode use `lib.connectCharacterPack`, `lib.configOL`, host settings, or
   another list?
3. Does `character/index.js` with `connect: true` correctly populate the online
   candidate pool after normal extension loading?
4. Is the ycc extension enabled only in the local/single-player config but not in
   the online host/client config?
5. What local example explains the correct pattern? Prefer `Zusfylri武将包` if it
   works online; otherwise use another online-capable extension/character pack.
6. What is the smallest coder task to make ycc visible/effective in online mode
   without direct data injection?

## Required Reading

- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-extension-registration-research.md`
- `F:\AI_project\nameless_game\nihilphile\ycc\reports\20260620-register-ycc-runtime.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\README.md`
- `F:\AI_project\nameless_game\tools\noname-test-cli\docs\LLM_GAMEPLAY_PROTOCOL.md`
- Runtime engine files under:
  `F:\AI_project\nameless_game\game\noname\resources\app\noname\`
- Runtime extension examples under:
  `F:\AI_project\nameless_game\game\noname\resources\app\extension\`

## Probe Rules

- You may start your own uniquely named CLI sessions if needed.
- Do not touch the user's manually controlled smoke session.
- Clean up any sessions/processes you start, or explicitly report what remains.
- Prefer source evidence first; use runtime probes only to disambiguate.

## Output

Write one incremental report under:

`F:\AI_project\nameless_game\nihilphile\ycc\reports\`

Recommended filename:

`20260620-online-extension-not-active.md`

Include:

- Root cause or best-supported hypothesis.
- Exact source paths/line references.
- Any runtime probe commands and parsed results.
- Whether the issue is extension enabling, character-pack enabling, online host
  settings, connect pack population, or UI filtering.
- A minimal patch plan for a coder.
- A clear verification plan for online mode.

Also put the report path and one-sentence verdict in final `result.md`.

## Constraints

- Use CC_Crew group `ycc`; do not inspect or mutate other groups.
- Do not edit source code.
- Do not run broad gameplay smoke testing.
- Do not duplicate older reports except where directly relevant.
