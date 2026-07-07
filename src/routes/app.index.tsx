import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatCurrency, monthLabel, formatDate, todayISO } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
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

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

interface TxRow {
  id: string;
  type: "income" | "expense";
  amount: number;
  date: string;
  description: string;
  category_id: string | null;
  card_last4: string | null;
  purchase_type: "cash" | "installment" | null;
}

interface CatRow {
  id: string;
  name: string;
  color: string;
  type: "income" | "expense";
  parent_id: string | null;
}
interface UpcomingBill {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  type: "income" | "expense";
}

function Dashboard() {
  const { user } = useAuth();
  const [tx, setTx] = useState<TxRow[]>([]);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingBill[]>([]);
  const [loading, setLoading] = useState(true);

  type PeriodOption = "1m" | "3m" | "6m" | "12m" | "custom";
  const [period, setPeriod] = useState<PeriodOption>("6m");
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [catChartType, setCatChartType] = useState<"expense" | "income">("expense");
  const [catChartId, setCatChartId] = useState<string>("");

  const periodStart = useMemo(() => {
    const d = new Date();
    switch (period) {
      case "1m":
        // mês corrente: do dia 1 até hoje
        d.setDate(1);
        return d.toISOString().slice(0, 10);
      case "3m":
        d.setMonth(d.getMonth() - 2);
        break;
      case "6m":
        d.setMonth(d.getMonth() - 5);
        break;
      case "12m":
        d.setMonth(d.getMonth() - 11);
        break;
      case "custom":
        return customStart;
    }
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }, [period, customStart]);


  const periodEnd = useMemo(() => {
    if (period === "custom") return customEnd;
    return todayISO();
  }, [period, customEnd]);

  const periodMonths = useMemo(() => {
    switch (period) {
      case "1m": return 1;
      case "3m": return 3;
      case "6m": return 6;
      case "12m": return 12;
      case "custom": {
        const s = new Date(periodStart + "T00:00:00");
        const e = new Date(periodEnd + "T00:00:00");
        return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1);
      }
    }
  }, [period, periodStart, periodEnd]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const today = todayISO();
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      const in7ISO = in7.toISOString().slice(0, 10);
      const [{ data: t }, { data: c }, { data: ub }] = await Promise.all([
        supabase
          .from("transactions")
          .select("id,type,amount,date,description,category_id,card_last4,purchase_type")
          .gte("date", periodStart)
          .lte("date", periodEnd)
          .order("date", { ascending: false }),

        supabase.from("categories").select("id,name,color,type,parent_id"),
        supabase
          .from("bills")
          .select("id,description,amount,due_date,type")
          .eq("status", "pending")
          .gte("due_date", today)
          .lte("due_date", in7ISO)
          .order("due_date", { ascending: true })
          .limit(5),
      ]);
      setTx((t ?? []) as TxRow[]);
      setCats((c ?? []) as CatRow[]);
      setUpcoming((ub ?? []) as UpcomingBill[]);
      setLoading(false);
    };
    load();
  }, [user, periodStart, periodEnd]);

  const now = new Date();

  const periodTx = useMemo(() => {
    return tx.filter((t) => t.date >= periodStart && t.date <= periodEnd);
  }, [tx, periodStart, periodEnd]);

  const income = periodTx
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expense = periodTx
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);
  const balance = income - expense;
  const savingsPct = income > 0 ? Math.round((balance / income) * 100) : 0;

  const { installmentTotal, cashTotal } = useMemo(() => {
    let inst = 0;
    let cash = 0;
    periodTx
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        if (t.purchase_type === "installment") inst += Number(t.amount);
        else cash += Number(t.amount);
      });
    return { installmentTotal: inst, cashTotal: cash };
  }, [periodTx]);

  const expenseByCat = useMemo(() => {
    const map = new Map<string, number>();
    periodTx
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
  }, [periodTx, cats]);

  const expenseByCard = useMemo(() => {
    const map = new Map<string, { installment: number; cash: number }>();
    periodTx
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const key = t.card_last4 ?? "__none__";
        const cur = map.get(key) ?? { installment: 0, cash: 0 };
        if (t.purchase_type === "installment") cur.installment += Number(t.amount);
        else cur.cash += Number(t.amount);
        map.set(key, cur);
      });
    return Array.from(map.entries())
      .map(([key, v]) => ({
        key,
        label:
          key === "__none__"
            ? "Sem cartão"
            : key.startsWith("@")
              ? key
              : `•••• ${key}`,
        total: v.installment + v.cash,
        cash: v.cash,
        installment: v.installment,
      }))
      .sort((a, b) => b.total - a.total);
  }, [periodTx]);


  const monthly = useMemo(() => {
    const buckets = new Map<string, { month: string; income: number; expense: number; key: string }>();
    const totalMonths = periodMonths;
    for (let i = totalMonths - 1; i >= 0; i--) {
      const refDate = period === "custom"
        ? new Date(new Date(periodEnd + "T00:00:00").getFullYear(), new Date(periodEnd + "T00:00:00").getMonth() - i, 1)
        : new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = refDate.toISOString().slice(0, 7);
      buckets.set(key, { month: monthLabel(refDate), income: 0, expense: 0, key });
    }
    tx.forEach((t) => {
      const key = t.date.slice(0, 7);
      const b = buckets.get(key);
      if (!b) return;
      if (t.type === "income") b.income += Number(t.amount);
      else b.expense += Number(t.amount);
    });
    return Array.from(buckets.values());
  }, [tx, period, periodEnd, periodMonths, now]);

  const childrenMap = useMemo(() => {
    const m = new Map<string, string[]>();
    cats.forEach((c) => {
      if (c.parent_id) {
        const arr = m.get(c.parent_id) ?? [];
        arr.push(c.id);
        m.set(c.parent_id, arr);
      }
    });
    return m;
  }, [cats]);

  const descendantIds = useMemo(() => {
    if (!catChartId) return new Set<string>();
    const out = new Set<string>([catChartId]);
    const stack = [catChartId];
    while (stack.length) {
      const id = stack.pop()!;
      (childrenMap.get(id) ?? []).forEach((cid) => {
        if (!out.has(cid)) {
          out.add(cid);
          stack.push(cid);
        }
      });
    }
    return out;
  }, [catChartId, childrenMap]);

  const categoryMonthly = useMemo(() => {
    const buckets = new Map<string, { month: string; total: number; key: string }>();
    const totalMonths = periodMonths;
    for (let i = totalMonths - 1; i >= 0; i--) {
      const refDate = period === "custom"
        ? new Date(new Date(periodEnd + "T00:00:00").getFullYear(), new Date(periodEnd + "T00:00:00").getMonth() - i, 1)
        : new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = refDate.toISOString().slice(0, 7);
      buckets.set(key, { month: monthLabel(refDate), total: 0, key });
    }
    if (catChartId) {
      tx.forEach((t) => {
        if (t.type !== catChartType) return;
        if (!t.category_id || !descendantIds.has(t.category_id)) return;
        const b = buckets.get(t.date.slice(0, 7));
        if (b) b.total += Number(t.amount);
      });
    }
    return Array.from(buckets.values());
  }, [tx, catChartId, catChartType, descendantIds, period, periodEnd, periodMonths, now]);

  const catOptions = useMemo(
    () => cats.filter((c) => c.type === catChartType).sort((a, b) => a.name.localeCompare(b.name)),
    [cats, catChartType],
  );

  const selectedCat = cats.find((c) => c.id === catChartId);

  const periodLabel = useMemo(() => {
    switch (period) {
      case "1m": return "Mês corrente";
      case "3m": return "Últimos 3 meses";
      case "6m": return "Últimos 6 meses";
      case "12m": return "Últimos 12 meses";
      case "custom": return `${formatDate(periodStart)} a ${formatDate(periodEnd)}`;
    }
  }, [period, periodStart, periodEnd]);

  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;




  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">Mês corrente</SelectItem>
              <SelectItem value="3m">Últimos 3 meses</SelectItem>
              <SelectItem value="6m">Últimos 6 meses</SelectItem>
              <SelectItem value="12m">Últimos 12 meses</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {period === "custom" && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} max={todayISO()} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} max={todayISO()} />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Saldo do período" value={formatCurrency(balance)} icon={Wallet} accent="primary" />
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
              <EmptyChart label="Sem despesas no período" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseByCat} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {expenseByCat.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={chartTooltip} itemStyle={chartTooltipItem} labelStyle={chartTooltipLabel} />

                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receitas vs Despesas ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.03 285 / 50%)" />
                <XAxis dataKey="month" stroke="oklch(0.70 0.03 280)" fontSize={12} />
                <YAxis stroke="oklch(0.70 0.03 280)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={chartTooltip} itemStyle={chartTooltipItem} labelStyle={chartTooltipLabel} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Receitas" fill="oklch(0.70 0.18 155)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" name="Despesas" fill="oklch(0.62 0.24 25)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {(installmentTotal > 0 || cashTotal > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Despesas à vista vs Parcelamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-xs text-muted-foreground">À vista</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(cashTotal)}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {expense > 0 ? `${Math.round((cashTotal / expense) * 100)}% das despesas` : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-indigo-500/30 p-3">
                <div className="text-xs text-indigo-600 dark:text-indigo-400">Parcelamentos</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(installmentTotal)}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {expense > 0 ? `${Math.round((installmentTotal / expense) * 100)}% das despesas` : "—"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {expenseByCard.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Despesas por cartão</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/50">
              {expenseByCard.map((c) => (
                <li
                  key={c.key}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.label}
                    </span>
                    {c.installment > 0 && (
                      <span className="rounded border border-indigo-500/40 px-1.5 py-0 text-[10px] text-indigo-600 dark:text-indigo-400">
                        Parcelado: {formatCurrency(c.installment)}
                      </span>
                    )}
                    {c.cash > 0 && (
                      <span className="rounded border border-muted-foreground/25 px-1.5 py-0 text-[10px] text-muted-foreground">
                        À vista: {formatCurrency(c.cash)}
                      </span>
                    )}
                  </div>
                  <div className="tabular-nums font-semibold text-destructive">
                    {formatCurrency(c.total)}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}



      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              {catChartType === "expense" ? "Despesas" : "Receitas"} mensais por categoria
              {selectedCat ? ` — ${selectedCat.name}` : ""}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={catChartType}
                onValueChange={(v) => {
                  setCatChartType(v as "expense" | "income");
                  setCatChartId("");
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Despesas</SelectItem>
                  <SelectItem value="income">Receitas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={catChartId} onValueChange={setCatChartId}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {catOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.parent_id ? "↳ " : ""}{c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-[280px]">
          {!catChartId ? (
            <EmptyChart label="Selecione uma categoria para ver a evolução mensal" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.03 285 / 50%)" />
                <XAxis dataKey="month" stroke="oklch(0.70 0.03 280)" fontSize={12} />
                <YAxis stroke="oklch(0.70 0.03 280)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={chartTooltip}
                  itemStyle={chartTooltipItem}
                  labelStyle={chartTooltipLabel}
                />
                <Bar
                  dataKey="total"
                  name={catChartType === "expense" ? "Despesa" : "Receita"}
                  fill={selectedCat?.color ?? (catChartType === "expense" ? "oklch(0.62 0.24 25)" : "oklch(0.70 0.18 155)")}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" /> Próximas contas (7 dias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma conta com vencimento nos próximos 7 dias.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-3">
                  <Link to="/app/contas" className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.description}</div>
                    <div className="text-xs text-muted-foreground">
                      Vence em {formatDate(b.due_date)}
                    </div>
                  </Link>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
                      Pendente
                    </Badge>
                    <div
                      className={`tabular-nums font-semibold ${
                        b.type === "income" ? "text-success" : "text-destructive"
                      }`}
                    >
                      {b.type === "income" ? "+" : "−"}
                      {formatCurrency(Number(b.amount))}
                    </div>
                  </div>
                </li>
              ))}
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

const chartTooltipItem = {
  color: "oklch(0.97 0.01 280)",
};

const chartTooltipLabel = {
  color: "oklch(0.97 0.01 280)",
  fontWeight: 600,
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
// trigger
