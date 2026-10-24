import express from 'express';
import { getSubjects } from '../controllers/subjectController.js';

const router = express.Router();
router.get('/', getSubjects);

export default router;
