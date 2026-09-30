import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSettings, publicClinicInfo } from "@/services/settings";
import { Arrow, BigTooth, GlassIcon, Molar, Orbit } from "@/components/brand";

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
        <div className="mx-auto grid max-w-5xl items-center gap-2 px-4 pb-14 pt-10 md:min-h-[34rem] md:grid-cols-[1.15fr_1fr] md:pt-14">
          {/* composição de dentes (mobile: acima do título) */}
          <div className="relative order-first mx-auto h-64 w-full max-w-sm md:order-last md:h-[26rem]">
            <Orbit className="absolute inset-0 h-full w-full" />
            <span className="anim-pop d2 absolute bottom-0 left-2 h-[88%]"><BigTooth className="float-a h-full drop-shadow-2xl" /></span>
            <span className="anim-pop d4 absolute right-0 top-[34%] h-[38%] rotate-[14deg]"><Molar className="float-b h-full" /></span>
            <GlassIcon kind="tooth" className="drift anim-pop d5 absolute left-0 top-2 h-16 w-16 md:h-20 md:w-20" />
            <GlassIcon kind="heart" className="float-b anim-pop d6 absolute right-6 top-0 h-14 w-14 md:h-[4.5rem] md:w-[4.5rem]" />
          </div>

          <div className="relative z-10">
            <h1 className="display anim-rise d1 text-[2.4rem] sm:text-6xl">
              Cuidamos do<br />
              <span className="display-grad">seu sorriso</span>
            </h1>
            <p className="display-soft anim-rise d2 mt-2 text-3xl sm:text-4xl">agende online!</p>
            <p className="anim-rise d3 mt-5 max-w-md text-base text-white/75">
              Escolha o procedimento, o profissional e um horário livre. Leva menos de um minuto, sem criar conta.
            </p>
            <div className="anim-rise d4 mt-7 flex flex-wrap items-center gap-3">
              <span className="pill-white shine inline-flex items-center gap-2 px-5 py-3 text-base font-bold">
                {c.horario_funcionamento || "Agendamento online grátis"} <span aria-hidden="true">🔥</span>
              </span>
            </div>
            <Link href="/agendamento" className="cta-blue group anim-rise d5 mt-4 inline-flex items-center gap-3 py-1.5 pl-2 pr-5 text-sm font-bold">
              <span className="cta-pulse grid h-9 w-9 place-items-center rounded-full bg-orange text-white"><Arrow /></span>
              Agendar minha consulta
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="h1 !text-2xl">Como funciona</h2>
        <ol className="stagger grid gap-3 sm:grid-cols-3">
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
