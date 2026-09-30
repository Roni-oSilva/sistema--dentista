import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ActionForm, Field, SubmitButton } from "@/components/ActionForm";
import { setNewPassword } from "./actions";

export const metadata = { title: "Nova senha" };

export default async function NewPasswordPage() {
  if ((await cookies()).get("pw_recovery")?.value !== "1") redirect("/recuperar-senha");
  return (
    <main className="mx-auto max-w-sm p-5 pt-16">
      <h1 className="h1">Definir nova senha</h1>
      <div className="card">
        <ActionForm action={setNewPassword}>
          <Field label="Nova senha (mín. 10 caracteres, com letras e números)" name="nova">
            <input id="nova" name="nova" type="password" autoComplete="new-password" required minLength={10} maxLength={72} className="input" />
          </Field>
          <Field label="Confirmar nova senha" name="confirmar">
            <input id="confirmar" name="confirmar" type="password" autoComplete="new-password" required className="input" />
          </Field>
          <SubmitButton>Salvar senha</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
