#!/usr/bin/env node

/**
 * Switch between profiles (lewis, wife)
 * Usage: node switch-profile.mjs lewis|wife
 */

import { copyFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const profiles = ['lewis', 'wife'];
const files = [
  { src: 'cv-{profile}.md', dst: 'cv.md' },
  { src: 'config/profile-{profile}.yml', dst: 'config/profile.yml' },
  { src: 'modes/_profile-{profile}.md', dst: 'modes/_profile.md' }
];

const profile = process.argv[2]?.toLowerCase();

if (!profile || !profiles.includes(profile)) {
  console.error(`Usage: node switch-profile.mjs [${profiles.join('|')}]`);
  console.error(`Current available profiles: ${profiles.join(', ')}`);
  process.exit(1);
}

console.log(`Switching to ${profile} profile...`);

try {
  for (const file of files) {
    const src = resolve(ROOT, file.src.replace('{profile}', profile));
    const dst = resolve(ROOT, file.dst);

    if (!existsSync(src)) {
      console.error(`✗ Source file not found: ${src}`);
      process.exit(1);
    }

    copyFileSync(src, dst);
    console.log(`✓ ${file.dst}`);
  }

  console.log(`\n✅ Switched to ${profile} profile`);
  console.log(`Active profile: ${profile}`);
} catch (err) {
  console.error('Error switching profile:', err.message);
  process.exit(1);
}
