import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatCurrency, monthLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowDownRight,
  ArrowUpRight,
  PiggyBank,
  Wallet,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});

interface TxRow {
  id: string;
  type: "income" | "expense";
  amount: number;
  date: string;
  description: string;
  category_id: string | null;
}
interface CatRow {
  id: string;
  name: string;
  color: string;
  type: "income" | "expense";
}

function Dashboard() {
  const { user } = useAuth();
  const [tx, setTx] = useState<TxRow[]>([]);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 6);
      since.setDate(1);
      const [{ data: t }, { data: c }] = await Promise.all([
        supabase
          .from("transactions")
          .select("id,type,amount,date,description,category_id")
          .gte("date", since.toISOString().slice(0, 10))
          .order("date", { ascending: false }),
        supabase.from("categories").select("id,name,color,type"),
      ]);
      setTx((t ?? []) as TxRow[]);
      setCats((c ?? []) as CatRow[]);
      setLoading(false);
    };
    load();
  }, [user]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const monthTx = tx.filter((t) => t.date >= monthStart);
  const income = monthTx
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expense = monthTx
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);
  const balance = income - expense;
  const savingsPct = income > 0 ? Math.round((balance / income) * 100) : 0;

  const expenseByCat = useMemo(() => {
    const map = new Map<string, number>();
    monthTx
      .filter((t) => t.type === "expense" && t.category_id)
      .forEach((t) => {
        map.set(t.category_id!, (map.get(t.category_id!) ?? 0) + Number(t.amount));
      });
    return Array.from(map.entries())
      .map(([cid, value]) => {
        const c = cats.find((x) => x.id === cid);
        return { name: c?.name ?? "Outros", color: c?.color ?? "#a855f7", value };
      })
      .sort((a, b) => b.value - a.value);
  }, [monthTx, cats]);

  const monthly = useMemo(() => {
    const buckets = new Map<string, { month: string; income: number; expense: number; key: string }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      buckets.set(key, { month: monthLabel(d), income: 0, expense: 0, key });
    }
    tx.forEach((t) => {
      const key = t.date.slice(0, 7);
      const b = buckets.get(key);
      if (!b) return;
      if (t.type === "income") b.income += Number(t.amount);
      else b.expense += Number(t.amount);
    });
    return Array.from(buckets.values());
  }, [tx]);

  const recent = tx.slice(0, 6);

  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Visão geral</h1>
        <p className="text-sm text-muted-foreground">Seu resumo financeiro do mês</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Saldo do mês" value={formatCurrency(balance)} icon={Wallet} accent="primary" />
        <StatCard label="Receitas" value={formatCurrency(income)} icon={ArrowUpRight} accent="success" />
        <StatCard label="Despesas" value={formatCurrency(expense)} icon={ArrowDownRight} accent="destructive" />
        <StatCard label="Economia" value={`${savingsPct}%`} icon={PiggyBank} accent="primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {expenseByCat.length === 0 ? (
              <EmptyChart label="Sem despesas neste mês" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseByCat} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {expenseByCat.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={chartTooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receitas vs Despesas (6 meses)</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.03 285 / 50%)" />
                <XAxis dataKey="month" stroke="oklch(0.70 0.03 280)" fontSize={12} />
                <YAxis stroke="oklch(0.70 0.03 280)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={chartTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Receitas" fill="oklch(0.70 0.18 155)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" name="Despesas" fill="oklch(0.62 0.24 25)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas transações</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum lançamento ainda. Comece adicionando suas transações.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {recent.map((t) => {
                const cat = cats.find((c) => c.id === t.category_id);
                return (
                  <li key={t.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: cat?.color ?? "#64748b" }}
                      />
                      <div>
                        <div className="text-sm font-medium">{t.description || cat?.name || "Sem descrição"}</div>
                        <div className="text-xs text-muted-foreground">
                          {cat?.name ?? "—"} • {new Date(t.date + "T00:00:00").toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`tabular-nums font-semibold ${
                        t.type === "income" ? "text-success" : "text-destructive"
                      }`}
                    >
                      {t.type === "income" ? "+" : "−"}
                      {formatCurrency(Number(t.amount))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const chartTooltip = {
  backgroundColor: "oklch(0.21 0.025 280)",
  border: "1px solid oklch(0.30 0.03 285 / 60%)",
  borderRadius: 8,
  fontSize: 12,
  color: "oklch(0.97 0.01 280)",
};

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "success" | "destructive";
}) {
  const colors = {
    primary: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/15 text-destructive",
  } as const;
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
