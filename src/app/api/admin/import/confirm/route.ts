import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { AppError, throwIfDbError } from "@/lib/errors";
import { applyScheduleOps, type ScheduleOp } from "@/services/schedule";
import { uuid } from "@/validators/common";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({ batchId: uuid, acao: z.enum(["aplicar", "descartar"]).default("aplicar") });

/** Passo 2: o admin confirmou. Aplica TODAS as operações numa única transação (tudo ou nada). */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const staff = await requirePermission("excel.import");
    const { batchId, acao } = body.parse(await request.json());

    const { data: batch } = await staff.db.from("import_batches").select("*").eq("id", batchId).maybeSingle();
    if (!batch || batch.criado_por !== staff.id) throw new AppError("NOT_FOUND");
    if (batch.status !== "PREVIEW") throw new AppError("INVALID_STATE", "Esta importação já foi processada.");
    if (Date.now() - new Date(batch.criado_em).getTime() > 60 * 60 * 1000)
      throw new AppError("INVALID_STATE", "A pré-visualização expirou. Envie o arquivo novamente.");

    if (acao === "descartar") {
      await staff.db.from("import_batches").update({ status: "CANCELADO" }).eq("id", batchId).eq("status", "PREVIEW");
      return NextResponse.json({ ok: true, descartado: true });
    }

    // "reserva" o lote para impedir aplicação dupla (duplo clique / duas abas)
    const { data: claimed, error: claimErr } = await staff.db
      .from("import_batches").update({ status: "APLICADO", aplicado_em: new Date().toISOString() })
      .eq("id", batchId).eq("status", "PREVIEW").select("id");
    throwIfDbError(claimErr);
    if (!claimed?.length) throw new AppError("INVALID_STATE", "Esta importação já foi processada.");

    try {
      const result = await applyScheduleOps(batch.operacoes as ScheduleOp[], staff.id, "IMPORTAR_EXCEL", {
        batch_id: batchId,
        arquivo: batch.nome_arquivo,
        resumo: batch.resumo,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      // a transação foi desfeita; libera o lote para nova tentativa
      await staff.db.from("import_batches").update({ status: "PREVIEW", aplicado_em: null }).eq("id", batchId);
      if (e instanceof AppError && e.code === "CONFLICT")
        throw new AppError("CONFLICT", "A agenda mudou desde a pré-visualização (há agendamento novo em horário a bloquear). Nada foi importado; envie o arquivo novamente.");
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
