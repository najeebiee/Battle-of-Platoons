import { createClient } from '@supabase/supabase-js';

const bucket = process.env.STORAGE_BUCKET;
const sourceUrl = process.env.SOURCE_SUPABASE_URL;
const sourceKey = process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY;
const targetUrl = process.env.TARGET_SUPABASE_URL;
const targetKey = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY;

function describeError(error) {
  const details = [
    error?.message,
    error?.cause?.message,
    error?.cause?.code,
    error?.cause?.errno,
  ].filter(Boolean);

  return details.length > 0 ? details.join(' | ') : String(error);
}

function hostFromUrl(value) {
  try {
    return new URL(value).host;
  } catch {
    return 'invalid-url';
  }
}

if (!bucket || !sourceUrl || !sourceKey || !targetUrl || !targetKey) {
  console.error(`
Missing required env vars.

Set:
  STORAGE_BUCKET
  SOURCE_SUPABASE_URL
  SOURCE_SUPABASE_SERVICE_ROLE_KEY
  TARGET_SUPABASE_URL
  TARGET_SUPABASE_SERVICE_ROLE_KEY
`);
  process.exit(1);
}

const source = createClient(sourceUrl, sourceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const target = createClient(targetUrl, targetKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let copied = 0;
let failed = 0;

async function listFiles(prefix = '') {
  let data;
  let error;

  try {
    const result = await source.storage.from(bucket).list(prefix, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });
    data = result.data;
    error = result.error;
  } catch (caughtError) {
    throw new Error(`Failed to list "${prefix || '/'}": ${describeError(caughtError)}`);
  }

  if (error) {
    throw new Error(`Failed to list "${prefix || '/'}": ${describeError(error)}`);
  }

  for (const item of data || []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.id === null) {
      await listFiles(path);
      continue;
    }

    await copyFile(path, item.metadata?.mimetype);
  }
}

async function copyFile(path, contentType) {
  const { data: file, error: downloadError } = await source.storage
    .from(bucket)
    .download(path);

  if (downloadError) {
    failed += 1;
    console.error(`download failed: ${path} - ${describeError(downloadError)}`);
    return;
  }

  const { error: uploadError } = await target.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType,
  });

  if (uploadError) {
    failed += 1;
    console.error(`upload failed: ${path} - ${describeError(uploadError)}`);
    return;
  }

  copied += 1;
  if (copied % 25 === 0) {
    console.log(`copied ${copied} files...`);
  }
}

console.log(`Copying storage bucket "${bucket}"...`);
console.log(`Source host: ${hostFromUrl(sourceUrl)}`);
console.log(`Target host: ${hostFromUrl(targetUrl)}`);

try {
  await listFiles();
  console.log(`Done. copied=${copied} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
} catch (error) {
  console.error(describeError(error));
  process.exit(1);
}
