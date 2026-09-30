"use client";

import { useState } from "react";

interface Summary {
  total: number; novos: number; alterados: number; removidos: number; ausentes: number;
  conflitos: number; inalterados: number; ignorados: number; erros: number;
}
interface RowError { linha: number; coluna: string; valor: string; motivo: string }
interface Preview { batchId: string; summary: Summary; errors: RowError[]; errorsTruncated: boolean; operacoes: number }

export function ImportClient() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null); setDone(null); setPreview(null);
    try {
      const res = await fetch("/api/admin/import", { method: "POST", body: new FormData(e.currentTarget) });
      const json = await res.json();
      if (!json.ok) setError(json.error);
      else setPreview(json);
    } catch {
      setError("Não foi possível enviar o arquivo. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(acao: "aplicar" | "descartar") {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/import/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: preview.batchId, acao }),
      });
      const json = await res.json();
      if (!json.ok) setError(json.error);
      else {
        setDone(acao === "descartar" ? "Importação descartada. Nada foi alterado." : `Importação concluída: ${json.gravados} gravados, ${json.removidos} removidos.`);
        setPreview(null);
      }
    } catch {
      setError("Não foi possível concluir a importação. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const s = preview?.summary;
  return (
    <div className="space-y-4">
      <form onSubmit={send} className="card space-y-3">
        <div>
          <label htmlFor="arquivo" className="label">Arquivo .xlsx (colunas: Data, Horário, Status, Profissional, Observação)</label>
          <input id="arquivo" name="arquivo" type="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="input" />
        </div>
        <label className="block text-sm">
          <input type="checkbox" name="remover_ausentes" /> Remover exceções existentes (no período e profissionais do arquivo) que não estão na planilha
        </label>
        <button className="btn" disabled={busy}>{busy ? "Aguarde…" : "Validar arquivo"}</button>
      </form>

      {error && <p role="alert" className="alert-error">{error}</p>}
      {done && <p role="status" className="alert-ok">{done}</p>}

      {preview && s && (
        <section className="card space-y-3">
          <h2 className="h2">Resumo da importação</h2>
          <p className="alert-info">Esta importação irá alterar {s.novos + s.alterados + s.removidos} registros. Nada foi gravado ainda.</p>
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <li>Novos: <b>{s.novos}</b></li>
            <li>Alterados: <b>{s.alterados}</b></li>
            <li>Removidos: <b>{s.removidos}</b>{s.ausentes > 0 && s.removidos === 0 && <span className="text-xs text-muted"> ({s.ausentes} ausentes mantidos)</span>}</li>
            <li>Conflitos: <b>{s.conflitos}</b></li>
            <li>Inalterados: <b>{s.inalterados}</b></li>
            <li>Ignorados (OCUPADO): <b>{s.ignorados}</b></li>
            <li>Com erro: <b>{s.erros}</b></li>
            <li>Linhas lidas: <b>{s.total}</b></li>
          </ul>

          {preview.errors.length > 0 && (
            <div>
              <h3 className="font-semibold">Erros e conflitos (estas linhas NÃO serão importadas)</h3>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Linha</th><th>Coluna</th><th>Valor</th><th>Motivo</th></tr></thead>
                  <tbody>{preview.errors.map((er, i) => <tr key={i}><td>{er.linha}</td><td>{er.coluna}</td><td>{er.valor}</td><td>{er.motivo}</td></tr>)}</tbody>
                </table>
              </div>
              {preview.errorsTruncated && <p className="text-xs">Mostrando os primeiros 1000 erros.</p>}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={busy || preview.operacoes === 0} onClick={() => confirm("aplicar")}>
              Confirmar importação ({preview.operacoes} operações válidas)
            </button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => confirm("descartar")}>Descartar</button>
          </div>
          {preview.operacoes === 0 && <p className="text-sm">Não há alterações válidas a aplicar.</p>}
        </section>
      )}
    </div>
  );
}
