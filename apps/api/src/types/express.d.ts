import type { Viewer } from '../services/viewer';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      user?: Viewer;
    }
  }
}

export {};
