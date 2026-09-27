import { enrolFamilySchema, externalParentSchema, familyUpdateSchema, memberCreateSchema, memberInputSchema, pendingQuerySchema, rejectFamilySchema } from '@samaj/shared';
import type { Request, Response } from 'express';
import * as approvalsService from '../services/approvals.service';
import * as familyService from '../services/family.service';
import * as linksService from '../services/links.service';
import * as movesService from '../services/moves.service';
import * as treeService from '../services/tree.service';
import * as inviteService from '../services/invite.service';
import type { Viewer } from '../services/viewer';
import * as matrimonyService from '../services/matrimony.service';
import * as verificationService from '../services/verification.service';
import { unauthenticated } from '../utils/app-error';

function viewer(req: Request): Viewer {
  if (!req.user) throw unauthenticated();
  return req.user;
}

/** Route params as plain strings (Express 5 types them as string | string[]). */
const param = (req: Request, name: string) => String(req.params[name] ?? '');

export async function enrol(req: Request, res: Response) {
  const input = enrolFamilySchema.parse(req.body);
  res.status(201).json({ family: await familyService.enrolFamily(viewer(req), input) });
}

export async function get(req: Request, res: Response) {
  res.json({ family: await familyService.getFamily(viewer(req), param(req, 'familyId')) });
}

export async function update(req: Request, res: Response) {
  const input = familyUpdateSchema.parse(req.body);
  res.json({ family: await familyService.updateFamily(viewer(req), param(req, 'familyId'), input) });
}

export async function addMember(req: Request, res: Response) {
  const { consent: _consent, ...input } = memberCreateSchema.parse(req.body);
  res.status(201).json({ family: await familyService.addMember(viewer(req), param(req, 'familyId'), input) });
}

export async function updateMember(req: Request, res: Response) {
  const input = memberInputSchema.parse(req.body);
  res.json({ family: await familyService.updateMember(viewer(req), param(req, 'familyId'), param(req, 'memberId'), input) });
}

export async function removeMember(req: Request, res: Response) {
  res.json({ family: await familyService.removeMember(viewer(req), param(req, 'familyId'), param(req, 'memberId')) });
}

export async function setExternalParent(req: Request, res: Response) {
  const { memberId } = externalParentSchema.parse(req.body);
  res.json({ family: await linksService.setExternalParent(viewer(req), param(req, 'familyId'), param(req, 'memberId'), memberId) });
}

export async function createInvite(req: Request, res: Response) {
  res.status(201).json({ invite: await inviteService.createInvite(viewer(req), param(req, 'familyId'), param(req, 'memberId')) });
}

export async function setPhoto(req: Request, res: Response) {
  const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  res.json({ family: await familyService.setPhoto(viewer(req), param(req, 'familyId'), param(req, 'memberId'), data) });
}

export async function removePhoto(req: Request, res: Response) {
  res.json({ family: await familyService.removePhoto(viewer(req), param(req, 'familyId'), param(req, 'memberId')) });
}

export async function getPhoto(req: Request, res: Response) {
  const { data, contentType } = await familyService.getPhoto(viewer(req), param(req, 'memberId'));
  // The URL carries a version, so a changed photo gets a new URL and this can be cached.
  res.set('Cache-Control', 'private, max-age=31536000, immutable').type(contentType).send(data);
}

export async function listPending(req: Request, res: Response) {
  const query = pendingQuerySchema.parse(req.query);
  res.json(await verificationService.listPending(viewer(req), query));
}

export async function countPending(req: Request, res: Response) {
  const v = viewer(req);
  const [families, profiles, members, moves] = await Promise.all([
    verificationService.countPending(v),
    matrimonyService.countPendingProfiles(v),
    approvalsService.countPendingMembers(v),
    movesService.countPendingMoves(v),
  ]);
  res.json({ pending: families + profiles + members + moves, families, profiles, members, moves });
}

export async function tree(req: Request, res: Response) {
  res.json({ tree: await treeService.getTree(viewer(req), param(req, 'familyId')) });
}

export async function requests(req: Request, res: Response) {
  res.json({ requests: await linksService.requestsFor(viewer(req), param(req, 'familyId')) });
}

export async function verify(req: Request, res: Response) {
  res.json({ family: await verificationService.verify(viewer(req), param(req, 'familyId')) });
}

export async function reject(req: Request, res: Response) {
  const { reason } = rejectFamilySchema.parse(req.body);
  res.json({ family: await verificationService.reject(viewer(req), param(req, 'familyId'), reason) });
}

export async function resubmit(req: Request, res: Response) {
  res.json({ family: await verificationService.resubmit(viewer(req), param(req, 'familyId')) });
}
