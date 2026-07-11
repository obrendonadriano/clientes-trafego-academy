-- Segmento (nicho) do cliente, usado para dar contexto à IA dos relatórios.
-- `segmento` guarda a chave do nicho pré-definido (ou "outro"); quando "outro",
-- `segmento_descricao` guarda a descrição livre do gestor.
alter table public.clients
  add column if not exists segmento text,
  add column if not exists segmento_descricao text;
