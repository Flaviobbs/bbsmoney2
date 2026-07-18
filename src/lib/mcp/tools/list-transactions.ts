import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_transactions",
  title: "Listar transações",
  description:
    "Lista transações financeiras do usuário autenticado, com filtros opcionais por período, tipo e limite. Datas no formato AAAA-MM-DD.",
  inputSchema: {
    date_from: z.string().optional().describe("Data inicial AAAA-MM-DD (opcional)."),
    date_to: z.string().optional().describe("Data final AAAA-MM-DD (opcional)."),
    type: z.enum(["income", "expense"]).optional().describe("Filtrar por tipo."),
    limit: z.number().int().min(1).max(500).optional().describe("Máximo de resultados (padrão 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date_from, date_to, type, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("transactions")
      .select("id,date,description,amount,type,category_id,merchant,card_last4,purchase_type,source")
      .order("date", { ascending: false })
      .limit(limit ?? 100);
    if (date_from) q = q.gte("date", date_from);
    if (date_to) q = q.lte("date", date_to);
    if (type) q = q.eq("type", type);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { transactions: data ?? [] },
    };
  },
});
