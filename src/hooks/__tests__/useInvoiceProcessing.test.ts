import { describe, it, expect, beforeEach } from "vitest";

// Minimal localStorage + window stub for non-DOM test environments
if (typeof globalThis.window === "undefined") {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage };
}
import {
  detectParcel,
  calculateDueDate,
  deduplicate,
  filterPayments,
  isFaturaPayment,
  suggestCategory,
  suggestCategoryDetailed,
  learnCategory,
  expandParcels,
  extractPurchaseDate,
  normalizeText,
  tokenize,
  LEARNING_STORAGE_KEY,
} from "@/services/invoiceProcessor";
import type { ProcessedInvoiceLine } from "@/types/ProcessedInvoice";

function mkProc(over: Partial<ProcessedInvoiceLine>): ProcessedInvoiceLine {
  return {
    id: "x",
    description: "Teste",
    value: 10,
    originalDate: "2026-01-10",
    purchaseDate: "2026-01-10",
    dueDate: "2026-01-10",
    isParcel: null,
    paymentType: "normal",
    isDuplicate: false,
    suggestedCategory: null,
    suggestionConfidence: null,
    appliedCategory: null,
    filterReason: null,
    ...over,
  };
}

describe("detectParcel", () => {
  it("detects '01/10' format", () => {
    expect(detectParcel("Compra 01/10")).toEqual({ current: 1, total: 10 });
  });
  it("detects 'Parcela 3 de 12'", () => {
    expect(detectParcel("Parcela 3 de 12 Magazine")).toEqual({ current: 3, total: 12 });
  });
  it("detects 'px5/12'", () => {
    expect(detectParcel("Loja px5/12")).toEqual({ current: 5, total: 12 });
  });
  it("detects parentheses '(1/10)'", () => {
    expect(detectParcel("TV LED (1/10)")).toEqual({ current: 1, total: 10 });
  });
  it("detects 'PARC 01/10'", () => {
    expect(detectParcel("Magazine PARC 01/10")).toEqual({ current: 1, total: 10 });
  });
  it("detects 'PCL 3/12'", () => {
    expect(detectParcel("Loja PCL 3/12")).toEqual({ current: 3, total: 12 });
  });
  it("rejects when current > total", () => {
    expect(detectParcel("Compra 11/10")).toBeNull();
  });
  it("returns null when no parcel info", () => {
    expect(detectParcel("Padaria do João")).toBeNull();
  });
});

describe("calculateDueDate", () => {
  it("returns original date for parcel 1", () => {
    expect(calculateDueDate("2026-01-15", 1)).toBe("2026-01-15");
  });
  it("adds N-1 months for parcel N", () => {
    expect(calculateDueDate("2026-01-15", 3)).toBe("2026-03-15");
  });
  it("returns null for invalid date", () => {
    expect(calculateDueDate("not-a-date", 1)).toBeNull();
  });
});

describe("extractPurchaseDate", () => {
  it("extracts dd/mm with inferred year from fallback", () => {
    expect(extractPurchaseDate("15/03 LOJA X", "2026-05-10")).toBe("2026-03-15");
  });
  it("extracts dd/mm/yyyy when present", () => {
    expect(extractPurchaseDate("15/03/2025 LOJA X", "2026-05-10")).toBe("2025-03-15");
  });
  it("retroages year when month is after fallback month", () => {
    // compra em dezembro, fatura em janeiro do ano seguinte
    expect(extractPurchaseDate("20/12 LOJA X", "2026-01-10")).toBe("2025-12-20");
  });
  it("falls back when no date in description", () => {
    expect(extractPurchaseDate("PADARIA", "2026-05-10")).toBe("2026-05-10");
  });
});

describe("filterPayments", () => {
  it("filters 'DEB AUTOM DE FATURA EM C/'", () => {
    const { kept, filtered } = filterPayments([
      { description: "DEB AUTOM DE FATURA EM C/", value: 100, date: "2026-01-01" },
      { description: "Padaria", value: 10, date: "2026-01-01" },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].filterReason).toBe("pagamento_detectado");
    expect(kept).toHaveLength(1);
  });
  it("filters negative values regardless of description", () => {
    const { kept, filtered } = filterPayments([
      { description: "Whatever", value: -50, date: "2026-01-01" },
      { description: "Padaria", value: 10, date: "2026-01-01" },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].filterReason).toBe("valor_negativo");
    expect(kept).toHaveLength(1);
  });
  it("filters PAGAMENTO RECEBIDO", () => {
    expect(isFaturaPayment("PAGAMENTO RECEBIDO")).toBe(true);
  });
  it("filters ESTORNO", () => {
    expect(isFaturaPayment("ESTORNO COMPRA")).toBe(true);
  });
  it("does not filter regular descriptions", () => {
    expect(isFaturaPayment("Restaurante")).toBe(false);
  });
});

