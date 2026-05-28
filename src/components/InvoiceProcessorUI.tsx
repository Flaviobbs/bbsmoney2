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
import { Loader2, Wand2, AlertCircle, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";
import { useInvoiceProcessing } from "@/hooks/useInvoiceProcessing";
import type {
  FilterReason,
  InvoiceLine,
  ProcessedInvoiceLine,
} from "@/types/ProcessedInvoice";

interface Props {
  invoiceLines: InvoiceLine[];
  onProcessed?: (processed: ProcessedInvoiceLine[]) => void;
}

const FILTER_REASON_LABEL: Record<Exclude<FilterReason, null>, string> = {
  valor_negativo: "Valor negativo",
  pagamento_detectado: "Pagamento",
  credito: "Crédito",
  estorno: "Estorno",
};

const SOURCE_LABEL: Record<"aprendizado" | "keyword", { label: string; title: string }> = {
  aprendizado: { label: "Aprendizado", title: "Categoria sugerida pelo histórico do usuário" },
  keyword: { label: "Catálogo", title: "Categoria sugerida pelo catálogo de comerciantes" },
};

export function InvoiceProcessorUI({ invoiceLines, onProcessed }: Props) {
  const {
    processed,
    filteredPayments,
    loading,
    error,
    summary,
    process,
    applyCategory,
    restoreFiltered,
  } = useInvoiceProcessing();
  const [categories, setCategories] = useState<
    { id: string; name: string; parent_id: string | null; displayName: string }[]
  >([]);
  const [showFiltered, setShowFiltered] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("categories")
      .select("id,name,parent_id")
      .order("name")
      .then(({ data }) => {
        if (!active) return;
        const raw = (data ?? []) as { id: string; name: string; parent_id: string | null }[];
        // Ordena: pais primeiro, filhos logo abaixo, com indentação
        const parents = raw.filter((c) => !c.parent_id);
        const ordered: { id: string; name: string; parent_id: string | null; displayName: string }[] = [];
        for (const p of parents) {
          ordered.push({ ...p, displayName: p.name });
          for (const child of raw.filter((c) => c.parent_id === p.id)) {
            ordered.push({ ...child, displayName: `↳ ${child.name}` });
          }
        }
        // órfãos
        for (const c of raw) {
          if (!ordered.find((o) => o.id === c.id)) {
            ordered.push({ ...c, displayName: c.name });
          }
        }
        setCategories(ordered);
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

  const confidenceVariant = useMemo(
    () => ({
      alta: "default" as const,
      media: "secondary" as const,
      baixa: "outline" as const,
    }),
    [],
  );

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

        {(processed.length > 0 || filteredPayments.length > 0) && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">Total no PDF: {summary.totalInput}</Badge>
            <Badge variant="default">Importadas: {summary.imported}</Badge>
            <Badge variant="outline">Parcelas: {summary.parcelsExpanded}</Badge>
            <Badge variant="destructive">Duplicatas: {summary.duplicates}</Badge>
            <Badge variant="secondary">Filtradas: {summary.filtered}</Badge>
          </div>
        )}

        {processed.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Compra</TableHead>
                  <TableHead>Vencimento</TableHead>
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
                      {line.purchaseDate ? formatDate(line.purchaseDate) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {line.dueDate ? formatDate(line.dueDate) : "—"}
                    </TableCell>
                    <TableCell>
                      {line.isParcel ? (
                        <Badge variant="outline">
                          Parcela {line.isParcel.current}/{line.isParcel.total}
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
                              {c.displayName}
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
                        {!line.appliedCategory && line.suggestedCategory && line.suggestionConfidence && (
                          <Badge
                            variant={confidenceVariant[line.suggestionConfidence]}
                            className="text-[10px]"
                          >
                            Sugestão ({line.suggestionConfidence})
                          </Badge>
                        )}
                        {!line.appliedCategory && line.suggestionSource && (
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                            title={SOURCE_LABEL[line.suggestionSource].title}
                          >
                            {SOURCE_LABEL[line.suggestionSource].label}
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
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <button
              type="button"
              onClick={() => setShowFiltered((v) => !v)}
              className="flex w-full items-center justify-between font-semibold text-muted-foreground hover:text-foreground"
            >
              <span>{filteredPayments.length} linha(s) ignorada(s) (pagamentos/créditos)</span>
              {showFiltered ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showFiltered && (
              <ul className="mt-2 space-y-1">
                {filteredPayments.map((p, i) => (
                  <li
                    key={`${p.description}-${i}`}
                    className="flex items-center justify-between gap-2 rounded border bg-background p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{p.description}</div>
                      <div className="text-muted-foreground">
                        {formatCurrency(p.value)} ·{" "}
                        <span className="font-medium">{FILTER_REASON_LABEL[p.filterReason]}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => restoreFiltered(i)}
                      title="Restaurar esta linha"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
