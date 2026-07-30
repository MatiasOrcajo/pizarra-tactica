# Repository Guide

## Commands

- `npm run dev` starts the Vite development server.
- `npm run build` is the only configured verification command; there are no test, lint, or typecheck scripts.

## Architecture & Strict Rules

- **CRITICAL - NO VUE-KONVA:** This project transitioned AWAY from `vue-konva` (declarative) to **vanilla Konva.js (imperative)** inside Vue components to prevent rendering race conditions and phantom nodes. **Do NOT use `<v-stage>`, `<v-layer>`, or any `vue-konva` templates in `.vue` files.**
- `src/stores/pizarra.js` is the absolute source of truth (Pinia) for board elements, team configuration, selection, imports, exports, and autosave. UI components must mutate it through its public store methods.
- `CanvasBoard.vue` is responsible for rendering. It manages imperative Konva nodes and reconciles them manually from `store.elements`.
- **Interaction & Reconciliations:** Always use imperative checks like `node.isDragging()` during state updates to prevent Pinia UI reconciliations from interrupting active Konva native drag-and-drop interactions.
- Board coordinates use a fixed `1050 x 680` virtual pitch from `useFootballPitch.js`. Convert pointer input with `screenToVirtual`; never persist viewport-scaled coordinates.
- HTML Overlays: Absolute positioned HTML elements (like editing popovers) used alongside the canvas must calculate their position synchronizing with Konva object virtual coordinates, scale, and offsets.

## State Compatibility

- Persisted board data lives in browser `localStorage` under `pizarra-tactica-autosave`; exported JSON is version 2. Treat existing element fields and team settings as persisted data when changing schemas.
- Every board element requires a unique numeric `id`. Selection and the Konva node map are keyed by it; preserve IDs during updates and migrations.
- Team formation coordinates are generated in the store and mirrored for team 2. Keep formation changes in the store so resets, autosave, export, and canvas rendering stay consistent.