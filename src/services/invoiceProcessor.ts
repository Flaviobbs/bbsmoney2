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

// Padrões que indicam parcelamento mesmo sem "parcela atual/total" completos.
// Ex.: "em 10x", "10 vezes", "3x sem juros", "parcelado", "PARC.".
const INSTALLMENT_HINT_REGEXES: RegExp[] = [
  /\bem\s*(\d{1,3})\s*x\b/i,
  /\b(\d{1,3})\s*x\s*(?:sem\s*juros|s\.?\s*juros|de\s*r?\$)/i,
  /\b(\d{1,3})\s*vezes\b/i,
  /\bparcelad[oa]s?\b/i,
  /\bparc\.?\b(?!\s*\d)/i,
  /\bpcl\.?\b(?!\s*\d)/i,
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

/**
 * Retorna true se a descrição contém indicativo de parcelamento, mesmo sem
 * parcela atual/total explícita (ex.: "em 10x", "3 vezes", "parcelado").
 */
export function hasInstallmentHint(description: string): boolean {
  if (!description) return false;
  if (detectParcel(description)) return true;
  return INSTALLMENT_HINT_REGEXES.some((re) => re.test(description));
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
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const isPastOrToday = (y: number, m: number, d: number) => {
      const dt = new Date(y, m - 1, d);
      return dt.getTime() <= today.getTime();
    };

    // 1) data completa dd/mm/yyyy
    for (const m of description.matchAll(DATE_DDMMYYYY)) {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      let year = parseInt(m[3], 10);
      if (year < 100) year += 2000;
      if (
        month >= 1 && month <= 12 &&
        isValidDateParts(year, month, day) &&
        isPastOrToday(year, month, day)
      ) {
        return format(new Date(year, month - 1, day), "yyyy-MM-dd");
      }
    }

    // 2) data parcial dd/mm — evita colisão com indicador de parcela ("1/3")
    for (const m of description.matchAll(DATE_DDMM)) {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      if (month < 1 || month > 12) continue;
      if (day <= 12 && month <= 12) continue;
      if (day < 1 || day > 31) continue;
      let year = fallback.getFullYear();
      if (month > fallback.getMonth() + 1) year -= 1;
      if (!isValidDateParts(year, month, day)) continue;
      // se cair no futuro, recua 1 ano
      if (!isPastOrToday(year, month, day)) year -= 1;
      if (isValidDateParts(year, month, day) && isPastOrToday(year, month, day)) {
        return format(new Date(year, month - 1, day), "yyyy-MM-dd");
      }
    }

    // fallback nunca pode estar no futuro
    if (fallback.getTime() > today.getTime()) {
      return format(today, "yyyy-MM-dd");
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

// Padrões que poluem o "nome" do comerciante e devem ser removidos antes de gerar a assinatura.
const NOISE_PATTERNS: RegExp[] = [
  /parcela\s*\d{1,3}\s*(?:de|\/)\s*\d{1,3}/gi,
  /parc\.?\s*\d{1,3}\s*[\/.\-]\s*\d{1,3}/gi,
  /pcl\.?\s*\d{1,3}\s*[\/.\-]\s*\d{1,3}/gi,
  /\bp[xX]?\.?\s*\d{1,3}\s*\/\s*\d{1,3}\b/gi,
  /[\(\[\{]\s*\d{1,3}\s*\/\s*\d{1,3}\s*[\)\]\}]/g,
  /\b\d{1,3}\s*\/\s*\d{1,3}\b/g,
  /\b\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\b/g, // datas
  /\br\$\s*\d[\d.,]*/gi,
];

/**
 * Assinatura estável de um comerciante: remove parcelas, datas, valores e
 * tokens genéricos. Usada como chave secundária de aprendizado para que a
 * mesma loja seja reconhecida em compras futuras com valor/parcela diferentes.
 */
export function merchantSignature(description: string): string {
  if (!description) return "";
  let s = description;
  for (const re of NOISE_PATTERNS) s = s.replace(re, " ");
  return tokenize(s).slice(0, 4).join(" ");
}

export interface SuggestionResult {
  category: string | null;
  confidence: SuggestionConfidence;
  source: "aprendizado" | "keyword" | null;
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
    return { category: data[exactKey].category, confidence: "alta", source: "aprendizado", score: 1 };
  }

  // 2) match por assinatura de comerciante (ignora valor/parcela)
  const sig = merchantSignature(description);
  if (sig) {
    const sigMatches: CategoryLearning[] = [];
    for (const entry of Object.values(data)) {
      if (entry.signature && entry.signature === sig) sigMatches.push(entry);
    }
    if (sigMatches.length > 0) {
      // pega a categoria com maior frequência somada
      const totals: Record<string, number> = {};
      for (const e of sigMatches) totals[e.category] = (totals[e.category] ?? 0) + e.frequency;
      const [bestCat] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
      return { category: bestCat, confidence: "alta", source: "aprendizado", score: 0.95 };
    }
  }

  const queryTokens = tokenize(description);
  const querySet = new Set(queryTokens);

  // 3) match por token nas regras aprendidas (jaccard puro, sem penalizar entradas novas)
  let best: { entry: CategoryLearning; score: number } | null = null;
  if (queryTokens.length > 0) {
    for (const entry of Object.values(data)) {
      const learnedTokens = entry.tokens && entry.tokens.length > 0 ? entry.tokens : [];
      if (learnedTokens.length === 0) continue;
      const learnedSet = new Set(learnedTokens);
      let intersection = 0;
      for (const t of learnedSet) if (querySet.has(t)) intersection++;
      if (intersection === 0) continue;
      const unionSize = new Set([...querySet, ...learnedSet]).size;
      if (unionSize === 0) continue;
      const jaccard = intersection / unionSize;
      const rootMatch =
        learnedTokens[0] && queryTokens[0] && learnedTokens[0] === queryTokens[0] ? 0.15 : 0;
      const freqBoost = Math.min(0.2, entry.frequency * 0.05);
      const combined = jaccard + rootMatch + freqBoost;
      if (!best || combined > best.score) {
        best = { entry, score: combined };
      }
    }
  }

  if (best && best.score >= SCORE_THRESHOLD) {
    const confidence: SuggestionConfidence = best.score >= 0.9 ? "alta" : best.score >= 0.6 ? "media" : "baixa";
    return { category: best.entry.category, confidence, source: "aprendizado", score: best.score };
  }

  // 4) fallback: catálogo de keywords de comerciantes conhecidos
  const keywordCategory = suggestCategoryByKeyword(description);
  if (keywordCategory) {
    return { category: keywordCategory, confidence: "media", source: "keyword", score: 0.6 };
  }

  return { category: null, confidence: null, source: null, score: best?.score ?? 0 };
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
  const signature = merchantSignature(description);
  const next: CategoryLearning = {
    category,
    frequency:
      existing && existing.category === category
        ? existing.frequency + 1
        : (existing?.frequency ?? 0) + 1,
    lastUpdated: new Date().toISOString(),
    tokens,
    signature: signature || undefined,
  };
  store[key] = next;

  // Reforça/atualiza todas as entradas existentes com a mesma assinatura para
  // refletir a categoria mais recente escolhida manualmente pelo usuário.
  if (signature) {
    for (const [k, entry] of Object.entries(store)) {
      if (k === key) continue;
      if (entry.signature === signature && entry.category !== category) {
        store[k] = {
          ...entry,
          category,
          lastUpdated: new Date().toISOString(),
        };
      }
    }
  }

  writeLearningStore(store);
  return store;
}

/**
 * Popula o aprendizado local com base no histórico real do usuário (transações
 * já cadastradas com categoria). Permite que o motor reconheça categorias
 * previamente definidas mesmo que o usuário nunca tenha aprovado sugestões via
 * fluxo de PDF. Idempotente: re-executar apenas reforça as frequências.
 */
export function seedLearningFromHistory(
  txs: Array<{ description: string; amount: number; category: string }>,
): CategoryLearningStore {
  if (typeof window === "undefined") return readLearningStore();
  const store = readLearningStore();
  // Conta votos por (assinatura + categoria) e por (chave exata + categoria)
  // para que a categoria vencedora seja a mais usada, não a última vista.
  const sigVotes = new Map<string, Map<string, number>>(); // signature -> cat -> votes
  const keyVotes = new Map<string, Map<string, number>>(); // exactKey -> cat -> votes
  const meta = new Map<string, { tokens: string[]; signature: string }>();
  for (const t of txs) {
    if (!t.category || !t.description) continue;
    const key = buildLearningKey(t.description, Number(t.amount));
    const tokens = tokenize(t.description);
    const signature = merchantSignature(t.description);
    meta.set(key, { tokens, signature });
    const kv = keyVotes.get(key) ?? new Map();
    kv.set(t.category, (kv.get(t.category) ?? 0) + 1);
    keyVotes.set(key, kv);
    if (signature) {
      const sv = sigVotes.get(signature) ?? new Map();
      sv.set(t.category, (sv.get(t.category) ?? 0) + 1);
      sigVotes.set(signature, sv);
    }
  }
  for (const [key, votes] of keyVotes) {
    const [bestCat, freq] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    const m = meta.get(key)!;
    const existing = store[key];
    // histórico real tem prioridade sobre aprendizado antigo divergente
    if (!existing || existing.category !== bestCat || (existing.frequency ?? 0) < freq) {
      store[key] = {
        category: bestCat,
        frequency: freq,
        lastUpdated: new Date().toISOString(),
        tokens: m.tokens,
        signature: m.signature || undefined,
      };
    }
  }
  // Reforça assinaturas: para qualquer entrada cuja signature tenha vencedor claro
  // no histórico, alinha a categoria ao vencedor.
  for (const [sig, votes] of sigVotes) {
    const [bestCat] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    for (const [k, entry] of Object.entries(store)) {
      if (entry.signature === sig && entry.category !== bestCat) {
        store[k] = { ...entry, category: bestCat, lastUpdated: new Date().toISOString() };
      }
    }
  }
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
    suggestionSource: null,
    appliedCategory: null,
    filterReason: null,
    ...overrides,
  };
}

/**
 * Para parcelados em fatura, geramos APENAS a parcela do mês atual de pagamento.
 * Não criamos lançamentos futuros — eles aparecerão em faturas futuras.
 * A data do lançamento é a data da fatura (mês de pagamento), não a data da compra original.
 */
export function expandParcels(lines: InvoiceLine[]): ProcessedInvoiceLine[] {
  const out: ProcessedInvoiceLine[] = [];
  for (const line of lines) {
    const parcel = detectParcel(line.description);
    if (!parcel) {
      out.push(newProcessedLine(line, {}));
      continue;
    }
    const purchaseDate = extractPurchaseDate(line.description, line.date);
    out.push(
      newProcessedLine(line, {
        id: `${line.id ?? crypto.randomUUID()}-p${parcel.current}`,
        purchaseDate,
        // mês de pagamento da parcela = data da fatura
        dueDate: line.date,
        isParcel: { current: parcel.current, total: parcel.total },
      }),
    );
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
    return {
      ...l,
      suggestedCategory: res.category,
      suggestionConfidence: res.confidence,
      suggestionSource: res.source,
    };
});
}

