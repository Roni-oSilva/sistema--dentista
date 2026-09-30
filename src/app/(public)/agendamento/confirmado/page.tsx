import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readDoneCookie } from "@/lib/booking-flow";
import { getSettings } from "@/services/settings";
import { formatBR, normalizeTime } from "@/lib/datetime";
import { buildNewBookingMessage, whatsappLinkProvider } from "@/lib/whatsapp";

export const metadata = { title: "Agendamento registrado" };

export default async function ConfirmadoPage() {
  const id = await readDoneCookie();
  if (!id) redirect("/agendamento/procedimento");
  const db = createSupabaseAdminClient();
  const { data: a } = await db
    .from("appointments")
    .select("data, hora_inicio, paciente:patients(nome, telefone), profissional:professionals(nome), procedimento:procedures(nome)")
    .eq("id", id)
    .maybeSingle();
  if (!a) redirect("/agendamento/procedimento");
  const paciente = a.paciente as unknown as { nome: string; telefone: string };
  const profissional = a.profissional as unknown as { nome: string };
  const procedimento = a.procedimento as unknown as { nome: string };
  const settings = await getSettings(db);
  const msgData = {
    paciente: paciente.nome,
    telefonePaciente: paciente.telefone,
    procedimento: procedimento.nome,
    profissional: profissional.nome,
    data: a.data as string,
    hora: normalizeTime(a.hora_inicio as string),
  };
  const link = whatsappLinkProvider.bookingCreated(settings.clinica.whatsapp, msgData);
  return (
    <div>
      <h1 className="h1">Agendamento registrado</h1>
      <p className="alert-ok mb-4">
        Seu horário foi reservado para {formatBR(msgData.data)} às {msgData.hora}. A clínica entrará em contato para confirmar.
      </p>
      <pre className="card mb-4 whitespace-pre-wrap text-sm">{buildNewBookingMessage(msgData)}</pre>
      {link ? (
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="btn">
          Enviar pelo WhatsApp
        </a>
      ) : (
        <p className="text-sm">Guarde estes dados. Em caso de dúvida, entre em contato com a clínica.</p>
      )}
      <p className="mt-4 text-sm">
        <Link href="/" className="underline">
          Voltar ao início
        </Link>
      </p>
    </div>
  );
}
