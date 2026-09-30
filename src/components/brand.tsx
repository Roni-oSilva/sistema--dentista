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

const TOOTH_D = "M100 22c-24-14-66-6-74 34-6 32 8 52 16 80 6 24 8 82 28 82 16 0 16-44 30-44s14 44 30 44c20 0 22-58 28-82 8-28 22-48 16-80-8-40-50-48-74-34z";
const MOLAR_D = "M22 46C22 12 58 4 72 20c14-16 50-8 50 26 0 22-10 32-12 54-3 22-7 46-19 46-10 0-10-24-17-24s-7 24-17 24c-12 0-16-24-19-46-2-22-16-32-16-54z";

/** Dente "3D" brilhante (azul-acinzentado, com luz de contorno ciano), inspirado no pôster. */
export function BigTooth({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 250" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="bt-g" cx="32%" cy="22%" r="95%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".35" stopColor="#dbe8ee" />
          <stop offset=".75" stopColor="#8ea9b6" />
          <stop offset="1" stopColor="#5d7c8b" />
        </radialGradient>
        <linearGradient id="bt-rim" x1="0" x2="1">
          <stop offset=".6" stopColor="#19c2d3" stopOpacity="0" />
          <stop offset="1" stopColor="#7cf0ff" stopOpacity=".9" />
        </linearGradient>
        <filter id="bt-s" x="-30%" y="-20%" width="160%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="14" floodColor="#00141a" floodOpacity=".55" />
        </filter>
      </defs>
      <path d={TOOTH_D} fill="url(#bt-g)" filter="url(#bt-s)" />
      <path d={TOOTH_D} fill="none" stroke="url(#bt-rim)" strokeWidth="3" />
      <path d="M56 50c12-12 32-16 48-8" stroke="#fff" strokeWidth="7" strokeLinecap="round" fill="none" opacity=".85" />
      <ellipse cx="62" cy="98" rx="6" ry="16" fill="#fff" opacity=".35" transform="rotate(12 62 98)" />
    </svg>
  );
}

/** Molar flutuante (branco perolado). */
export function Molar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 144 160" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="mo-g" cx="35%" cy="20%" r="90%">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".6" stopColor="#eef4f7" />
          <stop offset="1" stopColor="#b7c9d2" />
        </radialGradient>
        <filter id="mo-s" x="-30%" y="-20%" width="160%" height="160%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#00141a" floodOpacity=".5" />
        </filter>
      </defs>
      <path d={MOLAR_D} fill="url(#mo-g)" filter="url(#mo-s)" />
      <path d="M40 40c10-10 22-12 32-6" stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".9" />
    </svg>
  );
}

/** Círculo de vidro com ícone (dente, coração, calendário), como nos pôsteres. */
export function GlassIcon({ kind, className = "" }: { kind: "tooth" | "heart" | "calendar"; className?: string }) {
  return (
    <span className={`glass grid place-items-center rounded-full text-white ${className}`}>
      {kind === "tooth" && <ToothMark className="h-1/2 w-1/2" />}
      {kind === "heart" && (
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.500-7 10-7 10z" />
        </svg>
      )}
      {kind === "calendar" && (
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      )}
    </span>
  );
}

/** Linha fina em arco ligando elementos flutuantes. */
export function Orbit({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 300" className={className} fill="none" aria-hidden="true">
      <path d="M20 280C10 120 120 20 280 20" stroke="rgba(255,255,255,.35)" strokeWidth="1.2" />
    </svg>
  );
}

export function Stepper({ step }: { step: number }) {
  const steps = ["Procedimento", "Profissional", "Data", "Horário", "Seus dados", "Resumo"];
  return (
    <nav aria-label="Etapas do agendamento" className="mb-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">
        Passo {step} de {steps.length} · {steps[step - 1]}
      </p>
      <ol className="flex gap-1.5" aria-hidden="true">
        {steps.map((s, i) => (
          <li key={s} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-cyan" : "bg-white/20"}`} />
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
