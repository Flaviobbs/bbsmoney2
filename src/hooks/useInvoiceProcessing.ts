import { useCallback, useMemo, useState } from "react";
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
  type FilteredInvoiceLine,
  type InvoiceLine,
  type ProcessedInvoiceLine,
  type ProcessingSummary,
} from "@/types/ProcessedInvoice";

interface UseInvoiceProcessingResult {
  processed: ProcessedInvoiceLine[];
  filteredPayments: FilteredInvoiceLine[];
  loading: boolean;
  error: string | null;
  corrections: Correction[];
  summary: ProcessingSummary;
  process: (lines: InvoiceLine[]) => ProcessedInvoiceLine[];
  applyCategory: (lineId: string, category: string) => void;
  restoreFiltered: (index: number) => void;
  reset: () => void;
}

export function useInvoiceProcessing(): UseInvoiceProcessingResult {
  const [processed, setProcessed] = useState<ProcessedInvoiceLine[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<FilteredInvoiceLine[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [totalInput, setTotalInput] = useState<number>(0);

  const runPipeline = useCallback(
    (kept: InvoiceLine[]): ProcessedInvoiceLine[] => {
      const expanded = expandParcels(kept);
      const deduped = deduplicate(expanded);
      return applySuggestions(deduped);
    },
    [],
  );

  const process = useCallback(
    (lines: InvoiceLine[]): ProcessedInvoiceLine[] => {
      setLoading(true);
      setError(null);
      try {
        const parsed = invoiceLinesSchema.parse(lines);
        setTotalInput(parsed.length);
        const { kept, filtered } = filterPayments(parsed);
        const result = runPipeline(kept);
        setProcessed(result);
        setFilteredPayments(filtered);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao processar fatura";
        setError(msg);
        console.error("[useInvoiceProcessing] process error", err);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [runPipeline],
  );

  const applyCategory = useCallback((lineId: string, category: string) => {
    setProcessed((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const previous = l.appliedCategory;
        try {
          learnCategory(l.description, l.value, category);
        } catch (err) {
          console.error("[useInvoiceProcessing] learnCategory error", err);
        }
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
      }),
    );
  }, []);

  const restoreFiltered = useCallback(
    (index: number) => {
      setFilteredPayments((prev) => {
        const item = prev[index];
        if (!item) return prev;
        const next = prev.filter((_, i) => i !== index);
        // promove a linha de volta ao pipeline
        const restored: InvoiceLine = {
          id: item.id,
          description: item.description,
          value: Math.abs(item.value),
          date: item.date,
        };
        try {
          setProcessed((cur) => {
            const combined = [...cur, ...runPipeline([restored])];
            return deduplicate(combined);
          });
        } catch (err) {
          console.error("[useInvoiceProcessing] restoreFiltered error", err);
        }
        return next;
      });
    },
    [runPipeline],
  );

  const reset = useCallback(() => {
    setProcessed([]);
    setFilteredPayments([]);
    setError(null);
    setCorrections([]);
    setTotalInput(0);
  }, []);

  const summary = useMemo<ProcessingSummary>(() => {
    const duplicates = processed.filter((p) => p.isDuplicate).length;
    const parcelsExpanded = processed.filter((p) => p.isParcel).length;
    return {
      totalInput,
      imported: processed.length - duplicates,
      filtered: filteredPayments.length,
      duplicates,
      parcelsExpanded,
    };
  }, [processed, filteredPayments, totalInput]);

  return {
    processed,
    filteredPayments,
    loading,
    error,
    corrections,
    summary,
    process,
    applyCategory,
    restoreFiltered,
    reset,
  };
}
