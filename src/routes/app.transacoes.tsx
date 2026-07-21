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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Search, ChevronDown, AlertTriangle, Tag } from "lucide-react";
import { formatCurrency, todayISO } from "@/lib/format";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { learnCategory } from "@/services/invoiceProcessor";


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
  card_last4: string | null;
  purchase_type: "cash" | "installment" | null;
  notes: string | null;
}


interface Cat {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string;
  parent_id: string | null;
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

function buildCatTree(cats: Cat[]): { cat: Cat; depth: number }[] {
  const parents = cats.filter((c) => !c.parent_id);
  const out: { cat: Cat; depth: number }[] = [];
  for (const p of parents) {
    out.push({ cat: p, depth: 0 });
    for (const child of cats.filter((c) => c.parent_id === p.id)) {
      out.push({ cat: child, depth: 1 });
    }
  }
  // Append orphans (parent not in same type list) just in case
  for (const c of cats) {
    if (c.parent_id && !out.find((o) => o.cat.id === c.id)) {
      out.push({ cat: c, depth: 1 });
    }
  }
  return out;
}

function catFullName(cat: Cat | undefined, all: Cat[]): string {
  if (!cat) return "Sem categoria";
  if (cat.parent_id) {
    const p = all.find((c) => c.id === cat.parent_id);
    if (p) return `${p.name} › ${cat.name}`;
  }
  return cat.name;
}

function TransactionsPage() {
  const { user } = useAuth();
  const [tx, setTx] = useState<Tx[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [accs, setAccs] = useState<Acc[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterCard, setFilterCard] = useState<string>("all");
  const [filterPurchaseType, setFilterPurchaseType] = useState<"all" | "cash" | "installment">("all");
  const [groupBy, setGroupBy] = useState<"category" | "month">("category");
  const [open, setOpen] = useState(false);

  const [editing, setEditing] = useState<Tx | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = async () => {
    const pageSize = 1000;
    let from = 0;
    const all: Tx[] = [];
    // Paginação para evitar truncamento (limite padrão do PostgREST é 1000).
    while (true) {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error || !data) break;
      all.push(...(data as Tx[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from("categories").select("id,name,type,color,parent_id").order("name"),
      supabase.from("accounts").select("id,name"),
    ]);
    setTx(all);
    setCats((c ?? []) as Cat[]);
    setAccs((a ?? []) as Acc[]);
    setSelected(new Set());
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

  const [wiping, setWiping] = useState(false);
  const wipeAll = async () => {
    if (!user) return;
    setWiping(true);
    const { error } = await supabase.from("transactions").delete().eq("user_id", user.id);
    setWiping(false);
    if (error) return toast.error(error.message);
    toast.success("Todas as transações foram apagadas");
    load();
  };

  // Mapas auxiliares para resolver hierarquia de categorias
  const catMap = useMemo(() => {
    const m = new Map<string, Cat>();
    cats.forEach((c) => m.set(c.id, c));
    return m;
  }, [cats]);

  const rootCatId = (cid: string | null): string | null => {
    if (!cid) return null;
    const c = catMap.get(cid);
    if (!c) return cid;
    return c.parent_id ?? c.id;
  };

  const cardOptions = useMemo(() => {
    const s = new Set<string>();
    tx.forEach((t) => {
      if (t.card_last4) s.add(t.card_last4);
    });
    return Array.from(s).sort((a, b) => {
      // "@" primeiro, depois numérico
      if (a.startsWith("@") && !b.startsWith("@")) return -1;
      if (!a.startsWith("@") && b.startsWith("@")) return 1;
      return a.localeCompare(b);
    });
  }, [tx]);

  const filtered = tx.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterCategory !== "all") {
      if (filterCategory === "__none__") {
        if (t.category_id) return false;
      } else {
        // Aceita a própria categoria OU qualquer subcategoria dela
        const tCat = t.category_id ? catMap.get(t.category_id) : undefined;
        const matches =
          t.category_id === filterCategory ||
          tCat?.parent_id === filterCategory;
        if (!matches) return false;
      }
    }
    if (filterCard !== "all") {
      if (filterCard === "__none__") {
        if (t.card_last4) return false;
      } else if (t.card_last4 !== filterCard) return false;
    }
    if (filterPurchaseType !== "all") {
      const pt = t.purchase_type ?? "cash";
      if (pt !== filterPurchaseType) return false;
    }
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });


  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const visibleIds = filtered.map((t) => t.id);
      const allSelected = visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("transactions").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} transaç${ids.length === 1 ? "ão" : "ões"} excluída(s)`);
    load();
  };

  const bulkApplyCategory = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    setBulkSaving(true);
    const newCatId = bulkCategoryId === "__none__" ? null : bulkCategoryId || null;
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: newCatId })
      .in("id", ids);
    setBulkSaving(false);
    if (error) return toast.error(error.message);
    const catName = newCatId ? cats.find((c) => c.id === newCatId)?.name : null;
    if (catName) {
      for (const id of ids) {
        const t = tx.find((x) => x.id === id);
        if (!t || !t.description?.trim()) continue;
        try {
          learnCategory(t.description, Number(t.amount), catName);
        } catch (_) {
          /* ignora */
        }
      }
    }
    toast.success(`Categoria aplicada a ${ids.length} transaç${ids.length === 1 ? "ão" : "ões"}`);
    setBulkOpen(false);
    setBulkCategoryId("");
    load();
  };

  // Agrupamento hierárquico: primário + secundário
  type SubGroup = {
    key: string;
    name: string;
    color: string;
    items: Tx[];
    income: number;
    expense: number;
  };
  type Group = {
    key: string;
    name: string;
    color: string;
    income: number;
    expense: number;
    count: number;
    subgroups: SubGroup[];
  };

  const groups = useMemo<Group[]>(() => {
    // Chave/nome/cor para a dimensão "categoria" (rolando subcategorias no pai)
    const categoryKeyOf = (t: Tx) => {
      const rid = rootCatId(t.category_id);
      if (!rid) return { key: "__none__", name: "Sem categoria", color: "#64748b" };
      const c = catMap.get(rid);
      return { key: rid, name: c?.name ?? "Sem categoria", color: c?.color ?? "#64748b" };
    };
    const monthKeyOf = (t: Tx) => {
      const key = t.date.slice(0, 7);
      return { key, name: MONTH_LABEL(key), color: "#a855f7" };
    };

    const primaryFn = groupBy === "month" ? monthKeyOf : categoryKeyOf;
    const secondaryFn = groupBy === "month" ? categoryKeyOf : monthKeyOf;

    const primaryMap = new Map<string, Group & { _subMap: Map<string, SubGroup> }>();
    for (const t of filtered) {
      const p = primaryFn(t);
      let g = primaryMap.get(p.key);
      if (!g) {
        g = {
          key: p.key,
          name: p.name,
          color: p.color,
          income: 0,
          expense: 0,
          count: 0,
          subgroups: [],
          _subMap: new Map(),
        };
        primaryMap.set(p.key, g);
      }
      const s = secondaryFn(t);
      let sg = g._subMap.get(s.key);
      if (!sg) {
        sg = { key: s.key, name: s.name, color: s.color, items: [], income: 0, expense: 0 };
        g._subMap.set(s.key, sg);
      }
      sg.items.push(t);
      g.count += 1;
      if (t.type === "income") {
        g.income += Number(t.amount);
        sg.income += Number(t.amount);
      } else {
        g.expense += Number(t.amount);
        sg.expense += Number(t.amount);
      }
    }

    const arr: Group[] = Array.from(primaryMap.values()).map((g) => {
      const subgroups = Array.from(g._subMap.values()).sort((a, b) => {
        if (groupBy === "month") {
          // dentro de um mês: categorias por maior gasto
          return b.expense + b.income - (a.expense + a.income);
        }
        // dentro de uma categoria: meses mais recentes primeiro
        return a.key < b.key ? 1 : -1;
      });
      // ordena itens por data desc dentro de cada subgrupo
      subgroups.forEach((s) =>
        s.items.sort((a, b) => (a.date < b.date ? 1 : -1)),
      );
      return {
        key: g.key,
        name: g.name,
        color: g.color,
        income: g.income,
        expense: g.expense,
        count: g.count,
        subgroups,
      };
    });

    if (groupBy === "month") {
      arr.sort((a, b) => (a.key < b.key ? 1 : -1)); // mais recente primeiro
    } else {
      arr.sort((a, b) => b.income + b.expense - (a.income + a.expense));
    }
    return arr;
  }, [filtered, cats, catMap, groupBy]);


  const allVisibleSelected =
    filtered.length > 0 && filtered.every((t) => selected.has(t.id));


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transações</h1>
          <p className="text-sm text-muted-foreground">Gerencie receitas e despesas</p>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={wiping || tx.length === 0}>
                <AlertTriangle className="mr-1 h-4 w-4 text-destructive" />
                Apagar todas
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar todas as transações?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação remove permanentemente todas as suas transações e zera o dashboard.
                  Categorias, contas e configurações permanecem intactas. Não é possível desfazer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={wipeAll}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Apagar tudo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Nova transação
              </Button>
            </DialogTrigger>
            <TransactionDialog
              open={open}
              cats={cats}
              accs={accs}
              onSaved={() => {
                setOpen(false);
                load();
              }}
            />
          </Dialog>
        </div>
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
        <Select
          value={filterType}
          onValueChange={(v) => {
            const next = v as typeof filterType;
            setFilterType(next);
            if (filterCategory !== "all" && filterCategory !== "__none__") {
              const c = cats.find((x) => x.id === filterCategory);
              if (c && next !== "all" && c.type !== next) setFilterCategory("all");
            }
          }}
        >
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
            {buildCatTree(
              cats.filter((c) => filterType === "all" || c.type === filterType),
            ).map(({ cat: c, depth }) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="inline-flex items-center gap-2">
                    {depth > 0 && <span className="text-muted-foreground">↳</span>}
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={filterCard} onValueChange={setFilterCard}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Cartão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os cartões</SelectItem>
            <SelectItem value="__none__">Sem cartão</SelectItem>
            {cardOptions.map((c) => (
              <SelectItem key={c} value={c}>
                <span className="font-mono text-xs">
                  {c.startsWith("@") ? c : `•••• ${c}`}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterPurchaseType}
          onValueChange={(v) => setFilterPurchaseType(v as "all" | "cash" | "installment")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">À vista + Parcelado</SelectItem>
            <SelectItem value="cash">Somente à vista</SelectItem>
            <SelectItem value="installment">Somente parcelado</SelectItem>
          </SelectContent>
        </Select>

        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "category" | "month")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Agrupar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="category">Agrupar por categoria</SelectItem>
            <SelectItem value="month">Agrupar por mês</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} />
            <span className="text-xs text-muted-foreground">
              {selected.size === 0
                ? `Selecionar todas (${filtered.length})`
                : `${selected.size} selecionada${selected.size === 1 ? "" : "s"}`}
            </span>
          </label>
          <div className="ml-auto flex gap-2">
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={selected.size === 0}>
                  <Tag className="mr-1 h-4 w-4" /> Mudar categoria
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    Mudar categoria de {selected.size} transaç{selected.size === 1 ? "ão" : "ões"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Label>Categoria</Label>
                  <Select value={bulkCategoryId} onValueChange={setBulkCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem categoria</SelectItem>
                      {buildCatTree(cats).map(({ cat: c, depth }) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="inline-flex items-center gap-2">
                            {depth > 0 && <span className="text-muted-foreground">↳</span>}
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: c.color }}
                            />
                            {c.name} <span className="text-xs text-muted-foreground">({c.type === "income" ? "Receita" : "Despesa"})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancelar</Button>
                  <Button onClick={bulkApplyCategory} disabled={bulkSaving || !bulkCategoryId}>
                    {bulkSaving ? "Aplicando..." : "Aplicar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={selected.size === 0}>
                  <Trash2 className="mr-1 h-4 w-4 text-destructive" /> Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir {selected.size} transaç{selected.size === 1 ? "ão" : "ões"}?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={bulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma transação encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const key = g.key;
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
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: g.color }}
                      />
                      <span className="font-semibold">{g.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({g.count} {g.count === 1 ? "lançamento" : "lançamentos"})
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
                    <div className="divide-y divide-border/50 border-t">
                      {g.subgroups.map((sg) => {
                        const subKey = `${key}::${sg.key}`;
                        const subOpen = !collapsed[subKey];
                        const subBalance = sg.income - sg.expense;
                        return (
                          <div key={subKey} className="bg-muted/10">
                            <Collapsible
                              open={subOpen}
                              onOpenChange={(v) =>
                                setCollapsed((s) => ({ ...s, [subKey]: !v }))
                              }
                            >
                              <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-6 py-2 text-sm hover:bg-muted/40">
                                <div className="flex items-center gap-2">
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                                      subOpen ? "" : "-rotate-90"
                                    }`}
                                  />
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: sg.color }}
                                  />
                                  <span className="font-medium">{sg.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ({sg.items.length})
                                  </span>
                                </div>
                                <div
                                  className={`tabular-nums text-xs font-semibold ${
                                    subBalance >= 0 ? "text-success" : "text-destructive"
                                  }`}
                                >
                                  {subBalance >= 0 ? "+" : "−"}
                                  {formatCurrency(Math.abs(subBalance))}
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <ul className="divide-y divide-border/50 border-t bg-background">
                                  {sg.items.map((t: Tx) => {
                                    const cat = cats.find((c) => c.id === t.category_id);
                                    return (
                                      <li
                                        key={t.id}
                                        className="flex items-center justify-between gap-3 px-8 py-3"
                                      >
                                        <Checkbox
                                          checked={selected.has(t.id)}
                                          onCheckedChange={() => toggleOne(t.id)}
                                          onClick={(e) => e.stopPropagation()}
                                        />
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
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="truncate text-sm font-medium">
                                                {t.description || cat?.name || "Sem descrição"}
                                              </span>
                                              {t.card_last4 && (
                                                <span className="rounded border border-muted-foreground/25 px-1.5 py-0 font-mono text-[10px] text-muted-foreground">
                                                  {t.card_last4.startsWith("@")
                                                    ? t.card_last4
                                                    : `•••• ${t.card_last4}`}
                                                </span>
                                              )}
                                              {t.purchase_type === "installment" && (
                                                <span className="rounded border border-indigo-500/40 px-1.5 py-0 text-[10px] text-indigo-600 dark:text-indigo-400">
                                                  Parcelado
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              {catFullName(cat, cats)} •{" "}
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
                          </div>
                        );
                      })}
                    </div>
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
  const [date, setDate] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [applyAll, setApplyAll] = useState(true);

  useEffect(() => {
    if (tx) {
      setCategoryId(tx.category_id ?? "");
      setDate(tx.date);
      setDescription(tx.description ?? "");
      setNotes(tx.notes ?? "");
      setCreating(false);
      setNewName("");
      setNewColor(COLORS[0]);
      setApplyAll(true);
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
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDate.test(date)) {
      setSaving(false);
      return toast.error("Data inválida");
    }
    const todayBR = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    if (date > todayBR) {
      setSaving(false);
      return toast.error("Não é permitido data no futuro");
    }
    const dateChanged = date !== tx.date;
    const desc = (tx.description ?? "").trim();
    const newDesc = description.trim();
    const descChanged = newDesc !== (tx.description ?? "");
    const newNotes = notes.trim() ? notes.trim() : null;
    const notesChanged = (newNotes ?? "") !== (tx.notes ?? "");

    // 1) Atualiza data / descrição / notas apenas no lançamento atual
    if (dateChanged || descChanged || notesChanged) {
      const patch: Record<string, unknown> = {};
      if (dateChanged) patch.date = date;
      if (descChanged) patch.description = newDesc;
      if (notesChanged) patch.notes = newNotes;
      const { error: dErr } = await supabase
        .from("transactions")
        .update(patch)
        .eq("id", tx.id);
      if (dErr) {
        setSaving(false);
        return toast.error(dErr.message);
      }
    }


    // 2) Atualiza categoria (no atual ou em todos com mesma descrição)
    let query = supabase
      .from("transactions")
      .update({ category_id: finalCategoryId || null });
    if (applyAll && desc) {
      query = query.eq("type", tx.type).ilike("description", desc);
    } else {
      query = query.eq("id", tx.id);
    }
    const { data: updated, error } = await query.select("id");
    setSaving(false);
    if (error) return toast.error(error.message);
    const count = updated?.length ?? 0;
    // Aprende essa categorização para futuras importações de PDF
    if (finalCategoryId && desc) {
      const catName = cats.find((c) => c.id === finalCategoryId)?.name
        ?? (creating ? newName.trim() : null);
      if (catName) {
        try {
          learnCategory(desc, Number(tx.amount), catName);
        } catch (_) {
          /* ignora */
        }
      }
    }
    toast.success(
      applyAll && desc
        ? `Atualizado em ${count} transaç${count === 1 ? "ão" : "ões"}`
        : "Transação atualizada",
    );
    onSaved();
  };



  return (
    <Dialog open={!!tx} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar transação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="font-medium truncate">{tx.description || "Sem descrição"}</div>
            <div className="text-xs text-muted-foreground">
              {tx.type === "income" ? "Receita" : "Despesa"} • {formatCurrency(Number(tx.amount))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Data</Label>
            <Input
              type="date"
              value={date}
              max={new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}
              onChange={(e) => setDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A alteração de data se aplica somente a este lançamento.
            </p>
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
                    {buildCatTree(filteredCats).map(({ cat: c, depth }) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="inline-flex items-center gap-2">
                          {depth > 0 && <span className="text-muted-foreground">↳</span>}
                          {c.name}
                        </span>
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

          {tx.description?.trim() && (
            <label className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm cursor-pointer">
              <Checkbox
                checked={applyAll}
                onCheckedChange={(v) => setApplyAll(!!v)}
                className="mt-0.5"
              />
              <span>
                Aplicar <span className="font-medium">categoria</span> a todas as transações com a descrição{" "}

                <span className="font-medium">"{tx.description.trim()}"</span>{" "}
                <span className="text-muted-foreground">
                  (anteriores e futuras do mesmo tipo)
                </span>
              </span>
            </label>
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
  open,
  cats,
  accs,
  onSaved,
}: {
  open: boolean;
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

  useEffect(() => {
    if (!open) {
      setAmount("");
      setDescription("");
      setDate(todayISO());
      setType("expense");
      setCategoryId("");
      setAccountId(accs[0]?.id ?? "");
    }
  }, [open, accs]);


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
                {buildCatTree(filteredCats).map(({ cat: c, depth }) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center gap-2">
                      {depth > 0 && <span className="text-muted-foreground">↳</span>}
                      {c.name}
                    </span>
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
