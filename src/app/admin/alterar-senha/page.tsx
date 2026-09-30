import { ActionForm, Field, SubmitButton } from "@/components/ActionForm";
import { requireStaff } from "@/lib/auth/session";
import { changePasswordAction } from "./actions";

export const metadata = { title: "Alterar senha" };

export default async function AlterarSenhaPage() {
  await requireStaff();
  return (
    <div className="max-w-sm">
      <h1 className="h1">Alterar senha</h1>
      <div className="card">
        <ActionForm action={changePasswordAction}>
          <Field label="Senha atual" name="atual"><input id="atual" name="atual" type="password" autoComplete="current-password" required className="input" /></Field>
          <Field label="Nova senha (mín. 10, letras e números)" name="nova"><input id="nova" name="nova" type="password" autoComplete="new-password" required minLength={10} maxLength={72} className="input" /></Field>
          <Field label="Confirmar nova senha" name="confirmar"><input id="confirmar" name="confirmar" type="password" autoComplete="new-password" required className="input" /></Field>
          <SubmitButton>Alterar senha</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
