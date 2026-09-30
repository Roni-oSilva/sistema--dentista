import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { fetchAll } from "@/lib/db";
import { buildTableWorkbook } from "@/lib/excel/export";
import { addDays, diffDays, formatBR, isValidYmd, nowInZone, normalizeTime } from "@/lib/datetime";
import { getSettings } from "@/services/settings";
import { loadAgendaBundle } from "@/services/agenda-data";
import { sheetRows, type SheetRow } from "@/services/schedule";
import { APPT_SELECT } from "@/services/appointments";
import { writeAudit } from "@/lib/audit";
import { formatPhone, uuid } from "@/validators/common";
import type { AppointmentRow, Patient } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  try {
    const staff = await requirePermission("excel.export");
    const { tipo } = await params;
    const sp = request.nextUrl.searchParams;
    const settings = await getSettings(staff.db);
    const today = nowInZone(settings.agenda.timezone).date;
    let buffer: Buffer;

    if (tipo === "agenda") {
      const de = isValidYmd(sp.get("de")) ? sp.get("de")! : today;
      const ateRaw = isValidYmd(sp.get("ate")) ? sp.get("ate")! : addDays(de, 30);
      if (ateRaw < de || diffDays(de, ateRaw) > 92) throw new AppError("INVALID_INPUT", "Período inválido (máximo de 92 dias).");
      const proParam = sp.get("profissional");
      const { data: pros } = await staff.db.from("professionals").select("id, nome, ativo").order("nome");
      const selected = (pros ?? []).filter((p) => p.ativo !== false && (!proParam || (uuid.safeParse(proParam).success && p.id === proParam)));
      const nameById = new Map((pros ?? []).map((p) => [p.id, p.nome]));
      const rows: (SheetRow & { nome: string })[] = [];
      for (const p of selected) {
        const bundle = await loadAgendaBundle(staff.db, p.id, de, ateRaw, settings.agenda.duracao_padrao_minutos);
        rows.push(...sheetRows(bundle).map((r) => ({ ...r, nome: nameById.get(r.professional_id) ?? "" })));
      }
      buffer = await buildTableWorkbook("Agenda", [
        { header: "Data", width: 14, value: (r: (typeof rows)[number]) => formatBR(r.data) },
        { header: "Horário", width: 10, value: (r) => r.hora },
        { header: "Status", width: 14, value: (r) => r.status },
        { header: "Profissional", width: 28, value: (r) => r.nome },
        { header: "Observação", width: 40, value: (r) => r.observacao },
      ], rows);
    } else if (tipo === "pacientes") {
      const data = await fetchAll<Patient>((a, b) => staff.db.from("patients").select("id, nome, telefone, email, observacao, criado_em").order("id").range(a, b));
      buffer = await buildTableWorkbook("Pacientes", [
        { header: "Nome", width: 30, value: (r: Patient) => r.nome },
        { header: "Telefone", width: 18, value: (r) => formatPhone(r.telefone) },
        { header: "E-mail", width: 30, value: (r) => r.email },
        { header: "Observação", width: 40, value: (r) => r.observacao },
        { header: "Cadastrado em", width: 14, value: (r) => formatBR(r.criado_em.slice(0, 10)) },
      ], data);
    } else if (tipo === "agendamentos") {
      const data = (await fetchAll((a, b) => staff.db.from("appointments").select(APPT_SELECT).order("data").order("hora_inicio").order("id").range(a, b))) as unknown as AppointmentRow[];
      buffer = await buildTableWorkbook("Agendamentos", [
        { header: "Data", width: 14, value: (r: AppointmentRow) => formatBR(r.data) },
        { header: "Início", width: 10, value: (r) => normalizeTime(r.hora_inicio) },
        { header: "Fim", width: 10, value: (r) => normalizeTime(r.hora_fim) },
        { header: "Paciente", width: 30, value: (r) => r.paciente?.nome },
        { header: "Telefone", width: 18, value: (r) => (r.paciente ? formatPhone(r.paciente.telefone) : "") },
        { header: "Procedimento", width: 22, value: (r) => r.procedimento?.nome },
        { header: "Profissional", width: 26, value: (r) => r.profissional?.nome },
        { header: "Status", width: 16, value: (r) => r.status },
        { header: "Observação", width: 40, value: (r) => r.observacao },
      ], data);
    } else {
      throw new AppError("NOT_FOUND");
    }

    await writeAudit(staff, "EXPORTAR_EXCEL", "export", tipo);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${tipo}-${today}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
