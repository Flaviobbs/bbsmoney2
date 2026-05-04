export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);

export const formatDate = (value: string | Date) => {
  const d = typeof value === "string" ? new Date(value + "T00:00:00") : value;
  return new Intl.DateTimeFormat("pt-BR").format(d);
};

export const monthLabel = (value: Date) =>
  new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
    .format(value)
    .replace(".", "");

export const todayISO = () => new Date().toISOString().slice(0, 10);