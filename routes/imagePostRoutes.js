import express from 'express';
import multer from 'multer';
import protect, { requireAdmin } from '../middlewares/authMiddleware.js';
import { createPost, getPostCount, getPostImage, getPosts, recordPostView, setPostLike } from '../controllers/imagePostController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, done) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return done(null, true);
    return done(new Error('ارفع صور JPEG أو PNG أو WEBP فقط.'));
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 1, fieldSize: 2000 }
});

function receiveImages(req, res, next) {
  upload.array('images', 3)(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'حجم كل صورة لازم يكون 5 ميجا أو أقل.' });
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ message: 'اختار من صورة إلى 3 صور للمنشور.' });
    if (error.code === 'LIMIT_FIELD_VALUE') return res.status(400).json({ message: 'الكلام لازم يكون 500 حرف أو أقل.' });
    return res.status(400).json({ message: error.message || 'مقدرناش نقرأ الصور المختارة.' });
  });
}

const router = express.Router();
router.get('/', protect, getPosts);
router.get('/count', protect, getPostCount);
router.post('/', protect, requireAdmin, receiveImages, createPost);
router.get('/:id/images/:index', protect, getPostImage);
router.post('/:id/view', protect, recordPostView);
router.put('/:id/like', protect, setPostLike);

export default router;
