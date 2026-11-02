import express, { type Express } from 'express';
import type { Db } from './db/connection.ts';
import { healthRouter } from './modules/health/health.routes.ts';

export interface AppDeps {
  db: Db;
}

/** Construye la app sin arrancar el servidor, para poder testearla. */
export function createApp({ db }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/health', healthRouter(db));

  return app;
}
