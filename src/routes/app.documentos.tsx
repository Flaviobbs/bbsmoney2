import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Upload, FileText, Trash2, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/app/documentos")({
  component: DocumentosPage,
});

type Doc = {
  id: string;
  file_name: string;
  file_path: string;
  status: "uploaded" | "processing" | "processed" | "failed";
  created_at: string;
  error_message: string | null;
};
type Suggestion = {
  descricao: string;
  valor: number;
  tipo: "income" | "expense";
  data: string;
  categoria: string;
  comerciante?: string;
};
type Extraction = { id: string; document_id: string; suggestions: Suggestion[]; status: string };

const statusLabel: Record<Doc["status"], string> = {
  uploaded: "Enviado",
  processing: "Processando",
  processed: "Processado",
  failed: "Falhou",
};

function DocumentosPage() {
  const { user, session } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [extractions, setExtractions] = useState<Record<string, Extraction>>({});
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data: ds } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });
    setDocs((ds as Doc[]) ?? []);
    const { data: ex } = await supabase
      .from("document_extractions")
      .select("id,document_id,suggestions,status");
    const map: Record<string, Extraction> = {};
    (ex ?? []).forEach((e) => {
      map[e.document_id] = e as unknown as Extraction;
    });
    setExtractions(map);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const onUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
      contentType: file.type || "application/pdf",
    });
    if (upErr) {
      setUploading(false);
      return toast.error(upErr.message);
    }
    const { error: insErr } = await supabase.from("documents").insert({
      user_id: user.id,
      file_name: file.name,
      file_path: path,
      mime_type: file.type || "application/pdf",
      status: "uploaded",
    });
    setUploading(false);
    if (insErr) return toast.error(insErr.message);
    toast.success("PDF enviado");
    void load();
  };

  const processDoc = async (docId: string) => {
    if (!session) return;
    setProcessingId(docId);
    try {
      const res = await fetch("/api/documents/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ document_id: docId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro");
      toast.success(`${json.suggestions?.length ?? 0} sugestões geradas`);
      setOpenDocId(docId);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      await load();
    } finally {
      setProcessingId(null);
    }
  };

  const removeDoc = async (doc: Doc) => {
    if (!confirm(`Excluir ${doc.file_name}?`)) return;
    await supabase.storage.from("documents").remove([doc.file_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    toast.success("Documento excluído");
    void load();
  };

  const approve = async (docId: string, sug: Suggestion, idx: number) => {
    if (!user) return;
    const { data: cats } = await supabase
      .from("categories")
      .select("id,name,type")
      .eq("type", sug.tipo);
    const cat = cats?.find((c) => c.name.toLowerCase() === sug.categoria.toLowerCase());
    const { data: accounts } = await supabase.from("accounts").select("id").limit(1);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      description: sug.descricao,
      amount: sug.valor,
      type: sug.tipo,
      date: sug.data,
      category_id: cat?.id ?? null,
      account_id: accounts?.[0]?.id ?? null,
      source: "pdf",
      document_id: docId,
      merchant: sug.comerciante ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Transação criada");
    rejectSuggestion(docId, idx);
  };

  const rejectSuggestion = (docId: string, idx: number) => {
    setExtractions((prev) => {
      const e = prev[docId];
      if (!e) return prev;
      const next = { ...e, suggestions: e.suggestions.filter((_, i) => i !== idx) };
      void supabase
        .from("document_extractions")
        .update({ suggestions: next.suggestions })
        .eq("id", e.id);
      return { ...prev, [docId]: next };
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
        <p className="text-sm text-muted-foreground">
          Envie extratos ou faturas em PDF e a IA sugere transações para aprovação.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enviar PDF</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept="application/pdf"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = "";
              }}
              className="max-w-md"
            />
            {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            PDFs escaneados (apenas imagem) podem falhar — use PDFs com texto selecionável.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {docs.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum documento enviado.
            </CardContent>
          </Card>
        )}
        {docs.map((d) => {
          const ex = extractions[d.id];
          const open = openDocId === d.id;
          return (
            <Card key={d.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{d.file_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <Badge variant={d.status === "failed" ? "destructive" : "secondary"}>
                    {statusLabel[d.status]}
                  </Badge>
                  {d.status !== "processing" && (
                    <Button
                      size="sm"
                      onClick={() => processDoc(d.id)}
                      disabled={processingId === d.id}
                    >
                      {processingId === d.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {d.status === "processed" ? "Reprocessar" : "Processar"}
                    </Button>
                  )}
                  {ex && ex.suggestions.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenDocId(open ? null : d.id)}
                    >
                      {ex.suggestions.length} sugestões
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => removeDoc(d)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {d.error_message && (
                  <div className="text-xs text-destructive">{d.error_message}</div>
                )}
                {open && ex && (
                  <div className="space-y-2 border-t pt-3">
                    {ex.suggestions.length === 0 && (
                      <div className="text-sm text-muted-foreground">Sem sugestões.</div>
                    )}
                    {ex.suggestions.map((s, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center gap-3 rounded-md border p-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-medium">{s.descricao}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.data} · {s.categoria} · {s.tipo === "income" ? "Receita" : "Despesa"}
                          </div>
                        </div>
                        <div
                          className={`text-sm font-semibold ${
                            s.tipo === "income" ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {formatCurrency(Number(s.valor))}
                        </div>
                        <Button size="sm" onClick={() => approve(d.id, s, i)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => rejectSuggestion(d.id, i)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}