## Plano das 7 melhorias

### 1. Indicador de progresso ao processar PDF (`src/routes/app.documentos.tsx`)
Mostrar barra de progresso animada com etapas estimadas enquanto o servidor processa:
- 0–15%: "Baixando PDF…"
- 15–40%: "Extraindo texto…"
- 40–95%: "Analisando com IA (Gemini)…"
- 100%: ao receber a resposta

Como o backend não emite progresso real, simulamos com `setInterval` que avança suavemente até 95% e completa ao receber o JSON. Tempo total estimado exibido (~30–60s). Substitui o ícone girando que parecia travado.

### 2. Aprendizado retroativo nas sugestões do PDF (`src/routes/app.documentos.tsx`)
Hoje o aprendizado (localStorage) só é aplicado no `InvoiceProcessorUI` (cola de texto), não no fluxo principal de PDF. Mudanças:
- Quando as sugestões chegarem do servidor, rodar cada uma por `suggestCategoryDetailed`. Se houver match de **alta** confiança no aprendizado, substituir a categoria do AI pela aprendida (e marcar com badge "Aprendido").
- Permitir que o usuário troque a categoria de cada sugestão antes de aprovar (Select novo na linha da sugestão).
- Ao aprovar (individual ou em lote), chamar `learnCategory(descricao, valor, categoriaFinal)` para que próximos PDFs reaproveitem.
- O `EditCategoryDialog` (em `app.transacoes.tsx`) também passa a chamar `learnCategory` ao salvar — assim qualquer categorização manual alimenta o aprendizado.

### 3. Agrupar transações por mês ou categoria (`src/routes/app.transacoes.tsx`)
Adicionar `Select` "Agrupar por": **Categoria** (atual, default) | **Mês**. Quando "Mês", cada card é um mês ("Janeiro 2026") com total receitas/despesas/saldo e linhas ordenadas por data desc.

### 4. Seleção múltipla de transações (`src/routes/app.transacoes.tsx`)
- Checkbox por transação dentro de cada grupo + checkbox "Selecionar todas as visíveis" no topo.
- Barra de ação fixa quando há seleção: **Mudar categoria…** (abre diálogo com Select de categoria), **Excluir** (confirmação).
- Mudar categoria em lote também alimenta `learnCategory` para cada linha selecionada.

### 5. Seletor de período em Insights com IA (`src/routes/app.insights.tsx` + `src/routes/api.insights.generate.ts`)
- UI: mesmo padrão do dashboard (1m / 3m / 6m / 12m / Personalizado).
- API: aceitar `period_start` e `period_end` no body POST; usar esses valores no lugar do mês corrente fixo. Mantém compatibilidade (sem body = mês atual).

### 6. Seletor de período no Dashboard (`src/routes/app.index.tsx`)
**Já implementado** numa rodada anterior (Select com 1m/3m/6m/12m/personalizado + datas custom). Vou apenas verificar que o `1m` mostra realmente o mês corrente e não 2 meses; corrigir a definição se necessário (`periodStart` para 1m: primeiro dia do mês corrente, não do mês anterior).

### 7. Backup dos dados (`src/routes/app.configuracoes.tsx`)
Novo card "Backup". Botão **Baixar backup (JSON)** exporta um arquivo `bbsmoney-backup-AAAA-MM-DD.json` com:
- profiles, accounts, categories, transactions, bills, budgets, goals, ai_insights, document_extractions, ingestion_logs (somente do usuário, via RLS).
Tudo lido com `supabase.from(...).select("*")` e salvo client-side via `Blob` + `URL.createObjectURL`. Importação fica para depois (mais complexo e exige validação de IDs).

## Arquivos afetados

- `src/routes/app.documentos.tsx` — progresso + aprendizado + seleção de categoria por sugestão
- `src/routes/app.transacoes.tsx` — agrupar por mês/categoria + seleção múltipla + learnCategory ao salvar
- `src/routes/app.insights.tsx` — seletor de período
- `src/routes/api.insights.generate.ts` — aceitar período no body
- `src/routes/app.index.tsx` — ajuste fino no preset "1m" se necessário
- `src/routes/app.configuracoes.tsx` — card de backup

Nenhuma migration de banco. Nenhum dado é apagado. Mudanças aditivas — fluxos atuais continuam funcionando.
