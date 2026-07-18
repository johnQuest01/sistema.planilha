-- Guarda só as keys do bloco de imagem "Referência" para a prévia da lixeira.
alter table lixeira_registros
  add column if not exists fotos_referencia jsonb not null default '[]'::jsonb;
