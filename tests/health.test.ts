import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase, type Db } from '../src/db/connection.ts';

let server: Server | undefined;
let db: Db | undefined;

async function start(database: Db): Promise<string> {
  const app = createApp({ db: database, config: loadConfig({}), log: () => {} });
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server!.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  if (db?.open) db.close();
  server = undefined;
  db = undefined;
});

describe('GET /health', () => {
  it('responde 200 con status ok cuando la BD está disponible', async () => {
    db = openDatabase(':memory:');
    const baseUrl = await start(db);

    const res = await fetch(`${baseUrl}/health`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = (await res.json()) as { status: string; db: string; uptime: unknown };
    expect(body).toMatchObject({ status: 'ok', db: 'up' });
    expect(typeof body.uptime).toBe('number');
  });

  it('responde 503 cuando la BD no está disponible', async () => {
    db = openDatabase(':memory:');
    const baseUrl = await start(db);
    db.close();

    const res = await fetch(`${baseUrl}/health`);

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'degraded', db: 'down' });
  });
});
