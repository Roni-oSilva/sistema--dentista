import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/ActionForm";
import { getCurrentStaff } from "@/lib/auth/session";
import { loginAction } from "./actions";
import { Flash, first, type SearchParams } from "@/components/ui";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  if (await getCurrentStaff()) redirect("/admin");
  return (
    <main className="mx-auto max-w-sm p-4">
      <h1 className="h1">Painel da clínica</h1>
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
          <SubmitButton>Entrar</SubmitButton>
        </ActionForm>
        <p className="mt-4 text-sm">
          <Link href="/recuperar-senha" className="underline">
            Esqueci minha senha
          </Link>
        </p>
      </div>
    </main>
  );
}
