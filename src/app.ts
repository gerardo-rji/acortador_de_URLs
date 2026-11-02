import express, { type Express } from 'express';
import type { Config } from './config.ts';
import type { Db } from './db/connection.ts';
import { healthRouter } from './modules/health/health.routes.ts';
import { createErrorHandler, notFoundHandler } from './shared/error-middleware.ts';
import { createRequestLogger, type LogFn } from './shared/request-logger.ts';

export interface AppDeps {
  db: Db;
  config: Config;
  /** Destino del log de peticiones. Por defecto console.log. */
  log?: LogFn;
}

/**
 * Construye la app sin arrancar el servidor, para poder testearla
 * inyectando dependencias (p. ej. una BD en memoria o otra configuración).
 */
export function createApp({ db, config, log = console.log }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Primero de la cadena: así registra todas las peticiones, incluidas
  // las que fallan en express.json(), los 404 y los 500.
  app.use(createRequestLogger(log));
  app.use(express.json());

  app.use('/health', healthRouter({ db }));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeDetails: !config.isProduction }));
  return app;
}
