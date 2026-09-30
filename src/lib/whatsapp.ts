import { formatBR } from "@/lib/datetime";
import { formatPhone } from "@/validators/common";

/**
 * WhatsApp via link (wa.me). A interface `NotificationProvider` permite trocar depois por
 * WhatsApp Business API sem mexer nas regras de negócio: basta criar outro provider.
 */
export interface BookingMessageData {
  paciente: string;
  telefonePaciente: string; // dígitos
  procedimento: string;
  profissional: string;
  data: string; // YYYY-MM-DD
  hora: string; // HH:MM
}

export function buildNewBookingMessage(d: BookingMessageData): string {
  return [
    "NOVO AGENDAMENTO",
    `Paciente: ${d.paciente}`,
    `WhatsApp: ${formatPhone(d.telefonePaciente)}`,
    `Procedimento: ${d.procedimento}`,
    `Profissional: ${d.profissional}`,
    `Data: ${formatBR(d.data)}`,
    `Horário: ${d.hora}`,
  ].join("\n");
}

/** Número para wa.me: somente dígitos com DDI 55 (Brasil). Retorna null se inválido. */
export function toWaNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  return null;
}

export function buildWhatsAppLink(phone: string, message: string): string | null {
  const number = toWaNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export interface NotificationProvider {
  /** Gera o destino/ação para notificar. Na versão por link devolve uma URL para abrir. */
  bookingCreated(to: string, data: BookingMessageData): { kind: "link"; url: string } | null;
}

export const whatsappLinkProvider: NotificationProvider = {
  bookingCreated(to, data) {
    const url = buildWhatsAppLink(to, buildNewBookingMessage(data));
    return url ? { kind: "link", url } : null;
  },
};
