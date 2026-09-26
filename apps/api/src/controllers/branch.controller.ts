import { assignCommitteeSchema, branchCreateSchema, branchUpdateSchema } from '@samaj/shared';
import type { Request, Response } from 'express';
import * as branchService from '../services/branch.service';
import * as userService from '../services/user.service';
import { unauthenticated } from '../utils/app-error';

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

export async function assignCommittee(req: Request, res: Response) {
  if (!req.user) throw unauthenticated();
  const input = assignCommitteeSchema.parse(req.body);
  res.status(201).json({ user: await userService.assignCommittee(req.user, param(req, 'branchId'), input) });
}

export async function removeCommittee(req: Request, res: Response) {
  if (!req.user) throw unauthenticated();
  res.json({ user: await userService.removeCommittee(req.user, param(req, 'branchId'), param(req, 'userId')) });
}
