import express from 'express';
import protect from '../middlewares/authMiddleware.js';
import { getRooms, getRoom, createRoom, updateRoom, deleteRoom } from '../controllers/roomController.js';

const router = express.Router();

router.get('/', getRooms);
router.get('/:id', getRoom);
router.post('/', protect, createRoom);
router.patch('/:id', protect, updateRoom);
router.delete('/:id', protect, deleteRoom);

export default router;
