import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/categorias")({
  component: CategoriesPage,
});

interface Cat {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string;
  icon: string;
  parent_id: string | null;
}

const COLORS = ["#a855f7", "#22c55e", "#ef4444", "#0ea5e9", "#f97316", "#eab308", "#ec4899", "#64748b"];

function CategoriesPage() {
  const { user } = useAuth();
  const [cats, setCats] = useState<Cat[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("categories").select("*").order("type").order("name");
    setCats((data ?? []) as Cat[]);
  };
  useEffect(() => {
    if (user) load();
  }, [user]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Categoria excluída");
    load();
  };

  const expense = cats.filter((c) => c.type === "expense");
  const income = cats.filter((c) => c.type === "income");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorias</h1>
          <p className="text-sm text-muted-foreground">Personalize suas categorias</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" /> Nova categoria
            </Button>
          </DialogTrigger>
          <CategoryDialog
            onSaved={() => {
              setOpen(false);
              load();
            }}
          />
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CategoryList title="Despesas" items={expense} onDelete={remove} onReload={load} />
        <CategoryList title="Receitas" items={income} onDelete={remove} onReload={load} />
      </div>
    </div>
  );
}

function CategoryList({
  title,
  items,
  onDelete,
  onReload,
}: {
  title: string;
  items: Cat[];
  onDelete: (id: string) => void;
  onReload: () => void;
}) {
  const parents = items.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => items.filter((c) => c.parent_id === id);
  const [subOpenFor, setSubOpenFor] = useState<Cat | null>(null);
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h2>
        {parents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sem categorias</p>
        ) : (
          <ul className="space-y-1">
            {parents.map((c) => {
              const subs = childrenOf(c.id);
              return (
                <li key={c.id} className="rounded-lg hover:bg-accent/20">
                  <div className="flex items-center justify-between px-2 py-2">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="text-sm font-medium">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setSubOpenFor(c)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Subcategoria
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => onDelete(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {subs.length > 0 && (
                    <ul className="ml-6 border-l pl-3">
                      {subs.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-accent/30"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: s.color }}
                            />
                            <span className="text-sm text-muted-foreground">{s.name}</span>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => onDelete(s.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <Dialog open={!!subOpenFor} onOpenChange={(v) => !v && setSubOpenFor(null)}>
        {subOpenFor && (
          <SubcategoryDialog
            parent={subOpenFor}
            onSaved={() => {
              setSubOpenFor(null);
              onReload();
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function SubcategoryDialog({ parent, onSaved }: { parent: Cat; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(parent.color);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error("Informe um nome");
    setSaving(true);
    const { error } = await supabase.from("categories").insert({
      name: name.trim(),
      type: parent.type,
      color,
      icon: "Tag",
      parent_id: parent.id,
      user_id: (await supabase.auth.getUser()).data.user!.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Subcategoria criada");
    onSaved();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Nova subcategoria de "{parent.name}"</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Supermercado"
          />
        </div>
        <div className="space-y-2">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
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

function CategoryDialog({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error("Informe um nome");
    setSaving(true);
    const { error } = await supabase.from("categories").insert({
      name: name.trim(),
      type,
      color,
      icon: "Tag",
      user_id: (await supabase.auth.getUser()).data.user!.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Categoria criada");
    onSaved();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Nova categoria</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pets" />
        </div>
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select value={type} onValueChange={(v) => setType(v as "income" | "expense")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Despesa</SelectItem>
              <SelectItem value="income">Receita</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
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
