import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSettings, publicClinicInfo } from "@/services/settings";

export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const clinic = publicClinicInfo(await getSettings(createSupabaseAdminClient()));
  return (
    <>
      <header className="border-b border-gray-300 bg-white">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 p-4">
          <Link href="/" className="text-lg font-bold">
            {clinic.nome}
          </Link>
          <Link href="/agendamento" className="btn btn-sm">
            Agendar consulta
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-4">{children}</main>
    </>
  );
}
