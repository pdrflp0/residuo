import { createNotesServer } from './server';

const port = Number(process.env.NOTES_PORT ?? 4300);
const { server } = await createNotesServer({
  databaseUrl: process.env.NOTES_DATABASE_URL ?? 'postgres://residuo:residuo-local-only@localhost:54329/residuo_example_notes',
  hooks: process.env.RESIDUO_HOOKS === '1',
});
server.listen(port, '127.0.0.1', () => {
  console.log(`[notes-sync] http://127.0.0.1:${port} (ganchos de teste: ${process.env.RESIDUO_HOOKS === '1' ? 'ligados' : 'desligados'})`);
});
