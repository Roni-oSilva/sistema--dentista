import ExcelJS from "exceljs";
import { formatBR, isValidTime, minToTime, parseBR, timeToMin } from "@/lib/datetime";
import { AppError } from "@/lib/errors";

export const SCHEDULE_COLUMNS = ["Data", "Horário", "Status", "Profissional", "Observação"] as const;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 5000;

export type SheetStatus = "DISPONIVEL" | "OCUPADO" | "BLOQUEADO";

export interface ParsedRow {
  linha: number;
  data: string; // YYYY-MM-DD
  hora: string; // HH:MM
  status: SheetStatus;
  profissional: string;
  observacao: string | null;
}

export interface RowError {
  linha: number;
  coluna: string;
  valor: string;
  motivo: string;
}

export const normKey = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Evita injeção de fórmula (CSV/Excel injection): textos que começam com = + - @ viram texto literal. */
export function safeCell(v: string | null | undefined): string {
  const s = v ?? "";
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function cellToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellToString(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("error" in v) return String(v.error);
  }
  return String(v);
}

/** Data de célula -> YYYY-MM-DD. Datas do Excel vêm em UTC: usamos getUTC* para não "voltar um dia". */
function parseDateCell(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    if (v < 1 || v > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000).toISOString().slice(0, 10);
  }
  const s = cellToString(v).trim();
  return s ? parseBR(s) : null;
}

function parseTimeCell(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return minToTime(v.getUTCHours() * 60 + v.getUTCMinutes());
  }
  if (typeof v === "number") {
    if (v < 0 || v >= 1) return null;
    return minToTime(Math.round(v * 1440) % 1440);
  }
  const s = cellToString(v).trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const t = `${m[1].padStart(2, "0")}:${m[2]}`;
  return isValidTime(t) ? t : null;
}

function parseStatus(s: string): SheetStatus | null {
  const k = normKey(s).toUpperCase();
  if (k === "DISPONIVEL" || k === "OCUPADO" || k === "BLOQUEADO") return k;
  return null;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: RowError[];
  totalLinhas: number;
}

/** Lê e valida a planilha. Nunca descarta linha inválida em silêncio: tudo vai para `errors`. */
export async function parseScheduleWorkbook(buffer: Buffer): Promise<ParseResult> {
  if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES) {
    throw new AppError("INVALID_FILE", "Arquivo Excel inválido: tamanho máximo de 2 MB.");
  }
  // .xlsx é um ZIP: começa com "PK"
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new AppError("INVALID_FILE");

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new AppError("INVALID_FILE");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new AppError("INVALID_FILE", "Arquivo Excel inválido: nenhuma planilha encontrada.");

  const errors: RowError[] = [];
  const header = ws.getRow(1);
  const colIndex = new Map<string, number>();
  header.eachCell((cell, col) => colIndex.set(normKey(cellToString(cell.value)), col));

  const cols: Record<string, number | undefined> = {};
  let missing = false;
  for (const name of SCHEDULE_COLUMNS) {
    cols[name] = colIndex.get(normKey(name));
    if (!cols[name] && name !== "Observação") {
      missing = true;
      errors.push({ linha: 1, coluna: name, valor: "", motivo: `A coluna ${name} não foi encontrada.` });
    }
  }
  if (missing) return { rows: [], errors, totalLinhas: 0 };
  if (ws.rowCount - 1 > MAX_ROWS) {
    throw new AppError("INVALID_FILE", `Arquivo Excel inválido: máximo de ${MAX_ROWS} linhas por importação.`);
  }

  const rows: ParsedRow[] = [];
  const seen = new Map<string, number>();
  let total = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (name: string) => (cols[name] ? row.getCell(cols[name]!).value : null);
    const raw = SCHEDULE_COLUMNS.map((n) => cellToString(get(n)).trim());
    if (raw.every((x) => x === "")) continue; // linha em branco
    total++;

    const before = errors.length;
    const fail = (coluna: string, valor: string, motivo: string) => errors.push({ linha: r, coluna, valor, motivo });

    const data = parseDateCell(get("Data"));
    if (!data) fail("Data", raw[0], raw[0] ? "Data inválida (use DD/MM/AAAA)." : "Data obrigatória.");

    const hora = parseTimeCell(get("Horário"));
    if (!hora) fail("Horário", raw[1], raw[1] ? "Horário inválido (use HH:MM)." : "Horário obrigatório.");

    const status = parseStatus(raw[2]);
    if (!status) fail("Status", raw[2], "Status inválido (use DISPONIVEL, OCUPADO ou BLOQUEADO).");

    const profissional = raw[3];
    if (!profissional) fail("Profissional", "", "Profissional obrigatório.");

    const observacao = raw[4];
    if (observacao.length > 300) fail("Observação", observacao.slice(0, 40) + "…", "Observação muito longa (máximo 300 caracteres).");

    if (errors.length > before) continue;

    const key = `${normKey(profissional)}|${data}|${hora}`;
    const first = seen.get(key);
    if (first) {
      fail("Horário", `${formatBR(data!)} ${hora}`, `Linha duplicada (mesmo profissional, data e horário da linha ${first}).`);
      continue;
    }
    seen.set(key, r);
    rows.push({ linha: r, data: data!, hora: hora!, status: status!, profissional, observacao: observacao || null });
  }

  if (total === 0 && errors.length === 0) {
    errors.push({ linha: 2, coluna: "Data", valor: "", motivo: "A planilha não possui linhas de dados." });
  }
  return { rows, errors, totalLinhas: total };
}

export { timeToMin };
