import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSettings, publicClinicInfo } from "@/services/settings";

export default async function Home() {
  const c = publicClinicInfo(await getSettings(createSupabaseAdminClient()));
  return (
    <div className="card">
      <h1 className="h1">{c.nome}</h1>
      {c.endereco && <p>Endereço: {c.endereco}</p>}
      {c.telefone && <p>Telefone: {c.telefone}</p>}
      {c.horario_funcionamento && <p>Horário: {c.horario_funcionamento}</p>}
      <p className="mt-4">
        <Link href="/agendamento" className="btn">
          Agendar consulta
        </Link>
      </p>
    </div>
  );
}
