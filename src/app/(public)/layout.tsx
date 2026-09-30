import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSettings, publicClinicInfo } from "@/services/settings";
import { Logo } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const clinic = publicClinicInfo(await getSettings(createSupabaseAdminClient()));
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-deep text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label={`${clinic.nome} — início`}>
            <Logo name={clinic.nome} dark />
          </Link>
          <Link href="/agendamento" className="btn btn-light btn-sm whitespace-nowrap">
            Agendar
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-4 py-4 text-xs text-muted">
          <span>{clinic.nome}</span>
          {clinic.endereco && <span>{clinic.endereco}</span>}
          {clinic.telefone && <span>{clinic.telefone}</span>}
        </div>
      </footer>
    </div>
  );
}
