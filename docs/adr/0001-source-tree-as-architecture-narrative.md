# Source tree as architecture narrative

`http-connect` makes module boundaries and responsibilities visible through the source tree. `src/public.ts` explicitly re-exports every public name. The `exports` map in `package.json` exposes the built entry point at `http-connect`.

Implementation modules import directly from the files that define the symbols they use. Those files can export symbols for internal composition or tests. Tests that exercise the package interface can import through `src/public.ts`.

The root README teaches package usage, and `docs/README.md` orients maintainers. Keep durable decisions, glossary entries, and deferred ideas in the docs. Keep deferred ideas in one document that identifies them as non-current. Let the source tree and tests describe current implementation details. Extract durable decisions and deferred ideas from comparison research before removing it.
