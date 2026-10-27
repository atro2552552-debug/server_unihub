import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.join(currentDir, '../uploads/profiles');

fs.mkdirSync(profileDir, { recursive: true });

function checkImage(req, file, done) {
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (imageTypes.includes(file.mimetype)) return done(null, true);
  return done(new Error('اختار صورة JPG أو PNG أو WEBP.'));
}

const uploadProfileImage = multer({
  storage: multer.memoryStorage(),
  fileFilter: checkImage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

export { uploadProfileImage, profileDir };
