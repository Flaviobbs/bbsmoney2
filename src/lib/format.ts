export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);

export const formatDate = (value: string | Date) => {
  const d = typeof value === "string" ? new Date(value + "T00:00:00") : value;
  return new Intl.DateTimeFormat("pt-BR").format(d);
};

/** Formata data ISO (yyyy-mm-dd) no padrão brasileiro DD-MM-AAAA. */
export const formatDateBR = (value: string | null | undefined) => {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return String(value);
};

export const monthLabel = (value: Date) =>
  new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
    .format(value)
    .replace(".", "");

export const todayISO = () => new Date().toISOString().slice(0, 10);