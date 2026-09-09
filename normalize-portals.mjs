#!/usr/bin/env node

/**
 * normalize-portals.mjs
 *
 * Normalizes careers URLs and provider metadata in portals.yml. Hostname-based
 * ATS detection wins over stale `provider: custom` entries.
 */

import { readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';

const PORTALS_PATH = 'portals.yml';
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

function inferProvider(careersUrl) {
  const url = careersUrl || '';
  if (/job-boards(?:\.eu)?\.greenhouse\.io\//.test(url) || /boards\.greenhouse\.io\//.test(url)) return 'greenhouse';
  if (/jobs\.lever\.co\//.test(url)) return 'lever';
  if (/jobs\.ashbyhq\.com\//.test(url)) return 'ashby';
  if (/apply\.workable\.com\//.test(url)) return 'workable';
  if (/jobs\.workable\.com\/company\//.test(url)) return 'workable';
  if (/\.teamtailor\.com\//.test(url)) return 'teamtailor';
  if (/\.myworkdayjobs\.com\//.test(url)) return 'workday';
  if (/careers\.smartrecruiters\.com\//.test(url)) return 'smartrecruiters';
  if (/\.bamboohr\.com\//.test(url)) return 'bamboohr';
  if (/\.recruitee\.com\//.test(url)) return 'recruitee';
  if (/ats\.rippling\.com\//.test(url)) return 'rippling';
  if (/jobs\.jobvite\.com\//.test(url)) return 'jobvite';
  return 'custom';
}

function resolveProvider(company) {
  const inferred = inferProvider(company.careers_url);
  const configured = (company.provider || '').toLowerCase().trim();
  if (configured === 'custom' && inferred !== 'custom') return inferred;
  return configured || inferred;
}

const config = yaml.load(readFileSync(PORTALS_PATH, 'utf8'));
for (const company of config.tracked_companies || []) {
  company.careers_url = canonicalizeUrl(company.careers_url);
  company.provider = resolveProvider(company);
}

writeFileSync(PORTALS_PATH, yaml.dump(config, {
  lineWidth: 120,
  noRefs: true,
  sortKeys: false,
}), 'utf8');

console.log(`Normalized ${config.tracked_companies?.length || 0} tracked companies in ${PORTALS_PATH}`);
