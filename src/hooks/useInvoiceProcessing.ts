import { useCallback, useState } from "react";
import {
  applySuggestions,
  deduplicate,
  expandParcels,
  filterPayments,
  learnCategory,
} from "@/services/invoiceProcessor";
import {
  invoiceLinesSchema,
  type Correction,
  type InvoiceLine,
  type ProcessedInvoiceLine,
} from "@/types/ProcessedInvoice";

interface UseInvoiceProcessingResult {
  processed: ProcessedInvoiceLine[];
  filteredPayments: InvoiceLine[];
  loading: boolean;
  error: string | null;
  corrections: Correction[];
  process: (lines: InvoiceLine[]) => ProcessedInvoiceLine[];
  applyCategory: (lineId: string, category: string) => void;
  reset: () => void;
}

export function useInvoiceProcessing(): UseInvoiceProcessingResult {
  const [processed, setProcessed] = useState<ProcessedInvoiceLine[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<InvoiceLine[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);

  const process = useCallback((lines: InvoiceLine[]): ProcessedInvoiceLine[] => {
    setLoading(true);
    setError(null);
    try {
      const parsed = invoiceLinesSchema.parse(lines);
      const { kept, filtered } = filterPayments(parsed);
      const expanded = expandParcels(kept);
      const deduped = deduplicate(expanded);
      const withSuggestions = applySuggestions(deduped);
      setProcessed(withSuggestions);
      setFilteredPayments(filtered);
      return withSuggestions;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao processar fatura";
      setError(msg);
      console.error("[useInvoiceProcessing] process error", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const applyCategory = useCallback((lineId: string, category: string) => {
    setProcessed((prev) => {
      const next = prev.map((l) => {
        if (l.id !== lineId) return l;
        const previous = l.appliedCategory;
        learnCategory(l.description, l.value, category);
        setCorrections((cs) => [
          ...cs,
          {
            lineId,
            previousCategory: previous,
            newCategory: category,
            timestamp: new Date().toISOString(),
          },
        ]);
        return { ...l, appliedCategory: category, suggestedCategory: category };
      });
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setProcessed([]);
    setFilteredPayments([]);
    setError(null);
    setCorrections([]);
  }, []);

  return { processed, filteredPayments, loading, error, corrections, process, applyCategory, reset };
}