import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { openDatabase, type Db } from '../src/db/connection.ts';

describe('GET /health', () => {
  let db: Db;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    server = createApp({ db }).listen(0);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    server.close();
    await once(server, 'close');
    if (db.open) db.close();
  });

  it('responde 200 con status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = (await res.json()) as { status: string; db: string; uptime: unknown };
    expect(body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(typeof body.uptime).toBe('number');
  });

  it('responde 503 si la base de datos no está disponible', async () => {
    db.close();

    const res = await fetch(`${baseUrl}/health`);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'error', db: 'unreachable' });
  });
});
