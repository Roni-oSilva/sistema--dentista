import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { logoutAction } from "@/app/login/actions";

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
  return (
    <div>
      <header className="border-b border-gray-300 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 p-3">
          <span className="text-sm">
            <strong>{staff.nome}</strong> ({staff.role})
          </span>
          <div className="flex items-center gap-2">
            <Link href="/admin/alterar-senha" className="btn btn-secondary btn-sm">
              Alterar senha
            </Link>
            <form action={logoutAction}>
              <button className="btn btn-sm">Sair</button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-3 pb-3 text-sm" aria-label="Menu">
          {NAV.filter((n) => hasPermission(staff.role, n.perm)).map((n) => (
            <Link key={n.href} href={n.href} className="underline">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-3">{children}</main>
    </div>
  );
}
