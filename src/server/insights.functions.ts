import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface CategoryAgg {
  name: string;
  total: number;
}

export const generateInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      .toISOString()
      .slice(0, 10);

    const [{ data: tx }, { data: cats }, { data: budgets }] = await Promise.all([
      supabase
        .from("transactions")
        .select("type,amount,date,category_id,description")
        .gte("date", prevStart)
        .lte("date", periodEnd),
      supabase.from("categories").select("id,name,type"),
      supabase
        .from("budgets")
        .select("category_id,limit_amount")
        .eq("month", periodStart),
    ]);

    const txs = tx ?? [];
    const catMap = new Map((cats ?? []).map((c) => [c.id, c.name]));
    const cur = txs.filter((t) => t.date >= periodStart);
    const prev = txs.filter((t) => t.date < periodStart);

    const sum = (arr: typeof txs, type: "income" | "expense") =>
      arr.filter((t) => t.type === type).reduce((s, t) => s + Number(t.amount), 0);

    const incomeCur = sum(cur, "income");
    const expenseCur = sum(cur, "expense");
    const incomePrev = sum(prev, "income");
    const expensePrev = sum(prev, "expense");

    const byCat = new Map<string, number>();
    cur.filter((t) => t.type === "expense").forEach((t) => {
      const name = catMap.get(t.category_id ?? "") ?? "Outros";
      byCat.set(name, (byCat.get(name) ?? 0) + Number(t.amount));
    });
    const topCategories: CategoryAgg[] = Array.from(byCat.entries())
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const budgetsAgg = (budgets ?? []).map((b) => {
      const name = catMap.get(b.category_id) ?? "—";
      const spent = byCat.get(name) ?? 0;
      return {
        category: name,
        limit: Number(b.limit_amount),
        spent: Math.round(spent * 100) / 100,
        pct: b.limit_amount ? Math.round((spent / Number(b.limit_amount)) * 100) : 0,
      };
    });

    const aggregated = {
      periodo: { inicio: periodStart, fim: periodEnd },
      mes_atual: {
        receitas: Math.round(incomeCur * 100) / 100,
        despesas: Math.round(expenseCur * 100) / 100,
        saldo: Math.round((incomeCur - expenseCur) * 100) / 100,
      },
      mes_anterior: {
        receitas: Math.round(incomePrev * 100) / 100,
        despesas: Math.round(expensePrev * 100) / 100,
      },
      top_categorias_despesa: topCategories,
      orcamentos: budgetsAgg,
      total_transacoes_mes: cur.length,
    };

    const systemPrompt =
      "Você é um consultor financeiro pessoal brasileiro. Analise os dados agregados (já anonimizados) e produza insights práticos, claros e acionáveis em português do Brasil. Use linguagem simples, valores em reais. Nunca invente números fora dos fornecidos.";

    const userPrompt = `Dados financeiros do usuário (apenas agregados):\n\n${JSON.stringify(
      aggregated,
      null,
      2,
    )}\n\nGere análise estruturada.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "registrar_insight",
                description: "Retorna o insight financeiro estruturado.",
                parameters: {
                  type: "object",
                  properties: {
                    summary: {
                      type: "string",
                      description:
                        "Resumo executivo do mês em 2-4 frases (saldo, comparação com mês anterior, principais categorias).",
                    },
                    recommendations: {
                      type: "array",
                      description: "3-5 recomendações práticas e acionáveis.",
                      items: { type: "string" },
                    },
                    risk_alerts: {
                      type: "array",
                      description:
                        "Alertas de risco financeiro (estouro de orçamento, gasto desproporcional, saldo negativo). Pode ser vazio.",
                      items: { type: "string" },
                    },
                  },
                  required: ["summary", "recommendations", "risk_alerts"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "registrar_insight" },
          },
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429)
        throw new Error("Limite de requisições atingido. Tente novamente em alguns instantes.");
      if (response.status === 402)
        throw new Error("Créditos de IA esgotados. Adicione créditos em Configurações.");
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("Falha ao gerar insight com IA.");
    }

    const json = await response.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("IA não retornou insight estruturado.");
    const parsed = JSON.parse(toolCall.function.arguments) as {
      summary: string;
      recommendations: string[];
      risk_alerts: string[];
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("ai_insights")
      .insert({
        user_id: userId,
        period_start: periodStart,
        period_end: periodEnd,
        summary: parsed.summary,
        recommendations: parsed.recommendations,
        risk_alerts: parsed.risk_alerts,
        model: "google/gemini-2.5-flash",
      })
      .select()
      .single();

    if (insertErr) throw new Error(insertErr.message);
    return inserted;
  });