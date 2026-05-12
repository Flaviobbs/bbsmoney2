## Tema claro/escuro

Adicionar suporte a tema claro com seletor na página de Configurações.

### O que será feito

1. **Tokens de cor para tema claro** (`src/styles.css`)
   - Hoje só existe o tema escuro em `:root`. Criar bloco `.light` (ou `:root.light`) com a paleta clara equivalente para todos os tokens (`--background`, `--foreground`, `--card`, `--primary`, `--sidebar`, gradientes, etc.), mantendo a identidade roxa do BBSMoney.

2. **ThemeProvider** (`src/lib/theme.tsx` — novo)
   - Contexto React com `theme: "light" | "dark" | "system"` e `setTheme()`.
   - Aplica a classe `light`/`dark` no `<html>`.
   - Persiste em `localStorage` (`bbsmoney-theme`).
   - Padrão: `system` (segue preferência do SO via `prefers-color-scheme`).

3. **Integração no root** (`src/routes/__root.tsx`)
   - Envolver a árvore com `<ThemeProvider>` dentro do `AuthProvider`.

4. **Seletor em Configurações** (`src/routes/app.configuracoes.tsx`)
   - Novo card "Aparência" com 3 opções (Claro / Escuro / Sistema) usando `RadioGroup` ou `Select`.
   - Mudança aplica imediatamente, sem reload.

### Detalhes técnicos

- A troca é puramente client-side; não precisa migração nem alteração no backend.
- Para evitar flash de tema errado no SSR, o ThemeProvider lê `localStorage` no `useEffect` inicial e aplica a classe antes do primeiro render visível.
- Componentes existentes já usam tokens semânticos (`bg-background`, `text-foreground`, etc.), então não precisam de ajustes — basta os tokens claros existirem.