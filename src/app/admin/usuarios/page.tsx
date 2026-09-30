import { requirePagePermission } from "@/lib/auth/session";
import { Flash, type SearchParams } from "@/components/ui";
import { SubmitButton } from "@/components/ActionForm";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createUserAction, updateUserAction } from "./actions";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requirePagePermission("users.manage");
  const { data: profiles } = await staff.db.from("profiles").select("id, nome, role, ativo").order("nome");
  const admin = createSupabaseAdminClient();
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const email = new Map((list?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  return (
    <div className="space-y-6">
      <h1 className="h1">Usuários do painel</h1>
      <Flash sp={await searchParams} />
      <div className="space-y-2">
        {(profiles ?? []).map((p) => (
          <form key={p.id} action={updateUserAction} className="card flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="id" value={p.id} />
            <span className="min-w-40"><b>{p.nome}</b><br /><span className="text-gray-600">{email.get(p.id)}</span></span>
            <select name="role" defaultValue={p.role} aria-label="Perfil" className="input w-auto"><option>ADMIN</option><option>SECRETARIA</option></select>
            <label><input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Ativo</label>
            <SubmitButton className="btn btn-sm">Salvar</SubmitButton>
          </form>
        ))}
      </div>
      <section className="card max-w-md">
        <h2 className="h2">Novo usuário</h2>
        <form action={createUserAction} className="space-y-2">
          <input name="nome" placeholder="Nome" required maxLength={120} className="input" />
          <input name="email" type="email" placeholder="E-mail" required maxLength={200} className="input" />
          <select name="role" aria-label="Perfil" className="input" defaultValue="SECRETARIA"><option>SECRETARIA</option><option>ADMIN</option></select>
          <input name="password" type="password" placeholder="Senha inicial (mín. 10, letras e números)" required minLength={10} maxLength={72} autoComplete="new-password" className="input" />
          <SubmitButton>Criar usuário</SubmitButton>
        </form>
      </section>
    </div>
  );
}