// ---------- Cartão e tipo de compra ----------

/**
 * Deriva o tipo da compra a partir de indicadores de parcelamento.
 * - Se `parcela_total > 1` ou `parcela_atual >= 1` → "installment".
 * - Se a descrição casa com `detectParcel` → "installment".
 * - Caso contrário → "cash".
 */
export function derivePurchaseType(input: {
  description?: string;
  parcela_atual?: number | null;
  parcela_total?: number | null;
}): "cash" | "installment" {
  const pa = Number(input.parcela_atual ?? 0);
  const pt = Number(input.parcela_total ?? 0);
  if ((pt && pt > 1) || (pa && pa >= 1 && pt && pt >= 1 && pa <= pt)) {
    return "installment";
  }
  if (input.description && hasInstallmentHint(input.description)) {
    return "installment";
  }
  return "cash";
}

/**
 * Extrai um "final de cartão" (últimos 4 dígitos) de uma linha da fatura.
 * - Aceita "**** 4437", "XXXX 4437", "4258 XXXX XXXX 4437".
 * - Retorna null se não encontrar.
 */
export function extractCardLast4(text: string): string | null {
  if (!text) return null;
  const patterns: RegExp[] = [
    /\b\d{4}\s?[\dxX*]{4}\s?[\dxX*]{4}\s?(\d{4})\b/,
    /(?:\*{2,}|[xX]{2,})\s?(\d{4})\b/,
    /final\s*(?:do\s*)?cart(?:[aã]o)?\s*[:\-]?\s*(\d{4})/i,
    /cart(?:[aã]o)\s*(?:final|term\.?)\s*[:\-]?\s*(\d{4})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

/**
 * Marcadores textuais para compras online quando não há final de cartão físico.
 */
const ONLINE_HINTS = /\b(online|internet|e-?commerce|virtual|digital|iof|paypal)\b/i;

export function normalizeCardLast4(
  raw: string | null | undefined,
  description?: string,
): string | null {
  const val = (raw ?? "").toString().trim();
  if (val.startsWith("@")) return val.slice(0, 24);
  if (/^\d{4}$/.test(val)) return val;
  if (val && val.length <= 8) return val;
  if (description && ONLINE_HINTS.test(description)) return "@online";
  return null;
}

