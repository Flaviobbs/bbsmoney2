import { z } from "zod";

export interface InvoiceLine {
  id?: string;
  description: string;
  value: number;
  date: string; // ISO yyyy-MM-dd
}

export interface ParcelInfo {
  current: number;
  total: number;
}

export type PaymentType = "fatura" | "normal";

export interface ProcessedInvoiceLine {
  id: string;
  originalId?: string;
  description: string;
  value: number;
  originalDate: string;
  dueDate: string | null;
  isParcel: ParcelInfo | null;
  paymentType: PaymentType;
  isDuplicate: boolean;
  suggestedCategory: string | null;
  appliedCategory: string | null;
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
}

export type CategoryLearningStore = Record<string, CategoryLearning>;

export const invoiceLineSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1).max(500),
  value: z.number().finite(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be ISO yyyy-MM-dd"),
});

export const invoiceLinesSchema = z.array(invoiceLineSchema);

export const processedInvoiceLineSchema: z.ZodType<ProcessedInvoiceLine> = z.object({
  id: z.string(),
  originalId: z.string().optional(),
  description: z.string(),
  value: z.number(),
  originalDate: z.string(),
  dueDate: z.string().nullable(),
  isParcel: z
    .object({ current: z.number().int().min(1), total: z.number().int().min(1) })
    .nullable(),
  paymentType: z.enum(["fatura", "normal"]),
  isDuplicate: z.boolean(),
  suggestedCategory: z.string().nullable(),
  appliedCategory: z.string().nullable(),
});