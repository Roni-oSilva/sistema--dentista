import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/ActionForm";
import { BigTooth, GlassIcon, Logo, Molar } from "@/components/brand";
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
        <Logo name="Painel da clínica" dark />
        <div className="relative z-10">
          <div className="relative mb-6 h-56">
            <BigTooth className="float-a anim-pop d2 absolute bottom-0 left-0 h-full" />
            <Molar className="float-b anim-pop d4 absolute bottom-6 left-40 h-28 rotate-[14deg]" />
            <GlassIcon kind="calendar" className="drift anim-pop d5 absolute left-52 top-0 h-16 w-16" />
          </div>
          <h1 className="display anim-rise d3 text-5xl">Agenda <span className="display-grad">sob controle</span></h1>
          <p className="display-soft mt-2 text-2xl">simples, rápida, segura.</p>
        </div>
      </section>
      <section className="grid place-items-center p-5">
        <div className="anim-rise d2 w-full max-w-sm">
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
