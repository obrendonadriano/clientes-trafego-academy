// O Supabase/PostgREST devolve relações incorporadas (ex.: o `clients` de um
// `users.client_id → clients`) ora como um único objeto (quando detecta a
// chave estrangeira como "muitos-para-um"), ora como array. Os mapeamentos
// antigos assumiam sempre array (`clients?.[0]`), o que retornava `undefined`
// quando vinha objeto — daí o "Campanhas de undefined" mesmo com empresa
// cadastrada. Este helper normaliza os dois formatos.
export type Embedded<T> = T | T[] | null | undefined;

export function firstEmbedded<T>(value: Embedded<T>): T | undefined {
  if (!value) {
    return undefined;
  }

  return Array.isArray(value) ? value[0] : value;
}
