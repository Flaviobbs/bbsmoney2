import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, AlertTriangle, Lightbulb, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate, todayISO } from "@/lib/format";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceProcessorUI } from "@/components/InvoiceProcessorUI";
import type { InvoiceLine } from "@/types/ProcessedInvoice";

export const Route = createFileRoute("/app/insights")({
  component: InsightsPage,
});

interface Insight {
  id: string;
  period_start: string;
  period_end: string;
  summary: string;
  recommendations: string[];
  risk_alerts: string[];
  created_at: string;
}

type PeriodOption = "1m" | "3m" | "6m" | "12m" | "custom";

function InsightsPage() {
  const { user, session } = useAuth();
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [rawInvoice, setRawInvoice] = useState("");
  const [parsedLines, setParsedLines] = useState<InvoiceLine[]>([]);
  const [period, setPeriod] = useState<PeriodOption>("1m");
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());

  const periodStart = useMemo(() => {
    const d = new Date();
    switch (period) {
      case "1m":
        d.setDate(1);
        return d.toISOString().slice(0, 10);
      case "3m":
        d.setMonth(d.getMonth() - 2);
        break;
      case "6m":
        d.setMonth(d.getMonth() - 5);
        break;
      case "12m":
        d.setMonth(d.getMonth() - 11);
        break;
      case "custom":
        return customStart;
    }
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }, [period, customStart]);

  const periodEnd = useMemo(() => {
    if (period === "custom") return customEnd;
    return todayISO();
  }, [period, customEnd]);

  const periodLabel = useMemo(() => {
    switch (period) {
      case "1m": return "Mês corrente";
      case "3m": return "Últimos 3 meses";
      case "6m": return "Últimos 6 meses";
      case "12m": return "Últimos 12 meses";
      case "custom": return `${formatDate(periodStart)} a ${formatDate(periodEnd)}`;
    }
  }, [period, periodStart, periodEnd]);

  const parseRaw = (text: string): InvoiceLine[] => {
    const out: InvoiceLine[] = [];
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const l of lines) {
      const parts = l.split(/[;\t]/).map((p) => p.trim());
      if (parts.length < 3) continue;
      const [date, description, valueRaw] = parts;
      const value = Number(valueRaw.replace(/\./g, "").replace(",", "."));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !description || !Number.isFinite(value)) continue;
      out.push({ date, description, value });
    }
    return out;
  };

  const load = async () => {
    const { data } = await supabase
      .from("ai_insights")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as unknown as Insight[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const onGenerate = async () => {
    if (!session) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/insights/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erro ao gerar insight");
      toast.success("Insight gerado!");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar insight");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-6 w-6 text-primary" /> Insights com IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Análise inteligente — {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Período</label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">Mês corrente</SelectItem>
                <SelectItem value="3m">Últimos 3 meses</SelectItem>
                <SelectItem value="6m">Últimos 6 meses</SelectItem>
                <SelectItem value="12m">Últimos 12 meses</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">De</label>
                <Input type="date" value={customStart} max={todayISO()} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Até</label>
                <Input type="date" value={customEnd} max={todayISO()} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}
          <Button onClick={onGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Gerar insight do período
              </>
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Nenhum insight gerado ainda. Selecione um período e clique em "Gerar insight" para começar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((it, idx) => (
            <Card key={it.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {formatDate(it.period_start)} — {formatDate(it.period_end)}
                  </CardTitle>
                  {idx === 0 && <Badge variant="default">Mais recente</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed">{it.summary}</p>

                {it.recommendations?.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Lightbulb className="h-4 w-4 text-primary" /> Recomendações
                    </div>
                    <ul className="space-y-1.5 pl-1">
                      {it.recommendations.map((r, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="text-primary">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {it.risk_alerts?.length > 0 && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
                      <AlertTriangle className="h-4 w-4" /> Alertas
                    </div>
                    <ul className="space-y-1.5 pl-1">
                      {it.risk_alerts.map((r, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="text-destructive">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  Gerado em {new Date(it.created_at).toLocaleString("pt-BR")}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importar linhas de fatura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Cole linhas no formato <code>data;descrição;valor</code> (uma por linha). Ex.:{" "}
            <code>2026-01-10;TV Parcelado 1/3;1500,00</code>
          </p>
          <Textarea
            rows={5}
            value={rawInvoice}
            onChange={(e) => {
              setRawInvoice(e.target.value);
              setParsedLines(parseRaw(e.target.value));
            }}
            placeholder="2026-01-10;Padaria;15,90"
          />
          <div className="text-xs text-muted-foreground">
            {parsedLines.length} linha(s) reconhecida(s)
          </div>
        </CardContent>
      </Card>

      <InvoiceProcessorUI
        invoiceLines={parsedLines}
        onProcessed={() => toast.success("Pré-processamento concluído")}
      />
    </div>
  );
}