describe("deduplicate", () => {
  it("marks exact duplicates", () => {
    const lines = [
      mkProc({ id: "a", description: "Padaria", value: 10, dueDate: "2026-01-10" }),
      mkProc({ id: "b", description: "Padaria", value: 10, dueDate: "2026-01-10" }),
    ];
    const out = deduplicate(lines);
    expect(out[0].isDuplicate).toBe(false);
    expect(out[1].isDuplicate).toBe(true);
  });
  it("treats different parcel indices as distinct", () => {
    const lines = [
      mkProc({ id: "a", isParcel: { current: 1, total: 10 }, dueDate: "2026-01-10" }),
      mkProc({ id: "b", isParcel: { current: 2, total: 10 }, dueDate: "2026-02-10" }),
    ];
    const out = deduplicate(lines);
    expect(out.every((l) => !l.isDuplicate)).toBe(true);
  });
  it("treats parcel 1/10 and 2/10 with same desc/value as distinct", () => {
    const lines = [
      mkProc({ id: "a", description: "MAGAZINE", value: 150, isParcel: { current: 1, total: 10 } }),
      mkProc({ id: "b", description: "MAGAZINE", value: 150, isParcel: { current: 2, total: 10 } }),
    ];
    const out = deduplicate(lines);
    expect(out[0].isDuplicate).toBe(false);
    expect(out[1].isDuplicate).toBe(false);
  });
});

describe("expandParcels", () => {
  it("expands a 3-parcel line into 3 entries with sequential dates from purchase date", () => {
    const out = expandParcels([
      { description: "TV Parcelado 1/3 15/01", value: 300, date: "2026-01-20" },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].dueDate).toBe("2026-01-15");
    expect(out[1].dueDate).toBe("2026-02-15");
    expect(out[2].dueDate).toBe("2026-03-15");
  });
  it("uses fatura date when no date in description", () => {
    const out = expandParcels([
      { description: "Loja 3/10", value: 100, date: "2026-05-10" },
    ]);
    // parcela 3 → offset 1 → mesma data de compra
    expect(out[0].isParcel).toEqual({ current: 3, total: 10 });
    expect(out[0].dueDate).toBe("2026-05-10");
    expect(out[1].dueDate).toBe("2026-06-10");
  });
  it("keeps single-line entries unchanged", () => {
    const out = expandParcels([
      { description: "Padaria", value: 10, date: "2026-01-10" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].isParcel).toBeNull();
  });
});

describe("normalizeText / tokenize", () => {
  it("removes accents and punctuation", () => {
    expect(normalizeText("Restauração - Açaí 123")).toBe("restauracao acai");
  });
  it("filters generic and short tokens", () => {
    const t = tokenize("LOJA IFOOD RESTAURANTE A LTDA");
    expect(t).toContain("ifood");
    expect(t).toContain("restaurante");
    expect(t).not.toContain("ltda");
    expect(t).not.toContain("loja");
  });
});

describe("category learning", () => {
  beforeEach(() => {
    window.localStorage.removeItem(LEARNING_STORAGE_KEY);
  });

  it("returns null when store empty", () => {
    expect(suggestCategory("Padaria", 10)).toBeNull();
  });
  it("learns and suggests by exact key with high confidence", () => {
    learnCategory("Padaria Central", 10, "Alimentação");
    const res = suggestCategoryDetailed("Padaria Central", 10, undefined);
    expect(res.category).toBe("Alimentação");
    expect(res.confidence).toBe("alta");
  });
  it("matches by token overlap (different establishment, same root)", () => {
    learnCategory("IFOOD RESTAURANTE A", 50, "Alimentação");
    const res = suggestCategoryDetailed("IFOOD RESTAURANTE B", 99);
    expect(res.category).toBe("Alimentação");
    expect(res.confidence).not.toBeNull();
  });
  it("increments frequency on repeat", () => {
    learnCategory("Padaria", 10, "Alimentação");
    learnCategory("Padaria", 10, "Alimentação");
    const raw = window.localStorage.getItem(LEARNING_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as Record<string, { frequency: number }>;
    const entry = Object.values(parsed)[0];
    expect(entry.frequency).toBeGreaterThanOrEqual(2);
  });
});
