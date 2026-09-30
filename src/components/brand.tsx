/** Marca e elementos decorativos (SVG/CSS puros: sem imagens pesadas). */

export function ToothMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 120" className={className} fill="none" aria-hidden="true">
      <path
        d="M50 10C38 3 18 7 14 27c-3 16 4 26 8 40 3 12 4 40 14 40 8 0 8-22 14-22s6 22 14 22c10 0 11-28 14-40 4-14 11-24 8-40C82 7 62 3 50 10z"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ name, dark = false }: { name: string; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`grid h-9 w-9 place-items-center rounded-full border-2 ${dark ? "border-white/80 text-white" : "border-royal text-royal"}`}>
        <ToothMark className="h-4 w-4" />
      </span>
      <span className="display-soft text-base font-bold uppercase tracking-tight" style={{ fontWeight: 800 }}>
        {name}
      </span>
    </span>
  );
}

/** Dente "3D" estilizado para o hero. */
export function BigTooth({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 240" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="tg" cx="35%" cy="25%" r="85%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".55" stopColor="#e7f1f4" />
          <stop offset="1" stopColor="#a9c4cc" />
        </radialGradient>
        <filter id="ts" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#02161b" floodOpacity=".35" />
        </filter>
      </defs>
      <path
        filter="url(#ts)"
        fill="url(#tg)"
        d="M100 22c-24-14-66-6-74 34-6 32 8 52 16 80 6 24 8 82 28 82 16 0 16-44 30-44s14 44 30 44c20 0 22-58 28-82 8-28 22-48 16-80-8-40-50-48-74-34z"
      />
      <path d="M62 52c10-10 26-12 38-6" stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".9" />
    </svg>
  );
}

/** Anéis decorativos (como no pôster azul). */
export function Rings({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className} fill="none" aria-hidden="true">
      <circle cx="200" cy="200" r="190" stroke="currentColor" strokeWidth="26" opacity=".12" />
      <circle cx="200" cy="200" r="120" stroke="currentColor" strokeWidth="14" opacity=".10" />
    </svg>
  );
}

export function Stepper({ step }: { step: number }) {
  const steps = ["Procedimento", "Profissional", "Data", "Horário", "Seus dados", "Resumo"];
  return (
    <nav aria-label="Etapas do agendamento" className="mb-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
        Passo {step} de {steps.length} · {steps[step - 1]}
      </p>
      <ol className="flex gap-1.5" aria-hidden="true">
        {steps.map((s, i) => (
          <li key={s} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-royal" : "bg-line"}`} />
        ))}
      </ol>
    </nav>
  );
}

export function Arrow() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-royal" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
