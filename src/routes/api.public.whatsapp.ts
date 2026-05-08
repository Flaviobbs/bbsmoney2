import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/whatsapp")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        };
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)
          return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500, headers: cors });

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
        }
        const token = authHeader.slice(7);
        const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
        if (claimsErr || !claimsData?.claims?.sub) {
          return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: cors });
        }
        const userId = claimsData.claims.sub;

        let body: { message?: string };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: cors });
        }
        const message = (body.message ?? "").trim();
        if (!message || message.length > 2000)
          return new Response(
            JSON.stringify({ error: "message obrigatório (máx. 2000 caracteres)" }),
            { status: 400, headers: cors },
          );

        const { data: cats } = await supabaseAdmin
          .from("categories")
          .select("id,name,type")
          .eq("user_id", userId);
        const { data: accounts } = await supabaseAdmin
          .from("accounts")
          .select("id,name")
          .eq("user_id", userId)
          .limit(1);
        const accountId = accounts?.[0]?.id ?? null;
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
                  "Você interpreta mensagens curtas em PT-BR sobre finanças pessoais e extrai uma única transação. Use a categoria mais próxima da lista; se nenhuma encaixar, use 'Outros'. Data padrão = hoje (AAAA-MM-DD).",
              },
              { role: "user", content: `Categorias: ${catList}\nMensagem: "${message}"` },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "registrar_transacao",
                  parameters: {
                    type: "object",
                    properties: {
                      descricao: { type: "string" },
                      valor: { type: "number" },
                      tipo: { type: "string", enum: ["income", "expense"] },
                      data: { type: "string" },
                      categoria: { type: "string" },
                    },
                    required: ["descricao", "valor", "tipo", "data", "categoria"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "registrar_transacao" } },
          }),
        });

        if (!aiRes.ok) {
          const t = await aiRes.text();
          await supabaseAdmin.from("ingestion_logs").insert({
            user_id: userId,
            source: "whatsapp_simulado",
            input_payload: { message },
            status: "failed",
            error_message: `IA ${aiRes.status}: ${t}`,
          });
          return new Response(JSON.stringify({ error: "Falha na IA" }), { status: 502, headers: cors });
        }
        const aiJson = await aiRes.json();
        const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall)
          return new Response(JSON.stringify({ error: "Sem extração" }), { status: 422, headers: cors });
        const parsed = JSON.parse(toolCall.function.arguments) as {
          descricao: string;
          valor: number;
          tipo: "income" | "expense";
          data: string;
          categoria: string;
        };

        const cat = (cats ?? []).find(
          (c) => c.name.toLowerCase() === parsed.categoria.toLowerCase() && c.type === parsed.tipo,
        );

        const { data: tx, error: txErr } = await supabaseAdmin
          .from("transactions")
          .insert({
            user_id: userId,
            description: parsed.descricao,
            amount: parsed.valor,
            type: parsed.tipo,
            date: parsed.data,
            category_id: cat?.id ?? null,
            account_id: accountId,
            source: "whatsapp_simulado",
          })
          .select()
          .single();

        await supabaseAdmin.from("ingestion_logs").insert({
          user_id: userId,
          source: "whatsapp_simulado",
          input_payload: { message },
          output_payload: parsed,
          status: txErr ? "failed" : "ok",
          error_message: txErr?.message,
        });

        if (txErr)
          return new Response(JSON.stringify({ error: txErr.message }), { status: 500, headers: cors });
        return new Response(JSON.stringify({ transaction: tx, parsed }), { status: 200, headers: cors });
      },
    },
  },
});