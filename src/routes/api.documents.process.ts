import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/documents/process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !LOVABLE_API_KEY) {
          return Response.json({ error: "Server misconfigured" }, { status: 500 });
        }
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.slice(7);
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return Response.json({ error: "Invalid token" }, { status: 401 });
        }
        const userId = claims.claims.sub;

        const body = (await request.json()) as { document_id?: string };
        if (!body.document_id) return Response.json({ error: "document_id obrigatório" }, { status: 400 });

        const { data: doc, error: docErr } = await supabase
          .from("documents")
          .select("*")
          .eq("id", body.document_id)
          .maybeSingle();
        if (docErr || !doc) return Response.json({ error: "Documento não encontrado" }, { status: 404 });

        await supabase.from("documents").update({ status: "processing" }).eq("id", doc.id);

        try {
          const { data: file, error: dlErr } = await supabase.storage
            .from("documents")
            .download(doc.file_path);
          if (dlErr || !file) throw new Error(dlErr?.message ?? "Falha ao baixar PDF");

          const buf = new Uint8Array(await file.arrayBuffer());
          const { extractText, getDocumentProxy } = await import("unpdf");
          const pdf = await getDocumentProxy(buf);
          const { text } = await extractText(pdf, { mergePages: true });
          const rawText = (Array.isArray(text) ? text.join("\n") : text).slice(0, 20000);

          if (!rawText.trim()) throw new Error("PDF sem texto selecionável (pode ser escaneado)");

          const { data: cats } = await supabase
            .from("categories")
            .select("id,name,type");
          const catList = (cats ?? []).map((c) => `${c.name} (${c.type})`).join(", ");

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
                    "Você analisa extratos/faturas/recibos em PT-BR e extrai transações. Use SOMENTE valores presentes no texto. Categorize com base na lista fornecida; se nenhuma encaixar, use 'Outros'. Datas no formato AAAA-MM-DD.",
                },
                {
                  role: "user",
                  content: `Categorias disponíveis: ${catList}\n\nTexto do documento:\n${rawText}`,
                },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "registrar_sugestoes",
                    description: "Lista de transações sugeridas a partir do documento.",
                    parameters: {
                      type: "object",
                      properties: {
                        sugestoes: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              descricao: { type: "string" },
                              valor: { type: "number" },
                              tipo: { type: "string", enum: ["income", "expense"] },
                              data: { type: "string" },
                              categoria: { type: "string" },
                              comerciante: { type: "string" },
                            },
                            required: ["descricao", "valor", "tipo", "data", "categoria"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["sugestoes"],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              tool_choice: { type: "function", function: { name: "registrar_sugestoes" } },
            }),
          });

          if (!aiRes.ok) {
            if (aiRes.status === 429)
              return Response.json({ error: "Limite de requisições. Tente novamente." }, { status: 429 });
            if (aiRes.status === 402)
              return Response.json({ error: "Créditos de IA esgotados." }, { status: 402 });
            const t = await aiRes.text();
            throw new Error(`IA falhou: ${aiRes.status} ${t}`);
          }
          const aiJson = await aiRes.json();
          const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
          const parsed = toolCall ? JSON.parse(toolCall.function.arguments) : { sugestoes: [] };
          const suggestions = parsed.sugestoes ?? [];

          await supabase.from("document_extractions").insert({
            document_id: doc.id,
            user_id: userId,
            raw_text: rawText,
            suggestions,
            status: "ready",
          });
          await supabase
            .from("documents")
            .update({ status: "processed", processed_at: new Date().toISOString() })
            .eq("id", doc.id);

          return Response.json({ suggestions });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Erro";
          await supabase
            .from("documents")
            .update({ status: "failed", error_message: msg })
            .eq("id", doc.id);
          await supabase.from("document_extractions").insert({
            document_id: doc.id,
            user_id: userId,
            status: "failed",
            error_message: msg,
            suggestions: [],
          });
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});