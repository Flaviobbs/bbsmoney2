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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, CheckCircle2, RotateCcw, XCircle, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, todayISO, formatDate } from "@/lib/format";
import { toast } from "sonner";
import {
  effectiveStatus,
  nextDueDate,
  recurrenceLabel,
  statusLabel,
  type BillStatus,
  type Recurrence,
} from "@/lib/bills";

export const Route = createFileRoute("/app/contas")({
  component: BillsPage,
});

interface Bill {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string;
  due_date: string;
  status: BillStatus;
  recurrence: Recurrence;
  category_id: string | null;
  account_id: string | null;
  paid_transaction_id: string | null;
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

type Tab = "all" | "pending" | "paid" | "overdue";

function BillsPage() {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [accs, setAccs] = useState<Acc[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);

  const load = async () => {
    const [{ data: b }, { data: c }, { data: a }] = await Promise.all([
      supabase.from("bills").select("*").order("due_date", { ascending: true }),
      supabase.from("categories").select("id,name,type,color"),
      supabase.from("accounts").select("id,name"),
    ]);
    setBills((b ?? []) as Bill[]);
    setCats((c ?? []) as Cat[]);
    setAccs((a ?? []) as Acc[]);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const enriched = useMemo(
    () => bills.map((b) => ({ ...b, effective: effectiveStatus(b.status, b.due_date) })),
    [bills]
  );

  const filtered = enriched.filter((b) => (tab === "all" ? true : b.effective === tab));

  const counts = {
    pending: enriched.filter((b) => b.effective === "pending").length,
    overdue: enriched.filter((b) => b.effective === "overdue").length,
    paid: enriched.filter((b) => b.status === "paid").length,
  };

  const markPaid = async (bill: Bill) => {
    if (!user) return;
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        type: bill.type,
        amount: bill.amount,
        description: `Pagamento: ${bill.description}`,
        date: todayISO(),
        category_id: bill.category_id,
        account_id: bill.account_id,
      })
      .select("id")
      .single();
    if (txErr || !tx) return toast.error(txErr?.message ?? "Erro ao gerar transação");

    const { error: updErr } = await supabase
      .from("bills")
      .update({ status: "paid", paid_transaction_id: tx.id })
      .eq("id", bill.id);
    if (updErr) return toast.error(updErr.message);

    if (bill.recurrence !== "none") {
      const next = nextDueDate(bill.due_date, bill.recurrence);
      if (next) {
        await supabase.from("bills").insert({
          user_id: user.id,
          type: bill.type,
          amount: bill.amount,
          description: bill.description,
          due_date: next,
          status: "pending",
          recurrence: bill.recurrence,
          category_id: bill.category_id,
          account_id: bill.account_id,
        });
      }
    }
    toast.success("Conta marcada como paga");
    load();
  };

  const reopen = async (bill: Bill) => {
    if (bill.paid_transaction_id) {
      const { error: delErr } = await supabase
        .from("transactions")
        .delete()
        .eq("id", bill.paid_transaction_id);
      if (delErr) return toast.error(delErr.message);
    }
    const { error } = await supabase
      .from("bills")
      .update({ status: "pending", paid_transaction_id: null })
      .eq("id", bill.id);
    if (error) return toast.error(error.message);
    toast.success("Conta reaberta");
    load();
  };

  const cancel = async (bill: Bill) => {
    const { error } = await supabase.from("bills").update({ status: "cancelled" }).eq("id", bill.id);
    if (error) return toast.error(error.message);
    toast.success("Conta cancelada");
    load();
  };

