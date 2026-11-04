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
  readonly auth: {
    /** Secreto con el que se firman los JWT (HS256). */
    readonly jwtSecret: string;
    /** Coste de bcrypt (2^rounds iteraciones). */
    readonly bcryptRounds: number;
  };
  readonly analytics: {
    /** Secreto del HMAC con el que se seudonimiza a los visitantes (ver clicks/visitor.ts). */
    readonly visitorHashSecret: string;
  };
}

/**
 * Variables que en desarrollo/test tienen fallback, pero que en producción
 * deben definirse explícitamente.
 */
const REQUIRED_IN_PRODUCTION = ['PORT', 'DB_NAME', 'JWT_SECRET', 'VISITOR_HASH_SECRET'] as const;

const DEFAULTS = {
  NODE_ENV: 'development',
  PORT: '3000',
  DB_NAME: 'snap.db',
  // Solo para desarrollo/test. En producción JWT_SECRET es obligatorio.
  JWT_SECRET: 'dev-only-insecure-jwt-secret-do-not-use-in-prod',
  VISITOR_HASH_SECRET: 'dev-only-insecure-visitor-hash-secret-do-not-use-in-prod',
  BCRYPT_ROUNDS: '12',
} as const;

/** Rango de BCRYPT_ROUNDS. Por debajo de 10 solo tiene sentido en tests. */
const BCRYPT_ROUNDS_RANGE = { min: 4, max: 15 } as const;

/** Longitud mínima de los secretos (JWT_SECRET, VISITOR_HASH_SECRET) en producción: 256 bits. */
export const MIN_SECRET_LENGTH = 32;

/** Secretos cuya longitud mínima se exige en producción. */
const SECRETS = ['JWT_SECRET', 'VISITOR_HASH_SECRET'] as const;

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

  if (isProduction) {
    for (const key of SECRETS) {
      const value = read(env, key);
      if (value !== undefined && value.length < MIN_SECRET_LENGTH) {
        problems.push(`${key} es demasiado corto (mínimo ${MIN_SECRET_LENGTH} caracteres en production)`);
      }
    }
  }
  const jwtSecret = read(env, 'JWT_SECRET') ?? DEFAULTS.JWT_SECRET;
  const visitorHashSecret = read(env, 'VISITOR_HASH_SECRET') ?? DEFAULTS.VISITOR_HASH_SECRET;

  const rawRounds = read(env, 'BCRYPT_ROUNDS') ?? DEFAULTS.BCRYPT_ROUNDS;
  const bcryptRounds = Number(rawRounds);
  const { min, max } = BCRYPT_ROUNDS_RANGE;
  if (!/^\d+$/.test(rawRounds) || bcryptRounds < min || bcryptRounds > max) {
    problems.push(`BCRYPT_ROUNDS="${rawRounds}" no es válido (debe ser un entero entre ${min} y ${max})`);
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return Object.freeze({
    env: nodeEnv,
    isProduction,
    port,
    db: Object.freeze({ name: dbName, path: dbPath }),
    auth: Object.freeze({ jwtSecret, bcryptRounds }),
    analytics: Object.freeze({ visitorHashSecret }),
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
