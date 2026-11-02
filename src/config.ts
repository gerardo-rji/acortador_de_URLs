function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT inválido: "${value}"`);
  }
  return port;
}

export const config = {
  port: parsePort(process.env.PORT, 3000),
  databasePath: process.env.DATABASE_PATH ?? 'data/snap.db',
} as const;
