import { z } from "zod";

export interface InvoiceLine {
  id?: string;
  description: string;
  value: number;
  date: string; // ISO yyyy-MM-dd — data de lançamento na fatura
}

export interface ParcelInfo {
  current: number;
  total: number;
}

export type PaymentType = "fatura" | "normal";

export type FilterReason =
  | "valor_negativo"
  | "pagamento_detectado"
  | "credito"
  | "estorno"
  | null;

export interface FilteredInvoiceLine extends InvoiceLine {
  filterReason: Exclude<FilterReason, null>;
}

export type SuggestionConfidence = "alta" | "media" | "baixa" | null;

export type SuggestionSource = "aprendizado" | "keyword" | null;

export interface ProcessedInvoiceLine {
  id: string;
  originalId?: string;
  description: string;
  value: number;
  originalDate: string; // data de lançamento na fatura (compatibilidade)
  purchaseDate: string | null; // data real da compra extraída da descrição
  dueDate: string | null; // purchaseDate + (parcela - 1) meses
  isParcel: ParcelInfo | null;
  paymentType: PaymentType;
  isDuplicate: boolean;
  suggestedCategory: string | null;
  suggestionConfidence: SuggestionConfidence;
  suggestionSource: SuggestionSource;
  appliedCategory: string | null;
  filterReason: FilterReason;
}

export interface ProcessingSummary {
  totalInput: number;
  imported: number;
  filtered: number;
  duplicates: number;
  parcelsExpanded: number;
}

export interface Correction {
  lineId: string;
  previousCategory: string | null;
  newCategory: string;
  timestamp: string;
}

export interface CategoryLearning {
  category: string;
  frequency: number;
  lastUpdated: string;
  tokens?: string[]; // tokens normalizados da descrição
  signature?: string; // assinatura do comerciante (sem parcela/data/valor)
}

export type CategoryLearningStore = Record<string, CategoryLearning>;

export const invoiceLineSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1).max(500),
  value: z.number().finite(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be ISO yyyy-MM-dd"),
});

export const invoiceLinesSchema = z.array(invoiceLineSchema);
