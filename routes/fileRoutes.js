import express from 'express';
import multer from 'multer';
import protect, { requireAdmin } from '../middlewares/authMiddleware.js';
import { getFiles, uploadFile, createFileUploadUrl, completeFileUpload, cancelFileUpload, downloadFile, deleteFile } from '../controllers/fileController.js';

function checkFile(req, file, done) {
  const allowedTypes = /pdf|msword|officedocument|powerpoint/;
  const fileType = file.mimetype.toLowerCase();
  if (allowedTypes.test(fileType)) return done(null, true);
  return done(new Error('نوع الملف مش مدعوم. استخدم PDF أو Word أو PowerPoint.'));
}

const upload = multer({ storage: multer.memoryStorage(), fileFilter: checkFile, limits: { fileSize: 50_000_000 } });
const router = express.Router();

router.get('/', getFiles);
router.get('/:id/download', downloadFile);
router.delete('/:id', protect, requireAdmin, deleteFile);
router.post('/upload-url', protect, requireAdmin, createFileUploadUrl);
router.post('/upload-complete', protect, requireAdmin, completeFileUpload);
router.post('/upload-cancel', protect, requireAdmin, cancelFileUpload);
router.post('/upload', protect, requireAdmin, upload.single('file'), uploadFile);

export default router;
