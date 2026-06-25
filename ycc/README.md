# 御承宸 Workspace

This is the project workspace for the 御承宸 custom general extension.

It does not replace the game extension directory. It is the coordination layer
for briefs, tests, result indexes, and worker handoffs.

## Current Source Locations

| Item | Path |
|------|------|
| Extension source | `F:\AI_project\nameless_game\noname\apps\core\extension\yuchengchen` |
| Rules/spec | `F:\AI_project\nameless_game\noname\docs\yuchengchen-online-spec.md` |
| Result manifest | `F:\AI_project\nameless_game\noname\docs\yuchengchen-result-manifest.md` |
| Role protocols | `F:\AI_project\nameless_game\AGENTS` |
| Game test CLI | `F:\AI_project\nameless_game\tools\noname-test-cli` |
| CC_Crew | `F:\AI_project\CC_Crew` |

## CC_Crew Dispatch

Use group `ycc` for this project.

```powershell
$tui = "F:\AI_project\CC_Crew\scripts\ClaudeTui.ps1"

& $tui send ycc-explorer `
  -Group "ycc" `
  -Role explorer `
  -Mode p `
  -Workspace "F:\AI_project\nameless_game" `
  -Prompt "Read nihilphile/ycc/README.md and the assigned brief. Investigate only the requested unknowns."

& $tui wait ycc-explorer -Group "ycc"
& $tui result ycc-explorer -Group "ycc"
```

Prefer `-Mode p` for automated orchestration. Use TUI only when visible
interactive observation is useful.

## Current Technical State

- The extension source exists under the noname extension tree.
- The `ycc` character pack is enabled at boot by the extension precontent path so
  `lib.character.ycc_yuchengchen` enters the final character library without
  editing default `config.json`.
- The basic two-client closed-loop test previously passed with both clients
  seeing `ycc_yuchengchen`.
- 【皇命】 has received static fixes for the forced target flow and filtering
  chain. Real runtime skill interaction still needs controlled gameplay tests.

For detailed provenance, read the result manifest before assigning new work.

## Next Work

1. Establish a `noname-test-cli` based scenario harness for controlled gameplay.
2. Re-run the baseline extension load check through the new test CLI.
3. Build minimal runtime tests for 【皇命】.
4. Expand to 【龙殛】, 【御策】, and 【亲征】.
5. Decide how to version the ignored extension directory.

