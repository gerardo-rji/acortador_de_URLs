import type { ErrorRequestHandler, RequestHandler } from 'express';

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

    console.error(err);

    res.status(500).json({
      error: 'Internal Server Error',
      ...(exposeDetails ? { message: err instanceof Error ? err.message : String(err) } : {}),
    });
  };
}
