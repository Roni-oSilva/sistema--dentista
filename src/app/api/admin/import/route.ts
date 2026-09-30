import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { AppError, throwIfDbError } from "@/lib/errors";
import { MAX_FILE_BYTES, parseScheduleWorkbook } from "@/lib/excel/schedule-sheet";
import { getSettings } from "@/services/settings";
import { planImport } from "@/services/schedule";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Passo 1: recebe o .xlsx, valida e devolve a PRÉ-VISUALIZAÇÃO. Nada é gravado na agenda. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const staff = await requirePermission("excel.import");
    const form = await request.formData();
    const file = form.get("arquivo");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) throw new AppError("INVALID_FILE");
    if (file.size === 0 || file.size > MAX_FILE_BYTES) throw new AppError("INVALID_FILE", "Arquivo Excel inválido: tamanho máximo de 2 MB.");
    const removeMissing = form.get("remover_ausentes") === "on";

    const parsed = await parseScheduleWorkbook(Buffer.from(await file.arrayBuffer()));
    const settings = await getSettings(staff.db);
    const plan = await planImport(staff.db, settings, parsed.rows, parsed.errors, removeMissing);

    const nomeArquivo = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 200);
    const { data, error } = await staff.db
      .from("import_batches")
      .insert({
        criado_por: staff.id,
        nome_arquivo: nomeArquivo,
        operacoes: plan.ops,
        resumo: plan.summary,
        erros: plan.errors.slice(0, 1000),
        remover_ausentes: removeMissing,
      })
      .select("id")
      .single();
    throwIfDbError(error);
    await writeAudit(staff, "PREVIA_IMPORTACAO_EXCEL", "import_batches", data!.id, { resumo: plan.summary });

    return NextResponse.json({
      ok: true,
      batchId: data!.id,
      summary: plan.summary,
      errors: plan.errors.slice(0, 1000),
      errorsTruncated: plan.errors.length > 1000,
      operacoes: plan.ops.length,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
