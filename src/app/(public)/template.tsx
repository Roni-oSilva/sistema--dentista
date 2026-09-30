/** `template` remonta a cada navegação: dá a entrada suave de cada passo do agendamento. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
