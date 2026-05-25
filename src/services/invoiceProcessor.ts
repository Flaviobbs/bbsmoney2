import { addMonths, format, isValid, parseISO } from "date-fns";
import { suggestCategoryByKeyword } from "./merchantKeywords";
import type {
  CategoryLearning,
  CategoryLearningStore,
  FilteredInvoiceLine,
  InvoiceLine,
  ParcelInfo,
  ProcessedInvoiceLine,
  SuggestionConfidence,
} from "@/types/ProcessedInvoice";

export const LEARNING_STORAGE_KEY = "bbsmoney_category_learning";

// ---------- Filtros de pagamento / crédito ----------

const PAYMENT_PATTERNS: Array<{ regex: RegExp; reason: "pagamento_detectado" | "credito" | "estorno" }> = [
  { regex: /pagamento\s*recebido/i, reason: "pagamento_detectado" },
  { regex: /pagamento\s*efetuado/i, reason: "pagamento_detectado" },
  { regex: /pagamento\s*(de\s*)?fatura/i, reason: "pagamento_detectado" },
  { regex: /pag(to|amento)/i, reason: "pagamento_detectado" },
  { regex: /deb\s*autom|d[eé]bito\s*autom[aá]tico/i, reason: "pagamento_detectado" },
  { regex: /saldo\s*(anterior|atual|disponivel|dispon[ií]vel)/i, reason: "pagamento_detectado" },
  { regex: /\bajuste\b/i, reason: "pagamento_detectado" },
  { regex: /valor\s*recebido/i, reason: "credito" },
  { regex: /estorno/i, reason: "estorno" },
  { regex: /devolu[cç][aã]o/i, reason: "estorno" },
  { regex: /cancelamento\s*compra/i, reason: "estorno" },
  { regex: /\bcr[eé]dito\b(?!\s*card|\s*cart)/i, reason: "credito" }, // evita matar "cartão crédito"
  { regex: /cashback/i, reason: "credito" },
  { regex: /bonifica[cç][aã]o/i, reason: "credito" },
];

export function detectPaymentReason(description: string): "pagamento_detectado" | "credito" | "estorno" | null {
  if (!description) return null;
  for (const { regex, reason } of PAYMENT_PATTERNS) {
    if (regex.test(description)) return reason;
  }
  return null;
}

export function isFaturaPayment(description: string): boolean {
  return detectPaymentReason(description) !== null;
}

export function filterPayments(lines: InvoiceLine[]): {
  kept: InvoiceLine[];
  filtered: FilteredInvoiceLine[];
} {
  const kept: InvoiceLine[] = [];
  const filtered: FilteredInvoiceLine[] = [];
  for (const line of lines) {
    if (line.value < 0) {
      filtered.push({ ...line, filterReason: "valor_negativo" });
      continue;
    }
    const reason = detectPaymentReason(line.description);
    if (reason) {
      filtered.push({ ...line, filterReason: reason });
      continue;
    }
    kept.push(line);
  }
  return { kept, filtered };
}

// ---------- Detecção de parcelas ----------

const PARCEL_REGEXES: RegExp[] = [
  /parcela\s*(\d{1,3})\s*(?:de|\/)\s*(\d{1,3})/i,
  /parcelado\s*(?:em\s*)?(\d{1,3})\s*(?:\/|de|x)\s*(\d{1,3})/i,
  /\bparc\.?\s*(\d{1,3})\s*[\/.\-]\s*(\d{1,3})/i,
  /\bpcl\.?\s*(\d{1,3})\s*[\/.\-]\s*(\d{1,3})/i,
  /\bp[xX]?\.?\s*(\d{1,3})\s*\/\s*(\d{1,3})/i,
  /[\(\[\{]\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*[\)\]\}]/,
  /\b(\d{1,3})\s*[ºoa°ª]?\s*(?:de|of)\s*(\d{1,3})\b/i,
  /\b(\d{1,3})\s*-\s*(\d{1,3})\b/,
  
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
    // Evita capturar datas tipo dd/mm onde total < 13 e current > 12 (heurística leve)
    if (total <= 12 && current > 12) continue;
    return { current, total };
  }
  return null;
}

