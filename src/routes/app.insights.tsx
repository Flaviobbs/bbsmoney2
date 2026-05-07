import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, Lightbulb, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

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

function InsightsPage() {
  const { user, session } = useAuth();
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

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
        headers: { Authorization: `Bearer ${session.access_token}` },
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-6 w-6 text-primary" /> Insights com IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Análise inteligente das suas finanças do mês atual
          </p>
        </div>
        <Button onClick={onGenerate} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Gerar insight do mês
            </>
          )}
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Nenhum insight gerado ainda. Clique em "Gerar insight do mês" para começar.
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
    </div>
  );
}