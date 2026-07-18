import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_transaction",
  title: "Criar transação",
  description:
    "Cria uma transação (receita ou despesa) para o usuário autenticado. Se category_id não for informado, tenta casar pelo nome em category_name.",
  inputSchema: {
    description: z.string().min(1).describe("Descrição da transação."),
    amount: z.number().positive().describe("Valor em reais, sempre positivo."),
    type: z.enum(["income", "expense"]).describe("Tipo da transação."),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Data no formato AAAA-MM-DD."),
    category_id: z.string().uuid().optional().describe("ID da categoria (opcional)."),
    category_name: z.string().optional().describe("Nome da categoria (usado se category_id ausente)."),
    merchant: z.string().optional(),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    if (!userId)
      return { content: [{ type: "text", text: "Usuário não identificado" }], isError: true };

    let categoryId = input.category_id ?? null;
    if (!categoryId && input.category_name) {
      const { data: cat } = await sb
        .from("categories")
        .select("id")
        .ilike("name", input.category_name)
        .eq("type", input.type)
        .maybeSingle();
      categoryId = cat?.id ?? null;
    }

    const { data: accounts } = await sb.from("accounts").select("id").limit(1);
    const accountId = accounts?.[0]?.id ?? null;

    const { data, error } = await sb
      .from("transactions")
      .insert({
        user_id: userId,
        description: input.description,
        amount: input.amount,
        type: input.type,
        date: input.date,
        category_id: categoryId,
        account_id: accountId,
        merchant: input.merchant ?? null,
        notes: input.notes ?? null,
        source: "manual",
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Transação criada: ${data.id}` }],
      structuredContent: { transaction: data },
    };
  },
});
