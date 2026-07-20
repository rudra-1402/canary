import { Router } from 'express';
import * as jobPostController from './jobPost.controller.js';

const router = Router();

router.get('/', jobPostController.list);
router.get('/:id', jobPostController.getById);

export default router;
