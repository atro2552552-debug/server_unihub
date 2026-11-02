import { createClient } from '@supabase/supabase-js';

let client;

function getStorageConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  // SUPABASE_SERVICE_ROLE_KEY is kept as a fallback for existing deployments.
  const serviceKey = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    const error = new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in the server environment.');
    error.code = 'SUPABASE_STORAGE_NOT_CONFIGURED';
    throw error;
  }

  if (!client) {
    client = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }

  return {
    client,
    url: url.replace(/\/+$/, ''),
    serviceKey,
    // This bucket is only used to read objects created by the previous layout.
    legacyBucket: process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'course-files'
  };
}

function getStorageCandidates(key, config) {
  const storageKey = typeof key === 'string' ? key.replace(/^\/+/, '') : '';
  const separator = storageKey.indexOf('/');
  const prefix = separator === -1 ? '' : storageKey.slice(0, separator);
  const objectPath = separator === -1 ? '' : storageKey.slice(separator + 1);
  const bucketByPrefix = {
    'course-files': process.env.SUPABASE_COURSE_FILES_BUCKET?.trim() || 'course-files',
    'image-posts': process.env.SUPABASE_IMAGE_POSTS_BUCKET?.trim() || 'image-posts',
    'profile-avatars': process.env.SUPABASE_PROFILE_AVATARS_BUCKET?.trim() || 'profile-avatars'
  };

  if (!storageKey || storageKey.includes('\\') || storageKey.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Invalid Supabase storage key.');
  }

  const bucket = bucketByPrefix[prefix];
  const primary = bucket && objectPath
    ? { bucket, path: objectPath }
    : { bucket: config.legacyBucket, path: storageKey };
  const candidates = [primary];

  // Existing records used the whole prefixed key inside one shared bucket.
  const legacy = { bucket: config.legacyBucket, path: storageKey };
  if (legacy.bucket !== primary.bucket || legacy.path !== primary.path) {
    candidates.push(legacy);
  }

  return candidates;
}

function isNotFound(error) {
  return Number(error?.statusCode || error?.status) === 404 || error?.name === 'NotFound';
}

function makeStorageError(bucket, status = 404) {
  const message = status === 404
    ? `Supabase object not found in bucket "${bucket}".`
    : `Supabase Storage returned HTTP ${status} for bucket "${bucket}".`;
  const error = new Error(message);
  error.status = status;
  error.statusCode = String(status);
  error.name = status === 404 ? 'NotFound' : 'StorageHttpError';
  return error;
}

async function uploadSupabaseObject({ key, body, contentType }) {
  const config = getStorageConfig();
  const [{ bucket, path: objectPath }] = getStorageCandidates(key, config);
  const { error } = await config.client.storage.from(bucket).upload(objectPath, body, {
    contentType,
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
}

async function createSupabaseUploadUrl(key) {
  const config = getStorageConfig();
  const [{ bucket, path: objectPath }] = getStorageCandidates(key, config);
  const { data, error } = await config.client.storage.from(bucket).createSignedUploadUrl(objectPath);
  if (error) throw error;
  return data;
}

async function getSupabaseObjectInfo(key) {
  const config = getStorageConfig();
  let lastNotFound;

  for (const candidate of getStorageCandidates(key, config)) {
    const { data, error } = await config.client.storage.from(candidate.bucket).info(candidate.path);
    if (!error) return data;
    if (!isNotFound(error)) throw error;
    lastNotFound = error;
  }

  throw lastNotFound || makeStorageError('unknown');
}

async function getSupabaseObjectPrefix(key, length = 5) {
  const config = getStorageConfig();
  let lastNotFound;

  for (const candidate of getStorageCandidates(key, config)) {
    const objectPath = candidate.path.split('/').map(encodeURIComponent).join('/');
    const headers = {
      apikey: config.serviceKey,
      Range: `bytes=0-${length - 1}`
    };

    // Legacy service-role keys are JWTs; the new sb_secret keys are not.
    if (config.serviceKey.startsWith('eyJ')) {
      headers.Authorization = `Bearer ${config.serviceKey}`;
    }

    const response = await fetch(
      `${config.url}/storage/v1/object/${encodeURIComponent(candidate.bucket)}/${objectPath}`,
      { headers }
    );

    if (!response.ok) {
      const error = makeStorageError(candidate.bucket, response.status);
      if (response.status === 404) {
        lastNotFound = error;
        continue;
      }
      throw error;
    }

    if (!response.body) {
      return Buffer.from(await response.arrayBuffer()).subarray(0, length);
    }

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

  throw lastNotFound || makeStorageError('unknown');
}

async function downloadSupabaseObject(key) {
  const config = getStorageConfig();
  let lastNotFound;

  for (const candidate of getStorageCandidates(key, config)) {
    const { data, error } = await config.client.storage.from(candidate.bucket).download(candidate.path);
    if (!error) {
      if (!data) return null;
      return {
        body: Buffer.from(await data.arrayBuffer()),
        contentLength: data.size,
        contentType: data.type
      };
    }
    if (!isNotFound(error)) throw error;
    lastNotFound = error;
  }

  throw lastNotFound || makeStorageError('unknown');
}

async function deleteSupabaseObject(key) {
  const config = getStorageConfig();
  let removedFromAtLeastOneBucket = false;
  let lastNotFound;

  for (const candidate of getStorageCandidates(key, config)) {
    const { error } = await config.client.storage.from(candidate.bucket).remove([candidate.path]);
    if (!error) {
      removedFromAtLeastOneBucket = true;
      continue;
    }
    if (!isNotFound(error)) throw error;
    lastNotFound = error;
  }

  if (!removedFromAtLeastOneBucket && lastNotFound) throw lastNotFound;
}

export {
  uploadSupabaseObject,
  createSupabaseUploadUrl,
  getSupabaseObjectInfo,
  getSupabaseObjectPrefix,
  downloadSupabaseObject,
  deleteSupabaseObject
};
