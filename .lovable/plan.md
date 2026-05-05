# Fase 2 — Contas a pagar/receber funcionais

Substituir a página placeholder `/app/contas` por um módulo completo de contas com vencimentos, status, recorrências e geração automática de transação ao marcar como pago. Também integrar "próximas contas" no Dashboard.

## Escopo

1. **Página `/app/contas`** (`src/routes/app.contas.tsx`) — substituir placeholder.
2. **Componente `BillFormDialog`** — criar/editar contas.
3. **Helpers de recorrência** em `src/lib/bills.ts`.
4. **Atualização do Dashboard** — card "Próximas contas (7 dias)".

## Funcionalidades

### Listagem
- Tabs: **Todas | Pendentes | Pagas | Atrasadas**.
- Filtros: tipo (despesa/receita), categoria, intervalo de vencimento.
- Colunas: descrição, categoria, valor, vencimento, status, ações.
- Badge de status colorido (pendente=amarelo, pago=verde, atrasado=vermelho, cancelado=cinza).
- Marcação automática de "atrasado": contas `pending` com `due_date < hoje` são exibidas como atrasadas (visual no client; status real só muda ao agir).

### Criar / Editar
Dialog com campos: descrição, valor, tipo (income/expense), categoria (filtrada por tipo), conta, data de vencimento, recorrência (none/weekly/monthly/yearly).

### Ações por linha
- **Marcar como pago** → cria `transactions` row (mesma categoria/conta/valor/tipo, `date = hoje`, descrição com prefixo "Pagamento: "), atualiza bill: `status='paid'`, `paid_transaction_id=<id>`. Se houver recorrência ≠ none, cria automaticamente a próxima ocorrência (`status='pending'`, novo `due_date` calculado).
- **Cancelar** → status='cancelled'.
- **Reabrir** (se pago/cancelado) → volta para 'pending', se houver `paid_transaction_id` deleta a transação vinculada.
- **Editar** / **Excluir**.

### Recorrência
Helper `nextDueDate(date, recurrence)`:
- weekly: +7 dias
- monthly: +1 mês (mantém dia, ajusta fim de mês)
- yearly: +1 ano

A próxima ocorrência só é gerada quando a conta atual é paga (modelo simples, evita explosão de registros futuros).

### Dashboard
Adicionar Card "Próximas contas" listando até 5 bills com `status='pending'` e `due_date` entre hoje e hoje+7 dias, ordenadas por vencimento. Cada item linka para `/app/contas`.

## Detalhes técnicos

- Usar `supabase` client direto (padrão já adotado nas outras páginas Fase 1).
- Toda operação em uma função async com try/catch + `toast` (sonner).
- Após mutation, refetch via `useQuery` invalidation OU re-busca local via `useState` + `useEffect` (manter consistência com `transacoes.tsx` — verificar padrão).
- RLS já cobre tudo (`bills_all_own`, `transactions_all_own`); incluir `user_id: user.id` em todos os inserts.
- Datas: usar `date-fns` (já em uso) com locale pt-BR.
- Validação: bloquear amount ≤ 0 e campos obrigatórios via UI; sem schema lib nova.

## Arquivos a criar/editar

```text
edit    src/routes/app.contas.tsx        # substitui placeholder
create  src/components/app/BillFormDialog.tsx
create  src/lib/bills.ts                 # nextDueDate + helpers
edit    src/routes/app.index.tsx         # adiciona card "Próximas contas"
```

## Fora de escopo (Fase 3)
Orçamentos, metas, alertas de limite, lembretes por email, geração antecipada de várias ocorrências futuras.