// ---------- Datas ----------

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

const DATE_DDMMYYYY = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;
const DATE_DDMM = /\b(\d{1,2})[\/\-.](\d{1,2})\b/g;

export function extractPurchaseDate(
  description: string,
  fallbackDate: string,
): string | null {
  if (!description) return fallbackDate || null;
  try {
    const fallback = parseISO(fallbackDate);
    if (!isValid(fallback)) return null;

    // 1) data completa dd/mm/yyyy
    for (const m of description.matchAll(DATE_DDMMYYYY)) {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      let year = parseInt(m[3], 10);
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && isValidDateParts(year, month, day)) {
        return format(new Date(year, month - 1, day), "yyyy-MM-dd");
      }
    }

    // 2) data parcial dd/mm — para evitar colisão com indicador de parcela ("1/3"),
    // só consideramos quando day > 12 OU month > 12 (inequívoco), e month ∈ [1..12]
    for (const m of description.matchAll(DATE_DDMM)) {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      if (month < 1 || month > 12) continue;
      if (day <= 12 && month <= 12) continue; // ambíguo com parcela — descartar
      if (day < 1 || day > 31) continue;
      let year = fallback.getFullYear();
      if (month > fallback.getMonth() + 1) year -= 1;
      if (isValidDateParts(year, month, day)) {
        return format(new Date(year, month - 1, day), "yyyy-MM-dd");
      }
    }

    return fallbackDate;
  } catch (err) {
    console.error("[invoiceProcessor] extractPurchaseDate error", err);
    return fallbackDate;
  }
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return (
    isValid(d) &&
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

// ---------- Deduplicação ----------

function buildKey(p: {
  description: string;
  value: number;
  date: string;
  parcelCurrent: number | null;
  parcelTotal: number | null;
}): string {
  const desc = p.description.toLowerCase().trim();
  return `${desc}|${p.value}|${p.date}|${p.parcelCurrent ?? "x"}/${p.parcelTotal ?? "x"}`;
}

export function deduplicate(lines: ProcessedInvoiceLine[]): ProcessedInvoiceLine[] {
  const seen = new Set<string>();
  const out: ProcessedInvoiceLine[] = [];
  for (const line of lines) {
    const key = buildKey({
      description: line.description,
      value: line.value,
      date: line.dueDate ?? line.purchaseDate ?? line.originalDate,
      parcelCurrent: line.isParcel?.current ?? null,
      parcelTotal: line.isParcel?.total ?? null,
    });
    if (seen.has(key)) {
      out.push({ ...line, isDuplicate: true });
    } else {
      seen.add(key);
      out.push({ ...line, isDuplicate: false });
    }
  }
  return out;
}

// ---------- Aprendizado de categoria ----------

const GENERIC_TOKENS = new Set([
  "ltda", "me", "mei", "sa", "s/a", "br", "com", "pag", "mp", "pagamento",
  "compra", "loja", "online", "internet", "card", "cartao", "cartão",
]);

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length > 2 && !GENERIC_TOKENS.has(t));
}

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
  const norm = normalizeText(description).substring(0, 50);
  return `${norm}-${Math.round(value)}`;
}

export interface SuggestionResult {
  category: string | null;
  confidence: SuggestionConfidence;
  score: number;
}

const SCORE_THRESHOLD = 0.4;

