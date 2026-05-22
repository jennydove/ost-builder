/**
 * One-shot script: rewrite all shares' markdown to include stable card IDs.
 *
 * Run once after Phase 1 deploy. Idempotent — shares whose markdown already
 * contains {#id} markers parse to the same output, so the UPDATE is skipped.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/backfill-card-ids.mts
 */
import { createClient } from '@supabase/supabase-js';
import { parseMarkdownToTree, serializeTreeToMarkdown } from '@ost-builder/shared';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: shares, error } = await supabase
  .from('shares')
  .select('id, name, markdown');

if (error) {
  console.error('Failed to list shares:', error.message);
  process.exit(1);
}

let updated = 0;
let skipped = 0;

for (const row of shares ?? []) {
  const original = row.markdown as string;
  const tree = parseMarkdownToTree(original);
  const rewritten = serializeTreeToMarkdown(tree, row.name as string | undefined);

  if (rewritten === original) {
    skipped += 1;
    continue;
  }

  const { error: updateError } = await supabase
    .from('shares')
    .update({ markdown: rewritten })
    .eq('id', row.id);

  if (updateError) {
    console.error(`Failed to update ${row.id}:`, updateError.message);
    continue;
  }

  console.log(`Updated ${row.id} (${row.name ?? 'unnamed'})`);
  updated += 1;
}

console.log(`Done. Updated ${updated}, skipped ${skipped}.`);
