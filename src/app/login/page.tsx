import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/ActionForm";
import { BigTooth, Logo, Rings } from "@/components/brand";
import { getCurrentStaff } from "@/lib/auth/session";
import { loginAction } from "./actions";
import { Flash, first, type SearchParams } from "@/components/ui";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  if (await getCurrentStaff()) redirect("/admin");
  return (
    <main className="grid min-h-dvh md:grid-cols-2">
      <section className="hero relative hidden overflow-hidden p-10 text-white md:flex md:flex-col md:justify-between">
        <Rings className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 text-white" />
        <Logo name="Painel da clínica" dark />
        <div className="relative z-10">
          <BigTooth className="mb-6 h-44 w-44" />
          <h1 className="display text-5xl">Agenda sob controle</h1>
          <p className="display-soft mt-2 text-2xl">simples, rápida, segura.</p>
        </div>
      </section>
      <section className="grid place-items-center p-5">
        <div className="w-full max-w-sm">
          <h2 className="h1">Entrar</h2>
          <Flash sp={sp} />
          <div className="card">
            <ActionForm action={loginAction}>
              <input type="hidden" name="next" value={first(sp.next) ?? ""} />
              <Field label="E-mail" name="email">
                <input id="email" name="email" type="email" autoComplete="username" required maxLength={200} className="input" />
              </Field>
              <Field label="Senha" name="password">
                <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} className="input" />
              </Field>
              <SubmitButton className="btn w-full">Entrar</SubmitButton>
            </ActionForm>
            <p className="mt-4 text-sm">
              <Link href="/recuperar-senha" className="font-semibold text-royal underline">Esqueci minha senha</Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
