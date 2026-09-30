import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSettings, publicClinicInfo } from "@/services/settings";
import { Arrow, BigTooth, Rings, ToothMark } from "@/components/brand";

export default async function Home() {
  const c = publicClinicInfo(await getSettings(createSupabaseAdminClient()));
  const steps = [
    ["1", "Escolha o procedimento", "e o profissional"],
    ["2", "Veja só horários livres", "atualizados em tempo real"],
    ["3", "Confirme e pronto", "mensagem já pronta no WhatsApp"],
  ];
  return (
    <>
      <section className="hero relative overflow-hidden text-white">
        <Rings className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] text-white" />
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-14 sm:py-20 md:grid-cols-[1.2fr_1fr]">
          <div className="relative z-10">
            <p className="chip mb-5"><ToothMark className="h-3.5 w-3.5" /> {c.nome}</p>
            <h1 className="display text-[2.6rem] sm:text-6xl">
              Cuidamos do <span className="text-[#7be0bd]">seu sorriso</span>
            </h1>
            <p className="display-soft mt-2 text-3xl sm:text-4xl">agende online!</p>
            <p className="mt-5 max-w-md text-base text-white/80">
              Escolha o procedimento, o profissional e um horário livre. Leva menos de um minuto, sem criar conta.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/agendamento" className="btn btn-light btn-lg">
                Agendar agora <Arrow />
              </Link>
              {c.horario_funcionamento && <span className="chip">{c.horario_funcionamento}</span>}
            </div>
          </div>
          <div className="relative mx-auto hidden h-72 w-72 md:block">
            <BigTooth className="relative z-10 h-full w-full" />
            <span className="glass absolute -left-4 top-6 grid h-16 w-16 place-items-center rounded-full text-xs font-bold">Limpa</span>
            <span className="glass absolute -right-2 top-24 grid h-16 w-16 place-items-center rounded-full text-xs font-bold">Forte</span>
            <span className="glass absolute bottom-4 left-2 grid h-16 w-16 place-items-center rounded-full text-xs font-bold">Saudável</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="h1 !text-2xl">Como funciona</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map(([n, t, s]) => (
            <li key={n} className="card">
              <span className="display grid h-9 w-9 place-items-center rounded-full bg-royal text-sm text-white">{n}</span>
              <p className="mt-3 font-bold">{t}</p>
              <p className="text-sm text-muted">{s}</p>
            </li>
          ))}
        </ol>
        {(c.endereco || c.telefone) && (
          <div className="card mt-6 flex flex-wrap gap-x-8 gap-y-1 text-sm">
            {c.endereco && <p><b>Endereço:</b> {c.endereco}</p>}
            {c.telefone && <p><b>Telefone:</b> {c.telefone}</p>}
          </div>
        )}
      </section>
    </>
  );
}
