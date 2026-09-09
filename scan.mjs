#!/usr/bin/env node

/**
 * scan.mjs — Zero-token portal scanner
 *
 * Fetches ATS/provider APIs directly, applies title
 * filters from portals.yml, deduplicates against existing history,
 * and appends new offers to pipeline.md + scan-history.tsv.
 *
 * Zero Claude API tokens — pure HTTP + JSON.
 *
 * Usage:
 *   node scan.mjs                  # scan all enabled companies
 *   node scan.mjs --dry-run        # preview without writing files
 *   node scan.mjs --company Cohere # scan a single company
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
const parseYaml = yaml.load;

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

// Ensure required directories exist (fresh setup)
mkdirSync('data', { recursive: true });

const CONCURRENCY = 10;
const FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_FETCH_HEADERS = {
  'accept': 'text/html,application/json,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
};
const JSON_FETCH_HEADERS = {
  ...DEFAULT_FETCH_HEADERS,
  'accept': 'application/json,*/*;q=0.8',
};
const SUPPORTED_DIRECT_PROVIDERS = new Set([
  'greenhouse',
  'ashby',
  'lever',
  'workable',
  'workable_page',
  'teamtailor',
  'jobvite',
  'workday',
  'smartrecruiters',
  'bamboohr',
  'recruitee',
  'rippling',
  'custom_page',
]);

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  '_gl',
  '_ga',
]);

function canonicalizeUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key) || key.startsWith('_ga')) {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function normalizeProvider(provider) {
  return (provider || '').toLowerCase().trim();
}

function resolveProvider(company) {
  const inferred = inferProvider(company.careers_url);
  const configured = normalizeProvider(company.provider);
  if (configured === 'custom' && inferred !== 'custom') return inferred;
  return configured || inferred;
}

function inferProvider(careersUrl) {
  const url = careersUrl || '';
  if (/job-boards(?:\.eu)?\.greenhouse\.io\//.test(url) || /boards\.greenhouse\.io\//.test(url)) return 'greenhouse';
  if (/jobs\.lever\.co\//.test(url)) return 'lever';
  if (/jobs\.ashbyhq\.com\//.test(url)) return 'ashby';
  if (/apply\.workable\.com\//.test(url)) return 'workable';
  if (/jobs\.workable\.com\/company\//.test(url)) return 'workable';
  if (/\.teamtailor\.com\/jobs/.test(url)) return 'teamtailor';
  if (/\.myworkdayjobs\.com\//.test(url)) return 'workday';
  if (/careers\.smartrecruiters\.com\//.test(url)) return 'smartrecruiters';
  if (/\.bamboohr\.com\/careers/.test(url)) return 'bamboohr';
  if (/\.recruitee\.com\//.test(url)) return 'recruitee';
  if (/ats\.rippling\.com\//.test(url)) return 'rippling';
  if (/jobs\.jobvite\.com\//.test(url)) return 'jobvite';
  return 'custom';
}

// ── API detection ───────────────────────────────────────────────────

function detectApi(company) {
  const provider = resolveProvider(company);

  // Greenhouse: explicit api field
  if (company.api && company.api.includes('greenhouse')) {
    return { type: 'greenhouse', url: canonicalizeUrl(company.api), sourceType: 'ats_direct', confidence: 'high' };
  }

  const url = canonicalizeUrl(company.careers_url || '');

  // Ashby
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (provider === 'ashby' && ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  // Lever
  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (provider === 'lever' && leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  // Greenhouse EU boards
  const ghEuMatch = url.match(/(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([^/?#]+)/);
  if (provider === 'greenhouse' && ghEuMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghEuMatch[1]}/jobs`,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  const workableMatch = url.match(/apply\.workable\.com\/([^/?#]+)/);
  if (provider === 'workable' && workableMatch) {
    return {
      type: 'workable',
      url: `https://apply.workable.com/api/v3/accounts/${workableMatch[1]}/jobs`,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  if (provider === 'workable' && /jobs\.workable\.com\/company\//.test(url)) {
    return {
      type: 'workable_page',
      url,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  const teamtailorMatch = url.match(/https?:\/\/([^/?#]+\.teamtailor\.com)\/jobs/);
  if (provider === 'teamtailor' && teamtailorMatch) {
    return {
      type: 'teamtailor',
      url: `https://${teamtailorMatch[1]}/jobs.rss`,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  const jobviteMatch = url.match(/jobs\.jobvite\.com\/([^/?#]+)/);
  if (provider === 'jobvite' && jobviteMatch) {
    return {
      type: 'jobvite',
      url,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  const workdayMatch = url.match(/https?:\/\/([^/?#]+\.myworkdayjobs\.com)\/([^/?#]+)/);
  if (provider === 'workday' && workdayMatch) {
    const host = workdayMatch[1];
    const site = workdayMatch[2];
    const tenant = host.split('.')[0];
    return {
      type: 'workday',
      url: `https://${host}/wday/cxs/${tenant}/${site}/jobs`,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  const smartRecruitersMatch = url.match(/careers\.smartrecruiters\.com\/([^/?#]+)/);
  if (provider === 'smartrecruiters' && smartRecruitersMatch) {
    return {
      type: 'smartrecruiters',
      url: `https://api.smartrecruiters.com/v1/companies/${smartRecruitersMatch[1]}/postings`,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  const bambooHrMatch = url.match(/https?:\/\/([^/?#]+\.bamboohr\.com)\/careers/);
  if (provider === 'bamboohr' && bambooHrMatch) {
    return {
      type: 'bamboohr',
      url: `https://${bambooHrMatch[1]}/careers/list`,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  const recruiteeMatch = url.match(/https?:\/\/([^/?#]+\.recruitee\.com)/);
  if (provider === 'recruitee' && recruiteeMatch) {
    return {
      type: 'recruitee',
      url: `https://${recruiteeMatch[1]}/api/offers/`,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  const ripplingMatch = url.match(/ats\.rippling\.com\/([^/?#]+)\/jobs/);
  if (provider === 'rippling' && ripplingMatch) {
    return {
      type: 'rippling',
      url,
      sourceType: 'ats_direct',
      confidence: 'high',
    };
  }

  return { type: 'custom_page', provider, url, sourceType: 'careers_page', confidence: 'low' };
}

// ── API parsers ─────────────────────────────────────────────────────

function parseGreenhouse(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: canonicalizeUrl(j.absolute_url || ''),
    company: companyName,
    location: j.location?.name || '',
    posted_at: j.updated_at || null,
  }));
}

function parseAshby(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: canonicalizeUrl(j.jobUrl || ''),
    company: companyName,
    location: j.location || '',
    posted_at: j.publishedDate || j.updatedAt || null,
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '',
    url: canonicalizeUrl(j.hostedUrl || j.applyUrl || ''),
    company: companyName,
    location: j.categories?.location || '',
    posted_at: j.createdAt || null,
  }));
}

function parseWorkable(json, companyName) {
  const jobs = json.results || json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: canonicalizeUrl(j.url || j.shortlink || j.application_url || ''),
    company: companyName,
    location: [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(', ') || j.location?.location_str || '',
    posted_at: j.published || j.created_at || null,
  }));
}

function parseWorkablePage(html, companyName) {
  const embeddedJobs = html.match(/"jobs":(\[[\s\S]*?\])\s*,\s*"organizations"/);
  if (embeddedJobs) {
    try {
      const jobs = JSON.parse(embeddedJobs[1]);
      return jobs.map(j => ({
        title: j.title || '',
        url: canonicalizeUrl(j.url || ''),
        company: companyName,
        location: j.locations?.filter(Boolean).join(', ') || [j.location?.city, j.location?.subregion, j.location?.countryName].filter(Boolean).join(', '),
        posted_at: j.created || j.updated || null,
      }));
    } catch {
      // Fall through to link extraction below.
    }
  }

  const jobs = [];
  const seen = new Set();
  const linkPattern = /<a\b[^>]*href=["']([^"']*\/job\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const rawHref = decodeXml(match[1]);
    const title = stripTags(match[2]);
    if (!title || /^apply$/i.test(title) || /^view job$/i.test(title)) continue;

    const url = canonicalizeUrl(rawHref.startsWith('http') ? rawHref : `https://jobs.workable.com${rawHref}`);
    if (seen.has(url)) continue;
    seen.add(url);

    jobs.push({
      title,
      url,
      company: companyName,
      location: '',
      posted_at: null,
    });
  }
  return jobs;
}

function decodeXml(text) {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function parseTeamtailorRss(xml, companyName) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return items.map(([, item]) => {
    const title = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/);
    const link = item.match(/<link>([\s\S]*?)<\/link>/);
    const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    return {
      title: decodeXml((title?.[1] || title?.[2] || '').trim()),
      url: canonicalizeUrl(decodeXml((link?.[1] || '').trim())),
      company: companyName,
      location: '',
      posted_at: pubDate?.[1] || null,
    };
  });
}

function stripTags(html) {
  return decodeXml(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseJobviteHtml(html, companyName) {
  const jobs = [];
  const seen = new Set();
  const linkPattern = /<a\b[^>]*href=["']([^"']*\/job\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const rawHref = decodeXml(match[1]);
    const title = stripTags(match[2]);
    if (!title || /^apply$/i.test(title) || /^show more$/i.test(title)) continue;

    const url = canonicalizeUrl(rawHref.startsWith('http') ? rawHref : `https://jobs.jobvite.com${rawHref}`);
    if (seen.has(url)) continue;
    seen.add(url);

    jobs.push({
      title,
      url,
      company: companyName,
      location: '',
      posted_at: null,
    });
  }
  return jobs;
}

function parseWorkday(json, companyName, sourceUrl) {
  const postings = json.jobPostings || json.jobs || json.postings || [];
  return postings.map(j => ({
    title: j.title || '',
    url: canonicalizeUrl(j.externalPath ? new URL(j.externalPath, sourceUrl).toString() : j.url || ''),
    company: companyName,
    location: j.locationsText || j.location || '',
    posted_at: j.postedOn || j.startDate || null,
  }));
}

function parseSmartRecruiters(json, companyName) {
  const postings = json.content || json.postings || [];
  return postings.map(j => ({
    title: j.name || j.title || '',
    url: canonicalizeUrl(j.ref || j.url || j.applyUrl || ''),
    company: companyName,
    location: [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(', '),
    posted_at: j.releasedDate || j.updatedOn || null,
  }));
}

function parseBambooHr(json, companyName) {
  const jobs = json.result || json.jobs || [];
  return jobs.map(j => ({
    title: j.jobOpeningName || j.title || '',
    url: canonicalizeUrl(j.jobOpeningShareUrl || j.url || ''),
    company: companyName,
    location: j.location?.name || j.location || '',
    posted_at: j.datePosted || null,
  }));
}

function parseRecruitee(json, companyName) {
  const offers = json.offers || [];
  return offers.map(j => ({
    title: j.title || '',
    url: canonicalizeUrl(j.careers_url || j.url || ''),
    company: companyName,
    location: [j.city, j.country].filter(Boolean).join(', ') || j.location || '',
    posted_at: j.created_at || j.published_at || null,
  }));
}

function parseRipplingHtml(html, companyName) {
  const jobs = parseJsonLdJobs(html, companyName);
  if (jobs.length > 0) return jobs;
  return parseGenericCareersPage(html, companyName, 'https://ats.rippling.com');
}

function parseJsonLdJobs(html, companyName) {
  const jobs = [];
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of scripts) {
    try {
      const parsed = JSON.parse(decodeXml(raw.trim()));
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items.flatMap(i => i['@graph'] || i)) {
        if (item?.['@type'] !== 'JobPosting') continue;
        jobs.push({
          title: item.title || '',
          url: canonicalizeUrl(item.url || ''),
          company: companyName,
          location: item.jobLocation?.address?.addressLocality || item.jobLocation?.address?.addressCountry || '',
          posted_at: item.datePosted || null,
        });
      }
    } catch {
      // Ignore malformed JSON-LD and continue with other extraction methods.
    }
  }
  return jobs;
}

function parseGenericCareersPage(html, companyName, baseUrl) {
  const jsonLdJobs = parseJsonLdJobs(html, companyName);
  if (jsonLdJobs.length > 0) return jsonLdJobs;

  const jobs = [];
  const seen = new Set();
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const jobHrefPattern = /(job|jobs|career|careers|position|positions|opening|openings|vacanc|role|apply)/i;
  for (const match of html.matchAll(linkPattern)) {
    const rawHref = decodeXml(match[1]);
    const title = stripTags(match[2]);
    if (!rawHref || !title || title.length < 4 || title.length > 140) continue;
    if (!jobHrefPattern.test(rawHref) && !jobHrefPattern.test(title)) continue;
    if (/^(apply|view|learn more|read more|see all jobs|careers|jobs|open positions)$/i.test(title)) continue;

    let url = '';
    try {
      url = canonicalizeUrl(new URL(rawHref, baseUrl).toString());
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);

    jobs.push({
      title,
      url,
      company: companyName,
      location: '',
      posted_at: null,
    });
  }
  return jobs;
}

function parseCustomPage(html, companyName, sourceUrl) {
  return parseGenericCareersPage(html, companyName, sourceUrl);
}

const PARSERS = {
  greenhouse: parseGreenhouse,
  ashby: parseAshby,
  lever: parseLever,
  workable: parseWorkable,
  workable_page: parseWorkablePage,
  teamtailor: parseTeamtailorRss,
  jobvite: parseJobviteHtml,
  workday: parseWorkday,
  smartrecruiters: parseSmartRecruiters,
  bamboohr: parseBambooHr,
  recruitee: parseRecruitee,
  rippling: parseRipplingHtml,
  custom_page: parseCustomPage,
};

// ── Fetch with timeout ──────────────────────────────────────────────

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: JSON_FETCH_HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: DEFAULT_FETCH_HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProviderPayload(api) {
  if (api.type === 'custom_page') return fetchCustomPage(api.url);
  if (api.type === 'teamtailor' || api.type === 'jobvite' || api.type === 'workable_page' || api.type === 'rippling') return fetchText(api.url);
  if (api.type === 'workday') {
    return fetchJsonPost(api.url, { appliedFacets: {}, limit: 100, offset: 0, searchText: '' });
  }
  return fetchJson(api.url);
}

async function fetchCustomPage(url) {
  const candidates = buildCustomUrlCandidates(url);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return await fetchText(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('fetch failed');
}

function buildCustomUrlCandidates(rawUrl) {
  const candidates = [];
  try {
    const url = new URL(rawUrl);
    candidates.push(url.toString());
    for (const path of ['/careers', '/careers/', '/jobs', '/jobs/', '/careers.html']) {
      const alternate = new URL(url.origin);
      alternate.pathname = path;
      candidates.push(alternate.toString());
    }
    const host = url.hostname.startsWith('www.') ? url.hostname.slice(4) : `www.${url.hostname}`;
    const hostToggled = new URL(url.toString());
    hostToggled.hostname = host;
    candidates.push(hostToggled.toString());
  } catch {
    candidates.push(rawUrl);
  }
  return [...new Set(candidates.map(canonicalizeUrl))];
}

async function fetchJsonPost(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...JSON_FETCH_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Title filter ────────────────────────────────────────────────────

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

// ── Dedup ───────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  // scan-history.tsv
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) { // skip header
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  // pipeline.md — extract URLs from checkbox lines
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

  // applications.md — extract URLs from report links and any inline URLs
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  return seen;
}

function loadSeenCompanyRoles() {
  const seen = new Set();
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    // Parse markdown table rows: | # | Date | Company | Role | ...
    for (const match of text.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g)) {
      const company = match[1].trim().toLowerCase();
      const role = match[2].trim().toLowerCase();
      if (company && role && company !== 'company') {
        seen.add(`${company}::${role}`);
      }
    }
  }
  return seen;
}

// ── Pipeline writer ─────────────────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;

  let text = readFileSync(PIPELINE_PATH, 'utf-8');

  // Find "## Pendientes" section and append after it
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    // No Pendientes section — append at end before Procesadas
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    // Find the end of existing Pendientes content (next ## or end)
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;

    const block = '\n' + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date) {
  // Ensure file + header exist
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }

  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`
  ).join('\n') + '\n';

  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Parallel fetch with concurrency limit ───────────────────────────

async function parallelFetch(tasks, limit) {
  const results = [];
  let i = 0;

  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++];
      results.push(await task());
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

function categorizeFailure(error) {
  const message = error || '';
  if (/HTTP 401|HTTP 403|captcha|cloudflare|forbidden|blocked/i.test(message)) return 'blocked';
  if (/HTTP 30[1278]|redirect/i.test(message)) return 'redirect';
  if (/HTTP 404|HTTP 410|not found|gone/i.test(message)) return 'empty careers page';
  if (/HTTP \d+/i.test(message)) return 'HTTP error';
  if (/aborted|timeout/i.test(message)) return 'JS-rendered';
  if (/parse|JSON|Unexpected token|XML/i.test(message)) return 'parsing failure';
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|certificate/i.test(message)) return 'HTTP error';
  return 'HTTP error';
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jsonMode = args.includes('--json');
  const companyFlag = args.indexOf('--company');
  const filterCompany = companyFlag !== -1 ? args[companyFlag + 1]?.toLowerCase() : null;

  // 1. Read portals.yml
  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const companies = config.tracked_companies || [];
  const titleFilter = buildTitleFilter(config.title_filter);

  // 2. Filter to enabled companies with detectable APIs
  const targets = companies
    .filter(c => c.enabled !== false)
    .filter(c => !filterCompany || c.name.toLowerCase().includes(filterCompany))
    .map(c => {
      const provider = resolveProvider(c);
      return { ...c, provider, careers_url: canonicalizeUrl(c.careers_url || ''), _api: detectApi({ ...c, provider }) };
    });

  const enabledCompanies = companies.filter(c => c.enabled !== false);
  const providerCounts = new Map();
  for (const company of enabledCompanies) {
    const provider = resolveProvider(company);
    providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
  }
  const directTargets = targets.filter(c => c._api && !c._api.unsupported && SUPPORTED_DIRECT_PROVIDERS.has(c._api.type));
  const unsupportedTargets = targets.filter(c => !c._api || c._api.unsupported || !SUPPORTED_DIRECT_PROVIDERS.has(c._api.type));
  const skippedCount = unsupportedTargets.length;

  if (!jsonMode) {
    console.log(`Scanning ${directTargets.length} scan-capable companies (${skippedCount} unsupported)`);
    if (dryRun) console.log('(dry run — no files will be written)\n');
  }

  // 3. Load dedup sets
  const seenUrls = loadSeenUrls();
  const seenCompanyRoles = loadSeenCompanyRoles();

  // 4. Fetch all APIs
  const date = new Date().toISOString().slice(0, 10);
  let totalFound = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  let fetchSuccesses = 0;
  const newOffers = [];
  const errors = [];

  const tasks = directTargets.map(company => async () => {
    const { type, url } = company._api;
    try {
      const payload = await fetchProviderPayload(company._api);
      const jobs = PARSERS[type](payload, company.name, url);
      fetchSuccesses++;
      totalFound += jobs.length;

      for (const job of jobs) {
        if (!titleFilter(job.title)) {
          totalFiltered++;
          continue;
        }
        const canonicalUrl = canonicalizeUrl(job.url);
        if (seenUrls.has(canonicalUrl)) {
          totalDupes++;
          continue;
        }
        const key = `${job.company.toLowerCase()}::${job.title.toLowerCase()}::${(job.location || '').toLowerCase()}`;
        if (seenCompanyRoles.has(key)) {
          totalDupes++;
          continue;
        }
        // Mark as seen to avoid intra-scan dupes
        seenUrls.add(canonicalUrl);
        seenCompanyRoles.add(key);
        newOffers.push({
          company: job.company,
          title: job.title,
          location: job.location || '',
          url: canonicalUrl,
          posted_at: job.posted_at || null,
          provider: company.provider,
          source_type: company._api.sourceType,
          source: `${type}-api`,
        });
      }
    } catch (err) {
      errors.push({ company: company.name, provider: company.provider || type, adapter: type, error: err.message, category: categorizeFailure(err.message) });
    }
  });

  await parallelFetch(tasks, CONCURRENCY);

  // 5. Write results
  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  const providerCountsObject = Object.fromEntries([...providerCounts.entries()].sort());
  const summary = {
    date,
    companies_scanned: targets.length,
    scan_capable_companies: directTargets.length,
    unsupported_sources: unsupportedTargets.length,
    fetch_successes: fetchSuccesses,
    fetch_failures: errors.length,
    total_jobs_found: totalFound,
    filtered_by_title: totalFiltered,
    duplicates: totalDupes,
    new_offers_added: newOffers.length,
    provider_counts: providerCountsObject,
    errors,
    offers: newOffers,
    dry_run: dryRun,
  };

  if (jsonMode) {
    console.log(JSON.stringify(summary));
    return;
  }

  // 6. Print summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Portal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Companies scanned:     ${targets.length}`);
  console.log(`Scan-capable companies: ${directTargets.length}`);
  console.log(`Unsupported sources:    ${unsupportedTargets.length}`);
  console.log(`Fetch successes:        ${fetchSuccesses}`);
  console.log(`Fetch failures:         ${errors.length}`);
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFiltered} removed`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`New offers added:      ${newOffers.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  [WARN] ${e.provider} fetch failed: ${e.company} [${e.category}] (${e.error})`);
    }
  }

  if (errors.length > 0) {
    const failureCategories = new Map();
    const failureProviders = new Map();
    for (const e of errors) {
      failureCategories.set(e.category, (failureCategories.get(e.category) || 0) + 1);
      failureProviders.set(e.provider, (failureProviders.get(e.provider) || 0) + 1);
    }
    console.log('\nFailure categories:');
    for (const [category, count] of [...failureCategories.entries()].sort()) {
      console.log(`  ${category}: ${count}`);
    }
    console.log('\nFailures by provider:');
    for (const [provider, count] of [...failureProviders.entries()].sort()) {
      console.log(`  ${provider}: ${count}`);
    }
  }

  if (unsupportedTargets.length > 0) {
    console.log(`\nFallback sources (${unsupportedTargets.length}):`);
    for (const company of unsupportedTargets.slice(0, 25)) {
      console.log(`  [WARN] ${company.provider || 'custom'} source unsupported: ${company.name}`);
    }
    if (unsupportedTargets.length > 25) {
      console.log(`  ... ${unsupportedTargets.length - 25} more`);
    }
  }

  console.log('\nProvider counts:');
  for (const [provider, count] of [...providerCounts.entries()].sort()) {
    console.log(`  ${provider}: ${count}`);
  }
  console.log('\nProvider adapters: greenhouse, ashby, lever, workable, teamtailor, jobvite, workday, smartrecruiters, bamboohr, recruitee, rippling, custom_page');

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers) {
      console.log(`  + ${o.company} | ${o.title} | ${o.location || 'N/A'}`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
    } else {
      console.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
    }
  }

  console.log(`\n→ Run /career-ops pipeline to evaluate new offers.`);
  console.log('→ Share results and get help: https://discord.gg/8pRpHETxa4');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
