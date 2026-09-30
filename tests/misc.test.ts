import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "@/lib/signed-token";
import { buildNewBookingMessage, buildWhatsAppLink, toWaNumber } from "@/lib/whatsapp";
import { formatPhone, normalizePhone } from "@/validators/common";
import { publicPatientSchema, blockedPeriodSchema, slotRowSchema, passwordSchema } from "@/validators/schemas";

const SECRET = "x".repeat(40);

describe("token assinado", () => {
  it("valida, expira e detecta adulteração", () => {
    const t = signToken({ a: 1 }, SECRET, 60, 1_000_000);
    expect(verifyToken(t, SECRET, 1_000_000 + 30_000)).toEqual({ a: 1 });
    expect(verifyToken(t, SECRET, 1_000_000 + 61_000)).toBeNull();
    expect(verifyToken(t, "y".repeat(40), 1_000_000)).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ p: { a: 2 }, exp: 9e9 })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, SECRET, 1_000_000)).toBeNull();
    expect(verifyToken(`${body}.`, SECRET)).toBeNull();
    expect(verifyToken(undefined, SECRET)).toBeNull();
    expect(verifyToken("lixo", SECRET)).toBeNull();
  });
});

describe("WhatsApp", () => {
  const data = { paciente: "João Silva", telefonePaciente: "91999999999", procedimento: "Avaliação", profissional: "Dra. Maria", data: "2026-10-07", hora: "14:30" };
  it("mensagem no formato esperado", () => {
    expect(buildNewBookingMessage(data)).toBe(
      "NOVO AGENDAMENTO\nPaciente: João Silva\nWhatsApp: (91) 99999-9999\nProcedimento: Avaliação\nProfissional: Dra. Maria\nData: 07/10/2026\nHorário: 14:30",
    );
  });
  it("link wa.me com texto codificado", () => {
    const url = buildWhatsAppLink("(91) 98888-7777", buildNewBookingMessage(data))!;
    expect(url.startsWith("https://wa.me/5591988887777?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toContain("Horário: 14:30");
  });
  it("números", () => {
    expect(toWaNumber("91988887777")).toBe("5591988887777");
    expect(toWaNumber("+55 91 98888-7777")).toBe("5591988887777");
    expect(toWaNumber("123")).toBeNull();
    expect(buildWhatsAppLink("", "x")).toBeNull();
  });
});

describe("validação", () => {
  it("telefone", () => {
    expect(normalizePhone("(91) 99999-9999")).toBe("91999999999");
    expect(normalizePhone("+55 (91) 99999-9999")).toBe("91999999999");
    expect(normalizePhone("9199999999")).toBe("9199999999");
    expect(normalizePhone("91 89999-9999")).toBeNull(); // 11 dígitos sem 9
    expect(normalizePhone("00 99999-9999")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(formatPhone("91999999999")).toBe("(91) 99999-9999");
  });
  it("paciente público exige consentimento e bloqueia honeypot", () => {
    const ok = { nome: "  Maria  ", telefone: "(91) 99999-9999", email: "", consentimento: "on" };
    const r = publicPatientSchema.parse(ok);
    expect(r).toMatchObject({ nome: "Maria", telefone: "91999999999", email: null, consentimento: true });
    expect(publicPatientSchema.safeParse({ ...ok, consentimento: undefined }).success).toBe(false);
    expect(publicPatientSchema.safeParse({ ...ok, website: "http://spam" }).success).toBe(false);
    expect(publicPatientSchema.safeParse({ ...ok, nome: "A" }).success).toBe(false);
    expect(publicPatientSchema.safeParse({ ...ok, email: "nao-e-email" }).success).toBe(false);
  });
  it("remove caracteres de controle", () => {
    expect(publicPatientSchema.parse({ nome: "Ma\u0000ria\u0007", telefone: "91999999999", consentimento: "on" }).nome).toBe("Maria");
  });
  it("período bloqueado: datas e horários coerentes", () => {
    expect(blockedPeriodSchema.safeParse({ data_inicio: "2026-10-21", data_fim: "2026-10-20" }).success).toBe(false);
    expect(blockedPeriodSchema.safeParse({ data_inicio: "2026-10-20", data_fim: "2026-10-21" }).success).toBe(true);
    expect(blockedPeriodSchema.safeParse({ data_inicio: "2026-10-20", data_fim: "2026-10-20", hora_inicio: "10:00" }).success).toBe(false);
    expect(blockedPeriodSchema.safeParse({ data_inicio: "2026-10-20", data_fim: "2026-10-20", hora_inicio: "11:00", hora_fim: "10:00" }).success).toBe(false);
  });
  it("linha da planilha", () => {
    const base = { professional_id: "a0000000-0000-4000-8000-000000000001", data: "2026-10-07", hora_inicio: "14:30", status: "BLOQUEADO" };
    expect(slotRowSchema.safeParse(base).success).toBe(true);
    expect(slotRowSchema.safeParse({ ...base, status: "OCUPADO" }).success).toBe(false);
    expect(slotRowSchema.safeParse({ ...base, professional_id: "1; drop table" }).success).toBe(false);
    expect(slotRowSchema.safeParse({ ...base, data: "2026-02-30" }).success).toBe(false);
  });
  it("senha forte", () => {
    expect(passwordSchema.safeParse("curta1").success).toBe(false);
    expect(passwordSchema.safeParse("somenteletras").success).toBe(false);
    expect(passwordSchema.safeParse("Senha-segura-2026").success).toBe(true);
  });
});
