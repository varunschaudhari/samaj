import type { Request, Response } from 'express';
import * as branchService from '../services/branch.service';

export async function list(_req: Request, res: Response) {
  res.json({ items: await branchService.listBranches() });
}
