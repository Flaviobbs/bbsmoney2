import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload, FileText, Trash2, Check, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/format";
import { suggestCategoryDetailed, learnCategory } from "@/services/invoiceProcessor";


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
  const [processingProgress, setProcessingProgress] = useState<{ pct: number; stage: string }>({ pct: 0, stage: "" });

  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<number>>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dupKeys, setDupKeys] = useState<Record<string, Set<string>>>({});
  const [confirmDup, setConfirmDup] = useState<{
    docId: string;
    indices: number[];
    duplicates: number[];
    bulk: boolean;
  } | null>(null);
  const [pwdPrompt, setPwdPrompt] = useState<{
    docId: string;
    incorrect: boolean;
    value: string;
    save: boolean;
  } | null>(null);

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

  const dupKey = (date: string, amount: number, description: string) =>
    `${date}|${Math.round(Number(amount) * 100)}|${(description ?? "").trim().toLowerCase()}`;

  const loadDuplicates = async (docId: string, sugs: Suggestion[]) => {
    if (!user || sugs.length === 0) {
      setDupKeys((prev) => ({ ...prev, [docId]: new Set() }));
      return new Set<string>();
    }
    const dates = Array.from(new Set(sugs.map((s) => s.data)));
    const amounts = Array.from(new Set(sugs.map((s) => Number(s.valor))));
    const { data } = await supabase
      .from("transactions")
      .select("date,amount,description")
      .eq("user_id", user.id)
      .in("date", dates)
      .in("amount", amounts);
    const existing = new Set<string>(
      (data ?? []).map((t) =>
        dupKey(t.date as string, Number(t.amount), (t.description as string) ?? ""),
      ),
    );
    const dups = new Set<string>();
    sugs.forEach((s) => {
      const k = dupKey(s.data, Number(s.valor), s.descricao);
      if (existing.has(k)) dups.add(k);
    });
    setDupKeys((prev) => ({ ...prev, [docId]: dups }));
    return dups;
  };

  useEffect(() => {
    if (!openDocId) return;
    const ex = extractions[openDocId];
    if (ex) void loadDuplicates(openDocId, ex.suggestions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDocId, extractions]);

  useEffect(() => {
    void load();
  }, [user]);

  const onUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const safeName = file.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .toLowerCase();
    const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
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

  const processDoc = async (docId: string, password?: string) => {
    if (!session) return;
    setProcessingId(docId);
    try {
      const res = await fetch("/api/documents/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ document_id: docId, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.requires_password) {
          setPwdPrompt({
            docId,
            incorrect: !!json.incorrect_password,
            value: "",
            save: false,
          });
          await load();
          return;
        }
        throw new Error(json.error ?? "Erro");
      }
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

  const submitPassword = async () => {
    if (!pwdPrompt || !user) return;
    const { docId, value, save } = pwdPrompt;
    if (!value) return toast.error("Informe a senha");
    if (save) {
      await supabase.rpc("set_pdf_password", { p: value });
    }
    setPwdPrompt(null);
    await processDoc(docId, value);
  };

  const removeDoc = async (doc: Doc) => {
    if (!confirm(`Excluir ${doc.file_name}?`)) return;
    await supabase.storage.from("documents").remove([doc.file_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    toast.success("Documento excluído");
    void load();
  };

  const insertOne = async (docId: string, sug: Suggestion, idx: number) => {
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

  const approve = async (docId: string, sug: Suggestion, idx: number) => {
    const dups = dupKeys[docId] ?? (await loadDuplicates(docId, extractions[docId]?.suggestions ?? []));
    const k = dupKey(sug.data, Number(sug.valor), sug.descricao);
    if (dups.has(k)) {
      setConfirmDup({ docId, indices: [idx], duplicates: [idx], bulk: false });
      return;
    }
    await insertOne(docId, sug, idx);
  };

  const toggleSelect = (docId: string, idx: number) => {
    setSelected((prev) => {
      const set = new Set(prev[docId] ?? []);
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
      return { ...prev, [docId]: set };
    });
  };

  const toggleSelectAll = (docId: string, total: number) => {
    setSelected((prev) => {
      const set = prev[docId] ?? new Set<number>();
      if (set.size === total) return { ...prev, [docId]: new Set() };
      return { ...prev, [docId]: new Set(Array.from({ length: total }, (_, i) => i)) };
    });
  };

  const bulkApprove = async (docId: string) => {
    if (!user) return;
    const ex = extractions[docId];
    const set = selected[docId];
    if (!ex || !set || set.size === 0) return;
    const dups = await loadDuplicates(docId, ex.suggestions);
    const indices = Array.from(set);
    const duplicates = indices.filter((i) => {
      const s = ex.suggestions[i];
      return s && dups.has(dupKey(s.data, Number(s.valor), s.descricao));
    });
    if (duplicates.length > 0) {
      setConfirmDup({ docId, indices, duplicates, bulk: true });
      return;
    }
    await runBulkInsert(docId, indices);
  };

  const runBulkInsert = async (docId: string, indices: number[]) => {
    if (!user) return;
    const ex = extractions[docId];
    if (!ex || indices.length === 0) return;
    setBulkBusy(true);
    try {
      const sugs = indices.map((i) => ({ idx: i, s: ex.suggestions[i] })).filter((x) => x.s);
      const { data: cats } = await supabase.from("categories").select("id,name,type");
      const { data: accounts } = await supabase.from("accounts").select("id").limit(1);
      const accountId = accounts?.[0]?.id ?? null;
      const rows = sugs.map(({ s }) => {
        const cat = cats?.find(
          (c) => c.type === s.tipo && c.name.toLowerCase() === s.categoria.toLowerCase(),
        );
        return {
          user_id: user.id,
          description: s.descricao,
          amount: s.valor,
          type: s.tipo,
          date: s.data,
          category_id: cat?.id ?? null,
          account_id: accountId,
          source: "pdf" as const,
          document_id: docId,
          merchant: s.comerciante ?? null,
        };
      });
      const { error } = await supabase.from("transactions").insert(rows);
      if (error) throw error;
      const idxSet = new Set(indices);
      const remaining = ex.suggestions.filter((_, i) => !idxSet.has(i));
      await supabase
        .from("document_extractions")
        .update({ suggestions: remaining })
        .eq("id", ex.id);
      setExtractions((prev) => ({ ...prev, [docId]: { ...ex, suggestions: remaining } }));
      setSelected((prev) => ({ ...prev, [docId]: new Set() }));
      toast.success(`${rows.length} transações criadas`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkReject = async (docId: string) => {
    const ex = extractions[docId];
    const set = selected[docId];
    if (!ex || !set || set.size === 0) return;
    const remaining = ex.suggestions.filter((_, i) => !set.has(i));
    await supabase
      .from("document_extractions")
      .update({ suggestions: remaining })
      .eq("id", ex.id);
    setExtractions((prev) => ({ ...prev, [docId]: { ...ex, suggestions: remaining } }));
    setSelected((prev) => ({ ...prev, [docId]: new Set() }));
    toast.success("Sugestões removidas");
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
                    {ex.suggestions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pb-1">
                        <Checkbox
                          checked={
                            (selected[d.id]?.size ?? 0) === ex.suggestions.length &&
                            ex.suggestions.length > 0
                          }
                          onCheckedChange={() => toggleSelectAll(d.id, ex.suggestions.length)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {selected[d.id]?.size ?? 0} de {ex.suggestions.length} selecionadas
                        </span>
                        <div className="ml-auto flex gap-2">
                          <Button
                            size="sm"
                            disabled={bulkBusy || !(selected[d.id]?.size)}
                            onClick={() => bulkApprove(d.id)}
                          >
                            <Check className="h-4 w-4" /> Aprovar selecionadas
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={bulkBusy || !(selected[d.id]?.size)}
                            onClick={() => bulkReject(d.id)}
                          >
                            <X className="h-4 w-4" /> Rejeitar selecionadas
                          </Button>
                        </div>
                      </div>
                    )}
                    {ex.suggestions.map((s, i) => {
                      const isDup = (dupKeys[d.id] ?? new Set()).has(
                        dupKey(s.data, Number(s.valor), s.descricao),
                      );
                      return (
                      <div
                        key={i}
                        className={`flex flex-wrap items-center gap-3 rounded-md border p-2 ${
                          isDup ? "border-amber-500/40 bg-amber-500/5" : ""
                        }`}
                      >
                        <Checkbox
                          checked={selected[d.id]?.has(i) ?? false}
                          onCheckedChange={() => toggleSelect(d.id, i)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{s.descricao}</span>
                            {isDup && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/60 text-amber-700 dark:text-amber-400"
                              >
                                Já cadastrada
                              </Badge>
                            )}
                          </div>
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
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!confirmDup} onOpenChange={(o) => !o && setConfirmDup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDup?.bulk
                ? `${confirmDup?.duplicates.length} possível(eis) duplicata(s)`
                : "Transação possivelmente duplicada"}
            </DialogTitle>
            <DialogDescription>
              {confirmDup?.bulk
                ? "Algumas das sugestões selecionadas já existem em Transações com a mesma data, valor e descrição."
                : "Já existe uma transação idêntica (mesma data, valor e descrição). Deseja cadastrar mesmo assim?"}
            </DialogDescription>
          </DialogHeader>
          {confirmDup?.bulk && (
            <div className="max-h-56 space-y-1 overflow-auto rounded-md border p-2 text-sm">
              {confirmDup.duplicates.map((i) => {
                const s = extractions[confirmDup.docId]?.suggestions[i];
                if (!s) return null;
                return (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {s.data} · {s.descricao}
                    </span>
                    <span className="tabular-nums font-medium">
                      {formatCurrency(Number(s.valor))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDup(null)}>
              Cancelar
            </Button>
            {confirmDup?.bulk ? (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!confirmDup) return;
                    const dupSet = new Set(confirmDup.duplicates);
                    const keep = confirmDup.indices.filter((i) => !dupSet.has(i));
                    const docId = confirmDup.docId;
                    setConfirmDup(null);
                    if (keep.length === 0) {
                      toast.info("Nada a cadastrar");
                      return;
                    }
                    await runBulkInsert(docId, keep);
                  }}
                >
                  Pular duplicadas
                </Button>
                <Button
                  onClick={async () => {
                    if (!confirmDup) return;
                    const all = confirmDup.indices;
                    const docId = confirmDup.docId;
                    setConfirmDup(null);
                    await runBulkInsert(docId, all);
                  }}
                >
                  Cadastrar tudo
                </Button>
              </>
            ) : (
              <Button
                onClick={async () => {
                  if (!confirmDup) return;
                  const i = confirmDup.indices[0];
                  const s = extractions[confirmDup.docId]?.suggestions[i];
                  const docId = confirmDup.docId;
                  setConfirmDup(null);
                  if (s) await insertOne(docId, s, i);
                }}
              >
                Cadastrar duplicada
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwdPrompt} onOpenChange={(o) => !o && setPwdPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PDF protegido por senha</DialogTitle>
            <DialogDescription>
              {pwdPrompt?.incorrect
                ? "A senha informada está incorreta. Tente novamente."
                : "Este PDF requer senha para ser aberto. Informe a senha para continuar."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Senha do PDF</Label>
              <Input
                type="password"
                autoFocus
                value={pwdPrompt?.value ?? ""}
                onChange={(e) =>
                  setPwdPrompt((p) => (p ? { ...p, value: e.target.value } : p))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitPassword();
                }}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={pwdPrompt?.save ?? false}
                onCheckedChange={(c) =>
                  setPwdPrompt((p) => (p ? { ...p, save: c === true } : p))
                }
              />
              Salvar como senha padrão para próximos PDFs
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdPrompt(null)}>
              Cancelar
            </Button>
            <Button onClick={submitPassword}>Processar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}