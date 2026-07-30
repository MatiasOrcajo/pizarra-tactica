# Repository Guide

## Commands

- `npm run dev` starts the Vite development server.
- `npm run build` is the only configured verification command; there are no test, lint, or typecheck scripts.

## Architecture

- `src/main.js` mounts Vue 3 with Pinia and `vue-konva`; `App.vue` composes the toolbars and the canvas.
- `src/stores/pizarra.js` is the source of truth for board elements, team configuration, selection, imports, exports, and autosave. UI components should mutate it through its public store methods rather than interacting with the Konva stage.
- `CanvasBoard.vue` uses imperative Konva nodes and reconciles them from `store.elements`. Add a supported element type in both the store data flow and its `createElement`/`updateElement` rendering paths.
- Board coordinates are stored in the fixed `1050 x 680` virtual pitch from `useFootballPitch.js`. Convert pointer input with `screenToVirtual`; never persist viewport-scaled coordinates.

## State Compatibility

- Persisted board data lives in browser `localStorage` under `pizarra-tactica-autosave`; exported JSON is version 2. Treat existing element fields and team settings as persisted data when changing schemas.
- Every board element requires a unique numeric `id`. Selection and the Konva node map are keyed by it; preserve IDs during updates and migrations.
- Team formation coordinates are generated in the store and mirrored for team 2. Keep formation changes in the store so resets, autosave, export, and canvas rendering stay consistent.
