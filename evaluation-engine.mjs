#!/usr/bin/env node

/**
 * Lightweight local evaluation fallback for the CV editor.
 *
 * The primary evaluation path in `modes/pdf-editor-server.mjs` uses Claude.
 * This module keeps the editor usable when Claude is unavailable by returning
 * the same JSON shape expected by the UI.
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const DEFAULT_BLOCKS = ['A', 'B'];

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return DEFAULT_BLOCKS;
  return blocks.map(block => String(block).trim().toUpperCase()).filter(Boolean);
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

function detectCompany(jd, fallback) {
  const explicit = jd.match(/^\s*(?:company|employer)\s*:\s*(.+)$/im)?.[1]?.trim();
  if (explicit) return explicit;
  return fallback || 'Unknown Company';
}

function detectRole(jd, fallback) {
  const explicit = jd.match(/^\s*(?:role|position|title)\s*:\s*(.+)$/im)?.[1]?.trim();
  if (explicit) return explicit;
  const titleish = jd
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 6 && line.length < 90 && /manager|lead|engineer|product|payment|wallet|operations|specialist|director/i.test(line));
  return titleish || fallback || 'Unknown Role';
}

function detectArchetype(jd) {
  const text = jd.toLowerCase();
  if (/payment|wallet|psp|settlement|stablecoin|transaction|crypto/.test(text)) {
    return 'Crypto Payments / Wallet Operations';
  }
  if (/igaming|casino|poker|betting|gaming/.test(text)) {
    return 'iGaming Operations';
  }
  if (/product owner|product manager|roadmap|stakeholder/.test(text)) {
    return 'Product / Operations';
  }
  if (/business operations|operations manager|process|vendor/.test(text)) {
    return 'B2B Operations';
  }
  return 'General Role';
}

function scoreFit(jd, cv, profile) {
  const text = `${jd}\n${cv}\n${profile}`.toLowerCase();
  const jdText = jd.toLowerCase();
  const signals = [
    'payment',
    'wallet',
    'crypto',
    'stablecoin',
    'psp',
    'kyc',
    'aml',
    'igaming',
    'gaming',
    'operations',
    'settlement',
    'compliance',
  ];
  const matched = signals.filter(signal => jdText.includes(signal) && text.includes(signal));
  const base = 2.4 + Math.min(matched.length * 0.22, 1.8);
  return Math.max(1, Math.min(5, Math.round(base * 10) / 10));
}

function bulletList(items) {
  return items.map(item => `- ${item}`).join('\n');
}

function buildBlocks({ selectedBlocks, jd, cv, profile, company, role, archetype, score }) {
  const jdLower = jd.toLowerCase();
  const blocks = {};

  if (selectedBlocks.includes('A')) {
    blocks.A = [
      `## A) Role Summary`,
      '',
      `- Company: ${company}`,
      `- Role: ${role}`,
      `- Detected archetype: ${archetype}`,
      `- Local fallback score: ${score.toFixed(1)}/5`,
      `- Work model: ${/remote/i.test(jd) ? 'Remote mentioned' : /hybrid/i.test(jd) ? 'Hybrid mentioned' : /dubai|uae|on-?site/i.test(jd) ? 'Dubai/UAE or on-site signal' : 'Unknown'}`,
      `- TL;DR: ${archetype} role with ${score >= 4 ? 'strong' : score >= 3 ? 'moderate' : 'limited'} apparent alignment to the current CV/profile.`,
    ].join('\n');
  }

  if (selectedBlocks.includes('B')) {
    const evidence = [];
    if (/payment|wallet|psp|settlement|transaction|stablecoin|crypto/.test(jdLower)) {
      evidence.push('CV includes $20M+/month crypto payment operations, wallet infrastructure, PSP coordination, and multi-chain operations.');
    }
    if (/kyc|aml|compliance|risk|fraud/.test(jdLower)) {
      evidence.push('CV includes KYC/AML, KYT, compliance workflows, fraud monitoring, SumSub, and Chainalysis context.');
    }
    if (/igaming|casino|poker|betting|gaming/.test(jdLower)) {
      evidence.push('CV includes GGPoker and Netmarble gaming/iGaming operating context.');
    }
    if (/stakeholder|cross-functional|vendor|partner|operations/.test(jdLower)) {
      evidence.push('Profile emphasizes PSP, compliance, engineering, CS, and business stakeholder coordination.');
    }

    blocks.B = [
      `## B) CV Match`,
      '',
      evidence.length ? bulletList(evidence) : '- No strong keyword match was detected by the local fallback engine.',
      '',
      'Potential gaps to verify:',
      bulletList([
        'Confirm exact seniority, ownership scope, reporting line, and compensation band.',
        'Check whether any required tools or licenses are hard blockers.',
        'Replace this fallback report with a full Claude evaluation before making a final application decision.',
      ]),
    ].join('\n');
  }

  if (selectedBlocks.includes('C')) {
    blocks.C = [
      `## C) Level & Strategy`,
      '',
      '- Position Lewis as an operator who has owned payment reliability, escalation flow, and regulated transaction operations.',
      '- Lead with scale: $20M+/month volume, 99.9% uptime, $1M+ annual savings, and $0 to $2M/month PSP growth.',
      '- If downleveled, negotiate scope, decision authority, 6-month review criteria, and compensation structure.',
    ].join('\n');
  }

  if (selectedBlocks.includes('D')) {
    blocks.D = [
      `## D) Compensation & Demand`,
      '',
      '- Local fallback cannot perform live market research.',
      '- Use profile target: AED 240K-300K target range, AED 200K minimum.',
      '- Verify company band before deep application work.',
    ].join('\n');
  }

  if (selectedBlocks.includes('E')) {
    blocks.E = [
      `## E) Personalization Plan`,
      '',
      bulletList([
        'Tailor summary to the detected archetype.',
        'Move payments, wallet, PSP, KYC/AML, and iGaming proof points into the top third of the CV.',
        'Mirror the JD wording honestly where experience exists.',
        'Add a short case-study style bullet for the strongest matching proof point.',
      ]),
    ].join('\n');
  }

  if (selectedBlocks.includes('F')) {
    blocks.F = [
      `## F) Interview Stories`,
      '',
      bulletList([
        'NPay.io wallet stabilization: situation, reliability target, cross-functional action, uptime/cost result, lesson.',
        'Crypto PSP launch: starting from zero volume, partner execution, growth to $2M/month, operational learning.',
        'ACTUALAB launch: MVP pressure, wallet outage prevention, support playbooks, launch stabilization.',
      ]),
    ].join('\n');
  }

  if (selectedBlocks.includes('G')) {
    blocks.G = [
      `## G) Posting Legitimacy`,
      '',
      '- Local fallback cannot verify live posting status.',
      '- Check source URL, company domain, recruiter identity, compensation clarity, and whether the role is still open.',
    ].join('\n');
  }

  return blocks;
}

export async function evaluate(options = {}) {
  const selectedBlocks = normalizeBlocks(options.blocks);
  const jd = String(options.jd || options.description || '').trim();
  const cv = await readOptional(resolve(ROOT, 'cv.md'));
  const profile = [
    await readOptional(resolve(ROOT, 'config', 'profile.yml')),
    await readOptional(resolve(ROOT, 'modes', '_profile.md')),
  ].join('\n');

  const company = detectCompany(jd, options.company);
  const role = detectRole(jd, options.role);
  const archetype = detectArchetype(jd);
  const score = scoreFit(jd, cv, profile);

  return {
    metadata: {
      company,
      role,
      archetype,
      score,
      legitimacy: 'Proceed with Caution',
      blocksExecuted: selectedBlocks,
      tokenEstimate: Math.ceil((jd.length + cv.length + profile.length) / 4),
    },
    blocks: buildBlocks({
      selectedBlocks,
      jd,
      cv,
      profile,
      company,
      role,
      archetype,
      score,
    }),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const jd = process.argv.slice(2).join(' ') || 'Role: Payments Operations Manager\nCompany: Unknown';
  const result = await evaluate({ jd, blocks: ['A', 'B', 'C', 'G'] });
  console.log(JSON.stringify(result, null, 2));
}
