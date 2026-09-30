import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseScheduleWorkbook, safeCell } from "@/lib/excel/schedule-sheet";
import { buildTableWorkbook } from "@/lib/excel/export";

async function workbook(rows: (string | number | Date | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Agenda");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const H = ["Data", "Horário", "Status", "Profissional", "Observação"];

describe("importação Excel", () => {
  it("lê linhas válidas (texto, datas e horas nativas do Excel)", async () => {
    const buf = await workbook([
      H,
      ["07/10/2026", "14:30", "disponível", "Dra. Maria", "encaixe"],
      [new Date(Date.UTC(2026, 9, 7)), new Date(Date.UTC(1899, 11, 30, 15, 0)), "BLOQUEADO", "Dra. Maria", null],
      ["2026-10-08", "9:00", "OCUPADO", "Dr. Carlos", null],
      [46302, 0.375, "DISPONIVEL", "Dr. Carlos", null], // 46302 = 07/10/2026; 0,375 = 09:00
    ]);
    const r = await parseScheduleWorkbook(buf);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0]).toMatchObject({ data: "2026-10-07", hora: "14:30", status: "DISPONIVEL", observacao: "encaixe" });
    expect(r.rows[1]).toMatchObject({ data: "2026-10-07", hora: "15:00", status: "BLOQUEADO" }); // sem "voltar um dia"
    expect(r.rows[2]).toMatchObject({ data: "2026-10-08", hora: "09:00", status: "OCUPADO" });
    expect(r.rows[3]).toMatchObject({ data: "2026-10-07", hora: "09:00" });
  });

  it("reporta linha, coluna, valor e motivo de cada erro", async () => {
    const buf = await workbook([
      H,
      ["31/02/2026", "14:30", "DISPONIVEL", "A", null],
      ["07/10/2026", "25:00", "DISPONIVEL", "A", null],
      ["07/10/2026", "10:00", "TALVEZ", "A", null],
      ["07/10/2026", "10:30", "DISPONIVEL", "", null],
      ["07/10/2026", "11:00", "DISPONIVEL", "A", null],
      ["07/10/2026", "11:00", "BLOQUEADO", "A", null],
    ]);
    const r = await parseScheduleWorkbook(buf);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([
      { linha: 2, coluna: "Data", valor: "31/02/2026", motivo: "Data inválida (use DD/MM/AAAA)." },
      { linha: 3, coluna: "Horário", valor: "25:00", motivo: "Horário inválido (use HH:MM)." },
      { linha: 4, coluna: "Status", valor: "TALVEZ", motivo: "Status inválido (use DISPONIVEL, OCUPADO ou BLOQUEADO)." },
      { linha: 5, coluna: "Profissional", valor: "", motivo: "Profissional obrigatório." },
      expect.objectContaining({ linha: 7, coluna: "Horário", motivo: expect.stringContaining("duplicada") }),
    ]);
  });

  it("coluna ausente: 'A coluna Data não foi encontrada.'", async () => {
    const r = await parseScheduleWorkbook(await workbook([["Horário", "Status", "Profissional"], ["10:00", "DISPONIVEL", "A"]]));
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toEqual({ linha: 1, coluna: "Data", valor: "", motivo: "A coluna Data não foi encontrada." });
  });

  it("aceita cabeçalhos sem acento/maiúsculas e ignora linhas em branco", async () => {
    const r = await parseScheduleWorkbook(await workbook([["data", "horario", "STATUS", "profissional"], [], ["07/10/2026", "10:00", "BLOQUEADO", "A"]]));
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it("rejeita arquivos que não são xlsx", async () => {
    await expect(parseScheduleWorkbook(Buffer.from("isso não é excel"))).rejects.toThrow("Arquivo Excel inválido");
    await expect(parseScheduleWorkbook(Buffer.alloc(0))).rejects.toThrow("Arquivo Excel inválido");
    await expect(parseScheduleWorkbook(Buffer.concat([Buffer.from("PK"), Buffer.alloc(50)]))).rejects.toThrow("Arquivo Excel inválido");
    await expect(parseScheduleWorkbook(Buffer.alloc(3 * 1024 * 1024, 0x50))).rejects.toThrow("Arquivo Excel inválido");
  });
});

describe("exportação Excel", () => {
  it("exporta e reimporta sem alterar datas (ida e volta)", async () => {
    const buf = await buildTableWorkbook(
      "Agenda",
      [
        { header: "Data", value: (r: { d: string }) => r.d },
        { header: "Horário", value: () => "14:30" },
        { header: "Status", value: () => "DISPONIVEL" },
        { header: "Profissional", value: () => "Dra. Maria" },
        { header: "Observação", value: () => "=HYPERLINK(\"http://x\")" },
      ],
      [{ d: "07/10/2026" }],
    );
    const r = await parseScheduleWorkbook(buf);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ data: "2026-10-07", hora: "14:30" });
    expect(r.rows[0].observacao!.startsWith("'=")).toBe(true); // fórmula neutralizada
  });
  it("safeCell neutraliza fórmulas", () => {
    for (const s of ["=1+1", "+1", "-1", "@SUM(A1)"]) expect(safeCell(s).startsWith("'")).toBe(true);
    expect(safeCell("Maria")).toBe("Maria");
    expect(safeCell(null)).toBe("");
  });
});
