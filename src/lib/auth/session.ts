import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { hasPermission, isRole, type Permission, type Role } from "./permissions";

export interface Staff {
  id: string;
  email: string;
  nome: string;
  role: Role;
  /** cliente com a sessão do usuário (RLS aplicado) */
  db: SupabaseClient;
}

/** Usuário logado + perfil ativo. `null` se não logado, sem perfil ou desativado. */
export const getCurrentStaff = cache(async (): Promise<Staff | null> => {
  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getUser(); // valida o JWT no servidor do Supabase
  const user = data.user;
  if (!user) return null;
  const { data: profile } = await db.from("profiles").select("nome, role, ativo").eq("id", user.id).maybeSingle();
  if (!profile || !profile.ativo || !isRole(profile.role)) return null;
  return { id: user.id, email: user.email ?? "", nome: profile.nome, role: profile.role, db };
});

/** Para páginas: redireciona ao login se não autenticado. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}

/** Para páginas: redireciona para "sem permissão" se faltar a permissão. */
export async function requirePagePermission(permission: Permission): Promise<Staff> {
  const staff = await requireStaff();
  if (!hasPermission(staff.role, permission)) redirect("/admin/sem-permissao");
  return staff;
}

/** Para Server Actions e Route Handlers: lança AppError (mensagem segura) em vez de redirecionar. */
export async function requirePermission(permission: Permission): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) throw new AppError("UNAUTHENTICATED");
  if (!hasPermission(staff.role, permission)) throw new AppError("FORBIDDEN");
  return staff;
}
