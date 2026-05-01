# Mode: pdf-editor — In-Browser Split-View Editor + PDF Export

Split-view in-browser CV editor with evaluation report (left) and editable resume (right).

## Inputs

- Optional: CV filename (auto-discovers all HTML files in output/html/)
- Port (default: 9090)

## Steps

1. Start server: `node modes/pdf-editor-server.mjs [--port=9090]`
2. Browser opens to home page listing all available CVs
3. User selects a CV from the list
4. Editor loads with **split layout:**
   - **Left panel:** Evaluation report (read-only markdown rendering)
   - **Right panel:** Resume HTML (editable with contentEditable)
5. User can:
   - Click "✏️ Edit" to toggle editing mode
   - Edit resume text inline
   - Click "📥 Export PDF" to download edited resume as PDF
   - Close browser (server continues running; press Ctrl+C to stop)

## Output

- Server URL: http://localhost:9090
- PDF downloads to output/ with original filename
- File size and status reported

## Split-View Layout

- Report path auto-detected from CV filename (e.g., `cv-lewis-mccoin-2026-04-27.html` → `*-mccoin-2026-04-27.md`)
- Markdown rendered with headers, bold, links, code blocks
- Report is read-only; resume is editable
- Toolbar (Edit/Export) fixed above resume panel
- Full-screen layout; scroll independently in each panel

## Features

- **Auto-discovery:** Lists all HTML files in output/html/
- **Report matching:** Automatically finds and displays corresponding evaluation report
- **Inline editing:** contentEditable on resume content
- **PDF export:** Sends modified HTML to generate-pdf.mjs, downloads as PDF
- **Graceful fallback:** Shows "No evaluation report found" if report doesn't exist

## Stop Condition

- User closes browser (server remains running)
- Or Ctrl+C in terminal to stop server
- Do not regenerate HTML
- Do not modify cv.md
