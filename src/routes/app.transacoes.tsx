import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Search, ChevronDown } from "lucide-react";
import { formatCurrency, todayISO } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/app/transacoes")({
  component: TransactionsPage,
});

interface Tx {
  id: string;
  type: "income" | "expense";
  amount: number;
  date: string;
  description: string;
  category_id: string | null;
  account_id: string | null;
}
interface Cat {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string;
}
interface Acc {
  id: string;
  name: string;
}

const COLORS = ["#a855f7", "#22c55e", "#ef4444", "#0ea5e9", "#f97316", "#eab308", "#ec4899", "#64748b"];

const MONTH_LABEL = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function TransactionsPage() {
  const { user } = useAuth();
  const [tx, setTx] = useState<Tx[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [accs, setAccs] = useState<Acc[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = async () => {
    const [{ data: t }, { data: c }, { data: a }] = await Promise.all([
      supabase.from("transactions").select("*").order("date", { ascending: false }).limit(500),
      supabase.from("categories").select("id,name,type,color").order("name"),
      supabase.from("accounts").select("id,name"),
    ]);
    setTx((t ?? []) as Tx[]);
    setCats((c ?? []) as Cat[]);
    setAccs((a ?? []) as Acc[]);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lançamento excluído");
    load();
  };

  const filtered = tx.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterCategory !== "all") {
      if (filterCategory === "__none__") {
        if (t.category_id) return false;
      } else if (t.category_id !== filterCategory) return false;
    }
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const groups = useMemo(() => {
    const map = new Map<string, { items: Tx[]; income: number; expense: number }>();
    for (const t of filtered) {
      const key = t.date.slice(0, 7);
      if (!map.has(key)) map.set(key, { items: [], income: 0, expense: 0 });
      const g = map.get(key)!;
      g.items.push(t);
      if (t.type === "income") g.income += Number(t.amount);
      else g.expense += Number(t.amount);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transações</h1>
          <p className="text-sm text-muted-foreground">Gerencie receitas e despesas</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" /> Nova transação
            </Button>
          </DialogTrigger>
          <TransactionDialog
            cats={cats}
            accs={accs}
            onSaved={() => {
              setOpen(false);
              load();
            }}
          />
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição..."
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="income">Receitas</SelectItem>
            <SelectItem value="expense">Despesas</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filterCategory}
          onValueChange={(v) => setFilterCategory(v)}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            <SelectItem value="__none__">Sem categoria</SelectItem>
            {cats
              .filter((c) => filterType === "all" || c.type === filterType)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.name}
                    <span className="text-xs text-muted-foreground">
                      ({c.type === "income" ? "receita" : "despesa"})
                    </span>
                  </span>
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma transação encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map(([key, g]) => {
            const isOpen = !collapsed[key];
            const balance = g.income - g.expense;
            return (
              <Card key={key}>
                <Collapsible
                  open={isOpen}
                  onOpenChange={(v) => setCollapsed((s) => ({ ...s, [key]: !v }))}
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          isOpen ? "" : "-rotate-90"
                        }`}
                      />
                      <span className="font-semibold">{MONTH_LABEL(key)}</span>
                      <span className="text-xs text-muted-foreground">
                        ({g.items.length} {g.items.length === 1 ? "lançamento" : "lançamentos"})
                      </span>
                    </div>
                    <div
                      className={`tabular-nums text-sm font-semibold ${
                        balance >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {balance >= 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(balance))}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="divide-y divide-border/50 border-t">
                      {g.items.map((t) => {
                        const cat = cats.find((c) => c.id === t.category_id);
                        return (
                          <li
                            key={t.id}
                            className="flex items-center justify-between gap-3 px-4 py-3"
                          >
                            <button
                              type="button"
                              onClick={() => setEditing(t)}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-80"
                            >
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: cat?.color ?? "#64748b" }}
                              />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">
                                  {t.description || cat?.name || "Sem descrição"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {cat?.name ?? "Sem categoria"} •{" "}
                                  {new Date(t.date + "T00:00:00").toLocaleDateString("pt-BR")}
                                </div>
                              </div>
                            </button>
                            <div className="flex items-center gap-3">
                              <div
                                className={`tabular-nums font-semibold ${
                                  t.type === "income" ? "text-success" : "text-destructive"
                                }`}
                              >
                                {t.type === "income" ? "+" : "−"}
                                {formatCurrency(Number(t.amount))}
                              </div>
                              <Button size="icon" variant="ghost" onClick={() => remove(t.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      <EditCategoryDialog
        tx={editing}
        cats={cats}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}

function EditCategoryDialog({
  tx,
  cats,
  onClose,
  onSaved,
}: {
  tx: Tx | null;
  cats: Cat[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tx) {
      setCategoryId(tx.category_id ?? "");
      setCreating(false);
      setNewName("");
      setNewColor(COLORS[0]);
    }
  }, [tx]);

  if (!tx) return null;
  const filteredCats = cats.filter((c) => c.type === tx.type);

  const save = async () => {
    setSaving(true);
    let finalCategoryId = categoryId;
    if (creating) {
      if (!newName.trim()) {
        setSaving(false);
        return toast.error("Informe o nome da categoria");
      }
      const userId = (await supabase.auth.getUser()).data.user!.id;
      const { data, error } = await supabase
        .from("categories")
        .insert({
          user_id: userId,
          name: newName.trim(),
          type: tx.type,
          color: newColor,
          icon: "Tag",
        })
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        return toast.error(error?.message ?? "Erro ao criar categoria");
      }
      finalCategoryId = data.id;
    }
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: finalCategoryId || null })
      .eq("id", tx.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Categoria atualizada");
    onSaved();
  };

  return (
    <Dialog open={!!tx} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar categoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="font-medium truncate">{tx.description || "Sem descrição"}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(tx.date + "T00:00:00").toLocaleDateString("pt-BR")} •{" "}
              {tx.type === "income" ? "Receita" : "Despesa"} • {formatCurrency(Number(tx.amount))}
            </div>
          </div>

          {!creating ? (
            <>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCats.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-1 h-4 w-4" /> Criar nova categoria
              </Button>
            </>
          ) : (
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-2">
                <Label>Nome da nova categoria</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Pet"
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={`h-7 w-7 rounded-full border-2 ${
                        newColor === c ? "border-foreground" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancelar nova categoria
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransactionDialog({
  cats,
  accs,
  onSaved,
}: {
  cats: Cat[];
  accs: Acc[];
  onSaved: () => void;
}) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>(accs[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId && accs[0]) setAccountId(accs[0].id);
  }, [accs, accountId]);

  const filteredCats = cats.filter((c) => c.type === type);

  const submit = async () => {
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) return toast.error("Informe um valor válido");
    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      type,
      amount: value,
      description,
      date,
      category_id: categoryId || null,
      account_id: accountId || null,
      user_id: (await supabase.auth.getUser()).data.user!.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Transação adicionada");
    onSaved();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Nova transação</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={type === "expense" ? "default" : "outline"}
            onClick={() => {
              setType("expense");
              setCategoryId("");
            }}
          >
            Despesa
          </Button>
          <Button
            variant={type === "income" ? "default" : "outline"}
            onClick={() => {
              setType("income");
              setCategoryId("");
            }}
          >
            Receita
          </Button>
        </div>
        <div className="space-y-2">
          <Label>Valor (R$)</Label>
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Descrição</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Supermercado" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {filteredCats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Conta</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {accs.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