export function suggestCategoryDetailed(
  description: string,
  value: number,
  store?: CategoryLearningStore,
): SuggestionResult {
  const data = store ?? readLearningStore();
  const exactKey = buildLearningKey(description, value);

  // 1) match exato no aprendizado → alta confiança
  if (data[exactKey]) {
    return { category: data[exactKey].category, confidence: "alta", score: 1 };
  }

  const queryTokens = tokenize(description);
  const querySet = new Set(queryTokens);

  // 2) match por token nas regras aprendidas
  let best: { entry: CategoryLearning; score: number } | null = null;
  if (queryTokens.length > 0) {
    for (const entry of Object.values(data)) {
      const learnedTokens = entry.tokens && entry.tokens.length > 0 ? entry.tokens : [];
      if (learnedTokens.length === 0) continue;
      const learnedSet = new Set(learnedTokens);
      let intersection = 0;
      for (const t of learnedSet) if (querySet.has(t)) intersection++;
      const unionSize = new Set([...querySet, ...learnedSet]).size;
      if (unionSize === 0) continue;
      const jaccard = intersection / unionSize;
      const rootMatch =
        learnedTokens[0] && queryTokens[0] && learnedTokens[0] === queryTokens[0] ? 0.15 : 0;
      const combined = (jaccard + rootMatch) * Math.log2(1 + entry.frequency);
      if (!best || combined > best.score) {
        best = { entry, score: combined };
      }
    }
  }

  if (best && best.score >= SCORE_THRESHOLD) {
    const confidence: SuggestionConfidence = best.score >= 1 ? "alta" : best.score >= 0.7 ? "media" : "baixa";
    return { category: best.entry.category, confidence, score: best.score };
  }

  // 3) fallback: catálogo de keywords de comerciantes conhecidos
  const keywordCategory = suggestCategoryByKeyword(description);
  if (keywordCategory) {
    return { category: keywordCategory, confidence: "media", score: 0.6 };
  }

  return { category: null, confidence: null, score: best?.score ?? 0 };
}

export function suggestCategory(
  description: string,
  value: number,
  store?: CategoryLearningStore,
): string | null {
  return suggestCategoryDetailed(description, value, store).category;
}

export function learnCategory(
  description: string,
  value: number,
  category: string,
): CategoryLearningStore {
  const store = readLearningStore();
  const key = buildLearningKey(description, value);
  const existing = store[key];
  const tokens = tokenize(description);
  const next: CategoryLearning = {
    category,
    frequency:
      existing && existing.category === category
        ? existing.frequency + 1
        : (existing?.frequency ?? 0) + 1,
    lastUpdated: new Date().toISOString(),
    tokens,
  };
  store[key] = next;
  writeLearningStore(store);
  return store;
}

// ---------- Pipeline ----------

function newProcessedLine(
  line: InvoiceLine,
  overrides: Partial<ProcessedInvoiceLine>,
): ProcessedInvoiceLine {
  const purchaseDate = extractPurchaseDate(line.description, line.date);
  return {
    id: line.id ? `${line.id}` : crypto.randomUUID(),
    originalId: line.id,
    description: line.description,
    value: line.value,
    originalDate: line.date,
    purchaseDate,
    dueDate: purchaseDate ?? line.date,
    isParcel: null,
    paymentType: "normal",
    isDuplicate: false,
    suggestedCategory: null,
    suggestionConfidence: null,
    appliedCategory: null,
    filterReason: null,
    ...overrides,
  };
}

export function expandParcels(lines: InvoiceLine[]): ProcessedInvoiceLine[] {
  const out: ProcessedInvoiceLine[] = [];
  for (const line of lines) {
    const parcel = detectParcel(line.description);
    if (!parcel) {
      out.push(newProcessedLine(line, {}));
      continue;
    }
    const purchaseDate = extractPurchaseDate(line.description, line.date);
    const base = purchaseDate ?? line.date;
    for (let i = parcel.current; i <= parcel.total; i++) {
      const offset = i - parcel.current + 1;
      out.push(
        newProcessedLine(line, {
          id: `${line.id ?? crypto.randomUUID()}-p${i}`,
          purchaseDate,
          dueDate: calculateDueDate(base, offset),
          isParcel: { current: i, total: parcel.total },
        }),
      );
    }
  }
  return out;
}

export function applySuggestions(
  lines: ProcessedInvoiceLine[],
  store?: CategoryLearningStore,
): ProcessedInvoiceLine[] {
  const data = store ?? readLearningStore();
  return lines.map((l) => {
    const res = suggestCategoryDetailed(l.description, l.value, data);
    return { ...l, suggestedCategory: res.category, suggestionConfidence: res.confidence };
  });
}
