# Developing Misty

## Setup and runtime

The application needs Python 3.10+ and a modern browser. Python's standard library serves the studio and proxies model calls to the shared workshop bridge. All client libraries are checked in: there is no pip/npm install, build step, API credential, or external asset request at runtime. Optional development checks use Node for `node --check`; browser automation can use an existing Playwright installation.

From the repository root, start `python3 llm-bridge/bridge.py codex`, then `python3 revibes/misty/app/server.py`. The local URL is `http://127.0.0.1:5173`. Check `http://127.0.0.1:8787/health` for `backend: codex`. The app's `GET /api/health` reports bridge readiness and compatibility without calling a model. Do not modify the shared bridge.

The server binds to loopback by default. `--port` selects a different app port; `--host` is available when intentionally exposing the app on another interface. `MISTY_BRIDGE_URL` configures a different local Codex bridge. It is read once when the server starts. `.env` loading is unnecessary and not implemented.

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| `server.py` | Threaded local HTTP server, static files, input validation, bridge health verification, JSON response normalization and model proxy |
| `prompts.py` | Appendix A.3-inspired global/localized prompts; semantic refinement and syntax repair prompts |
| `static/index.html`, `style.css` | Studio toolbar, infinite canvas, inspector, dialogs and responsive layout |
| `static/app.js` | Nodes, connectors, pointer interactions, normalized cropping, drag/drop, modal workflows, editor, history and persistence |
| `static/preview.html`, `preview.js` | Isolated React runtime; Babel compilation, error boundary, target element detection and frame messaging |
| `static/samples.js` | Original source components and reference metadata |
| `static/example-*.svg` | Original demonstration screenshot/sketch images |
| `static/stock/*.svg` | Original vector illustrations for generated components |
| `static/vendor/` | Pinned browser bundles and upstream licenses |

## Data model

The studio state is `{nodes, edges, selected, camera}`. The camera has world-to-screen translation `{x,y}` and zoom `z`. Canvas positions remain in world coordinates; header drags divide pointer movement by zoom. Zooming preserves the world point under the pointer.

Every node has an ID, name, kind, position and creation time. An **example** has an image URL/data URL, a crop expressed as fractions `{x,y,w,h}`, and an optional previous crop. A **source** has `code` and optional blend metadata:

```text
groups          [{id, category, enabled, changes: [{type,before,after}]}]
originalCode    source code at the moment the blend was requested
blendedCode     initial generated code, before semantic refinements
recipe          exampleId, sourceId, mode, aspects, custom, target, targetLabel, crop
parentId        source node used to create this variation
designExplanation, differences, operation, model
```

A blend creates a new source and two directed edges: reference-to-result and source-to-result. Sources can branch repeatedly and can themselves serve as new inputs. Regenerate reuses the original recipe and original source node's current code, creating a sibling output rather than overwriting the existing one. The localized crop and DOM target are stored with the recipe. Removing an input leaves other nodes intact, but regeneration of its old recipe then reports the missing input.

Semantic toggles act on the selected result, sending original code, initial blended code, current code and requested group states to the bridge. Refinement updates `code` and the requested groups only after a successful response. Groups retain their identities and enable state; no fragile blanket text replacement is used to undo semantic changes. Fine-grained controls edit `after` values before making the same refinement request. Reset all disables every group. Manual editing changes `code` directly; the refinement prompt asks the model to preserve unrelated manual edits, although model behavior cannot guarantee this.

## Images and localized targets

Examples do not need underlying code. Uploads are decoded and rasterized into a PNG capped at 1600px on the longest edge. Input files are limited to 12 MB. Built-in SVG references are similarly rasterized before a model request. Global blending ignores the crop; localized blending rasterizes only the selected image region. No server-side image library or image service is needed.

During localized placement, the parent sends `drag-active` to source frames. Inside a preview, dragover/click locates the closest semantic region (`button`, `article`, `li`, `section`, `header`, `footer`, `nav`), falling back to the element under the pointer. A temporary CSS outline communicates the affected target. On drop, the frame returns its cleaned rendered HTML and a text label. The prompt maps that rendered HTML back to the original JSX and asks for corresponding repeated items to be changed together. This allows targets inside dynamically generated React lists.

Region selection and region dragging are deliberately separate gestures: draw on the image, then drag its handle. A transparent studio overlay captures drops above sandboxed previews and forwards pointer coordinates, corrected for canvas zoom, to the frame for DOM hit-testing. This avoids cross-origin drag restrictions. Click-to-place uses the same hit-testing without HTML drag-and-drop. Crop coordinates are normalized so a selection stays aligned when the canvas zooms.

## Live preview and component format

Each source iframe uses `sandbox="allow-scripts"` without `allow-same-origin`. Components cannot access the parent workspace or local storage. A per-frame token and `event.source` check associate messages with the intended node. Content security policy disallows network requests and remote resources. The preview itself loads local vendor scripts.

Recommended input:

