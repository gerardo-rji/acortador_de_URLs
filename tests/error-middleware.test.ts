import express, { type Express } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase, type Db } from '../src/db/connection.ts';
import { createErrorHandler, notFoundHandler } from '../src/shared/error-middleware.ts';

let server: Server | undefined;
let db: Db | undefined;

async function start(app: Express): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server!.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

/** App mínima con rutas que fallan, montando los middlewares reales al final. */
function createFailingApp({ exposeDetails = true } = {}): Express {
  const app = express();
  app.get('/ok', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/boom-sync', () => {
    throw new Error('fallo síncrono con detalle interno');
  });
  app.get('/boom-async', async () => {
    await Promise.resolve();
    throw new Error('fallo async con detalle interno');
  });
  app.get('/boom-non-error', () => {
    throw 'algo que no es un Error';
  });
  app.get('/client-error', () => {
    throw Object.assign(new Error('mensaje interno del parser'), { status: 422, expose: true });
  });
  app.get('/client-error-not-exposed', () => {
    throw Object.assign(new Error('fallo con status pero no expuesto'), { status: 400, expose: false });
  });
  app.post('/json', express.json(), (req, res) => {
    res.json(req.body);
  });
  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeDetails }));
  return app;
}

beforeEach(() => {
  // El errorHandler loguea el error; lo silenciamos para no ensuciar la salida.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  if (db?.open) db.close();
  server = undefined;
  db = undefined;
  vi.restoreAllMocks();
});

describe('notFoundHandler', () => {
  it('devuelve 404 con JSON indicando que la ruta no existe', async () => {
    db = openDatabase(':memory:');
    const baseUrl = await start(createApp({ db, config: loadConfig({}), log: () => {} }));

    const res = await fetch(`${baseUrl}/no-existe`);

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({
      error: 'Not Found',
      message: 'La ruta GET /no-existe no existe',
    });
  });

  it('también aplica a otros métodos HTTP', async () => {
    db = openDatabase(':memory:');
    const baseUrl = await start(createApp({ db, config: loadConfig({}), log: () => {} }));

    const res = await fetch(`${baseUrl}/health`, { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ message: 'La ruta DELETE /health no existe' });
  });
});

describe('errorHandler', () => {
  it.each(['/boom-sync', '/boom-async'])('captura el error de %s y responde 500', async (path) => {
    const baseUrl = await start(createFailingApp());

    const res = await fetch(`${baseUrl}${path}`);

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toMatchObject({ error: 'Internal Server Error' });
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('el servidor sigue respondiendo después de un error inesperado', async () => {
    const baseUrl = await start(createFailingApp());

    const failures = await Promise.all([
      fetch(`${baseUrl}/boom-sync`),
      fetch(`${baseUrl}/boom-async`),
      fetch(`${baseUrl}/boom-non-error`),
    ]);
    expect(failures.map((r) => r.status)).toEqual([500, 500, 500]);

    const after = await fetch(`${baseUrl}/ok`);
    expect(after.status).toBe(200);
    expect(await after.json()).toEqual({ ok: true });
    expect(server!.listening).toBe(true);
  });

  it('con exposeDetails incluye el mensaje del error', async () => {
    const baseUrl = await start(createFailingApp());

    const res = await fetch(`${baseUrl}/boom-sync`);

    expect(await res.json()).toEqual({
      error: 'Internal Server Error',
      message: 'fallo síncrono con detalle interno',
    });
  });

  it('con exposeDetails convierte a texto los valores lanzados que no son Error', async () => {
    const baseUrl = await start(createFailingApp());

    const res = await fetch(`${baseUrl}/boom-non-error`);

    expect(await res.json()).toEqual({
      error: 'Internal Server Error',
      message: 'algo que no es un Error',
    });
  });

  it('sin exposeDetails (producción) no expone detalles internos', async () => {
    const baseUrl = await start(createFailingApp({ exposeDetails: false }));

    const res = await fetch(`${baseUrl}/boom-sync`);
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: 'Internal Server Error' });
    expect(text).not.toContain('detalle interno');
    expect(text).not.toContain('at '); // sin stack trace
  });
});

describe('errorHandler: errores del cliente (4xx)', () => {
  function postJson(baseUrl: string, body: string): Promise<Response> {
    return fetch(`${baseUrl}/json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  }

  it('JSON mal formado → 400, sin el mensaje interno del parser y sin loguearlo como error', async () => {
    const baseUrl = await start(createFailingApp({ exposeDetails: false }));

    const res = await postJson(baseUrl, '{ esto no es json');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Bad Request',
      message: 'El body de la petición no es JSON válido',
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it('body demasiado grande → 413', async () => {
    const baseUrl = await start(createFailingApp({ exposeDetails: false }));

    const res = await postJson(baseUrl, JSON.stringify({ x: 'a'.repeat(200_000) }));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: 'Payload Too Large',
      message: 'El body de la petición es demasiado grande',
    });
  });

  it('respeta otros 4xx con expose, sin filtrar su mensaje interno', async () => {
    const baseUrl = await start(createFailingApp({ exposeDetails: false }));

    const res = await fetch(`${baseUrl}/client-error`);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'Unprocessable Entity', message: 'Unprocessable Entity' });
  });

  it('un error con status pero sin expose sigue siendo un 500', async () => {
    const baseUrl = await start(createFailingApp({ exposeDetails: false }));

    const res = await fetch(`${baseUrl}/client-error-not-exposed`);

    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('el JSON válido sigue funcionando', async () => {
    const baseUrl = await start(createFailingApp());

    const res = await postJson(baseUrl, '{"a":1}');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ a: 1 });
  });
});
