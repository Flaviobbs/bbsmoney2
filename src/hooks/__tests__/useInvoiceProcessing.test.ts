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
  learnCategory,
  expandParcels,
  LEARNING_STORAGE_KEY,
} from "@/services/invoiceProcessor";
import type { ProcessedInvoiceLine } from "@/types/ProcessedInvoice";

function mkProc(over: Partial<ProcessedInvoiceLine>): ProcessedInvoiceLine {
  return {
    id: "x",
    description: "Teste",
    value: 10,
    originalDate: "2026-01-10",
    dueDate: "2026-01-10",
    isParcel: null,
    paymentType: "normal",
    isDuplicate: false,
    suggestedCategory: null,
    appliedCategory: null,
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
  it("returns null for invalid parcel index", () => {
    expect(calculateDueDate("2026-01-15", 0)).toBeNull();
  });
});

describe("filterPayments", () => {
  it("filters 'DEB AUTOM DE FATURA EM C/'", () => {
    const { kept, filtered } = filterPayments([
      { description: "DEB AUTOM DE FATURA EM C/", value: 100, date: "2026-01-01" },
      { description: "Padaria", value: 10, date: "2026-01-01" },
    ]);
    expect(filtered).toHaveLength(1);
    expect(kept).toHaveLength(1);
  });
  it("filters 'PAGAMENTO DE FATURA'", () => {
    expect(isFaturaPayment("PAGAMENTO DE FATURA")).toBe(true);
  });
  it("filters 'Débito Automático'", () => {
    expect(isFaturaPayment("Débito Automático Visa")).toBe(true);
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
      mkProc({ id: "a", isParcel: { current: 1, total: 3 } }),
      mkProc({ id: "b", isParcel: { current: 2, total: 3 }, dueDate: "2026-02-10" }),
    ];
    const out = deduplicate(lines);
    expect(out.every((l) => !l.isDuplicate)).toBe(true);
  });
  it("is case-insensitive on description", () => {
    const lines = [
      mkProc({ id: "a", description: "PADARIA" }),
      mkProc({ id: "b", description: "padaria" }),
    ];
    const out = deduplicate(lines);
    expect(out[1].isDuplicate).toBe(true);
  });
});

describe("expandParcels", () => {
  it("expands a 3-parcel line into 3 entries with sequential dates", () => {
    const out = expandParcels([
      { description: "TV Parcelado 1/3", value: 300, date: "2026-01-10" },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].dueDate).toBe("2026-01-10");
    expect(out[1].dueDate).toBe("2026-02-10");
    expect(out[2].dueDate).toBe("2026-03-10");
  });
  it("keeps single-line entries unchanged", () => {
    const out = expandParcels([
      { description: "Padaria", value: 10, date: "2026-01-10" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].isParcel).toBeNull();
  });
});

describe("category learning", () => {
  beforeEach(() => {
    window.localStorage.removeItem(LEARNING_STORAGE_KEY);
  });

  it("returns null when store empty", () => {
    expect(suggestCategory("Padaria", 10)).toBeNull();
  });
  it("learns and suggests by exact key", () => {
    learnCategory("Padaria", 10, "Alimentação");
    expect(suggestCategory("Padaria", 10)).toBe("Alimentação");
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
  it("matches by description prefix when exact key absent", () => {
    learnCategory("Restaurante Bom Sabor", 50, "Alimentação");
    expect(suggestCategory("Restaurante Bom Sabor Filial", 99)).toBe("Alimentação");
  });
});