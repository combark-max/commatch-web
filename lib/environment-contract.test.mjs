import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const declaredNames = example
  .split(/\r?\n/)
  .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=$/)?.[1] ?? null)
  .filter(Boolean)
  .sort();

test('.env.example declares exactly the environment variables consumed by the application', () => {
  assert.deepEqual(declaredNames, [
    'CRON_SECRET',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY',
    'PUSH_WORKER_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VERCEL',
    'WEB_PUSH_VAPID_PRIVATE_KEY',
    'WEB_PUSH_VAPID_SUBJECT',
  ]);
  assert.doesNotMatch(example, /=\S+/);
});