  const remove = async (bill: Bill) => {
    const { error } = await supabase.from("bills").delete().eq("id", bill.id);
    if (error) return toast.error(error.message);
    toast.success("Conta excluída");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contas a pagar/receber</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe vencimentos e marque como pago para gerar a transação automaticamente.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}>
              <Plus className="mr-1 h-4 w-4" /> Nova conta
            </Button>
          </DialogTrigger>
          <BillFormDialog
            key={editing?.id ?? "new"}
            bill={editing}
            cats={cats}
            accs={accs}
            onSaved={() => {
              setOpen(false);
              setEditing(null);
              load();
            }}
          />
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="all">Todas ({enriched.length})</TabsTrigger>
          <TabsTrigger value="pending">Pendentes ({counts.pending})</TabsTrigger>
          <TabsTrigger value="overdue">Atrasadas ({counts.overdue})</TabsTrigger>
          <TabsTrigger value="paid">Pagas ({counts.paid})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma conta nesta visão.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {filtered.map((b) => {
                const cat = cats.find((c) => c.id === b.category_id);
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cat?.color ?? "#64748b" }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{b.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {cat?.name ?? "—"} • Vence em {formatDate(b.due_date)}
                          {b.recurrence !== "none" && ` • ${recurrenceLabel[b.recurrence]}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={b.effective} />
                      <div
                        className={`tabular-nums font-semibold ${
                          b.type === "income" ? "text-success" : "text-destructive"
                        }`}
                      >
                        {b.type === "income" ? "+" : "−"}
                        {formatCurrency(Number(b.amount))}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {b.status === "pending" && (
                            <DropdownMenuItem onClick={() => markPaid(b)}>
                              <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como pago
                            </DropdownMenuItem>
                          )}
                          {(b.status === "paid" || b.status === "cancelled") && (
                            <DropdownMenuItem onClick={() => reopen(b)}>
                              <RotateCcw className="mr-2 h-4 w-4" /> Reabrir
                            </DropdownMenuItem>
                          )}
                          {b.status === "pending" && (
                            <DropdownMenuItem onClick={() => cancel(b)}>
                              <XCircle className="mr-2 h-4 w-4" /> Cancelar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(b);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => remove(b)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

function StatusBadge({ status }: { status: BillStatus }) {
  const variants: Record<BillStatus, string> = {
    pending: "bg-warning/15 text-warning border-warning/30",
    paid: "bg-success/15 text-success border-success/30",
    overdue: "bg-destructive/15 text-destructive border-destructive/30",
    cancelled: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={variants[status]}>
      {statusLabel[status]}
    </Badge>
  );
}

function BillFormDialog({
  bill,
  cats,
  accs,
  onSaved,
}: {
  bill: Bill | null;
  cats: Cat[];
  accs: Acc[];
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [type, setType] = useState<"income" | "expense">(bill?.type ?? "expense");
  const [amount, setAmount] = useState(bill ? String(bill.amount).replace(".", ",") : "");
  const [description, setDescription] = useState(bill?.description ?? "");
  const [dueDate, setDueDate] = useState(bill?.due_date ?? todayISO());
  const [categoryId, setCategoryId] = useState(bill?.category_id ?? "");
  const [accountId, setAccountId] = useState(bill?.account_id ?? accs[0]?.id ?? "");
  const [recurrence, setRecurrence] = useState<Recurrence>(bill?.recurrence ?? "none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId && accs[0]) setAccountId(accs[0].id);
  }, [accs, accountId]);

  const filteredCats = cats.filter((c) => c.type === type);

  const submit = async () => {
    if (!user) return;
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) return toast.error("Informe um valor válido");
    if (!description.trim()) return toast.error("Informe uma descrição");
    setSaving(true);
    const payload = {
      user_id: user.id,
      type,
      amount: value,
      description: description.trim(),
      due_date: dueDate,
      recurrence,
      category_id: categoryId || null,
      account_id: accountId || null,
    };
    const { error } = bill
      ? await supabase.from("bills").update(payload).eq("id", bill.id)
      : await supabase.from("bills").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(bill ? "Conta atualizada" : "Conta criada");
    onSaved();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{bill ? "Editar conta" : "Nova conta"}</DialogTitle>
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
            A pagar
          </Button>
          <Button
            variant={type === "income" ? "default" : "outline"}
            onClick={() => {
              setType("income");
              setCategoryId("");
            }}
          >
            A receber
          </Button>
        </div>
        <div className="space-y-2">
          <Label>Descrição</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Aluguel, Internet..."
            maxLength={120}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
            <Label>Vencimento</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
        <div className="space-y-2">
          <Label>Recorrência</Label>
          <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem recorrência</SelectItem>
              <SelectItem value="weekly">Semanal</SelectItem>
              <SelectItem value="monthly">Mensal</SelectItem>
              <SelectItem value="yearly">Anual</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Ao marcar como paga, a próxima ocorrência é gerada automaticamente.
          </p>
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