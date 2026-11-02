# Misty

A local web implementation of **Mixing Interfaces by Semantic Transformation**, rebuilt from the workshop's Misty paper. Blend screenshots and sketches into work-in-progress React interfaces, compare branches on an infinite canvas, then refine semantic changes or edit the generated code.

## Launch

Requirements: **Python 3.10+**, a recent Chrome/Edge/Firefox browser, and the **Codex CLI signed in** for model calls. No API key, npm installation, or Python packages are needed. Browser libraries are included locally.

Open two terminals **at the repository root**:

```bash
# Terminal 1: leave the workshop's Codex bridge running
python3 llm-bridge/bridge.py codex
```

```bash
# Terminal 2: start Misty
python3 revibes/misty/app/server.py
```

Open **http://127.0.0.1:5173**. The top bar should say **Codex connected**. The app checks the bridge's `/health` response and requires the Codex backend. There is no `.env` or API key to fill in.

If the bridge is already running with Codex, reuse it. If it is running with Claude, stop it and restart with the command above. If another revibe owns port 8787, use a separate port:

```bash
python3 llm-bridge/bridge.py codex 8788
```

```bash
MISTY_BRIDGE_URL=http://127.0.0.1:8788 python3 revibes/misty/app/server.py --port 5174
```

Then open http://127.0.0.1:5174. The bridge uses the group's signed-in plan; each blend, regeneration, semantic toggle, fine-grained application, or render repair sends one model call. Uploading, cropping, navigating and editing code do not call the model.

## Use

1. **Start with a source and an example.** The canvas opens with Fuji's profile and an original dark reference screenshot. Use **Add example** to upload screenshots, wireframes, or photographed sketches. Draw directly on an example to crop a region. Use **Add source UI** to paste/upload a React component or choose the profile, trails or reading-list sample.
2. **Blend a whole screen.** Drag the connector on an example's right edge to the connector on a source's left edge. You can also click the example connector, then click the source. **Global blend** in the toolbar uses the selected example, or the first example. Global blending always uses the complete reference, preserving the source's content while adapting visual style and layout.
3. **Blend a detail.** Draw a selection on an example, then drag the handle below the image onto an element inside a source preview. The target highlights. Select one or more of **Color**, **Layout**, **Content**, and **Customize**, then blend. **Content** adds an element adapted to your source's context; it does not copy reference text. For a drag-free alternative, choose **Click to place**, then click a target in the source preview. Clear selection uses the entire reference for the next localized operation.
4. **Compare and iterate.** Each blend creates a new source node and lineage connections. The original source remains available. Drag node headers to rearrange them. Choose **Regenerate** on a result to create another variation from the same original operation. Any generated node can become the source of a later blend.
5. **Refine semantic changes.** Select a result and use **Applied changes** in the right panel. Toggle a category to keep or revert that conceptual change. Expand **Fine-grained changes** to edit individual Tailwind classes/code fragments, or a color value when available, then choose **Apply fine changes**. These refinements update that result's actual component code. **Reset all** disables all changes from that blend; toggles can reapply them.
6. **Edit the code.** Choose **Show code** or **Code editor** on a source node. Edit the component; the preview updates after a short pause. React, hooks and Lucide icons are already available. **Fix render** asks the bridge to repair syntax/render errors. You can always repair manually. Example images have no code editor.
7. **Keep the result.** Export individual components as `.jsx`. **Save workspace** downloads all examples, code, branches and semantic change history as JSON; **Open** restores it. Work also autosaves to this browser's local storage. Use workspace downloads for backups or to move between browsers. Large workspaces may exceed local storage, which is reported in the top bar.

Scroll to pan; Ctrl/Cmd + scroll to zoom; hold Space and drag to pan. The bottom toolbar includes zoom and **Fit all**. **0** also fits all nodes. **Escape** cancels placement/connection. Undo/redo supports local changes. Node menus offer focus, duplication and removal.

## Implementation choices and limits

- The workshop's **Codex bridge model replaces GPT-4o**. This is labelled in the interface. Generation quality and latency depend on that model; incomplete output can be regenerated or edited. Errors preserve existing designs and show a readable message.
- The studio uses browser-native canvas interactions; source previews use **React 18, Tailwind CSS 4 and Babel**. This substitutes for the paper's React Flow/React Live setup while retaining editable React code and live rendering.
- Original vector example screenshots, a sketch and three vector illustrations are included. They replace the unavailable stock-photo collection and are not the authors' demo assets. Upload your own screenshots or sketches to use real design examples.
- Like the paper, this supports **static, single-screen mobile UIs**. It does not reconstruct multi-screen apps or blend interactions and animations. Generated previews isolate code in a sandboxed iframe and suppress navigation/click actions to support selection. Export code to develop full functionality elsewhere.
- Source components must be self-contained. React hooks and the supplied Lucide icon library work; arbitrary npm imports, backend requests and remote images are not supported in the preview. Detailed scope and extension guidance are in [DEVELOPER.md](DEVELOPER.md).

The feature analysis and paper references are in [FEATURES.md](FEATURES.md).
