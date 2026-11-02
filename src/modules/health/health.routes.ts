import { Router } from 'express';
import type { Db } from '../../db/connection.ts';

export function healthRouter(db: Db): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', db: 'ok', uptime: process.uptime() });
    } catch {
      res.status(503).json({ status: 'error', db: 'unreachable' });
    }
  });

  return router;
}
