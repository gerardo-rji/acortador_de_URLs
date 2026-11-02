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

/**
 * Handler global de errores. Debe ser el último middleware.
 * Express 5 también reenvía aquí los rechazos de handlers async.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // Si la respuesta ya empezó a enviarse no podemos cambiar status/headers:
  // se delega al handler por defecto de Express, que cierra la conexión.
  if (res.headersSent) {
    next(err);
    return;
  }

  console.error(err);

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: 'Internal Server Error',
    ...(isProduction ? {} : { message: err instanceof Error ? err.message : String(err) }),
  });
};
