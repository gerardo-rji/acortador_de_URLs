import { Router } from 'express';
import type { Db } from '../../db/connection.ts';

export function healthRouter({ db }: { db: Db }): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    let dbUp: boolean;
    try {
      db.prepare('SELECT 1').get();
      dbUp = true;
    } catch {
      dbUp = false;
    }

    res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      uptime: process.uptime(),
    });
  });

  return router;
}
