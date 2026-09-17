-- A alteração do enum fica isolada porque o PostgreSQL só permite usar um
-- valor recém-adicionado depois que a transação que o criou termina.
alter type public.lead_qualification add value if not exists 'fechado';
