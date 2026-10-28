import express from 'express';
import protect from '../middlewares/authMiddleware.js';
import { getUserNotifications, markNotificationsRead } from '../controllers/notificationController.js';

const router = express.Router();

router.get('/', protect, getUserNotifications);
router.patch('/read', protect, markNotificationsRead);

export default router;
