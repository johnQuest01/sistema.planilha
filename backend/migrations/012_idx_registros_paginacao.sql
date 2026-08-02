-- 012: acelera a listagem paginada de registros por coleção (cursor em criado_em).
-- 001 já cria um índice equivalente; este garante o nome estável (IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_registros_colecao_criado
  ON registros (colecao_id, criado_em DESC);
