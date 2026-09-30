import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapDbError } from "@/lib/errors";
import { eachDay, formatBR, minToTime, timeToMin } from "@/lib/datetime";
import { ACTIVE_APPOINTMENT_STATUSES } from "@/lib/agenda/engine";
import { baseStatusAt, planSlotOp, type BaseStatus } from "@/lib/agenda/overrides";
import { dayInputFor, loadAgendaBundle, slotsFor, type AgendaBundle } from "@/services/agenda-data";
import { normKey, type ParsedRow, type RowError } from "@/lib/excel/schedule-sheet";
import type { AppSettings } from "@/types";

export type ScheduleOp =
  | { op: "upsert"; professional_id: string; data: string; hora_inicio: string; hora_fim: string; status: "DISPONIVEL" | "BLOQUEADO"; observacao: string | null }
  | { op: "delete"; professional_id: string; data: string; hora_inicio: string };

export interface ImportSummary {
  total: number;
  novos: number;
  alterados: number;
  removidos: number; // só conta se "remover ausentes" estiver ligado
  ausentes: number; // existem no banco, não estão na planilha
  conflitos: number;
  inalterados: number;
  ignorados: number; // linhas OCUPADO (derivadas de agendamentos)
  erros: number;
}

export interface ImportPlan {
  ops: ScheduleOp[];
  summary: ImportSummary;
  errors: RowError[]; // erros de validação + conflitos
}

/** Linhas da "planilha" de um profissional: grade efetiva (regras + exceções + agendamentos) no período. */
export interface SheetRow {
  professional_id: string;
  data: string;
  hora: string;
  status: "DISPONIVEL" | "OCUPADO" | "BLOQUEADO";
  origem: "REGRA" | "EXCECAO";
  observacao: string | null;
  motivo: string | null;
}

export function sheetRows(bundle: AgendaBundle): SheetRow[] {
  return eachDay(bundle.from, bundle.to).flatMap((data) =>
    slotsFor(bundle, data).map((s) => ({
      professional_id: bundle.professionalId,
      data,
      hora: s.hora,
      status: s.status,
      origem: s.origem === "EXCECAO" || s.excecao ? ("EXCECAO" as const) : ("REGRA" as const),
      observacao: s.excecao?.observacao ?? null,
      motivo: s.motivo ?? null,
    })),
  );
}

function hasActiveAppointment(bundle: AgendaBundle, data: string, startMin: number, endMin: number): boolean {
  return bundle.appointments.some(
    (a) =>
      a.data === data &&
      (ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(a.status) &&
      timeToMin(a.hora_inicio) < endMin &&
      timeToMin(a.hora_fim) > startMin,
  );
}

/** Planeja UMA edição de linha da planilha (usado pela tela e reaproveitado pela importação). */
export function planRow(
  bundle: AgendaBundle,
  data: string,
  hora: string,
  desired: { status: "DISPONIVEL" | "BLOQUEADO"; observacao: string | null },
) {
  const start = timeToMin(hora);
  const end = start + bundle.slotMinutes;
  const input = dayInputFor(bundle, data);
  const base: BaseStatus = baseStatusAt(input, start);
  const existingRow = bundle.overrides.find((o) => o.data === data && timeToMin(o.hora_inicio) === start);
  const plan = planSlotOp({
    base,
    existing: existingRow ? { status: existingRow.status, observacao: existingRow.observacao } : null,
    desired,
    hasActiveAppointment: hasActiveAppointment(bundle, data, start, end),
  });
  return { plan, start, end, hadExisting: !!existingRow };
}

/** Calcula o que a importação faria, SEM gravar nada. */
export async function planImport(
  db: SupabaseClient,
  settings: AppSettings,
  rows: ParsedRow[],
  parseErrors: RowError[],
  removeMissing: boolean,
): Promise<ImportPlan> {
  const errors: RowError[] = [...parseErrors];
  const summary: ImportSummary = {
    total: rows.length + parseErrors.filter((e) => e.linha > 1).length,
    novos: 0, alterados: 0, removidos: 0, ausentes: 0, conflitos: 0, inalterados: 0, ignorados: 0, erros: 0,
  };

  const { data: pros } = await db.from("professionals").select("id, nome");
  const byName = new Map<string, string[]>();
  for (const p of pros ?? []) byName.set(normKey(p.nome), [...(byName.get(normKey(p.nome)) ?? []), p.id]);

  // agrupa linhas por profissional (resolvendo nomes)
  const perPro = new Map<string, ParsedRow[]>();
  for (const r of rows) {
    const ids = byName.get(normKey(r.profissional));
    if (!ids || ids.length === 0) {
      errors.push({ linha: r.linha, coluna: "Profissional", valor: r.profissional, motivo: "Profissional não cadastrado." });
      continue;
    }
    if (ids.length > 1) {
      errors.push({ linha: r.linha, coluna: "Profissional", valor: r.profissional, motivo: "Nome de profissional ambíguo." });
      continue;
    }
    perPro.set(ids[0], [...(perPro.get(ids[0]) ?? []), r]);
  }

  const ops: ScheduleOp[] = [];
  const slot = settings.agenda.duracao_padrao_minutos;

  for (const [proId, proRows] of perPro) {
    const dates = proRows.map((r) => r.data).sort();
    const from = dates[0];
    const to = dates[dates.length - 1];
    const bundle = await loadAgendaBundle(db, proId, from, to, slot);
    const present = new Set<string>();

    for (const r of proRows) {
      const start = timeToMin(r.hora);
      present.add(`${r.data}|${start}`);
      if (r.status === "OCUPADO") {
        summary.ignorados++;
        continue;
      }
      const { plan, end } = planRow(bundle, r.data, r.hora, { status: r.status, observacao: r.observacao });
      if (plan.kind === "conflito") {
        summary.conflitos++;
        errors.push({ linha: r.linha, coluna: "Status", valor: r.status, motivo: plan.reason! });
        continue;
      }
      if (plan.kind === "inalterado") {
        summary.inalterados++;
        continue;
      }
      if (plan.kind === "novo") summary.novos++;
      else summary.alterados++;
      if (plan.op === "delete") ops.push({ op: "delete", professional_id: proId, data: r.data, hora_inicio: r.hora });
      else
        ops.push({
          op: "upsert", professional_id: proId, data: r.data, hora_inicio: r.hora,
          hora_fim: minToTime(end), status: r.status, observacao: r.observacao,
        });
    }

    // exceções existentes no intervalo que não aparecem na planilha
    for (const o of bundle.overrides) {
      if (present.has(`${o.data}|${timeToMin(o.hora_inicio)}`)) continue;
      summary.ausentes++;
      if (removeMissing) {
        summary.removidos++;
        ops.push({ op: "delete", professional_id: proId, data: o.data, hora_inicio: minToTime(timeToMin(o.hora_inicio)) });
      }
    }
  }

  summary.erros = errors.length - summary.conflitos;
  return { ops, summary, errors };
}

/** Aplica operações da planilha em UMA transação (tudo ou nada). Só chamar após autorizar. */
export async function applyScheduleOps(ops: ScheduleOp[], actorId: string, acao: string, detalhes: Record<string, unknown>) {
  if (ops.length === 0) return { gravados: 0, removidos: 0 };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("apply_schedule_ops", {
    p_ops: ops,
    p_actor: actorId,
    p_acao: acao,
    p_detalhes: detalhes,
  });
  if (error) throw mapDbError(error);
  return data as { gravados: number; removidos: number };
}

export function describeOp(op: ScheduleOp): string {
  return `${formatBR(op.data)} ${op.hora_inicio}`;
}

