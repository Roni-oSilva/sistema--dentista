import Link from "next/link";
import { StatusBadge } from "@/components/ui";
import { formatBR, normalizeTime } from "@/lib/datetime";
import { formatPhone } from "@/validators/common";
import type { AppointmentRow } from "@/types";

export function AppointmentTable({ rows, showDate = true }: { rows: AppointmentRow[]; showDate?: boolean }) {
  if (rows.length === 0) return <p className="alert-info">Nenhum agendamento encontrado.</p>;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {showDate && <th>Data</th>}
            <th>Horário</th>
            <th>Paciente</th>
            <th>Procedimento</th>
            <th>Profissional</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              {showDate && <td>{formatBR(a.data)}</td>}
              <td>
                {normalizeTime(a.hora_inicio)}–{normalizeTime(a.hora_fim)}
              </td>
              <td>
                {a.paciente?.nome}
                <br />
                <span className="text-xs text-muted">{a.paciente ? formatPhone(a.paciente.telefone) : ""}</span>
              </td>
              <td>{a.procedimento?.nome}</td>
              <td>{a.profissional?.nome}</td>
              <td>
                <StatusBadge status={a.status} />
              </td>
              <td>
                <Link href={`/admin/agendamentos/${a.id}`} className="underline">
                  Abrir
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
