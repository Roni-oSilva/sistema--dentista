import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { logoutAction } from "@/app/login/actions";
import { AdminNav } from "@/components/AdminNav";
import { Logo } from "@/components/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Painel", template: "%s | Painel" }, robots: { index: false, follow: false } };

const NAV: { href: string; label: string; perm: Permission }[] = [
  { href: "/admin", label: "Dashboard", perm: "dashboard.view" },
  { href: "/admin/agenda", label: "Agenda", perm: "agenda.view" },
  { href: "/admin/agendamentos", label: "Agendamentos", perm: "appointments.view" },
  { href: "/admin/pacientes", label: "Pacientes", perm: "patients.view" },
  { href: "/admin/profissionais", label: "Profissionais", perm: "professionals.manage" },
  { href: "/admin/procedimentos", label: "Procedimentos", perm: "procedures.manage" },
  { href: "/admin/bloqueios", label: "Bloqueios", perm: "blocks.manage" },
  { href: "/admin/planilha", label: "Planilha", perm: "availability.manage" },
  { href: "/admin/importar", label: "Importar Excel", perm: "excel.import" },
  { href: "/admin/configuracoes", label: "Configurações", perm: "settings.manage" },
  { href: "/admin/usuarios", label: "Usuários", perm: "users.manage" },
  { href: "/admin/auditoria", label: "Auditoria", perm: "audit.view" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const items = NAV.filter((n) => hasPermission(staff.role, n.perm)).map(({ href, label }) => ({ href, label }));
  return (
    <div>
      <header className="bg-deep text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-3">
          <Link href="/admin" aria-label="Painel — início"><Logo name="Painel" dark /></Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden sm:inline text-white/80"><b className="text-white">{staff.nome}</b> · {staff.role}</span>
            <Link href="/admin/alterar-senha" className="btn btn-sm border border-white/30 bg-transparent hover:bg-white/10">Alterar senha</Link>
            <form action={logoutAction}>
              <button className="btn btn-light btn-sm">Sair</button>
            </form>
          </div>
        </div>
        <AdminNav items={items} />
      </header>
      <main className="mx-auto max-w-6xl p-3 sm:p-5">{children}</main>
    </div>
  );
}
