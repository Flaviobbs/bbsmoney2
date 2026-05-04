# BBSMoney — SaaS de Controle Financeiro Pessoal

App web com tema dark estilo fintech (Nubank/Revolut), focado em pessoas físicas que querem organizar receitas, despesas, contas e metas.

## Identidade visual

- Tema escuro como padrão (background quase preto com tons de roxo profundo).
- Cor primária: roxo vibrante (acento de marca, botões, gráficos).
- Cores semânticas: verde para receitas/positivo, vermelho para despesas/negativo, amarelo para alertas.
- Tipografia moderna sans-serif, números tabulares para valores.
- Cards com bordas suaves, leve glassmorphism, gráficos minimalistas.

## Autenticação

- Cadastro e login por email + senha (Lovable Cloud).
- Proteção leaked password (HIBP) ativada.
- Tabela `profiles` com nome de exibição, criada automaticamente via trigger no signup.
- Rotas protegidas atrás de layout `_authenticated`; tela de login pública.

## Estrutura de rotas

```text
/                       Landing pública (hero, features, CTA)
/login                  Login + link para cadastro
/signup                 Cadastro
/app                    Dashboard (protegido)
/app/transacoes         Lista e CRUD de transações
/app/contas             Contas a pagar/receber
/app/orcamentos         Orçamentos por categoria + metas
/app/categorias         Gerenciar categorias
/app/configuracoes      Perfil e preferências
```

Sidebar colapsável (shadcn) com navegação entre as seções do app.

## Funcionalidades do MVP

### 1. Transações e categorias
- Cadastrar receitas e despesas com: valor, data, descrição, categoria, conta/método de pagamento, tipo (receita/despesa).
- Categorias pré-populadas (Alimentação, Moradia, Transporte, Lazer, Salário, etc.) + criar/editar/excluir.
- Cada categoria tem ícone e cor.
- Filtros por período, categoria, tipo. Busca por descrição.

### 2. Dashboard com gráficos
- Cards de topo: saldo do mês, total de receitas, total de despesas, economia (%).
- Gráfico de pizza/donut: despesas por categoria no mês.
- Gráfico de linha/barras: evolução de receitas vs despesas nos últimos 6 meses.
- Lista das últimas transações.
- Próximas contas a vencer (próximos 7 dias).

### 3. Contas a pagar/receber
- Lançamentos futuros com data de vencimento e status (pendente, pago, atrasado).
- Marcação de "pago" gera automaticamente uma transação real.
- Recorrências (mensal, semanal, anual) com geração das próximas ocorrências.
- Indicadores visuais para contas atrasadas.

### 4. Orçamentos e metas
- Definir limite mensal por categoria; barra de progresso mostra quanto já foi gasto.
- Alertas visuais quando ultrapassa 80% / 100%.
- Metas de economia: valor alvo, prazo, progresso atual baseado nas economias do período.

## Modelo de dados (Lovable Cloud)

- `profiles` — id (FK auth.users), display_name, created_at.
- `categories` — id, user_id, name, type (income/expense), color, icon.
- `accounts` — id, user_id, name, type (checking/credit/cash), initial_balance.
- `transactions` — id, user_id, account_id, category_id, type, amount, description, date, created_at.
- `bills` — id, user_id, category_id, account_id, description, amount, due_date, status, recurrence, paid_transaction_id.
- `budgets` — id, user_id, category_id, month, limit_amount.
- `goals` — id, user_id, name, target_amount, deadline, current_amount.

Todas as tabelas com RLS — cada usuário enxerga apenas seus próprios registros.

## Entregas por fases

**Fase 1 (este plano):** landing, autenticação, layout do app com sidebar, dashboard com dados de exemplo, CRUD de transações e categorias, schema do banco completo com RLS.

**Fase 2 (próximo prompt):** Contas a pagar/receber + recorrências.

**Fase 3:** Orçamentos e metas com alertas.

Quer que eu siga assim ou ajusta algo antes?
