import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useTheme } from "@/lib/theme";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/app/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState("");
  const [pdfPassword, setPdfPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [waMsg, setWaMsg] = useState("Gastei 50 reais no mercado hoje");
  const [waLoading, setWaLoading] = useState(false);
  const [waResult, setWaResult] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);


  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      setName(prof?.display_name ?? "");
      const { data: pwd } = await supabase.rpc("get_pdf_password");
      setPdfPassword((pwd as string | null) ?? "");
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", user.id);
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    const { error: pwdErr } = await supabase.rpc("set_pdf_password", { p: pdfPassword });
    setSaving(false);
    if (pwdErr) return toast.error(pwdErr.message);
    toast.success("Perfil atualizado");
  };

  const sendWhats = async () => {
    if (!user) return;
    setWaLoading(true);
    setWaResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const res = await fetch("/api/public/whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: waMsg }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro");
      setWaResult(JSON.stringify(json.parsed, null, 2));
      toast.success("Transação criada via WhatsApp simulado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setWaLoading(false);
    }
  };

  const downloadBackup = async () => {
    if (!user) return;
    setBackupBusy(true);
    try {
      const tables = [
        "profiles",
        "accounts",
        "categories",
        "transactions",
        "bills",
        "budgets",
        "goals",
        "ai_insights",
        "document_extractions",
        "documents",
        "ingestion_logs",
      ] as const;
      const out: Record<string, unknown> = {
        meta: {
          app: "BBSMoney",
          version: 1,
          exported_at: new Date().toISOString(),
          user_id: user.id,
        },
      };
      for (const t of tables) {
        const { data, error } = await supabase.from(t).select("*");
        if (error) {
          console.error("[backup]", t, error);
          out[t] = { error: error.message };
        } else {
          out[t] = data ?? [];
        }
      }
      // Inclui o aprendizado de categorias (localStorage)
      try {
        const raw = window.localStorage.getItem("bbsmoney_category_learning");
        if (raw) out.category_learning_local = JSON.parse(raw);
      } catch (_) {
        /* ignora */
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `bbsmoney-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Backup baixado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar backup");
    } finally {
      setBackupBusy(false);
    }
  };

  const curlExample = user
    ? `curl -X POST ${typeof window !== "undefined" ? window.location.origin : ""}/api/public/whatsapp \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer <SEU_ACCESS_TOKEN>" \\\n  -d '{"message":"Gastei 50 reais no mercado"}'`
    : "";


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil</p>
      </div>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>Nome de exibição</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Senha padrão para PDFs protegidos</Label>
            <Input
              type="password"
              value={pdfPassword}
              onChange={(e) => setPdfPassword(e.target.value)}
              placeholder="Opcional — usada ao processar faturas com senha"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Será usada automaticamente ao processar PDFs protegidos. Você ainda pode informar
              uma senha diferente em cada documento.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" onClick={signOut}>
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Aparência</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={theme}
            onValueChange={(v) => setTheme(v as "light" | "dark" | "system")}
            className="grid gap-3"
          >
            {[
              { v: "light", label: "Claro" },
              { v: "dark", label: "Escuro" },
              { v: "system", label: "Seguir o sistema" },
            ].map((opt) => (
              <Label
                key={opt.v}
                htmlFor={`theme-${opt.v}`}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-accent"
              >
                <RadioGroupItem id={`theme-${opt.v}`} value={opt.v} />
                <span>{opt.label}</span>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Backup dos dados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Baixe um arquivo JSON com tudo que você cadastrou (transações, categorias,
            contas, contas a pagar, orçamentos, metas, insights, documentos e aprendizado
            de categorias). Guarde antes de cada atualização importante para nunca perder
            o trabalho de processamento.
          </p>
          <Button onClick={downloadBackup} disabled={backupBusy}>
            {backupBusy ? "Gerando backup..." : "Baixar backup (JSON)"}
          </Button>
        </CardContent>
      </Card>



      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">WhatsApp simulado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Envie uma mensagem em linguagem natural. A IA extrai valor, categoria, tipo e data,
            e cria uma transação na sua conta.
          </p>
          <Textarea
            value={waMsg}
            onChange={(e) => setWaMsg(e.target.value)}
            rows={3}
            placeholder="Ex.: Recebi 1500 de freela ontem"
          />
          <Button onClick={sendWhats} disabled={waLoading || !waMsg.trim()}>
            {waLoading ? "Enviando..." : "Enviar"}
          </Button>
          {waResult && (
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{waResult}</pre>
          )}
          <div className="space-y-2">
            <Label className="text-xs">Endpoint público (curl)</Label>
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{curlExample}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
