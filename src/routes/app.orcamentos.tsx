import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/orcamentos")({
  component: BudgetsPage,
});

interface Cat {
  id: string;
  name: string;
  color: string;
  type: "income" | "expense";
}
interface Budget {
  id: string;
  category_id: string;
  month: string; // YYYY-MM-01
  limit_amount: number;
}
interface Tx {
  amount: number;
  category_id: string | null;
  date: string;
  type: "income" | "expense";
}

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const monthName = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase());
};

function BudgetsPage() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [cats, setCats] = useState<Cat[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [tx, setTx] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ category_id: string; existing?: Budget } | null>(null);

  const month = monthKey(cursor);
  const monthEnd = monthKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: c }, { data: b }, { data: t }] = await Promise.all([
      supabase.from("categories").select("id,name,color,type").eq("type", "expense").order("name"),
      supabase.from("budgets").select("id,category_id,month,limit_amount").eq("month", month),
      supabase
        .from("transactions")
        .select("amount,category_id,date,type")
        .eq("type", "expense")
        .gte("date", month)
        .lt("date", monthEnd),
    ]);
    setCats((c ?? []) as Cat[]);
    setBudgets((b ?? []) as Budget[]);
    setTx((t ?? []) as Tx[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, month]);

  const spentByCat = useMemo(() => {
    const map = new Map<string, number>();
    tx.forEach((t) => {
      if (!t.category_id) return;
      map.set(t.category_id, (map.get(t.category_id) ?? 0) + Number(t.amount));
    });
    return map;
  }, [tx]);

  const rows = cats.map((c) => {
    const b = budgets.find((x) => x.category_id === c.id);
    const spent = spentByCat.get(c.id) ?? 0;
    return { cat: c, budget: b, spent };
  });

  const totalLimit = budgets.reduce((s, b) => s + Number(b.limit_amount), 0);
  const totalSpent = rows.reduce((s, r) => s + (r.budget ? r.spent : 0), 0);

  const remove = async (id: string) => {
    const { error } = await supabase.from("budgets").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Orçamento removido");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">
            Defina limites mensais por categoria de despesa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[160px] text-center text-sm font-medium">{monthName(month)}</div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Limite total" value={formatCurrency(totalLimit)} />
        <SummaryCard label="Gasto (categorias com limite)" value={formatCurrency(totalSpent)} />
        <SummaryCard
          label="Restante"
          value={formatCurrency(totalLimit - totalSpent)}
          accent={totalLimit - totalSpent < 0 ? "destructive" : "success"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma categoria de despesa. Crie uma em Categorias.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {rows.map(({ cat, budget, spent }) => {
                const limit = budget ? Number(budget.limit_amount) : 0;
                const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
                const over = limit > 0 && spent > limit;
                return (
                  <li key={cat.id} className="flex flex-wrap items-center gap-4 py-4">
                    <div className="flex min-w-[160px] flex-1 items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <div>
                        <div className="text-sm font-medium">{cat.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {budget
                            ? `${formatCurrency(spent)} de ${formatCurrency(limit)}`
                            : `${formatCurrency(spent)} • sem limite`}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-[180px] flex-1">
                      {budget ? (
                        <div className="space-y-1">
                          <Progress
                            value={pct}
                            className={over ? "[&>div]:bg-destructive" : ""}
                          />
                          <div
                            className={`text-right text-xs tabular-nums ${
                              over ? "text-destructive" : "text-muted-foreground"
                            }`}
                          >
                            {pct}%{over ? " • estourado" : ""}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">—</div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={budget ? "outline" : "default"}
                        onClick={() => setEditing({ category_id: cat.id, existing: budget })}
                      >
                        {budget ? (
                          <>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                          </>
                        ) : (
                          <>
                            <Plus className="mr-1 h-3.5 w-3.5" /> Definir
                          </>
                        )}
                      </Button>
                      {budget && (
                        <Button size="icon" variant="ghost" onClick={() => remove(budget.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <BudgetDialog
            month={month}
            categoryId={editing.category_id}
            cats={cats}
            existing={editing.existing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "destructive";
}) {
  const cls =
    accent === "destructive"
      ? "text-destructive"
      : accent === "success"
        ? "text-success"
        : "";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-bold tabular-nums ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function BudgetDialog({
  month,
  categoryId,
  cats,
  existing,
  onClose,
  onSaved,
}: {
  month: string;
  categoryId: string;
  cats: Cat[];
  existing?: Budget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [catId, setCatId] = useState(categoryId);
  const [amount, setAmount] = useState(existing ? String(existing.limit_amount) : "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return toast.error("Informe um limite válido");
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user!.id;
    let error;
    if (existing) {
      ({ error } = await supabase
        .from("budgets")
        .update({ limit_amount: value, category_id: catId })
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase
        .from("budgets")
        .insert({ user_id: userId, category_id: catId, month, limit_amount: value }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Orçamento salvo");
    onSaved();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{existing ? "Editar orçamento" : "Novo orçamento"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={catId} onValueChange={setCatId} disabled={!!existing}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Limite mensal (R$)</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
