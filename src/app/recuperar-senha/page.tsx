import Link from "next/link";
import { ActionForm, Field, SubmitButton } from "@/components/ActionForm";
import { requestPasswordReset } from "./actions";

export const metadata = { title: "Recuperar senha" };

export default function RecoverPage() {
  return (
    <main className="mx-auto max-w-sm p-4">
      <h1 className="h1">Recuperar senha</h1>
      <div className="card">
        <ActionForm action={requestPasswordReset}>
          <Field label="E-mail" name="email">
            <input id="email" name="email" type="email" required maxLength={200} className="input" />
          </Field>
          <SubmitButton>Enviar link</SubmitButton>
        </ActionForm>
        <p className="mt-4 text-sm">
          <Link href="/login" className="underline">
            Voltar ao login
          </Link>
        </p>
      </div>
    </main>
  );
}
