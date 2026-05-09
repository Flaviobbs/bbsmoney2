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

export const Route = createFileRoute("/app/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const [name, setName] = useState("");
  const [pdfPassword, setPdfPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [waMsg, setWaMsg] = useState("Gastei 50 reais no mercado hoje");
  const [waLoading, setWaLoading] = useState(false);
  const [waResult, setWaResult] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name,pdf_password")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setName(data?.display_name ?? "");
        setPdfPassword(data?.pdf_password ?? "");
      });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name, pdf_password: pdfPassword || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
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
