import ExcelJS from "exceljs";
import { safeCell } from "./schedule-sheet";

export interface TableColumn<T> {
  header: string;
  width?: number;
  value: (row: T) => string | number | null | undefined;
}

/** Gera um .xlsx simples. Datas/horas são gravadas como TEXTO (DD/MM/AAAA, HH:MM): sem ambiguidade de fuso. */
export async function buildTableWorkbook<T>(sheetName: string, columns: TableColumn<T>[], rows: T[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema de Agendamento";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 18 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of rows) {
    ws.addRow(
      columns.map((c) => {
        const v = c.value(row);
        return typeof v === "number" ? v : safeCell(v == null ? "" : String(v));
      }),
    );
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