```jsx
() => {
  return <main className="min-h-screen bg-white p-6 text-slate-800">
    <h1 className="text-xl font-semibold">My source UI</h1>
  </main>;
}
```

Named components, `export default function App`, exported arrow components, JSX expressions and simple TSX are also accepted. Lightweight normalization removes Markdown fences, supported import statements and export declarations; Babel compiles JSX/TSX. The runtime supplies `React`, `useState`, `useEffect`, `useRef`, `useMemo`, `useCallback` and Lucide's named React components. Other hooks can be accessed as `React.use...`.

Only self-contained source code is supported. Arbitrary imports are stripped rather than fetched; unknown component names produce a render error. Styles use Tailwind v4, inline styles or component `<style>` tags. Generated prompts enumerate common available icons and three `/stock/*.svg` paths. To add stock assets, put files under `static/stock/` and update the asset list in `prompts.py`. Do not introduce nonexistent paths or remote placeholders.

React's error boundary reports render errors to the inspector; compile errors appear immediately. **Fix render** submits the current error and code for repair. A malformed model result still remains editable. Previews are presentation surfaces: click navigation is suppressed to enable canvas selection. The sandbox limits accidental effects but is not a substitute for reviewing unfamiliar source code; an infinite loop can still hang a browser tab.

## Backend API

`POST /api/blend` accepts `code`, PNG/JPEG/WebP data URL `image`, `mode` (`global` or `localized`), and for localized requests `aspects`, `custom`, `target`, `targetLabel`. Valid aspects are Color, Layout, Content, Customize. A custom aspect needs instructions; localized operations require a target.

`POST /api/refine` accepts `code`, `originalCode`, `blendedCode`, and `groups` with requested enable states and fine-grained values.

`POST /api/repair` accepts `code` and `error`.

All model endpoints return `updatedCode`, `designExplanation`, `differences`, normalized `categorizedChanges`, and the bridge's reported model. Source code is limited to 200,000 characters and HTTP request bodies to 16 MB. The proxy has a 310-second timeout. It verifies `backend == codex` before every model call. There are no automatic retries or background generation loops. The browser allows one operation at a time, keeping the group's plan usage intentional.

The backend uses the bridge's OpenAI-compatible Chat Completions format with JSON output and a multimodal image block. The bridge model name is informational: the bridge chooses its own fast model. HTTP/JSON/model errors are shown without replacing an existing node. Raw request/response contents, images, tokens and source code are not logged by Misty; the standard server logs request paths/statuses.

## Persistence and history

Browser-local autosave uses `misty-workspace-v1` in local storage, debounced after changes. Large image collections can exceed browser quota; the top bar reports this and workspace downloads remain available. A saved workspace contains the images as data URLs, source code, recipes, group states, edges and camera; no credentials are stored. Import checks node types, positions, IDs and image URL formats. It replaces the current workspace and creates an undo checkpoint.

Undo/redo keeps up to 40 in-memory snapshots. Code edits are grouped with a short debounce; cropping, node movement, deletion, duplication and successful generation/refinement create checkpoints. Undo does not make a model call or recover plan usage. There is no backend persistence or multi-user synchronization.

## Bundled libraries

| Library | Version | License |
| --- | --- | --- |
| React / ReactDOM | 18.3.1 | MIT |
| Babel Standalone | 7.26.9 | MIT |
| `@tailwindcss/browser` | 4.1.14 | MIT |
| Lucide React | 0.468.0 | ISC |

Bundles were downloaded from their pinned package distributions. Licenses are included in `static/vendor`. The Lucide UMD package expects `window.react`, supplied as an alias for React's UMD global before loading the icon bundle. The studio shell uses native DOM APIs rather than React Flow/React Live.

## Verification

Run syntax checks from the repository root:

```bash
python3 -m py_compile revibes/misty/app/server.py revibes/misty/app/prompts.py
node --check revibes/misty/app/static/app.js
node --check revibes/misty/app/static/preview.js
node --check revibes/misty/app/static/samples.js
```

Run the backend contract checks with `python3 -m unittest discover -s revibes/misty/app/tests -v`. These use an in-process bridge stub and make no model calls.

For a browser smoke check, verify the initial profile renders with icons/Tailwind, crop a reference, perform global and localized blends, toggle a semantic category, edit source code, undo/redo, save/open a workspace, and export JSX. Model output is nondeterministic; verify both code validity and visible content. Browser automation can isolate test workspaces with a new browser context. Real bridge calls use the signed-in plan; keep test requests small and sequential.

The initial build was checked in headless Chrome with real Codex calls for global blending, dark-theme reversion and cropped localized Layout blending. Generated components rendered without compile errors. Browser checks also covered JSX and sketch uploads, highlighted drag targets, click-to-place, custom-aspect validation, live editing, undo/redo, portable workspace export/import and deletion/undo. The six backend contract checks pass. These checks verify implementation behavior and do not grade the workshop rubric.
