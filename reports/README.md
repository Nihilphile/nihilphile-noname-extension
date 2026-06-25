# Nihilphile Reports

This directory stores reusable investigation reports for the Nihilphile/noname
workspace.

Reports here are not CC_Crew runtime state, raw worker stores, or one-off task
logs. They are curated notes extracted from useful worker results or manual
exploration, kept so later agents can reuse hard-won knowledge without repeating
the same source dive.

## Scope

Keep reports focused on the noname game and the Nihilphile extension work:

- noname engine behavior that affects extension development
- reusable source maps, call chains, and decision-flow notes
- AI behavior, skill authoring patterns, testing hooks, runtime layout, and
  online-compatibility constraints
- project-specific findings only when they teach something reusable about the
  noname extension surface

Avoid storing:

- raw CC_Crew state files, agent stores, or lifecycle metadata
- transient debugging logs that only explain one failed run
- reports whose value is mostly about an unrelated character, extension, or tool
- large copied source excerpts when a file path, line range, and summary are
  enough

If a report is mostly reusable but contains a small unrelated section, prefer
keeping it with a note in the summary rather than losing the useful material.

## Current Structure

| Directory | Purpose |
|-----------|---------|
| `code-explorer/for-ai-decision/` | Reusable notes about noname AI decision logic: choose events, scoring functions, skill `ai` fields, and source anchors. |

## Archiving Worker Reports

When dispatching CC_Crew workers, keep their output in the normal worker result
store. Do not ask workers to write directly into this curated reports directory.
After the main agent reads the worker result, the main agent may copy, summarize,
or distill only the reusable part into this directory.

Suggested workflow:

1. Run the worker with a concrete task and the appropriate CC_Crew group.
2. Let the worker finish in its own result store.
3. Read the worker result with `ClaudeTui.ps1 result <id> -Group <group>`.
4. Decide whether the result has reusable noname knowledge.
5. If yes, the main agent saves a curated `.result.md` or summary under a topic
   directory here.
6. If no, leave it in the worker result store and do not archive it here.

Use timestamped filenames when preserving a worker report directly:

```text
YYYYMMDD-HHMMSS-mmm.result.md
```

Use a descriptive `README.md` inside a topic directory when the folder gains
multiple reports or when future agents need routing guidance.

## Curation Standard

A good archived report should answer at least one of these questions:

- Where in noname source does this behavior live?
- Which functions, fields, or event flows matter?
- What should a future agent read first?
- What implementation choices or pitfalls did the investigation uncover?
- How should this knowledge change future extension or AI work?

Prefer concise source anchors over exhaustive transcripts. Future agents should
be able to skim the report, identify the relevant files, and continue from there.
