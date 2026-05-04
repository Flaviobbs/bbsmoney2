import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  PieChart,
  CalendarClock,
  Target,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40">
        <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[var(--shadow-glow)]">
              <Wallet className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold tracking-tight">BBSMoney</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Criar conta</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section
        className="relative overflow-hidden"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="container mx-auto max-w-6xl px-4 py-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Novo: dashboard com gráficos em tempo real
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Controle financeiro{" "}
            <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              sem complicação
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Receitas, despesas, contas a pagar e metas em um único painel
            elegante. Tome decisões melhores com seu dinheiro.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="shadow-[var(--shadow-glow)]">
              <Link to="/signup">
                Começar grátis <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Já tenho conta</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container mx-auto max-w-6xl px-4 py-20">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">
          Tudo o que você precisa para organizar suas finanças
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: PieChart,
              title: "Dashboard visual",
              desc: "Gráficos por categoria e evolução mensal de receitas e despesas.",
            },
            {
              icon: Wallet,
              title: "Transações",
              desc: "Cadastre receitas e despesas em segundos com categorias customizáveis.",
            },
            {
              icon: CalendarClock,
              title: "Contas a pagar",
              desc: "Lembretes de vencimento e recorrências automáticas.",
            },
            {
              icon: Target,
              title: "Orçamentos & metas",
              desc: "Defina limites por categoria e acompanhe suas metas de economia.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition hover:border-primary/40"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1 font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto max-w-6xl px-4 pb-24">
        <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-card to-card/40 p-10 text-center">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Seus dados, seu controle
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Criptografia em repouso e em trânsito. Apenas você acessa as suas
            informações financeiras.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/signup">Criar minha conta</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} BBSMoney. Todos os direitos reservados.
      </footer>
    </div>
  );
}
