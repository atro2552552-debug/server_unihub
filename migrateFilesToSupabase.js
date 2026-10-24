import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { connectDB, closeDB, getDB } from './config/db.js';
import { deleteSupabaseObject, uploadSupabaseObject } from './config/supabaseStorage.js';

dotenv.config();

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(currentDir, 'uploads');
const deleteLocalAfterCopy = process.argv.includes('--delete-local');

async function migrateFiles() {
  await connectDB();
  const files = getDB().collection('files');
  const allFiles = await files.find({}).toArray();
  let migrated = 0;
  let localCopiesRemoved = 0;
  let skipped = 0;

  for (const file of allFiles) {
    const localName = String(file.fileName || '');
    const storageKey = String(file.storageKey || '');

    if (storageKey) {
      if (deleteLocalAfterCopy && localName !== storageKey && path.basename(localName) === localName) {
        const localPath = path.resolve(uploadDir, localName);
        if (path.dirname(localPath) === uploadDir && fs.existsSync(localPath)) {
          try {
            await fs.promises.unlink(localPath);
            localCopiesRemoved += 1;
            console.log(`Removed local copy for ${file._id}: ${localName}`);
          } catch (error) {
            console.warn(`Could not remove the local copy for ${file._id}: ${error.message}`);
            skipped += 1;
          }
        }
      }
      continue;
    }

    if (!localName || path.basename(localName) !== localName) {
      console.warn(`Skipped ${file._id}: invalid local file name.`);
      skipped += 1;
      continue;
    }

    const localPath = path.resolve(uploadDir, localName);
    if (path.dirname(localPath) !== uploadDir || !fs.existsSync(localPath)) {
      console.warn(`Skipped ${file._id}: local file was not found.`);
      skipped += 1;
      continue;
    }

    const originalName = String(file.originalName || localName);
    const extension = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
    const newStorageKey = `course-files/${randomUUID()}${extension}`;
    let recordUpdated = false;
    try {
      const body = await fs.promises.readFile(localPath);
      await uploadSupabaseObject({
        key: newStorageKey,
        body,
        contentType: file.mimeType || 'application/octet-stream'
      });

      const update = await files.updateOne(
        { _id: file._id, storageKey: { $exists: false } },
        { $set: { storageProvider: 'supabase', storageKey: newStorageKey } }
      );
      if (!update.matchedCount) {
        await deleteSupabaseObject(newStorageKey).catch(() => {});
        console.warn(`Skipped ${file._id}: its record changed during migration.`);
        skipped += 1;
        continue;
      }
      recordUpdated = true;

      if (deleteLocalAfterCopy) {
        try {
          await fs.promises.unlink(localPath);
          localCopiesRemoved += 1;
        } catch (error) {
          console.warn(`Supabase copy is active for ${file._id}, but the local copy could not be removed: ${error.message}`);
        }
      }
      console.log(`Migrated ${file._id}: ${originalName}`);
      migrated += 1;
    } catch (error) {
      if (!recordUpdated) await deleteSupabaseObject(newStorageKey).catch(() => {});
      console.error(`Failed ${file._id}: ${error.message}`);
      skipped += 1;
    }
  }

  console.log(`Finished. Migrated: ${migrated}; local copies removed: ${localCopiesRemoved}; skipped: ${skipped}.`);
  if (!deleteLocalAfterCopy) console.log('Local copies were kept. Pass --delete-local after reviewing the migrated files to remove them.');
}

migrateFiles()
  .catch((error) => {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDB().catch(() => {}));
