#!/usr/bin/env node
/**
 * Apply any SQL migration file directly to the configured Supabase project
 * using the Supabase Management API (reads NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_ACCESS_TOKEN from .env.local).
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/<file>.sql
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('Usage: node --env-file=.env.local scripts/apply-migration.mjs <path-to-sql>');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || '';
const match = supabaseUrl.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);

if (!match) {
  console.error('Could not derive Supabase project ref from NEXT_PUBLIC_SUPABASE_URL');
  process.exit(1);
}
if (!accessToken) {
  console.error('SUPABASE_ACCESS_TOKEN is not set in .env.local');
  process.exit(1);
}

const projectRef = match[1];
const fullPath = path.resolve(sqlPath);
const query = await fs.readFile(fullPath, 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Supabase migration failed (${res.status}): ${text}`);
  process.exit(1);
}

console.log(`✅ Applied ${path.basename(fullPath)} cleanly to Supabase project ${projectRef}`);
if (text && text !== '[]') {
  console.log('Response:', text.slice(0, 400));
}
