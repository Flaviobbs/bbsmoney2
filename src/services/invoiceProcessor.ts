import { addMonths, format, isValid, parseISO } from "date-fns";
import type {
  CategoryLearning,
  CategoryLearningStore,
  InvoiceLine,
  ParcelInfo,
  ProcessedInvoiceLine,
} from "@/types/ProcessedInvoice";

export const LEARNING_STORAGE_KEY = "bbsmoney_category_learning";

const PAYMENT_REGEX =
  /deb\s*autom|debito\s*automatico|d[eé]bito\s*autom[aá]tico|pagamento\s*(de\s*)?fatura|pag\s*fatura/i;

// Supports: "01/10", "1/10", "Parcela 1 de 10", "Parcelado 3/12", "px5/12", "1 de 10"
const PARCEL_REGEXES: RegExp[] = [
  /parcela\s*(\d{1,3})\s*(?:de|\/)\s*(\d{1,3})/i,
  /parcelado\s*(\d{1,3})\s*\/\s*(\d{1,3})/i,
  /\bp[xX]?\s*(\d{1,3})\s*\/\s*(\d{1,3})/i,
  /\b(\d{1,3})\s*de\s*(\d{1,3})\b/i,
  /(?:^|\s)(\d{1,3})\s*\/\s*(\d{1,3})(?!\d)/,
];

export function detectParcel(description: string): ParcelInfo | null {
  if (!description) return null;
  for (const re of PARCEL_REGEXES) {
    const m = description.match(re);
    if (!m) continue;
    const current = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    if (!Number.isFinite(current) || !Number.isFinite(total)) continue;
    if (current < 1 || total < 1 || current > total) continue;
    return { current, total };
  }
  return null;
}

export function calculateDueDate(originalDate: string, parcelIndex: number): string | null {
  try {
    const base = parseISO(originalDate);
    if (!isValid(base)) {
      console.error("[invoiceProcessor] invalid originalDate", { originalDate });
      return null;
    }
    if (!Number.isInteger(parcelIndex) || parcelIndex < 1) {
      console.error("[invoiceProcessor] invalid parcelIndex", { parcelIndex });
      return null;
    }
    const result = addMonths(base, parcelIndex - 1);
    if (!isValid(result)) return null;
    return format(result, "yyyy-MM-dd");
  } catch (err) {
    console.error("[invoiceProcessor] calculateDueDate error", err);
    return null;
  }
}

export function isFaturaPayment(description: string): boolean {
  if (!description) return false;
  return PAYMENT_REGEX.test(description.trim());
}

export function filterPayments(lines: InvoiceLine[]): {
  kept: InvoiceLine[];
  filtered: InvoiceLine[];
} {
  const kept: InvoiceLine[] = [];
  const filtered: InvoiceLine[] = [];
  for (const line of lines) {
    if (isFaturaPayment(line.description)) filtered.push(line);
    else kept.push(line);
  }
  return { kept, filtered };
}

function buildKey(p: {
  description: string;
  value: number;
  date: string;
  parcelIndex: number | null;
}): string {
  const desc = p.description.toLowerCase().trim();
  return `${desc}-${p.value}-${p.date}-${p.parcelIndex ?? "single"}`;
}

export function deduplicate(lines: ProcessedInvoiceLine[]): ProcessedInvoiceLine[] {
  const seen = new Map<string, ProcessedInvoiceLine>();
  const out: ProcessedInvoiceLine[] = [];
  for (const line of lines) {
    const key = buildKey({
      description: line.description,
      value: line.value,
      date: line.dueDate ?? line.originalDate,
      parcelIndex: line.isParcel?.current ?? null,
    });
    if (seen.has(key)) {
      out.push({ ...line, isDuplicate: true });
    } else {
      const fresh = { ...line, isDuplicate: false };
      seen.set(key, fresh);
      out.push(fresh);
    }
  }
  return out;
}

// ---------- Category learning (localStorage) ----------

function safeParseStore(raw: string | null): CategoryLearningStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as CategoryLearningStore;
    return {};
  } catch {
    return {};
  }
}

export function readLearningStore(): CategoryLearningStore {
  if (typeof window === "undefined") return {};
  try {
    return safeParseStore(window.localStorage.getItem(LEARNING_STORAGE_KEY));
  } catch (err) {
    console.error("[invoiceProcessor] readLearningStore error", err);
    return {};
  }
}

export function writeLearningStore(store: CategoryLearningStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error("[invoiceProcessor] writeLearningStore error", err);
  }
}

export function buildLearningKey(description: string, value: number): string {
  const desc = description.toLowerCase().trim().substring(0, 50);
  return `${desc}-${Math.round(value)}`;
}

export function suggestCategory(
  description: string,
  value: number,
  store?: CategoryLearningStore,
): string | null {
  const data = store ?? readLearningStore();
  const key = buildLearningKey(description, value);

  // 1. exact key match
  if (data[key]) return data[key].category;

  // 2. prefix / fuzzy match — keep the highest frequency
  const descPrefix = description.toLowerCase().trim().substring(0, 20);
  if (!descPrefix) return null;

  let best: CategoryLearning | null = null;
  for (const [k, entry] of Object.entries(data)) {
    if (k.startsWith(descPrefix) || descPrefix.startsWith(k.split("-")[0] ?? "")) {
      if (!best || entry.frequency > best.frequency) best = entry;
    }
  }
  return best?.category ?? null;
}

export function learnCategory(
  description: string,
  value: number,
  category: string,
): CategoryLearningStore {
  const store = readLearningStore();
  const key = buildLearningKey(description, value);
  const existing = store[key];
  const next: CategoryLearning = {
    category,
    frequency:
      existing && existing.category === category ? existing.frequency + 1 : (existing?.frequency ?? 0) + 1,
    lastUpdated: new Date().toISOString(),
  };
  store[key] = next;
  writeLearningStore(store);
  return store;
}

// ---------- Pipeline helpers ----------

export function expandParcels(lines: InvoiceLine[]): ProcessedInvoiceLine[] {
  const out: ProcessedInvoiceLine[] = [];
  for (const line of lines) {
    const parcel = detectParcel(line.description);
    if (!parcel) {
      out.push({
        id: line.id ? `${line.id}` : crypto.randomUUID(),
        originalId: line.id,
        description: line.description,
        value: line.value,
        originalDate: line.date,
        dueDate: line.date,
        isParcel: null,
        paymentType: "normal",
        isDuplicate: false,
        suggestedCategory: null,
        appliedCategory: null,
      });
      continue;
    }
    for (let i = parcel.current; i <= parcel.total; i++) {
      out.push({
        id: `${line.id ?? crypto.randomUUID()}-p${i}`,
        originalId: line.id,
        description: line.description,
        value: line.value,
        originalDate: line.date,
        dueDate: calculateDueDate(line.date, i - parcel.current + 1),
        isParcel: { current: i, total: parcel.total },
        paymentType: "normal",
        isDuplicate: false,
        suggestedCategory: null,
        appliedCategory: null,
      });
    }
  }
  return out;
}

export function applySuggestions(
  lines: ProcessedInvoiceLine[],
  store?: CategoryLearningStore,
): ProcessedInvoiceLine[] {
  const data = store ?? readLearningStore();
  return lines.map((l) => ({
    ...l,
    suggestedCategory: suggestCategory(l.description, l.value, data),
  }));
}