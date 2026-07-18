import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

function safeNext(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export function GoogleSignInButton({
  label = "Continuar com Google",
  next,
}: {
  label?: string;
  next?: string;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const safe = safeNext(next);

  const onClick = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + (safe ?? "/app"),
    });
    if (result.error) {
      setLoading(false);
      toast.error(result.error.message || "Falha ao entrar com Google");
      return;
    }
    if (result.redirected) return;
    if (safe) window.location.href = safe;
    else navigate({ to: "/app" });
  };

  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick} disabled={loading}>
      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.74-6-6.1s2.7-6.1 6-6.1c1.9 0 3.16.8 3.88 1.5l2.65-2.55C16.9 3.4 14.7 2.5 12 2.5 6.98 2.5 2.9 6.58 2.9 11.6S6.98 20.7 12 20.7c6.93 0 9.2-4.85 9.2-7.4 0-.5-.05-.88-.12-1.25H12z"/>
      </svg>
      {loading ? "Conectando..." : label}
    </Button>
  );
}
