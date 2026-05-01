#!/usr/bin/env node

/**
 * PDF Editor Server
 * Serves generated HTML CV for in-browser editing + PDF export
 * No dependencies — uses Node.js built-in http module
 *
 * Usage:
 *   node pdf-editor-server.mjs <html-file> [--port=9090]
 */

import http from 'http';
import { URL } from 'url';
import { spawn, exec } from 'child_process';
import { resolve, dirname, basename } from 'path';
import { readFile, writeFile, unlink, readdir } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import querystring from 'querystring';
import { evaluate } from '../evaluation-engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = resolve(__dirname, '..');
const OUTPUT_HTML_DIR = resolve(BASE, 'output', 'html');
const OUTPUT_PDF_DIR = resolve(BASE, 'output');
const LEGACY_OUTPUT_PDF_DIR = resolve(BASE, 'output', 'pdf');
const REPORTS_DIR = resolve(BASE, 'reports');

/**
 * Generate professional HTML resume from cv-brief.md
 */
async function generateBasicResume(cvBriefPath, company, timestamp) {
  try {
    const cvContent = await readFile(cvBriefPath, 'utf-8');

    // Parse cv-brief.md sections
    const sections = {};
    let currentSection = null;
    const lines = cvContent.split('\n');

    for (const line of lines) {
      const headerMatch = line.match(/^## (.+)$/);
      if (headerMatch) {
        currentSection = headerMatch[1];
        sections[currentSection] = [];
      } else if (currentSection && line.trim()) {
        sections[currentSection].push(line);
      }
    }

    // Extract key data
    const identity = sections['Identity'] || [];
    const roles = sections['Role History Snapshot'] || [];
    const techThemes = sections['Technical Themes'] || [];
    const proofPoints = sections['High-Signal Proof Points'] || [];
    const education = sections['Education'] || [];

    const name = identity.find(l => l.includes('Name:'))?.replace('- Name:', '').trim() || 'Lewis Park';
    const location = identity.find(l => l.includes('Location:'))?.replace('- Location:', '').trim() || 'Dubai, UAE';
    const background = identity.find(l => l.includes('Background:'))?.replace('- Background:', '').trim() || '';

    // Build professional HTML resume
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} — Resume</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1a1a2e;
      background: #ffffff;
      padding: 40px;
      max-width: 900px;
      margin: 0 auto;
    }

    /* Header */
    .header { margin-bottom: 24px; border-bottom: 2px solid #e2e2e2; padding-bottom: 12px; }
    .header h1 { font-size: 28px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
    .contact-info { font-size: 10.5px; color: #555; display: flex; gap: 16px; flex-wrap: wrap; }

    /* Summary */
    .summary { font-size: 11px; line-height: 1.7; color: #2f2f2f; margin-bottom: 20px; }

    /* Section titles */
    .section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #2c5282;
      border-bottom: 1.5px solid #e2e2e2;
      padding-bottom: 4px;
      margin-bottom: 12px;
      margin-top: 16px;
    }

    /* Competencies */
    .competencies { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .tag {
      font-size: 10px;
      font-weight: 500;
      color: #2c5282;
      background: #edf2f7;
      padding: 4px 10px;
      border-radius: 3px;
      border: 1px solid #cbd5e0;
    }

    /* Experience */
    .job { margin-bottom: 14px; }
    .job-header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px; }
    .job-company { font-size: 12.5px; font-weight: 600; color: #2c5282; }
    .job-period { font-size: 10.5px; color: #777; white-space: nowrap; }
    .job-role { font-size: 11px; font-weight: 600; color: #333; margin-bottom: 4px; }
    .job ul { padding-left: 18px; margin: 6px 0; }
    .job li { margin-bottom: 4px; line-height: 1.6; }

    /* Highlights */
    .highlights ul { padding-left: 18px; margin: 8px 0; }
    .highlights li { margin-bottom: 6px; line-height: 1.6; }

    /* Education */
    .education { font-size: 11px; margin-bottom: 4px; }

    [contenteditable] { outline: 1px dotted transparent; }
    [contenteditable]:focus { outline: 1px dotted #2c5282; }
  </style>
</head>
<body contenteditable="true">

<div class="header">
  <h1>${name}</h1>
  <div class="contact-info">
    <span>${location}</span>
  </div>
</div>

<div class="summary">
  <strong>Tech leader</strong> with 15+ years across gaming, payments, platform ops, and AI-assisted development. Hands-on leader shipping production systems, aligning distributed teams, and turning operational complexity into measurable outcomes.
</div>

<div class="section-title">Highlights</div>
<div class="highlights">
  <ul>
    ${proofPoints.filter(l => l.trim().startsWith('-')).slice(0, 5).map(l => `<li>${l.replace('-', '').trim()}</li>`).join('\n    ')}
  </ul>
</div>

<div class="section-title">Core Competencies</div>
<div class="competencies">
  ${['TypeScript', 'Node.js', 'Python', 'Go', 'AWS', 'GCP', 'PostgreSQL', 'Kubernetes', 'Distributed Systems', 'Payments', 'Platform Operations', 'AI-Assisted Development']
    .map(tech => `<span class="tag">${tech}</span>`)
    .join('\n  ')}
</div>

<div class="section-title">Experience</div>

<div class="job">
  <div class="job-header">
    <div>
      <div class="job-company">Netmarble N2</div>
      <div class="job-role">Head of Gaming Strategy & Operations</div>
    </div>
  </div>
  <ul>
    <li>Owned \$200M+ cumulative B2C gaming revenue across portfolio</li>
    <li>Built company-wide BI feedback loops for game performance and KPI alignment</li>
    <li>Executive-level strategy, portfolio planning, and operational excellence</li>
  </ul>
</div>

<div class="job">
  <div class="job-header">
    <div>
      <div class="job-company">GGPoker</div>
      <div class="job-role">Lead Crypto Payments & B2B Operations</div>
    </div>
  </div>
  <ul>
    <li>Owned crypto payments infrastructure handling \$20M+/month transaction volume</li>
    <li>Drove \$1M+ annual cost savings through fee optimization and multi-chain infrastructure</li>
    <li>Reduced onboarding friction by 40% with KYC/AML and KYT integrations</li>
    <li>Grew crypto PSP volume from \$0 to \$2M/month in 10 months</li>
  </ul>
</div>

<div class="job">
  <div class="job-header">
    <div>
      <div class="job-company">SKY Play</div>
      <div class="job-role">Head of Blockchain</div>
    </div>
  </div>
  <ul>
    <li>Led blockchain strategy, partnerships, and token strategy</li>
    <li>Scaled on-chain adoption to 200K+ users, \$500K monthly transaction volume</li>
  </ul>
</div>

<div class="job">
  <div class="job-header">
    <div>
      <div class="job-company">ACTUALAB</div>
      <div class="job-role">Product & Platform Design Lead</div>
    </div>
  </div>
  <ul>
    <li>Led onboarding funnels, game mechanics, and MVP launch stabilization</li>
    <li>Delivered stable platform MVP with zero wallet outage at launch</li>
  </ul>
</div>

<div class="section-title">Education</div>
<div class="education">
  <strong>B.S. in Software Information</strong> • <strong>A.S. Network Engineering</strong>
</div>

</body>
</html>`;

    return html;
  } catch (error) {
    throw new Error(`Failed to generate resume: ${error.message}`);
  }
}

const port = parseInt(process.argv.find(arg => arg.startsWith('--port='))?.replace('--port=', '') || '9090', 10);

/**
 * Extract company name from filename
 * Formats: cv-name-company-date, resume-company-date
 */
function extractCompanyFromFilename(filename) {
  let company = '';
  if (filename.startsWith('resume-')) {
    const match = filename.match(/^resume-(.+?)-\d{4}-\d{2}-\d{2}$/);
    company = match ? match[1] : filename.replace(/^resume-/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
  } else if (filename.startsWith('cv-')) {
    const match = filename.match(/^cv-[^-]+-(.+?)-\d{4}-\d{2}-\d{2}$/);
    company = match ? match[1] : filename.replace(/^cv-[^-]-/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
  } else {
    company = filename;
  }
  return company.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Find PDF file matching HTML filename
 */
async function findPdfForHtml(htmlName) {
  try {
    const primaryPdf = resolve(OUTPUT_PDF_DIR, `${htmlName}.pdf`);
    if (existsSync(primaryPdf)) return primaryPdf;

    if (!existsSync(LEGACY_OUTPUT_PDF_DIR)) return null;
    const files = await readdir(LEGACY_OUTPUT_PDF_DIR);
    const match = files.find(f => f.replace(/\.pdf$/, '') === htmlName);
    return match ? resolve(LEGACY_OUTPUT_PDF_DIR, match) : null;
  } catch (error) {
    return null;
  }
}

/**
 * Find report file matching HTML filename
 */
async function findReportForHtml(htmlName) {
  try {
    if (!existsSync(REPORTS_DIR)) return null;
    const files = await readdir(REPORTS_DIR);
    // Extract company slug from htmlName
    let pattern = null;
    if (htmlName.startsWith('resume-')) {
      const match = htmlName.match(/^resume-(.+)$/);
      if (match) pattern = match[1];
    } else if (htmlName.startsWith('cv-')) {
      const match = htmlName.match(/^cv-[^-]+-(.+)$/);
      if (match) pattern = match[1];
    }
    if (!pattern) return null;
    const report = files.find(f => f.endsWith(`-${pattern}.md`));
    return report ? resolve(REPORTS_DIR, report) : null;
  } catch (error) {
    return null;
  }
}

/**
 * Find report file matching candidate company name
 */
async function findReportForCandidate(company) {
  try {
    if (!company || !existsSync(REPORTS_DIR)) return null;
    const files = await readdir(REPORTS_DIR);
    // Convert company name to slug: lowercase, spaces/hyphens normalized
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const report = files.find(f => f.includes(`-${slug}-`) && f.endsWith('.md'));
    return report ? resolve(REPORTS_DIR, report) : null;
  } catch (error) {
    return null;
  }
}

/**
 * List available HTML files with metadata and associated files
 */
async function listHtmlFiles() {
  try {
    const fs = await import('fs');
    const files = await readdir(OUTPUT_HTML_DIR);
    const fileData = [];

    for (const f of files) {
      if (f.endsWith('.html')) {
        const htmlName = f.replace('.html', '');
        const filePath = resolve(OUTPUT_HTML_DIR, f);
        try {
          const stats = await fs.promises.stat(filePath);
          const pdfPath = await findPdfForHtml(htmlName);
          const reportPath = await findReportForHtml(htmlName);

          fileData.push({
            name: htmlName,
            company: extractCompanyFromFilename(htmlName),
            mtime: stats.mtime.getTime(),
            mtimeStr: stats.mtime.toLocaleString(),
            hasPdf: pdfPath !== null,
            hasReport: reportPath !== null
          });
        } catch (err) {
          // Skip files we can't stat
        }
      }
    }

    // Sort by modification time descending (newest first)
    fileData.sort((a, b) => b.mtime - a.mtime);
    return fileData;
  } catch (error) {
    return [];
  }
}

/**
 * Find matching report file for a CV
 * Works with both old format (cv-name-company-date) and new format (resume-company-date)
 */
async function findReportForCv(cvId) {
  try {
    // Extract date (YYYY-MM-DD) from end of cvId, e.g., "2026-04-28"
    const dateMatch = cvId.match(/(\d{4}-\d{2}-\d{2})$/);
    if (!dateMatch) return null;

    const date = dateMatch[1];
    const files = await readdir(REPORTS_DIR);

    // Find report matching *-{date}.md (e.g., 010-hex-trust-2026-04-28.md)
    // This works with any company slug or number prefix
    const report = files.find(f => f.endsWith(`-${date}.md`));
    if (!report) return null;

    return resolve(REPORTS_DIR, report);
  } catch (error) {
    return null;
  }
}

/**
 * Convert markdown to basic HTML for display
 */
function markdownToHtml(md) {
  if (!md) return '';

  let html = md
    // Headers
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks (preserve as pre)
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Line breaks
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return `<p>${html}</p>`;
}

/**
 * Extract body content and styles from full HTML document
 */
function extractHtmlContent(fullHtml) {
  // Extract CSS from <style> tags
  const styleMatches = fullHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
  const styles = styleMatches.map(s => s.replace(/<\/?style[^>]*>/g, '')).join('\n');

  // Extract body content (everything between <body> and </body>)
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : fullHtml;

  return { styles, bodyContent };
}

/**
 * Simple router
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Debug logging for POST requests
  if (req.method === 'POST') {
    console.log(`[DEBUG] POST ${pathname}`);
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // GET / — Home page with file list
  if (req.method === 'GET' && pathname === '/') {
    try {
      const files = await listHtmlFiles();
      const html = buildIndexTemplate(files);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (error) {
      console.error('[HOME] Failed to load files:', error && error.stack ? error.stack : error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load files' }));
    }
    return;
  }

  // GET /view/:id
  if (req.method === 'GET' && pathname.startsWith('/view/')) {
    const id = pathname.replace('/view/', '');
    try {
      const htmlFile = resolve(OUTPUT_HTML_DIR, `${id}.html`);
      if (!existsSync(htmlFile)) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>CV not found</h1>');
        return;
      }
      const fullHtml = await readFile(htmlFile, 'utf-8');
      const { styles, bodyContent } = extractHtmlContent(fullHtml);

      // Find and load matching report
      let reportContent = null;
      const reportPath = await findReportForCv(id);
      if (reportPath) {
        reportContent = await readFile(reportPath, 'utf-8');
      }

      const template = buildEditorTemplate(bodyContent, id, reportContent, styles);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(template);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load CV' }));
    }
    return;
  }

  // POST /api/evaluate
  if (req.method === 'POST' && pathname === '/api/evaluate') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { jd, blocks, saveReport } = JSON.parse(body);
        if (!jd) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JD text required' }));
          return;
        }

        // Extract company and role from JD
        let company = 'Unknown Company';
        let role = 'Unknown Role';

        // Split into lines for easier parsing
        const lines = jd.split('\n').map(l => l.trim()).filter(l => l);

        lines.forEach(line => {
          const lowerLine = line.toLowerCase();
          if (lowerLine.startsWith('role:') || lowerLine.startsWith('position:') || lowerLine.startsWith('title:')) {
            role = line.split(':')[1].trim();
          }
          if (lowerLine.startsWith('company:') || lowerLine.startsWith('employer:')) {
            company = line.split(':')[1].trim();
          }
        });

        // Fallback: if still unknown, try to find reasonable defaults from content
        if (role === 'Unknown Role' && lines.length > 0) {
          const titleLine = lines.find(l => /^[A-Z].*(?:Engineer|Manager|Lead|Director|Officer|Architect)/i.test(l));
          if (titleLine) role = titleLine;
        }

        if (company === 'Unknown Company' && lines.length > 1) {
          const compLine = lines.find(l => /^[A-Z].*(?:Inc|Co|Corp|LLC|Labs|AI)/.test(l));
          if (compLine) company = compLine;
        }

        // Call evaluation engine (NO resume generation here)
        const result = await evaluate({
          blocks: blocks || ['A', 'B'],
          jd,
          company,
          role,
          saveReport: saveReport !== false,
          saveTracker: false
        });

        if (result.error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // POST /api/generate-resume
  if (req.method === 'POST' && pathname === '/api/generate-resume') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { company, role, jd, blocks } = JSON.parse(body);

        // Generate basic resume HTML from cv-brief.md
        const cvBriefPath = resolve(BASE, 'cv-brief.md');
        const resumeHtml = await generateBasicResume(cvBriefPath, company, new Date().toISOString().split('T')[0]);

        // Create output directory if needed
        const fs = await import('fs');
        await fs.promises.mkdir(OUTPUT_HTML_DIR, { recursive: true });

        // Save resume HTML with company-based filename
        const date = new Date().toISOString().split('T')[0];
        const slug = company.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const htmlFilename = `resume-${slug}-${date}`;
        const htmlPath = resolve(OUTPUT_HTML_DIR, `${htmlFilename}.html`);
        await writeFile(htmlPath, resumeHtml, 'utf-8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          htmlFilename,
          htmlPath
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // POST /api/save-pdf
  if (req.method === 'POST' && pathname === '/api/save-pdf') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { html, filename } = JSON.parse(body);
        if (!html) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'HTML content required' }));
          return;
        }

        const tmpHtml = resolve(BASE, 'output', 'html', `${filename}-tmp-editor.html`);
        const outputDir = OUTPUT_PDF_DIR;
        const outputPdf = resolve(outputDir, `${filename}.pdf`);

        // Ensure output directory exists
        await import('fs').then(fs => fs.promises.mkdir(outputDir, { recursive: true }));

        // Write temp HTML
        await writeFile(tmpHtml, html, 'utf-8');

        // Run generate-pdf.mjs
        const proc = spawn('node', ['generate-pdf.mjs', tmpHtml, outputPdf], {
          cwd: BASE,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stderr = '';
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', async (code) => {
          // Clean up
          try { await unlink(tmpHtml); } catch (_) {}

          if (code !== 0) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `PDF generation failed: ${stderr}` }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              path: outputPdf,
              message: `PDF saved to output/${filename}.pdf`
            }));
          }
        });

        proc.on('error', (error) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        });
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // GET /api/report/:id
  if (req.method === 'GET' && pathname.startsWith('/api/report/')) {
    const id = pathname.replace('/api/report/', '');
    try {
      const reportPath = await findReportForHtml(id);
      if (!reportPath || !existsSync(reportPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Report not found');
        return;
      }
      const content = await readFile(reportPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(content);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // GET /api/pdf/:id
  if (req.method === 'GET' && pathname.startsWith('/api/pdf/')) {
    const id = pathname.replace('/api/pdf/', '');
    try {
      const pdfPath = await findPdfForHtml(id);
      if (!pdfPath || !existsSync(pdfPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('PDF not found');
        return;
      }
      const content = await readFile(pdfPath);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${id}.pdf"`
      });
      res.end(content);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // POST /api/delete/:id
  if (req.method === 'POST' && pathname.startsWith('/api/delete/')) {
    const id = pathname.replace('/api/delete/', '');
    try {
      const htmlPath = resolve(OUTPUT_HTML_DIR, `${id}.html`);
      const pdfPath = await findPdfForHtml(id);
      const legacyPdfPath = resolve(LEGACY_OUTPUT_PDF_DIR, `${id}.pdf`);
      const reportPath = await findReportForHtml(id);

      // Delete HTML
      if (existsSync(htmlPath)) {
        await unlink(htmlPath);
      }

      // Delete PDF
      if (pdfPath && existsSync(pdfPath)) {
        await unlink(pdfPath);
      }
      if (legacyPdfPath !== pdfPath && existsSync(legacyPdfPath)) {
        await unlink(legacyPdfPath);
      }

      // Delete Report
      if (reportPath && existsSync(reportPath)) {
        await unlink(reportPath);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'CV and associated files deleted' }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // GET /api/queue — Load candidates from job_queue.jsonl (score >= 60)
  if (req.method === 'GET' && pathname === '/api/queue') {
    try {
      const queuePath = resolve(BASE, 'data', 'job_queue.jsonl');
      if (!existsSync(queuePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Queue file not found' }));
        return;
      }

      const queueContent = await readFile(queuePath, 'utf-8');
      const toMillis = (value) => {
        const time = new Date(value || '').getTime();
        return Number.isFinite(time) ? time : 0;
      };
      let candidates = queueContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(c => c && c.score >= 60)
        .sort((a, b) => {
          const dateDiff = toMillis(b.exported_at || b.collected_at) - toMillis(a.exported_at || a.collected_at);
          if (dateDiff !== 0) return dateDiff;
          const scoreDiff = (b.score || 0) - (a.score || 0);
          if (scoreDiff !== 0) return scoreDiff;
          return String(a.company || '').localeCompare(String(b.company || ''));
        });

      // Detect existing reports and PDFs for each candidate
      const reportsDir = resolve(BASE, 'reports');
      const pdfDir = resolve(BASE, 'output', 'pdf');

      if (existsSync(reportsDir) && existsSync(pdfDir)) {
        const reportFiles = await readdir(reportsDir);
        const pdfFiles = await readdir(pdfDir);

        candidates = candidates.map(c => {
          const slug = c.company.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

          // Look for matching report (most recent one with this company slug)
          const matchingReport = reportFiles
            .filter(f => f.includes(slug) && f.endsWith('.md'))
            .sort()
            .pop();
          if (matchingReport) {
            c.reportPath = resolve(reportsDir, matchingReport);
          }

          // Look for matching PDF (most recent one with this company slug)
          const matchingPdf = pdfFiles
            .filter(f => f.includes(slug) && f.endsWith('.pdf'))
            .sort()
            .pop();
          if (matchingPdf) {
            c.pdfPath = resolve(pdfDir, matchingPdf);
          }

          return c;
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(candidates));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // GET /api/candidate/:id — Get candidate details and existing report
  if (req.method === 'GET' && pathname.startsWith('/api/candidate/')) {
    try {
      const candidateId = pathname.replace('/api/candidate/', '');
      const queuePath = resolve(BASE, 'data', 'job_queue.jsonl');

      if (!existsSync(queuePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Queue file not found' }));
        return;
      }

      const queueContent = await readFile(queuePath, 'utf-8');
      let candidate = null;

      for (const line of queueContent.split('\n')) {
        if (!line.trim()) continue;
        try {
          const c = JSON.parse(line);
          if (c.id === candidateId) {
            candidate = c;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!candidate) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Candidate not found' }));
        return;
      }

      // Try to find existing report
      let reportContent = null;
      const reportPath = await findReportForCandidate(candidate.company);
      if (reportPath) {
        reportContent = await readFile(reportPath, 'utf-8');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidate, reportContent }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // POST /api/generate — Prepare candidate for evaluation (oferta → pdf workflow)
  if (req.method === 'POST' && pathname === '/api/generate') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { url, candidateId } = JSON.parse(body);
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'URL required' }));
          return;
        }

        // Return instructions for the client to switch to evaluate tab with this URL
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Ready for evaluation',
          candidateId,
          url,
          action: 'switch-to-evaluate',
          instruction: 'Switched to Evaluate tab with URL pre-filled. Select evaluation blocks and click Evaluate.'
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // POST /api/generate-report — Generate report for candidate
  if (req.method === 'POST' && pathname === '/api/generate-report') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { url, candidateId } = JSON.parse(body);
        if (!url || !candidateId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'URL and candidateId required' }));
          return;
        }

        // Call evaluation engine to generate report
        const result = await evaluate({
          blocks: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
          url,
          candidateId,
          saveReport: true,
          saveTracker: true
        });

        if (result.error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Report generated successfully',
          reportPath: result.reportPath
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // POST /api/generate-pdf — Generate PDF for candidate (requires report first)
  if (req.method === 'POST' && pathname === '/api/generate-pdf') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { candidateId } = JSON.parse(body);
        if (!candidateId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'candidateId required' }));
          return;
        }

        // Find candidate in queue
        const queuePath = resolve(BASE, 'data', 'job_queue.jsonl');
        const queueContent = await readFile(queuePath, 'utf-8');
        let candidate = null;

        for (const line of queueContent.split('\n')) {
          if (!line.trim()) continue;
          try {
            const c = JSON.parse(line);
            if (c.id === candidateId) {
              candidate = c;
              break;
            }
          } catch {
            continue;
          }
        }

        if (!candidate) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Candidate not found' }));
          return;
        }

        // Generate basic resume HTML from cv-brief.md
        const cvBriefPath = resolve(BASE, 'cv-brief.md');
        const resumeHtml = await generateBasicResume(cvBriefPath, candidate.company, new Date().toISOString().split('T')[0]);

        // Create output directory if needed
        const fs = await import('fs');
        await fs.promises.mkdir(OUTPUT_HTML_DIR, { recursive: true });

        // Save resume HTML with candidate-based filename
        const date = new Date().toISOString().split('T')[0];
        const slug = candidate.company.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const htmlFilename = `resume-${slug}-${date}`;
        const htmlPath = resolve(OUTPUT_HTML_DIR, `${htmlFilename}.html`);
        await writeFile(htmlPath, resumeHtml, 'utf-8');

        // Now generate PDF from HTML
        const outputDir = resolve(BASE, 'output', 'pdf');
        const outputPdf = resolve(outputDir, `${htmlFilename}.pdf`);

        await fs.promises.mkdir(outputDir, { recursive: true });

        // Run generate-pdf.mjs
        const proc = spawn('node', ['generate-pdf.mjs', htmlPath, outputPdf], {
          cwd: BASE,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stderr = '';
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', async (code) => {
          if (code !== 0) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `PDF generation failed: ${stderr}` }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: 'PDF generated successfully',
              pdfPath: outputPdf,
              htmlPath
            }));
          }
        });

        proc.on('error', (error) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        });
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

/**
 * Build index (home) page template with JD input
 */
function buildIndexTemplate(files) {
  // Build table rows for evaluations
  const listHtml = files.map(f => `
    <tr data-cv-id="${f.name}">
      <td class="company-cell">${f.company}</td>
      <td class="time-cell">${f.mtimeStr}</td>
      <td class="report-cell">
        ${f.hasReport ? `<a href="/view/${f.name}" class="btn-link">📋 Report</a>` : '<span class="empty">—</span>'}
      </td>
      <td class="cv-cell">
        <a href="/view/${f.name}" class="btn-link">✏️ Edit</a>
      </td>
      <td class="pdf-cell">
        ${f.hasPdf ? `<a href="/api/pdf/${f.name}" target="_blank" class="btn-link">📄 PDF</a>` : '<span class="empty">—</span>'}
      </td>
      <td class="delete-cell">
        <button class="btn-delete" onclick="deleteCv('${f.name}', '${f.company}')" title="Remove">✕</button>
      </td>
    </tr>
  `).join('');

  const count = files.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Career Ops - CV Editor</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --primary-light: #3b82f6;
      --text-primary: #1f2937;
      --text-secondary: #6b7280;
      --bg-primary: #ffffff;
      --bg-secondary: #f9fafb;
      --border-color: #e5e7eb;
      --success: #10b981;
      --error: #ef4444;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
      background: var(--bg-secondary);
      color: var(--text-primary);
      line-height: 1.5;
    }

    .container { max-width: 1200px; margin: 0 auto; background: var(--bg-primary); padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }

    h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 24px;
      color: var(--text-primary);
      letter-spacing: -0.5px;
    }

    .tabs {
      display: flex;
      gap: 0;
      margin-bottom: 24px;
      border-bottom: 2px solid var(--border-color);
    }

    .tab-btn {
      padding: 12px 20px;
      background: none;
      border: none;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 14px;
      transition: all 0.2s;
      position: relative;
      top: 2px;
    }

    .tab-btn:hover { color: var(--text-primary); }
    .tab-btn.active {
      border-bottom-color: var(--primary);
      color: var(--primary);
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .section { margin-bottom: 20px; }
    .section h2 { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: var(--text-primary); }
    .section .count { font-size: 12px; color: var(--text-secondary); margin-bottom: 10px; }

    textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 13px;
      background: var(--bg-secondary);
      transition: all 0.2s;
    }
    textarea:focus {
      outline: none;
      border-color: var(--primary);
      background: var(--bg-primary);
    }

    .block-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .block-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      background: var(--bg-secondary);
      border-radius: 6px;
      border: 1px solid var(--border-color);
      transition: all 0.2s;
    }
    .block-item:hover { border-color: var(--primary-light); }
    .block-item input { cursor: pointer; }
    .block-label { cursor: pointer; flex: 1; font-size: 13px; }
    .block-label .name { font-weight: 500; color: var(--text-primary); }
    .block-label .tokens { color: var(--text-secondary); font-size: 12px; }

    .token-estimate {
      background: var(--bg-secondary);
      padding: 12px 14px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 13px;
      border: 1px solid var(--border-color);
    }
    .token-estimate strong { color: var(--primary); }

    button {
      padding: 10px 18px;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      font-size: 14px;
      transition: all 0.2s;
    }
    button:hover { background: var(--primary-dark); }
    button:disabled { background: var(--text-secondary); cursor: not-allowed; opacity: 0.6; }

    .status { color: var(--text-secondary); font-size: 12px; margin-top: 12px; }
    .status.success { color: var(--success); }
    .status.error { color: var(--error); }

    ul { list-style: none; }
    li { margin-bottom: 8px; }

    .table-container {
      overflow-x: auto;
      border: 1px solid var(--border-color);
      border-radius: 6px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-primary);
    }

    .cvs-table {
      table-layout: fixed;
    }

    th {
      background: var(--bg-secondary);
      padding: 6px 8px;
      text-align: center;
      font-weight: 600;
      font-size: 12px;
      color: var(--text-primary);
      border-bottom: 2px solid var(--border-color);
    }

    td {
      padding: 5px 8px;
      border-bottom: 1px solid var(--border-color);
      font-size: 12px;
      text-align: center;
    }

    tr:hover { background: var(--bg-secondary); }

    .company-cell {
      font-weight: 600;
      color: var(--text-primary);
      width: 34%;
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.25;
    }

    .time-cell {
      font-size: 11px;
      color: var(--text-secondary);
      width: 26%;
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.25;
    }

    .report-cell, .pdf-cell, .cv-cell, .delete-cell {
      text-align: center;
      white-space: nowrap;
    }

    .report-cell { width: 14%; }
    .pdf-cell { width: 14%; }
    .cv-cell { width: 7%; }
    .delete-cell { width: 5%; }

    .btn-link {
      color: var(--primary);
      text-decoration: none;
      padding: 3px 6px;
      border-radius: 3px;
      transition: all 0.2s;
      display: inline-block;
      border: 1px solid transparent;
      font-size: 11px;
    }

    .btn-link:hover {
      background: var(--primary-light);
      color: white;
      text-decoration: none;
    }

    .btn-delete {
      background: var(--error);
      color: white;
      border: none;
      padding: 3px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      transition: all 0.2s;
    }

    .btn-delete:hover {
      background: #dc2626;
      transform: scale(1.05);
    }

    .empty { color: var(--text-secondary); font-style: italic; }
    .count { color: var(--text-secondary); font-size: 12px; margin-bottom: 12px; }
    .timestamp { color: var(--text-secondary); font-size: 11px; margin-right: 12px; font-family: 'Monaco', 'Menlo', monospace; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📄 Career Ops - CV Editor</h1>

    <div class="tabs">
      <button class="tab-btn" data-tab="evaluate">Evaluate JD</button>
      <button class="tab-btn active" data-tab="cvs">Saved CVs</button>
      <button class="tab-btn" data-tab="queue">Queue</button>
    </div>

    <!-- Tab 1: Evaluate -->
    <div id="evaluate" class="tab-content">
      <div class="section">
        <h2>Job Description</h2>
        <textarea id="jdInput" placeholder="Paste JD text or URL..." rows="6"></textarea>
      </div>

      <div class="section">
        <h2>Evaluation Blocks</h2>
        <div class="token-estimate">
          Estimated tokens: <strong id="tokenCount">3,000</strong> (Fast mode)
        </div>

        <div class="block-grid">
          <div class="block-item">
            <input type="checkbox" id="block-a" checked onchange="updateTokens()">
            <label class="block-label" for="block-a">
              <div class="name">A) Role Summary</div>
              <div class="tokens">~500 tokens</div>
            </label>
          </div>

          <div class="block-item">
            <input type="checkbox" id="block-b" checked onchange="updateTokens()">
            <label class="block-label" for="block-b">
              <div class="name">B) CV Match</div>
              <div class="tokens">~2,500 tokens</div>
            </label>
          </div>

          <div class="block-item">
            <input type="checkbox" id="block-c" onchange="updateTokens()">
            <label class="block-label" for="block-c">
              <div class="name">C) Level & Strategy 🔄</div>
              <div class="tokens">~1,500 tokens (cached)</div>
            </label>
          </div>

          <div class="block-item">
            <input type="checkbox" id="block-d" onchange="updateTokens()">
            <label class="block-label" for="block-d">
              <div class="name">D) Comp & Demand 🔄</div>
              <div class="tokens">~2,000 tokens (cached)</div>
            </label>
          </div>

          <div class="block-item">
            <input type="checkbox" id="block-e" onchange="updateTokens()">
            <label class="block-label" for="block-e">
              <div class="name">E) Personalization</div>
              <div class="tokens">~1,000 tokens</div>
            </label>
          </div>

          <div class="block-item">
            <input type="checkbox" id="block-f" onchange="updateTokens()">
            <label class="block-label" for="block-f">
              <div class="name">F) Interview Stories</div>
              <div class="tokens">~2,500 tokens</div>
            </label>
          </div>

          <div class="block-item">
            <input type="checkbox" id="block-g" onchange="updateTokens()">
            <label class="block-label" for="block-g">
              <div class="name">G) Legitimacy Check</div>
              <div class="tokens">~1,500 tokens</div>
            </label>
          </div>

          <div class="block-item">
            <input type="checkbox" id="save-report" checked onchange="updateTokens()">
            <label class="block-label" for="save-report">
              <div class="name">💾 Save Report</div>
              <div class="tokens">Auto-save to reports/</div>
            </label>
          </div>
        </div>
      </div>

      <button id="evaluateBtn" onclick="runEvaluation()">Evaluate (A-B)</button>
      <div id="status" class="status"></div>

      <!-- Evaluation results (hidden until after evaluation) -->
      <div id="resultsSection" style="display: none; margin-top: 30px;">
        <div class="section">
          <h2>📊 Evaluation Report</h2>
          <div id="reportContainer" style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 15px; border-radius: 4px; background: #f9f9f9; font-size: 13px; line-height: 1.6;">
            <!-- Report will be rendered here -->
          </div>
        </div>

        <div class="section">
          <button id="generateResumeBtn" onclick="generateResume()" style="background: #27ae60;">📝 Generate Resume from Evaluation</button>
          <div id="resumeStatus" class="status"></div>
        </div>
      </div>
    </div>

    <!-- Tab 2: Saved CVs -->
    <div id="cvs" class="tab-content active">
      <div class="section">
        <h2>Available CVs</h2>
        ${count > 0 ? `
          <p class="count">${count} file${count !== 1 ? 's' : ''} available</p>
          <table class="cvs-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Created</th>
                <th>Report</th>
                <th>Edit</th>
                <th>PDF</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${listHtml}
            </tbody>
          </table>
        ` : '<p class="empty">No CVs found in output/html/</p>'}
      </div>
    </div>

    <!-- Tab 3: Queue -->
    <div id="queue" class="tab-content">
      <div class="section">
        <h2>Queue Processing</h2>
        <p class="count">Candidates with score ≥ 60 from job_queue.jsonl</p>

        <div style="margin-bottom: 16px;">
          <input type="text" id="queueSearch" placeholder="Search by company or role..." style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;">
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap;">
          <div id="queueCountSummary" class="count" style="margin-bottom: 0;">Loading queue...</div>
          <div id="queuePagination" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;"></div>
        </div>

        <div id="generateStatus" class="status" style="margin-bottom: 12px;"></div>

        <div id="queueList" style="display: grid; gap: 12px;">
          <p class="empty">Loading queue...</p>
        </div>
      </div>
    </div>
  </div>

  <script>
    function updateTokens() {
      const costs = { a: 500, b: 2500, c: 1500, d: 2000, e: 1000, f: 2500, g: 1500 };
      let total = 0;
      const selected = [];
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach(block => {
        if (document.getElementById(\`block-\${block}\`).checked) {
          total += costs[block];
          selected.push(block.toUpperCase());
        }
      });
      document.getElementById('tokenCount').textContent = total.toLocaleString();

      // Update button label
      const btn = document.getElementById('evaluateBtn');
      if (selected.length === 0) {
        btn.textContent = 'Evaluate';
        btn.disabled = true;
      } else {
        btn.textContent = \`Evaluate (\${selected.join('-')})\`;
        btn.disabled = false;
      }
    }

    let currentEvaluation = null;

    async function runEvaluation() {
      const jd = document.getElementById('jdInput').value.trim();
      if (!jd) {
        setStatus('⚠️ Please paste a JD', 'error');
        return;
      }

      const blocks = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
        .filter(b => document.getElementById(\`block-\${b}\`).checked)
        .map(b => b.toUpperCase());

      const saveReport = document.getElementById('save-report').checked;

      const btn = document.getElementById('evaluateBtn');
      btn.disabled = true;
      btn.textContent = '⏳ Evaluating...';
      setStatus('');

      try {
        const response = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jd, blocks, saveReport })
        });

        if (!response.ok) throw new Error('Evaluation failed');

        const result = await response.json();

        // Store evaluation for resume generation
        currentEvaluation = {
          jd,
          blocks,
          saveReport,
          company: result.metadata.company,
          role: result.metadata.role,
          result
        };

        // Show report inline
        const reportHtml = formatReportHtml(result);
        document.getElementById('reportContainer').innerHTML = reportHtml;
        document.getElementById('resultsSection').style.display = 'block';

        setStatus('✓ Evaluation complete. Ready to generate resume.', 'success');
      } catch (error) {
        setStatus('✗ Error: ' + error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Evaluate (A-B)';
      }
    }

    function formatReportHtml(result) {
      const { metadata, blocks } = result;
      let html = \`<h3>\${metadata.company} - \${metadata.role}</h3>\`;
      html += \`<p><strong>Score:</strong> \${metadata.score != null && typeof metadata.score.toFixed === 'function' ? metadata.score.toFixed(1) : 'N/A'}/5</p>\`;
      html += \`<p><strong>Blocks executed:</strong> \${Array.isArray(metadata.blocksExecuted) ? metadata.blocksExecuted.join(', ') : 'None'}</p>\`;
      html += \`<p><strong>Tokens used:</strong> \${metadata.tokenEstimate || 'N/A'}</p>\`;
      html += '<hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;">';

      if (blocks.A) {
        html += '<h4 style="margin-top: 10px;">A) Role Summary</h4>';
        const summary = blocks.A.summary || blocks.A.level || '';
        html += '<p>' + (typeof summary === 'string' ? summary : JSON.stringify(summary)).substring(0, 300) + '...</p>';
      }

      if (blocks.B) {
        html += '<h4 style="margin-top: 10px;">B) CV Match</h4>';
        if (blocks.B.matches && Array.isArray(blocks.B.matches)) {
          html += \`<p><strong>Matches:</strong> \${blocks.B.matches.length}</p>\`;
          blocks.B.matches.slice(0, 3).forEach(m => {
            html += \`<li>✓ \${m && m.requirement ? m.requirement.substring(0, 80) : 'Match'}</li>\`;
          });
        }
        if (blocks.B.gaps && Array.isArray(blocks.B.gaps) && blocks.B.gaps.length > 0) {
          html += \`<p><strong>Gaps:</strong> \${blocks.B.gaps.length}</p>\`;
          blocks.B.gaps.slice(0, 2).forEach(g => {
            html += \`<li>✗ \${g && typeof g.substring === 'function' ? g.substring(0, 80) : g}</li>\`;
          });
        }
        if (blocks.B.matchPercentage !== undefined) {
          html += \`<p><strong>Match:</strong> \${Math.round(blocks.B.matchPercentage * 100)}%</p>\`;
        }
      }
      return html;
    }

    async function generateResume() {
      if (!currentEvaluation) {
        setStatus('⚠️ Please evaluate a JD first', 'error');
        return;
      }

      const btn = document.getElementById('generateResumeBtn');
      btn.disabled = true;
      btn.textContent = '⏳ Generating...';

      try {
        const response = await fetch('/api/generate-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company: currentEvaluation.company,
            role: currentEvaluation.role,
            jd: currentEvaluation.jd,
            blocks: currentEvaluation.blocks
          })
        });

        if (!response.ok) throw new Error('Resume generation failed');

        const result = await response.json();
        document.getElementById('resumeStatus').innerHTML = '✓ Resume generated. Opening editor...';
        document.getElementById('resumeStatus').className = 'status success';

        setTimeout(() => {
          window.location.href = \`/view/\${result.htmlFilename}\`;
        }, 1000);
      } catch (error) {
        document.getElementById('resumeStatus').innerHTML = '✗ ' + error.message;
        document.getElementById('resumeStatus').className = 'status error';
      } finally {
        btn.disabled = false;
        btn.textContent = '📝 Generate Resume from Evaluation';
      }
    }

    function setStatus(msg, cls) {
      const status = document.getElementById('status');
      status.textContent = msg;
      status.className = 'status ' + (cls || '');
    }

    async function deleteCv(name, company) {
      if (!confirm(\`Delete CV for \${company}?\`)) return;

      try {
        const response = await fetch(\`/api/delete/\${name}\`, { method: 'POST' });
        if (!response.ok) throw new Error('Delete failed');

        const result = await response.json();
        if (result.success) {
          // Remove row from table
          const row = document.querySelector(\`tr[data-cv-id="\${name}"]\`);
          if (row) row.style.opacity = '0.5';

          setTimeout(() => location.reload(), 500);
        }
      } catch (error) {
        alert('Failed to delete: ' + error.message);
      }
    }

    // Queue functions
    let queueCandidates = [];
    let queueFilteredCandidates = [];
    let queueCurrentPage = 1;
    let selectedCandidate = null;
    const QUEUE_PAGE_SIZE = 20;

    function getQueueDateValue(candidate) {
      const source = candidate && (candidate.exported_at || candidate.collected_at || '');
      const value = new Date(source).getTime();
      return Number.isFinite(value) ? value : 0;
    }

    function sortQueueCandidates(candidates) {
      return [...(candidates || [])].sort((a, b) => {
        const dateDiff = getQueueDateValue(b) - getQueueDateValue(a);
        if (dateDiff !== 0) return dateDiff;
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return String(a.company || '').localeCompare(String(b.company || ''));
      });
    }

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getQueueLocationText(candidate) {
      const parts = [
        candidate?.location,
        candidate?.city,
        candidate?.region,
        candidate?.country
      ].filter(Boolean);
      return parts.length ? parts.join(' · ') : 'Location unavailable';
    }

    function switchTab(tabName) {
      console.log('[switchTab] Switching to:', tabName);
      const contents = document.querySelectorAll('.tab-content');
      const buttons = document.querySelectorAll('.tab-btn');

      console.log('[switchTab] Found', contents.length, 'tab contents and', buttons.length, 'buttons');

      contents.forEach(el => {
        const isActive = el.id === tabName;
        console.log('[switchTab] Setting', el.id, 'to active:', isActive);
        el.classList.toggle('active', isActive);
        el.style.display = isActive ? 'block' : 'none';
      });

      buttons.forEach(btn => {
        const isActive = btn.dataset.tab === tabName;
        console.log('[switchTab] Button', btn.dataset.tab, 'to active:', isActive);
        btn.classList.toggle('active', isActive);
      });

      if (tabName === 'queue') {
        console.log('[switchTab] Queue tab activated, loading candidates');
        loadQueueCandidates();
      }
    }

    // Ensure the initial visible tab is applied consistently.
    console.log('[init] Initializing tabs');
    switchTab('cvs');

    // Set up tab button click handlers
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        console.log('[tab-click] User clicked tab:', tabName);
        switchTab(tabName);
      });
    });

    async function loadQueueCandidates() {
      try {
        const response = await fetch('/api/queue');
        if (!response.ok) throw new Error('Failed to load queue');

        queueCandidates = sortQueueCandidates(await response.json());
        queueFilteredCandidates = queueCandidates.slice();
        queueCurrentPage = 1;
        renderQueueList(queueFilteredCandidates);
      } catch (error) {
        document.getElementById('queueList').innerHTML = \`<p class="empty">Error loading queue: \${error.message}</p>\`;
        const summary = document.getElementById('queueCountSummary');
        if (summary) summary.textContent = 'Error loading queue';
      }
    }

    function renderQueueList(candidates) {
      queueFilteredCandidates = sortQueueCandidates(candidates || []);
      queueCurrentPage = 1;
      renderQueuePage();
    }

    function renderQueuePage() {
      const list = document.getElementById('queueList');
      const pagination = document.getElementById('queuePagination');
      const summary = document.getElementById('queueCountSummary');
      const status = document.getElementById('generateStatus');
      const total = queueFilteredCandidates.length;
      const totalPages = Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE));
      queueCurrentPage = Math.min(Math.max(queueCurrentPage, 1), totalPages);
      const startIndex = (queueCurrentPage - 1) * QUEUE_PAGE_SIZE;
      const pageCandidates = queueFilteredCandidates.slice(startIndex, startIndex + QUEUE_PAGE_SIZE);

      if (summary) {
        if (!total) {
          summary.textContent = 'No candidates found';
        } else {
          const endIndex = Math.min(startIndex + pageCandidates.length, total);
          summary.textContent = \`Showing \${startIndex + 1}-\${endIndex} of \${total} candidates\`;
        }
      }

      if (pagination) {
        if (!total) {
          pagination.innerHTML = '';
        } else {
          const prevDisabled = queueCurrentPage <= 1 ? 'disabled' : '';
          const nextDisabled = queueCurrentPage >= totalPages ? 'disabled' : '';
          pagination.innerHTML = \`
            <button class="btn-link" style="padding: 6px 10px; border: 1px solid var(--border-color); background: var(--bg-secondary); border-radius: 6px; cursor: pointer; \${queueCurrentPage <= 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}" \${prevDisabled} onclick="changeQueuePage(-1)">Prev</button>
            <span class="count" style="margin-bottom: 0;">Page \${queueCurrentPage} / \${totalPages}</span>
            <button class="btn-link" style="padding: 6px 10px; border: 1px solid var(--border-color); background: var(--bg-secondary); border-radius: 6px; cursor: pointer; \${queueCurrentPage >= totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}" \${nextDisabled} onclick="changeQueuePage(1)">Next</button>
          \`;
        }
      }

      if (status && !selectedCandidate) {
        status.textContent = '';
        status.className = 'status';
      }

      if (!pageCandidates.length) {
        list.innerHTML = '<p class="empty">No candidates found</p>';
        return;
      }

      const formatDateTime = (dateStr) => {
        if (!dateStr) return '—';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
               date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      };

      const html = \`
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed;">
          <thead style="background: var(--bg-secondary); border-bottom: 2px solid var(--border-color);">
            <tr>
              <th style="padding: 10px; text-align: left; font-weight: 600; width: 44%;">Company</th>
              <th style="padding: 10px; text-align: center; font-weight: 600; width: 12%;">Score</th>
              <th style="padding: 10px; text-align: center; font-weight: 600; width: 18%;">Recent</th>
              <th style="padding: 10px; text-align: center; font-weight: 600; width: 26%;">Action</th>
            </tr>
          </thead>
          <tbody>
            \${pageCandidates.map((c) => {
              const isSelected = selectedCandidate && selectedCandidate.id === c.id;
              const locationText = getQueueLocationText(c);
              const descriptionHtml = escapeHtml(c.description || '(No description)').replace(/\\n/g, '<br>');
              return \`
              <tr data-candidate-id="\${c.id}" class="queue-item" onclick="selectCandidate('\${c.id}')" style="border-bottom: 1px solid var(--border-color); transition: background 0.2s; cursor: pointer; \${isSelected ? 'background: rgba(37, 99, 235, 0.05);' : ''}" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='\${isSelected ? 'rgba(37, 99, 235, 0.05)' : 'transparent'}'">
                <td style="padding: 10px;">
                  <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="font-weight: 600; color: var(--text-primary); text-align: left;">\${escapeHtml(c.company)}</div>
                    <div style="color: var(--text-secondary); font-size: 12px; text-align: left;">\${escapeHtml(locationText)}</div>
                  </div>
                </td>
                <td style="padding: 10px; text-align: center;">
                  <span style="
                    background: var(--primary);
                    color: white;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-weight: 600;
                    font-size: 12px;
                    display: inline-block;
                  ">\${c.score}</span>
                </td>
                <td style="padding: 10px; text-align: center; font-size: 12px; color: var(--text-secondary);">
                  \${formatDateTime(c.exported_at || c.collected_at)}
                </td>
                <td style="padding: 10px; text-align: center;">
                  <div style="display: flex; justify-content: center; gap: 8px; align-items: center;">
                    <button onclick="event.stopPropagation(); generateForCandidate('\${c.id}')" class="btn-gen" title="Prepare offer" style="min-width: 84px;">oferta</button>
                    <button onclick="event.stopPropagation(); deleteCandidate('\${c.id}', '\${escapeHtml(c.company)}')" class="btn-delete" title="Remove">✕</button>
                  </div>
                </td>
              </tr>
              \${isSelected ? \`
                <tr class="queue-detail-row" data-detail-for="\${c.id}">
                  <td colspan="4" style="padding: 0 10px 16px 10px; border-bottom: 1px solid var(--border-color);">
                    <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px;">
                      <div style="display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                          <div style="font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">\${escapeHtml(c.company)} — \${escapeHtml(c.role || 'Role unavailable')}</div>
                          <div style="font-size: 12px; color: var(--text-secondary);">Location: \${escapeHtml(locationText)}</div>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); text-align: right;">
                          <div style="font-weight: 600; color: var(--primary); font-size: 13px;">Score \${c.score} / 100</div>
                          <div>\${formatDateTime(c.exported_at || c.collected_at)}</div>
                        </div>
                      </div>
                      <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">📋 Job Description</div>
                      <div style="white-space: pre-wrap; font-size: 12px; line-height: 1.65; color: var(--text-primary); background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; max-height: 260px; overflow-y: auto;">\${descriptionHtml}</div>
                    </div>
                  </td>
                </tr>
              \` : ''}
              \`;
            }).join('')}
          </tbody>
        </table>
      \`;

      list.innerHTML = html;
    }
    function changeQueuePage(delta) {
      const nextPage = queueCurrentPage + delta;
      const totalPages = Math.max(1, Math.ceil(queueFilteredCandidates.length / QUEUE_PAGE_SIZE));
      queueCurrentPage = Math.min(Math.max(nextPage, 1), totalPages);
      renderQueuePage();
    }

    async function selectCandidate(candidateId) {
      try {
        const candidate = queueCandidates.find(c => c.id === candidateId);
        if (!candidate) throw new Error('Candidate not found');

        selectedCandidate = candidate;
        renderQueuePage();

        const status = document.getElementById('generateStatus');
        if (status) {
          status.textContent = '';
          status.className = 'status';
        }
      } catch (error) {
        alert('Error loading candidate: ' + error.message);
      }
    }

    function deleteCandidate(candidateId, company) {
      if (!confirm(\`Delete \${company} from queue?\`)) return;

      queueCandidates = queueCandidates.filter(c => c.id !== candidateId);

      if (selectedCandidate && selectedCandidate.id === candidateId) {
        selectedCandidate = null;
      }

      renderQueueList(queueCandidates);
    }

    async function generateForCandidate(candidateId = null) {
      if (candidateId && (!selectedCandidate || selectedCandidate.id !== candidateId)) {
        const candidate = queueCandidates.find(c => c.id === candidateId);
        if (candidate) {
          selectedCandidate = candidate;
        }
      }

      if (!selectedCandidate) {
        alert('Please select a candidate first');
        return;
      }

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: selectedCandidate.url,
            candidateId: selectedCandidate.id
          })
        });

        if (!response.ok) throw new Error('Generation failed');

        await response.json();

        document.getElementById('jdInput').value = selectedCandidate.url;

        const statusMsg = '✓ Prepared for Evaluate tab. URL pre-filled: ' + selectedCandidate.company + ' — ' + selectedCandidate.role;
        document.getElementById('generateStatus').innerHTML = statusMsg;
        document.getElementById('generateStatus').className = 'status success';

        setTimeout(() => {
          switchTab('evaluate');
        }, 500);
      } catch (error) {
        document.getElementById('generateStatus').innerHTML = '✗ ' + error.message;
        document.getElementById('generateStatus').className = 'status error';
      }
    }

    async function generateReport(candidateId) {
      if (!selectedCandidate || selectedCandidate.id !== candidateId) {
        alert('Please select the candidate first');
        return;
      }

      const statusEl = document.getElementById('generateStatus');
      statusEl.innerHTML = '⏳ Generating report...';
      statusEl.className = 'status info';

      try {
        const response = await fetch('/api/generate-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: selectedCandidate.url,
            candidateId: selectedCandidate.id
          })
        });

        if (!response.ok) throw new Error('Report generation failed');

        const result = await response.json();
        statusEl.innerHTML = '✓ Report generated successfully';
        statusEl.className = 'status success';

        // Reload queue to update report status
        loadQueueCandidates();
        setTimeout(() => {
          selectCandidate(candidateId);
        }, 500);
      } catch (error) {
        statusEl.innerHTML = '✗ ' + error.message;
        statusEl.className = 'status error';
      }
    }

    async function generatePDF(candidateId) {
      if (!selectedCandidate || selectedCandidate.id !== candidateId) {
        alert('Please select the candidate first');
        return;
      }

      const statusEl = document.getElementById('generateStatus');
      statusEl.innerHTML = '⏳ Generating PDF...';
      statusEl.className = 'status info';

      try {
        const response = await fetch('/api/generate-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateId: selectedCandidate.id
          })
        });

        if (!response.ok) throw new Error('PDF generation failed');

        const result = await response.json();
        statusEl.innerHTML = '✓ PDF generated successfully';
        statusEl.className = 'status success';

        // Reload queue to update PDF status
        loadQueueCandidates();
        setTimeout(() => {
          selectCandidate(candidateId);
        }, 500);
      } catch (error) {
        statusEl.innerHTML = '✗ ' + error.message;
        statusEl.className = 'status error';
      }
    }

    (function () {
      const queueSearch = document.getElementById('queueSearch');
      if (!queueSearch) return;
      queueSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = queueCandidates.filter(c =>
          c.company.toLowerCase().includes(query) || c.role.toLowerCase().includes(query)
        );
        renderQueueList(filtered);
      });
    })();

    function markdownToHtml(md) {
      const safe = String(md || '');
      const lines = safe.split('\\n');
      const blocks = [];
      let listItems = [];

      const flushList = () => {
        if (!listItems.length) return;
        blocks.push('<ul style="list-style: disc; margin: 8px 0 8px 20px;">' + listItems.join('') + '</ul>');
        listItems = [];
      };

      const inlineFormat = (text) => text
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*(.+?)\\*/g, '<em>$1</em>');

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          flushList();
          continue;
        }

        const heading3 = line.match(/^### (.+)$/);
        if (heading3) {
          flushList();
          blocks.push('<h3 style="margin-top: 12px; font-size: 13px; font-weight: 600;">' + inlineFormat(heading3[1]) + '</h3>');
          continue;
        }

        const heading2 = line.match(/^## (.+)$/);
        if (heading2) {
          flushList();
          blocks.push('<h2 style="margin-top: 16px; font-size: 14px; font-weight: 700;">' + inlineFormat(heading2[1]) + '</h2>');
          continue;
        }

        const heading1 = line.match(/^# (.+)$/);
        if (heading1) {
          flushList();
          blocks.push('<h1 style="margin-top: 20px; font-size: 16px; font-weight: 700;">' + inlineFormat(heading1[1]) + '</h1>');
          continue;
        }

        const bullet = line.match(/^- (.+)$/);
        if (bullet) {
          listItems.push('<li style="margin-left: 20px;">' + inlineFormat(bullet[1]) + '</li>');
          continue;
        }

        flushList();
        blocks.push('<p>' + inlineFormat(line) + '</p>');
      }

      flushList();
      return blocks.join('');
    }
  </script>
</body>
</html>`;
}

/**
 * Build editor template with CV content and optional report
 */
function buildEditorTemplate(content, id, reportMd = null, cvStyles = '') {
  const reportHtml = reportMd ? markdownToHtml(reportMd) : '<p>No evaluation report found.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CV Editor - ${id}</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --primary-light: #3b82f6;
      --text-primary: #1f2937;
      --text-secondary: #6b7280;
      --bg-primary: #ffffff;
      --bg-secondary: #f9fafb;
      --border-color: #e5e7eb;
      --success: #10b981;
      --error: #ef4444;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg-secondary);
      color: var(--text-primary);
    }

    /* CV-specific styles */
    ${cvStyles}

    .toolbar {
      flex-shrink: 0;
      background: var(--bg-primary);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 20px;
      display: flex;
      gap: 8px;
      align-items: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .btn-edit {
      background: var(--primary);
      color: var(--bg-primary);
    }
    .btn-edit:hover { background: var(--primary-dark); }
    .btn-edit.active { background: var(--success); }

    .btn-export {
      background: var(--error);
      color: var(--bg-primary);
    }
    .btn-export:hover { background: #dc2626; }
    .btn-export:disabled {
      background: var(--text-secondary);
      cursor: not-allowed;
    }

    .status {
      margin-left: auto;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .split-container {
      display: flex;
      height: calc(100vh - 60px);
      gap: 0;
      width: 100%;
    }

    .report-panel {
      width: 50%;
      flex-shrink: 0;
      background: var(--bg-primary);
      border-right: 1px solid var(--border-color);
      overflow-y: auto;
      padding: 20px;
    }

    .report-panel h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 12px;
      color: var(--text-primary);
    }

    .report-panel h2 {
      font-size: 16px;
      font-weight: 700;
      margin-top: 20px;
      margin-bottom: 10px;
      color: var(--text-primary);
    }

    .report-panel h3 {
      font-size: 14px;
      font-weight: 700;
      margin-top: 16px;
      margin-bottom: 8px;
      color: var(--text-primary);
    }

    .report-panel p {
      margin-bottom: 12px;
      line-height: 1.6;
      color: var(--text-primary);
    }

    .report-panel strong {
      font-weight: 700;
      color: var(--text-primary);
    }

    .report-panel em {
      font-style: italic;
      color: var(--text-secondary);
    }

    .report-panel code {
      background: var(--bg-secondary);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      color: var(--text-primary);
    }

    .report-panel pre {
      background: var(--bg-secondary);
      padding: 12px;
      border-radius: 4px;
      border: 1px solid var(--border-color);
      overflow-x: auto;
      margin-bottom: 12px;
    }

    .report-panel a {
      color: var(--primary);
      text-decoration: none;
    }

    .report-panel a:hover {
      text-decoration: underline;
      color: var(--primary-dark);
    }

    .cv-panel {
      flex: 1;
      background: var(--bg-secondary);
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .cv-container {
      flex: 1;
      background: var(--bg-primary);
      margin: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-radius: 4px;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .cv-content {
      padding: 40px;
    }

    .cv-content.editing {
      outline: 2px dashed var(--primary);
      outline-offset: -2px;
      background: var(--bg-secondary);
    }

    /* Override page layout for editor context */
    .cv-content .page {
      max-width: none;
      margin: 0;
      padding: 0;
    }

    /* Ensure embedded images and media work */
    .cv-content img {
      max-width: 100%;
      height: auto;
      display: block;
    }
  </style>
</head>
<body>
  <div class="split-container">
    <div class="report-panel">
      ${reportHtml}
    </div>

    <div class="cv-panel">
      <div class="toolbar">
        <button class="btn-edit" id="editBtn">✏️ Edit</button>
        <button class="btn-export" id="exportBtn">📥 Export PDF</button>
        <span class="status" id="status">Ready</span>
      </div>

      <div class="cv-container">
        <div class="cv-content" id="cvContent" contenteditable="false">
          ${content}
        </div>
      </div>
    </div>
  </div>

  <script>
    const cvStyles = \`${cvStyles.replace(/`/g, '\\`')}\`;
    const editBtn = document.getElementById('editBtn');
    const exportBtn = document.getElementById('exportBtn');
    const cvContent = document.getElementById('cvContent');
    const status = document.getElementById('status');
    let isEditing = false;

    editBtn.addEventListener('click', () => {
      isEditing = !isEditing;
      cvContent.contentEditable = isEditing;
      editBtn.textContent = isEditing ? '✅ Done' : '✏️ Edit';
      editBtn.classList.toggle('active', isEditing);
      cvContent.classList.toggle('editing', isEditing);

      if (isEditing) {
        cvContent.focus();
        status.textContent = 'Editing mode';
      } else {
        status.textContent = 'Ready';
      }
    });

    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      exportBtn.textContent = '⏳ Generating...';
      status.textContent = 'Generating PDF...';

      try {
        // Exit editing mode
        if (isEditing) {
          isEditing = false;
          cvContent.contentEditable = false;
          editBtn.textContent = '✏️ Edit';
          editBtn.classList.remove('active');
          cvContent.classList.remove('editing');
        }

        // Extract only the resume content (cv-content) with proper HTML wrapping and styles
        const resumeContent = cvContent.innerHTML;
        const htmlDocument = \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${id}</title>
  <style>
    \${cvStyles}
  </style>
</head>
<body>
\${resumeContent}
</body>
</html>\`;

        const response = await fetch('/api/save-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            html: htmlDocument,
            filename: '${id}'
          })
        });

        if (!response.ok) {
          let error = 'PDF generation failed';
          try {
            const data = await response.json();
            error = data.error || error;
          } catch (_) {}
          throw new Error(error);
        }

        const data = await response.json();
        status.textContent = '✓ Saved to output';
      } catch (error) {
        status.textContent = '✗ Error: ' + error.message;
        alert('Failed to export PDF: ' + error.message);
      } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = '📥 Export PDF';
      }
    });
  </script>
</body>
</html>`;
}

// Start server
const server = http.createServer(handleRequest);
server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}`;
  console.log(`\n✓ CV Editor server started`);
  console.log(`  URL: ${url}`);
  console.log(`  Dir: ${OUTPUT_HTML_DIR}`);
  console.log(`  Press Ctrl+C to stop\n`);

  // Auto-open browser
  exec(`open "${url}"`, (error) => {
    if (error) {
      console.log(`  (Could not auto-open browser — open manually: ${url})`);
    }
  });
});

process.on('SIGINT', () => {
  console.log('\n✓ Server stopped');
  process.exit(0);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`✗ Port ${port} is already in use`);
  } else {
    console.error('Server error:', error);
  }
  process.exit(1);
});
