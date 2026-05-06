import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, PiggyBank, Target } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/metas")({
  component: GoalsPage,
});

interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
}

function GoalsPage() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [creating, setCreating] = useState(false);
  const [contributing, setContributing] = useState<Goal | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("goals")
      .select("*")
      .order("created_at", { ascending: false });
    setGoals((data ?? []) as Goal[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const remove = async (id: string) => {
    if (!confirm("Excluir esta meta?")) return;
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Meta excluída");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Metas</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe seus objetivos de economia
          </p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" /> Nova meta
            </Button>
          </DialogTrigger>
          {creating && (
            <GoalDialog
              onClose={() => setCreating(false)}
              onSaved={() => {
                setCreating(false);
                load();
              }}
            />
          )}
        </Dialog>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Target className="h-10 w-10 text-primary" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Você ainda não tem metas. Crie uma para começar a economizar com objetivo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => {
            const target = Number(g.target_amount);
            const current = Number(g.current_amount);
            const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
            const done = current >= target && target > 0;
            return (
              <Card key={g.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        <h3 className="truncate font-semibold">{g.name}</h3>
                      </div>
                      {g.deadline && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Até {formatDate(g.deadline)}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(g)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(g.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="tabular-nums font-semibold">
                        {formatCurrency(current)}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        de {formatCurrency(target)}
                      </span>
                    </div>
                    <Progress
                      value={pct}
                      className={done ? "[&>div]:bg-success" : ""}
                    />
                    <div
                      className={`text-right text-xs tabular-nums ${
                        done ? "text-success" : "text-muted-foreground"
                      }`}
                    >
                      {pct}%{done ? " • concluída" : ""}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setContributing(g)}
                  >
                    <PiggyBank className="mr-2 h-4 w-4" /> Contribuir
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <GoalDialog
            existing={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Dialog>

      <Dialog open={!!contributing} onOpenChange={(o) => !o && setContributing(null)}>
        {contributing && (
          <ContributeDialog
            goal={contributing}
            onClose={() => setContributing(null)}
            onSaved={() => {
              setContributing(null);
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function GoalDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing?: Goal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [target, setTarget] = useState(existing ? String(existing.target_amount) : "");
  const [current, setCurrent] = useState(existing ? String(existing.current_amount) : "0");
  const [deadline, setDeadline] = useState(existing?.deadline ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error("Informe um nome");
    const t = Number(target.replace(",", "."));
    if (!Number.isFinite(t) || t <= 0) return toast.error("Valor alvo inválido");
    const c = Number(current.replace(",", ".")) || 0;
    if (c < 0) return toast.error("Valor atual inválido");
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user!.id;
    const payload = {
      name: name.trim(),
      target_amount: t,
      current_amount: c,
      deadline: deadline || null,
    };
    let error;
    if (existing) {
      ({ error } = await supabase.from("goals").update(payload).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("goals").insert({ ...payload, user_id: userId }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Meta salva");
    onSaved();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{existing ? "Editar meta" : "Nova meta"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Reserva de emergência"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Valor alvo (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-2">
            <Label>Valor atual (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="0,00"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Prazo (opcional)</Label>
          <Input type="date" value={deadline ?? ""} onChange={(e) => setDeadline(e.target.value)} />
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

function ContributeDialog({
  goal,
  onClose,
  onSaved,
}: {
  goal: Goal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const v = Number(amount.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return toast.error("Informe um valor válido");
    setSaving(true);
    const newAmount = Number(goal.current_amount) + v;
    const { error } = await supabase
      .from("goals")
      .update({ current_amount: newAmount })
      .eq("id", goal.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Contribuição registrada");
    onSaved();
  };

  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Contribuir para "{goal.name}"</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Valor (R$)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            autoFocus
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Atual: {formatCurrency(Number(goal.current_amount))} · Alvo:{" "}
          {formatCurrency(Number(goal.target_amount))}
        </p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Salvando..." : "Adicionar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}