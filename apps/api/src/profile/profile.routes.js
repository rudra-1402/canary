import { Router } from 'express';
import * as profileController from './profile.controller.js';

const router = Router();

router.get('/:id/reviews', profileController.listReviews);
router.get('/:id', profileController.getById);

export default router;
