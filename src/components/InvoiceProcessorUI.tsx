import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Wand2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";
import { useInvoiceProcessing } from "@/hooks/useInvoiceProcessing";
import type { InvoiceLine, ProcessedInvoiceLine } from "@/types/ProcessedInvoice";

interface Props {
  invoiceLines: InvoiceLine[];
  onProcessed?: (processed: ProcessedInvoiceLine[]) => void;
}

export function InvoiceProcessorUI({ invoiceLines, onProcessed }: Props) {
  const { processed, filteredPayments, loading, error, process, applyCategory } =
    useInvoiceProcessing();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let active = true;
    supabase
      .from("categories")
      .select("id,name")
      .order("name")
      .then(({ data }) => {
        if (!active) return;
        setCategories(data ?? []);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleProcess = () => {
    if (invoiceLines.length === 0) {
      toast.error("Nenhuma linha para processar");
      return;
    }
    const result = process(invoiceLines);
    if (result.length > 0) {
      toast.success(`${result.length} linha(s) processada(s)`);
      onProcessed?.(result);
    }
  };

  const stats = useMemo(() => {
    const dups = processed.filter((p) => p.isDuplicate).length;
    const parcels = processed.filter((p) => p.isParcel).length;
    return { dups, parcels, filtered: filteredPayments.length, total: processed.length };
  }, [processed, filteredPayments]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-primary" /> Processar fatura
          </CardTitle>
          <Button onClick={handleProcess} disabled={loading || invoiceLines.length === 0} size="sm">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" /> Processar {invoiceLines.length} linha(s)
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {processed.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">Total: {stats.total}</Badge>
            <Badge variant="secondary">Parcelas: {stats.parcels}</Badge>
            <Badge variant="secondary">Duplicatas: {stats.dups}</Badge>
            <Badge variant="secondary">Pagamentos filtrados: {stats.filtered}</Badge>
          </div>
        )}

        {processed.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processed.map((line) => (
                  <TableRow key={line.id} className={line.isDuplicate ? "opacity-60" : ""}>
                    <TableCell className="max-w-[260px] truncate" title={line.description}>
                      {line.description}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(line.value)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {line.dueDate ? formatDate(line.dueDate) : "—"}
                    </TableCell>
                    <TableCell>
                      {line.isParcel ? (
                        <Badge variant="outline">
                          {line.isParcel.current}/{line.isParcel.total}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={line.appliedCategory ?? line.suggestedCategory ?? ""}
                        onValueChange={(v) => applyCategory(line.id, v)}
                      >
                        <SelectTrigger className="h-8 w-[160px]">
                          <SelectValue placeholder="Selecionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {line.isDuplicate && (
                          <Badge variant="destructive" className="text-[10px]">
                            Duplicata
                          </Badge>
                        )}
                        {line.appliedCategory && (
                          <Badge variant="default" className="text-[10px]">
                            Aplicada
                          </Badge>
                        )}
                        {!line.appliedCategory && line.suggestedCategory && (
                          <Badge variant="outline" className="text-[10px]">
                            Sugerida
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {filteredPayments.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-semibold">Pagamentos de fatura filtrados:</div>
            <ul className="list-inside list-disc space-y-0.5">
              {filteredPayments.map((p, i) => (
                <li key={i}>
                  {p.description} — {formatCurrency(p.value)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}