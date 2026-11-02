import { join } from 'node:path';

const NODE_ENVS = ['development', 'production', 'test'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export interface Config {
  readonly env: NodeEnv;
  readonly isProduction: boolean;
  readonly port: number;
  readonly db: {
    /** Nombre del fichero SQLite (o ':memory:'). */
    readonly name: string;
    /** Ruta efectiva que se pasa a better-sqlite3. */
    readonly path: string;
  };
}

/**
 * Variables que en desarrollo/test tienen fallback, pero que en producción
 * deben definirse explícitamente.
 */
const REQUIRED_IN_PRODUCTION = ['PORT', 'DB_NAME'] as const;

const DEFAULTS = {
  NODE_ENV: 'development',
  PORT: '3000',
  DB_NAME: 'snap.db',
} as const;

const DATA_DIR = 'data';

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Configuración inválida:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

type Env = Record<string, string | undefined>;

/** Trata '' igual que una variable no definida. */
function read(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function isNodeEnv(value: string): value is NodeEnv {
  return (NODE_ENVS as readonly string[]).includes(value);
}

/**
 * Construye y valida la configuración a partir de un objeto de entorno.
 * Es una función pura para poder testearla sin tocar process.env.
 * Lanza ConfigError con todos los problemas encontrados a la vez.
 */
export function loadConfig(env: Env = process.env): Config {
  const problems: string[] = [];

  const rawNodeEnv = read(env, 'NODE_ENV') ?? DEFAULTS.NODE_ENV;
  let nodeEnv: NodeEnv = DEFAULTS.NODE_ENV;
  if (isNodeEnv(rawNodeEnv)) {
    nodeEnv = rawNodeEnv;
  } else {
    problems.push(`NODE_ENV="${rawNodeEnv}" no es válido (valores permitidos: ${NODE_ENVS.join(', ')})`);
  }
  const isProduction = nodeEnv === 'production';

  if (isProduction) {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (read(env, key) === undefined) {
        problems.push(`Falta la variable de entorno obligatoria ${key} (requerida en production)`);
      }
    }
  }

  const rawPort = read(env, 'PORT') ?? DEFAULTS.PORT;
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port < 0 || port > 65535) {
    problems.push(`PORT="${rawPort}" no es válido (debe ser un entero entre 0 y 65535)`);
  }

  const dbName = read(env, 'DB_NAME') ?? DEFAULTS.DB_NAME;
  const dbPath = dbName === ':memory:' ? dbName : join(DATA_DIR, dbName);

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return Object.freeze({
    env: nodeEnv,
    isProduction,
    port,
    db: Object.freeze({ name: dbName, path: dbPath }),
  });
}

/**
 * Configuración de la aplicación, evaluada una sola vez al importar el módulo.
 * Si es inválida, el proceso falla al arrancar, antes de abrir la BD o escuchar.
 *
 * Solo el punto de entrada (server.ts) debe importarla; el resto de módulos
 * la reciben por parámetro para poder testearlos con otra configuración.
 */
export const config: Config = loadConfig();
