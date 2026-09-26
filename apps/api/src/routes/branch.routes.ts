import { Router } from 'express';
import * as branches from '../controllers/branch.controller';

export const branchRouter = Router();

// Public: the signup form needs the list before anyone has an account.
branchRouter.get('/', branches.list);
