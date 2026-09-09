#!/usr/bin/env node

/**
 * run.mjs
 *
 * End-to-end collection entrypoint: run the careers scan first so configured
 * portal sources are part of the normal collection flow. In dry-run mode this
 * verifies integration without writing to downstream files.
 */

import { spawnSync } from 'child_process';

const dryRun = process.argv.includes('--dry-run');
const scanArgs = ['scan.mjs'];
if (dryRun) scanArgs.push('--dry-run');

const scan = spawnSync('node', scanArgs, {
  cwd: process.cwd(),
  encoding: 'utf8',
});

if (scan.stdout) process.stdout.write(scan.stdout);
if (scan.stderr) process.stderr.write(scan.stderr);
if (scan.status !== 0) process.exit(scan.status ?? 1);

const stdout = scan.stdout || '';
const addedMatch = stdout.match(/New offers added:\s+(\d+)/);
const scannedMatch = stdout.match(/Companies scanned:\s+(\d+)/);
const successMatch = stdout.match(/Fetch successes:\s+(\d+)/);
const failureMatch = stdout.match(/Fetch failures:\s+(\d+)/);
const foundMatch = stdout.match(/Total jobs found:\s+(\d+)/);
const added = Number(addedMatch?.[1] || 0);

console.log('\n/run integration summary');
console.log('scan.mjs invoked: yes');
console.log(`company scan target count: ${scannedMatch?.[1] || 'unknown'}`);
console.log(`fetch successes: ${successMatch?.[1] || 'unknown'}`);
console.log(`fetch failures: ${failureMatch?.[1] || 'unknown'}`);
console.log(`careers jobs found: ${foundMatch?.[1] || 'unknown'}`);
console.log(`downstream jobs ${dryRun ? 'would receive' : 'received'}: ${added}`);
console.log(`pipeline processing: ${dryRun ? 'skipped by dry-run' : 'continue with /career-ops pipeline mode'}`);
console.log('other collection sources: unchanged');
console.log(`duplicate writes: ${dryRun ? 'none; dry-run made no writes' : 'dedupe handled by scan.mjs before writing pipeline.md'}`);
