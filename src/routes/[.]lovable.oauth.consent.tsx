import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";

type AuthorizationDetails = {
  client?: { name?: string; redirect_uri?: string } | null;
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
};

type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

const oauthApi = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

function isSafeRelative(p: string | null): p is string {
  return !!p && p.startsWith("/") && !p.startsWith("//");
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId =
      new URLSearchParams(location.search).get("authorization_id") ?? "";
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-bold">Erro na autorização</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "Aplicativo externo";
  const redirectUri = details?.client?.redirect_uri;

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    const safe = isSafeRelative(target ?? null) || (target && /^https?:\/\//.test(target));
    if (!safe || !target) {
      setBusy(false);
      setError("Nenhum redirecionamento retornado.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="h-4 w-4" />
          </div>
          <span className="font-bold">BBSMoney</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          Conectar {clientName} à sua conta
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {clientName} poderá usar as ferramentas do BBSMoney em seu nome (ler transações,
          categorias, resumos e criar novas transações). Suas políticas de dados continuam
          valendo — apenas seus próprios dados serão acessados.
        </p>
        {redirectUri && (
          <p className="mt-3 break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
            Redirecionamento: {redirectUri}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => decide(false)}
          >
            Recusar
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy ? "Conectando..." : "Autorizar"}
          </Button>
        </div>
      </div>
    </main>
  );
}
