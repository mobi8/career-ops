# Mode: pdf — Generate HTML, Edit, and Export PDF

Complete CV pipeline: generate tailored HTML from cv.md + JD, open in-browser editor with evaluation report, export to PDF.

## Inputs

- JD text or URL (required)
- Optional company name (auto-detected from JD if not provided)
- cv.md (source of truth)
- config/profile.yml (name, location, links)

## Steps

### Step 1: Generate Tailored HTML

1. Parse JD: extract company, role, location, 15-20 keywords
2. Detect language (EN default, de/fr/ja if JD language detected)
3. Detect paper format: US/Canada → letter, else → A4
4. Read cv.md and extract sections
5. Rewrite Professional Summary with JD keywords (truthful only)
6. Reorder experience bullets by JD relevance
7. Select top 3-4 projects
8. Build competency tags from JD requirements
9. Render HTML from `templates/cv-template.html` with personalized content
10. Save to: `output/html/cv-{candidate}-{company}-{YYYY-MM-DD}.html`
11. Report: HTML path, company, paper format

### Step 2: Auto-Open in Browser Editor

1. Check if PDF editor server is running on :9090
2. If not running, start: `node modes/pdf-editor-server.mjs --port=9090`
3. Navigate to: `http://localhost:9090/?file={generated-html-filename}`
4. Browser loads with:
   - **Left panel:** Evaluation report (if exists) or blank
   - **Right panel:** Editable resume HTML (contentEditable)
   - **Toolbar:** Edit mode toggle, Export PDF button

### Step 3: User Edits (Interactive)

User can:
- Click "✏️ Edit" to toggle contentEditable mode
- Edit resume text inline
- Click "📥 Export PDF" to download edited resume as PDF
- Close browser (server continues running)

### Step 4: Export to PDF

When user clicks "Export PDF":
1. Server captures edited HTML from DOM
2. Runs: `node generate-pdf.mjs [temp-file] output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`
3. Browser downloads PDF file
4. Server reports: PDF path, file size, page count

## Output

- HTML file: `output/html/cv-{candidate}-{company}-{YYYY-MM-DD}.html`
- PDF file: `output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf` (after user exports)
- Server URL: `http://localhost:9090/?file={filename}`

## Stop Condition

- User closes browser or clicks "Done"
- Do not render evaluation reports (only display existing ones)
- Do not expand into interview prep, company research, or tracker updates
- Do not modify cv.md

## Related Modes

- `pdf-generate` — HTML generation only (no browser)
- `pdf-render` — PDF rendering only
- `editor` — Launch browser editor for existing HTML files
