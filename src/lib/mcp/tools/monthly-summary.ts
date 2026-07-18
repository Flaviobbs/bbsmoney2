import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "monthly_summary",
  title: "Resumo mensal",
  description:
    "Retorna totais de receitas, despesas, saldo e top categorias de despesa no período informado (padrão: mês corrente).",
  inputSchema: {
    period_start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    period_end: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_start, period_end }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const now = new Date();
    const start =
      period_start ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end =
      period_end ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const sb = supabaseForUser(ctx);
    const [{ data: tx, error }, { data: cats }] = await Promise.all([
      sb.from("transactions").select("type,amount,category_id").gte("date", start).lte("date", end),
      sb.from("categories").select("id,name"),
    ]);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const catMap = new Map((cats ?? []).map((c) => [c.id, c.name]));
    const txs = tx ?? [];
    const income = txs
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + Number(t.amount), 0);
    const expense = txs
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + Number(t.amount), 0);
    const byCat = new Map<string, number>();
    txs
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const name = catMap.get(t.category_id ?? "") ?? "Outros";
        byCat.set(name, (byCat.get(name) ?? 0) + Number(t.amount));
      });
    const top = Array.from(byCat.entries())
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    const summary = {
      period: { start, end },
      receitas: Math.round(income * 100) / 100,
      despesas: Math.round(expense * 100) / 100,
      saldo: Math.round((income - expense) * 100) / 100,
      top_categorias_despesa: top,
      total_transacoes: txs.length,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
