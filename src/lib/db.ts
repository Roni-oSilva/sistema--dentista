import { throwIfDbError } from "@/lib/errors";

const PAGE = 1000; // limite padrão do PostgREST

/** Busca todas as páginas de uma consulta (PostgREST limita a 1000 linhas por requisição). */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
  maxRows = 50_000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    throwIfDbError(error, "UNKNOWN");
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}
