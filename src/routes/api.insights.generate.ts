import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/insights/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !LOVABLE_API_KEY) {
          return new Response(JSON.stringify({ error: "Server misconfigured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const token = authHeader.slice(7);

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claimsData?.claims?.sub) {
          return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const userId = claimsData.claims.sub;

        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .slice(0, 10);
        const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
          .toISOString()
          .slice(0, 10);

        let bodyPeriodStart: string | null = null;
        let bodyPeriodEnd: string | null = null;
        try {
          const body = (await request.json().catch(() => null)) as
            | { period_start?: string; period_end?: string }
            | null;
          const iso = /^\d{4}-\d{2}-\d{2}$/;
          if (body?.period_start && iso.test(body.period_start)) bodyPeriodStart = body.period_start;
          if (body?.period_end && iso.test(body.period_end)) bodyPeriodEnd = body.period_end;
        } catch {
          /* sem body = usa mês corrente */
        }

        const periodStart = bodyPeriodStart ?? defaultStart;
        const periodEnd = bodyPeriodEnd ?? defaultEnd;
        // janela anterior do mesmo tamanho para comparação
        const startMs = new Date(periodStart + "T00:00:00").getTime();
        const endMs = new Date(periodEnd + "T00:00:00").getTime();
        const spanMs = Math.max(endMs - startMs, 24 * 60 * 60 * 1000);
        const prevStart = new Date(startMs - spanMs).toISOString().slice(0, 10);

        const [{ data: tx }, { data: cats }, { data: budgets }] = await Promise.all([
          supabase
            .from("transactions")
            .select("type,amount,date,category_id")
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
        cur
          .filter((t) => t.type === "expense")
          .forEach((t) => {
            const name = catMap.get(t.category_id ?? "") ?? "Outros";
            byCat.set(name, (byCat.get(name) ?? 0) + Number(t.amount));
          });
        const topCategories = Array.from(byCat.entries())
          .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 8);

        const budgetsAgg = (budgets ?? []).map((b) => {
          const name = catMap.get(b.category_id) ?? "—";
          const spent = byCat.get(name) ?? 0;
          return {
            categoria: name,
            limite: Number(b.limit_amount),
            gasto: Math.round(spent * 100) / 100,
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

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "Você é um consultor financeiro pessoal brasileiro. Analise dados agregados e produza insights práticos, claros e acionáveis em português do Brasil. Use linguagem simples, valores em reais. Nunca invente números fora dos fornecidos.",
              },
              {
                role: "user",
                content: `Dados financeiros agregados do usuário:\n\n${JSON.stringify(aggregated, null, 2)}\n\nGere análise estruturada.`,
              },
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
                        description: "Resumo executivo do mês em 2-4 frases.",
                      },
                      recommendations: {
                        type: "array",
                        items: { type: "string" },
                        description: "3-5 recomendações práticas.",
                      },
                      risk_alerts: {
                        type: "array",
                        items: { type: "string" },
                        description: "Alertas de risco. Pode ser vazio.",
                      },
                    },
                    required: ["summary", "recommendations", "risk_alerts"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "registrar_insight" } },
          }),
        });

        if (!aiRes.ok) {
          if (aiRes.status === 429)
            return new Response(
              JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns instantes." }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          if (aiRes.status === 402)
            return new Response(
              JSON.stringify({ error: "Créditos de IA esgotados." }),
              { status: 402, headers: { "Content-Type": "application/json" } },
            );
          const t = await aiRes.text();
          console.error("AI gateway error:", aiRes.status, t);
          return new Response(JSON.stringify({ error: "Falha ao gerar insight." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const aiJson = await aiRes.json();
        const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) {
          return new Response(JSON.stringify({ error: "IA não retornou insight estruturado." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
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

        if (insertErr) {
          return new Response(JSON.stringify({ error: insertErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return Response.json(inserted);
      },
    },
  },
});