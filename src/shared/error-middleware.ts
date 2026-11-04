import type { ErrorRequestHandler, RequestHandler } from 'express';
import { STATUS_CODES } from 'node:http';

/**
 * Debe registrarse después de todas las rutas: solo se alcanza
 * si ninguna ruta anterior ha respondido.
 */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `La ruta ${req.method} ${req.path} no existe`,
  });
};

export interface ErrorHandlerOptions {
  /** Si es true, incluye el mensaje del error en la respuesta (solo fuera de producción). */
  exposeDetails: boolean;
}

/** Mensajes propios para los errores de express.json(), en vez de los internos del parser. */
const CLIENT_ERROR_MESSAGES: Record<string, string> = {
  'entity.parse.failed': 'El body de la petición no es JSON válido',
  'entity.too.large': 'El body de la petición es demasiado grande',
};

/**
 * Status 4xx de errores "de cliente" marcados como seguros de exponer
 * (`expose: true`), como los que lanza express.json() con JSON mal formado.
 */
function clientErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true ? status : undefined;
}

/**
 * Handler global de errores. Debe ser el último middleware.
 * Express 5 también reenvía aquí los rechazos de handlers async.
 */
export function createErrorHandler({ exposeDetails }: ErrorHandlerOptions): ErrorRequestHandler {
  return (err, _req, res, next) => {
    // Si la respuesta ya empezó a enviarse no podemos cambiar status/headers:
    // se delega al handler por defecto de Express, que cierra la conexión.
    if (res.headersSent) {
      next(err);
      return;
    }

    // Errores del cliente (p. ej. JSON mal formado): no son fallos del servidor,
    // así que se responde con su 4xx y no se loguean como error.
    const clientStatus = clientErrorStatus(err);
    if (clientStatus !== undefined) {
      const type = (err as { type?: unknown }).type;
      res.status(clientStatus).json({
        error: STATUS_CODES[clientStatus] ?? 'Bad Request',
        message: (typeof type === 'string' && CLIENT_ERROR_MESSAGES[type]) || STATUS_CODES[clientStatus],
      });
      return;
    }

    console.error(err);

    res.status(500).json({
      error: 'Internal Server Error',
      ...(exposeDetails ? { message: err instanceof Error ? err.message : String(err) } : {}),
    });
  };
}
