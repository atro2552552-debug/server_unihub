import express from 'express';
import { register, login, getMe, updateProfile, updateProfileImage } from '../controllers/authController.js';
import protect from '../middlewares/authMiddleware.js';
import { uploadProfileImage } from '../middlewares/profileUpload.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.patch('/me', protect, updateProfile);
router.patch('/me/avatar', protect, uploadProfileImage.single('avatar'), updateProfileImage);

export default router;
