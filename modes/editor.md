# Mode: editor — In-Browser Split-View CV Editor

Compatibility mode for the in-browser CV editor.

This mode is intentionally a thin alias for `modes/pdf-editor.md`, because the router exposes `/career-ops editor` while the original implementation lives in `modes/pdf-editor.md`.

## Execute

Follow all instructions in `modes/pdf-editor.md`.

Primary command:

```bash
node modes/pdf-editor-server.mjs --port=9090
```

Expected URL:

```text
http://localhost:9090
```

## Notes

- Do not regenerate HTML.
- Do not modify `cv.md`.
- Use existing files under `output/html/`.
- If the server is already running, reuse it.
