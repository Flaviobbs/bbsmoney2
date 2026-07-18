import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_categories",
  title: "Listar categorias",
  description: "Lista as categorias (e subcategorias) do usuário autenticado.",
  inputSchema: {
    type: z.enum(["income", "expense"]).optional().describe("Filtrar por tipo."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ type }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const sb = supabaseForUser(ctx);
    let q = sb.from("categories").select("id,name,type,color,parent_id").order("name");
    if (type) q = q.eq("type", type);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { categories: data ?? [] },
    };
  },
});
