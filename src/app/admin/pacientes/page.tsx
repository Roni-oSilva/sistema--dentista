import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { ActionForm, Field, SubmitButton } from "@/components/ActionForm";
import { first, type SearchParams } from "@/components/ui";
import { formatPhone } from "@/validators/common";
import { createPatientAction } from "./actions";

export const metadata = { title: "Pacientes" };

export default async function PacientesPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requirePagePermission("patients.view");
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim().slice(0, 60);
  let query = staff.db.from("patients").select("id, nome, telefone, email").order("nome").limit(100);
  if (q.length >= 2) {
    const safe = q.replace(/[%,()]/g, " ");
    const digits = q.replace(/\D/g, "");
    query = query.or(`nome.ilike.%${safe}%${digits.length >= 4 ? `,telefone.ilike.%${digits}%` : ""}`);
  }
  const { data: patients } = await query;
  return (
    <div>
      <h1 className="h1">Pacientes</h1>
      <form method="get" className="card mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nome ou telefone" className="input max-w-xs" />
        <button className="btn">Buscar</button>
        {hasPermission(staff.role, "excel.export") && <a href="/api/admin/export/pacientes" className="btn btn-secondary">Baixar Excel</a>}
      </form>
      <div className="table-wrap mb-6">
        <table className="tbl">
          <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th /></tr></thead>
          <tbody>
            {(patients ?? []).map((p) => (
              <tr key={p.id}><td>{p.nome}</td><td>{formatPhone(p.telefone)}</td><td>{p.email}</td>
                <td><Link className="underline" href={`/admin/pacientes/${p.id}`}>Abrir / histórico</Link></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasPermission(staff.role, "patients.create") && (
        <section className="card max-w-md">
          <h2 className="h2">Novo paciente</h2>
          <ActionForm action={createPatientAction}>
            <Field label="Nome" name="nome"><input id="nome" name="nome" required maxLength={120} className="input" /></Field>
            <Field label="Telefone/WhatsApp" name="telefone"><input id="telefone" name="telefone" type="tel" required maxLength={20} className="input" /></Field>
            <Field label="E-mail" name="email"><input id="email" name="email" type="email" maxLength={200} className="input" /></Field>
            <Field label="Observação" name="observacao"><textarea id="observacao" name="observacao" maxLength={1000} rows={2} className="input" /></Field>
            <SubmitButton>Cadastrar</SubmitButton>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
