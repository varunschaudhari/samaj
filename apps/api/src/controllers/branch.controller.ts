import { branchCreateSchema, branchUpdateSchema } from '@samaj/shared';
import type { Request, Response } from 'express';
import * as branchService from '../services/branch.service';

const param = (req: Request, name: string) => String(req.params[name] ?? '');

export async function list(_req: Request, res: Response) {
  res.json({ items: await branchService.listBranches() });
}

export async function summary(_req: Request, res: Response) {
  res.json({ items: await branchService.listBranchSummaries() });
}

export async function create(req: Request, res: Response) {
  const input = branchCreateSchema.parse(req.body);
  res.status(201).json({ branch: await branchService.createBranch(input) });
}

export async function update(req: Request, res: Response) {
  const input = branchUpdateSchema.parse(req.body);
  res.json({ branch: await branchService.updateBranch(param(req, 'branchId'), input) });
}

export async function remove(req: Request, res: Response) {
  await branchService.deleteBranch(param(req, 'branchId'));
  res.status(204).end();
}
