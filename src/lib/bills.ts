export type Recurrence = "none" | "weekly" | "monthly" | "yearly";
export type BillStatus = "pending" | "paid" | "overdue" | "cancelled";

export function nextDueDate(dateISO: string, recurrence: Recurrence): string | null {
  if (recurrence === "none") return null;
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (recurrence === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (recurrence === "monthly") {
    const targetMonth = date.getUTCMonth() + 1;
    date.setUTCMonth(targetMonth);
    // handle month-end overflow (e.g., Jan 31 -> Mar 3); clamp to last day of target month
    if (date.getUTCMonth() !== targetMonth % 12) {
      date.setUTCDate(0);
    }
  } else if (recurrence === "yearly") {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  }
  return date.toISOString().slice(0, 10);
}

export function effectiveStatus(status: BillStatus, dueDate: string): BillStatus {
  if (status !== "pending") return status;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today ? "overdue" : "pending";
}

export const recurrenceLabel: Record<Recurrence, string> = {
  none: "Sem recorrência",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

export const statusLabel: Record<BillStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Atrasado",
  cancelled: "Cancelado",
};