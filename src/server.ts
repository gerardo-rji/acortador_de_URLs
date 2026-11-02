import { createApp } from './app.ts';
import { config } from './config.ts';
import { openDatabase } from './db/connection.ts';

const db = openDatabase(config.databasePath);
const app = createApp({ db });

const server = app.listen(config.port, (err?: Error) => {
  if (err) throw err;
  console.log(`Snap escuchando en http://localhost:${config.port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} recibido, cerrando...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
