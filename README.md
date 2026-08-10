# Nihilphile Custom Characters

This directory is the workspace for custom noname characters and extensions made
under the Nihilphile umbrella.

Each character or extension should have its own subdirectory. The subdirectory is
a project workspace: it stores briefs, manifests, test notes, and orchestration
metadata. Production extension source may still live in the noname extension
tree when the game requires that layout.

## Projects

| Project         | Directory        | Purpose                                                           |
| --------------- | ---------------- | ----------------------------------------------------------------- |
| 御承宸             | `ycc/`           | Online-capable custom general extension and tests                 |
| Nihilphile Pack | (extension tree) | Distributable character extension package; 御承宸 is first character |

## Extension Source Locations

| Item                                   | Path                                               |
| -------------------------------------- | -------------------------------------------------- |
| Nihilphile extension source            | `noname/apps/core/extension/nihilphile/`           |
| Nihilphile extension runtime           | `game/noname/resources/app/extension/nihilphile/`  |
| yuchengchen extension source (legacy)  | `noname/apps/core/extension/yuchengchen/`          |
| yuchengchen extension runtime (legacy) | `game/noname/resources/app/extension/yuchengchen/` |

## Conventions

- Keep game runtime source in the location required by noname.
- Keep project coordination files here.
- Use CC_Crew group `ycc` for 御承宸 worker dispatch.
- Do not mix raw worker result stores into this directory. Link to result paths
  from manifests instead.
