import postgres from 'postgres';
import { config } from '../config';

// Pool único da aplicação. O caminho DONO abre transação e faz
// `set local app.conta_id = <uuid>` para a RLS filtrar por conta (ver migration 002).
export const sql = postgres(config.databaseUrl, {
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
});
