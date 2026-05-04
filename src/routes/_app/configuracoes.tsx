import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setName(data?.display_name ?? ""));
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil</p>
      </div>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>Nome de exibição</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" onClick={signOut}>
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
