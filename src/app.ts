import express, { type Express } from 'express';
import type { Db } from './db/connection.ts';
import { healthRouter } from './modules/health/health.routes.ts';
import { errorHandler, notFoundHandler } from './shared/error-middleware.ts';

export interface AppDeps {
  db: Db;
}

/**
 * Construye la app sin arrancar el servidor, para poder testearla
 * inyectando dependencias (p. ej. una BD en memoria).
 */
export function createApp({ db }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/health', healthRouter({ db }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
