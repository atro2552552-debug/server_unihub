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

  return { client, bucket, url, serviceKey };
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

async function createSupabaseUploadUrl(key) {
  const { client: supabase, bucket } = getStorageConfig();
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(key);
  if (error) throw error;
  return data;
}

async function getSupabaseObjectInfo(key) {
  const { client: supabase, bucket } = getStorageConfig();
  const { data, error } = await supabase.storage.from(bucket).info(key);
  if (error) throw error;
  return data;
}

async function getSupabaseObjectPrefix(key, length = 5) {
  const { bucket, url, serviceKey } = getStorageConfig();
  const objectPath = key.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${url.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Range: `bytes=0-${length - 1}`
    }
  });
  if (!response.ok) {
    const error = new Error(`Could not read uploaded object header (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  if (!response.body) return Buffer.from(await response.arrayBuffer()).subarray(0, length);
  const reader = response.body.getReader();
  let bytes = Buffer.alloc(0);
  while (bytes.length < length) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes = Buffer.concat([bytes, Buffer.from(value).subarray(0, length - bytes.length)]);
  }
  await reader.cancel().catch(() => {});
  return bytes;
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

export { uploadSupabaseObject, createSupabaseUploadUrl, getSupabaseObjectInfo, getSupabaseObjectPrefix, downloadSupabaseObject, deleteSupabaseObject };
