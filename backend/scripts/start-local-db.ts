import EmbeddedPostgres from 'embedded-postgres';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), '.postgres-data');
const isInitial = !fs.existsSync(dataDir);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  authMethod: 'password',
  persistent: true,
  onLog: (msg) => console.log('[Local Postgres]', msg),
  onError: (err) => console.error('[Local Postgres Error]', err),
});

async function main() {
  if (isInitial) {
    console.log('Inicializando cluster PostgreSQL local...');
    await pg.initialise();
  } else {
    // Si quedó un lockfile postmaster.pid huérfano de un apagado forzado, lo eliminamos
    const pidFile = path.join(dataDir, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
        console.log('Se limpió el archivo postmaster.pid huérfano de una sesión anterior.');
      } catch (e) {
        console.warn('No se pudo borrar postmaster.pid:', e);
      }
    }
  }

  console.log('Iniciando PostgreSQL local en puerto 5432...');
  await pg.start();
  console.log('PostgreSQL iniciado.');

  if (isInitial) {
    try {
      console.log('Creando base de datos scout_app...');
      await pg.createDatabase('scout_app');
      console.log('Base de datos scout_app creada exitosamente.');
    } catch (err: any) {
      if (!err?.message?.includes('already exists')) {
        console.error('Error al crear scout_app:', err);
      }
    }
  }

  console.log('PostgreSQL local listo y escuchando en postgres://postgres:postgres@localhost:5432/scout_app');

  // Mantener el proceso vivo para que el servidor local continúe ejecutándose
  process.stdin.resume();
}

main().catch((err) => {
  console.error('Error al arrancar Postgres local:', err);
  process.exit(1);
});
