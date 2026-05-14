## Módulo de Processamento Avançado de Faturas — Insights com IA

Adicionar um pipeline de processamento de linhas de extrato/fatura de cartão na aba **Insights com IA** (`/app/insights`), com detecção de parcelas, cálculo de datas futuras, desduplicação, filtro de pagamentos de fatura e categorização com aprendizado em localStorage.

### Arquivos novos

1. **`src/types/ProcessedInvoice.ts`**
   - Interfaces: `InvoiceLine` (input), `ProcessedInvoiceLine`, `Correction`, `CategoryLearning`, `CategoryLearningStore`.
   - Schemas Zod: `invoiceLineSchema`, `processedInvoiceLineSchema` para validação na entrada do pipeline.

2. **`src/services/invoiceProcessor.ts`** (funções puras)
   - `detectParcel(description)` — regex multi-formato (`01/10`, `1/10`, `Parcela 1 de 10`, `Parcelado 3/12`, `px5/12`); valida `1 ≤ current ≤ total`.
   - `calculateDueDate(originalDate, parcelIndex)` — usa `addMonths` + `isValid` do date-fns; retorna ISO `yyyy-MM-dd` ou `null` com `console.error` estruturado.
   - `filterPayments(line)` — regex `/deb\s*autom|debito\s*automatico|pagamento\s*fatura|pag\s*fatura/i`; marca `paymentType: 'fatura'` e sinaliza para exclusão.
   - `deduplicate(lines)` — `Map<string, ProcessedInvoiceLine>` com chave `desc-value-date-parcelIdx|single`; preserva primeira ocorrência, marca demais como `isDuplicate`.
   - `suggestCategory(description, value)` — busca em localStorage com prefix/fuzzy match, retorna a de maior `frequency`.
   - `learnCategory(description, value, category)` — incrementa `frequency`, atualiza `lastUpdated`, persiste com try/catch.
   - Constante `LEARNING_STORAGE_KEY = 'bbsmoney_category_learning'`.

3. **`src/hooks/useInvoiceProcessing.ts`**
   - Estado: `processed`, `loading`, `error`, `corrections`.
   - Pipeline orquestrado em `process(lines)`: validação Zod → filtro pagamentos → expansão de parcelas (gerando 1 linha por parcela com data calculada) → desduplicação → sugestão de categoria.
   - `applyCategory(lineId, category)` — atualiza estado e chama `learnCategory`.
   - Memoização com `useCallback`.

4. **`src/components/InvoiceProcessorUI.tsx`**
   - Props: `{ invoiceLines: InvoiceLine[]; onProcessed: (p: ProcessedInvoiceLine[]) => void }`.
   - UI: botão "Processar", tabela responsiva (mobile-first) com colunas Descrição, Valor, Data calculada, Parcela (`x/y`), Categoria sugerida + select para corrigir, badge para duplicatas/pagamentos filtrados.
   - Estilos via tokens do design system (`bg-card`, `text-muted-foreground`, `bg-primary`, etc.) — sem cores hard-coded.
   - Componentes shadcn existentes: `Card`, `Button`, `Table`, `Badge`, `Select`.

5. **`src/hooks/__tests__/useInvoiceProcessing.test.ts`**
   - Vitest. Mínimo 3 casos por feature: detectParcel (formatos válidos/inválidos/edge), calculateDueDate (parcela 1, parcela N, data inválida), deduplicate (duplicatas exatas, variações de case, chaves distintas por parcela), filterPayments (3 padrões), suggestCategory/learnCategory (vazio, prefix match, incremento de frequency).

### Integração na aba Insights

Editar **`src/routes/app.insights.tsx`**: adicionar um `Card` "Processamento de Fatura" abaixo do botão "Gerar insight do mês", com um `Textarea`/upload simples para colar linhas no formato `data;descrição;valor` (parser leve inline → `InvoiceLine[]`) e renderizar `<InvoiceProcessorUI />`. O callback `onProcessed` apenas exibe um toast de sucesso por enquanto (sem gravar transações automaticamente — respeita RN05/RN06 do projeto).

### Detalhes técnicos

- TypeScript estrito, sem `any`. Tipos discriminados em `paymentType` e `isParcel`.
- date-fns já está no projeto; Zod precisa de verificação — se ausente, instalar com `bun add zod` antes de escrever os arquivos.
- localStorage isolado por try/catch; SSR-safe (`typeof window !== 'undefined'`) já que o app roda em TanStack Start.
- Sem alterações em rotas, estado global, App.tsx, Header, useExtratoParser, Invoice.ts, validators.ts ou configs — apenas adições.
- Não persiste transações no Supabase neste escopo; o módulo é puramente client-side e produz preview para o usuário.

### Diagrama do pipeline

```text
InvoiceLine[] (raw)
   │
   ▼
[Zod validate] ─► erro → state.error
   │
   ▼
[filterPayments]  ──► paymentType='fatura' descartadas
   │
   ▼
[expandParcels]   ──► 1 linha por parcela, data = original + (i-1) meses
   │
   ▼
[deduplicate]     ──► Map por chave única
   │
   ▼
[suggestCategory] ──► localStorage learning store
   │
   ▼
ProcessedInvoiceLine[]  →  UI tabela  →  applyCategory → learnCategory
```
