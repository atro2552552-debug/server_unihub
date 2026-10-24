import { createClient } from '@supabase/supabase-js';

let client;

function getStorageConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();

  if (!url || !serviceKey || !bucket) {
    const error = new Error('SUPABASE_STORAGE_NOT_CONFIGURED');
    error.code = 'SUPABASE_STORAGE_NOT_CONFIGURED';
    throw error;
  }

  if (!client) {
    client = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }

  return { client, bucket };
}

async function uploadSupabaseObject({ key, body, contentType }) {
  const { client: supabase, bucket } = getStorageConfig();
  const { error } = await supabase.storage.from(bucket).upload(key, body, {
    contentType,
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
}

async function downloadSupabaseObject(key) {
  const { client: supabase, bucket } = getStorageConfig();
  const { data, error } = await supabase.storage.from(bucket).download(key);
  if (error) throw error;
  if (!data) return null;

  return {
    body: Buffer.from(await data.arrayBuffer()),
    contentLength: data.size,
    contentType: data.type
  };
}

async function deleteSupabaseObject(key) {
  const { client: supabase, bucket } = getStorageConfig();
  const { error } = await supabase.storage.from(bucket).remove([key]);
  if (error) throw error;
}

export { uploadSupabaseObject, downloadSupabaseObject, deleteSupabaseObject };
