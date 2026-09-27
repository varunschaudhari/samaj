import { consentSchema, deletionRequestSchema, memberPrivacySchema } from '@samaj/shared';
import { type Request, Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as privacy from '../services/privacy.service';
import type { Viewer } from '../services/viewer';
import { unauthenticated } from '../utils/app-error';

function viewer(req: Request): Viewer {
  if (!req.user) throw unauthenticated();
  return req.user;
}

/** Privacy notice, consent, per-person settings, download and deletion. Reachable before consent. */
export const privacyRouter = Router();

// Public: the notice page shows the version and who to contact.
privacyRouter.get('/info', (_req, res) => {
  res.json({ info: privacy.privacyInfo() });
});

privacyRouter.use(requireAuth);
privacyRouter.get('/status', async (req, res) => {
  res.json({ status: await privacy.getStatus(viewer(req)) });
});
privacyRouter.post('/consent', async (req, res) => {
  consentSchema.parse(req.body);
  res.json({ status: await privacy.consent(viewer(req)) });
});
privacyRouter.put('/members/:memberId', async (req, res) => {
  await privacy.setMemberPrivacy(viewer(req), String(req.params.memberId ?? ''), memberPrivacySchema.parse(req.body));
  res.status(204).end();
});
privacyRouter.get('/export', async (req, res) => {
  const data = await privacy.exportData(viewer(req));
  res
    .set('Content-Disposition', `attachment; filename="samaj-my-data-${new Date().toISOString().slice(0, 10)}.json"`)
    .set('Cache-Control', 'no-store')
    .type('application/json')
    .send(JSON.stringify(data, null, 2));
});
privacyRouter.post('/deletion', async (req, res) => {
  const { scope, password } = deletionRequestSchema.parse(req.body);
  res.json({ status: await privacy.requestDeletion(viewer(req), scope, password) });
});
privacyRouter.delete('/deletion', async (req, res) => {
  res.json({ status: await privacy.cancelDeletion(viewer(req)) });
});
