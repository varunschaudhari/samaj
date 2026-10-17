import { LANGUAGES, type Language, melavaCancelSchema, melavaInputSchema, melavaOfficeRegisterSchema, melavaOfficeSearchSchema, melavaRegisterSchema } from '@samaj/shared';
import type { Request, Response } from 'express';
import * as melavas from '../services/melava.service';
import type { Viewer } from '../services/viewer';
import { unauthenticated } from '../utils/app-error';

function viewer(req: Request): Viewer {
  if (!req.user) throw unauthenticated();
  return req.user;
}
const id = (req: Request) => String(req.params.id ?? '');
const registrationId = (req: Request) => String(req.params.registrationId ?? '');

export const list = async (req: Request, res: Response) => res.json({ items: await melavas.listMelavas(viewer(req)) });
export const get = async (req: Request, res: Response) => res.json({ melava: await melavas.getMelava(viewer(req), id(req)) });
export async function create(req: Request, res: Response) {
  res.status(201).json({ melava: await melavas.createMelava(viewer(req), melavaInputSchema.parse(req.body)) });
}
export const update = async (req: Request, res: Response) => res.json({ melava: await melavas.updateMelava(viewer(req), id(req), melavaInputSchema.parse(req.body)) });

export async function register(req: Request, res: Response) {
  res.status(201).json({ melava: await melavas.register(viewer(req), id(req), melavaRegisterSchema.parse(req.body)) });
}
export const officeSearch = async (req: Request, res: Response) =>
  res.json({ items: await melavas.officeSearch(viewer(req), id(req), melavaOfficeSearchSchema.parse(req.query).q) });
export async function officeRegister(req: Request, res: Response) {
  res.status(201).json({ melava: await melavas.officeRegister(viewer(req), id(req), melavaOfficeRegisterSchema.parse(req.body)) });
}
export const verify = async (req: Request, res: Response) => res.json({ melava: await melavas.verifyPayment(viewer(req), id(req), registrationId(req)) });
export const cancel = async (req: Request, res: Response) =>
  res.json({ melava: await melavas.cancelRegistration(viewer(req), id(req), registrationId(req), melavaCancelSchema.parse(req.body).reason) });

/** The booklet list as CSV. ?lang=en for English headings; Marathi by default, as the booklet is printed in Marathi. */
export async function exportCsv(req: Request, res: Response) {
  const lang = (LANGUAGES as readonly string[]).includes(String(req.query.lang)) ? (String(req.query.lang) as Language) : 'mr';
  const { filename, csv } = await melavas.exportCsv(viewer(req), id(req), lang);
  res
    .set('Cache-Control', 'no-store')
    .set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    .type('text/csv; charset=utf-8')
    .send(csv);
}
