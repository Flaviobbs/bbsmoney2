import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/app/orcamentos")({
  component: ComingSoon,
});

function ComingSoon() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orçamentos e metas</h1>
        <p className="text-sm text-muted-foreground">Em breve</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Construction className="h-10 w-10 text-primary" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Limites por categoria e metas de economia chegarão em breve.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
