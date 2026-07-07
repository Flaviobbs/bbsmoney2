## Objetivo

Enriquecer o processamento de faturas de cartão para:
1. Identificar e armazenar o **cartão** (últimos 4 dígitos) de cada transação, com filtros por cartão nas telas de transações e dashboards.
2. Diferenciar **compras parceladas** (`purchase_type = 'installment'`) de **compras à vista** (`purchase_type = 'cash'`), sem alterar categorias.
3. **Reprocessar faturas preservando** categorias já aplicadas e sinalizando transações já lançadas como "Já lançada" (checkbox desabilitado).

Sem migração destrutiva, sem alteração de RLS, sem remover dados existentes.

---

## Regras de classificação

**Cartão (`card_last4`)**
- Extrair o(s) padrão(ões) `\b\d{4}\s?\d{4}\s?\d{4}\s?(\d{4})\b` do texto do PDF, e também blocos mascarados `\*{4,}\s?(\d{4})` / `XXXX\s?(\d{4})`.
- Detectar cabeçalhos de bloco por titular ("PORTADOR: NOME", "TITULAR", "ADICIONAL", "@nome") e o último-4 associado ao bloco; associar cada linha subsequente até o próximo cabeçalho.
- Compras "online"/"internet"/marcadas com "@" na descrição, quando não houver últimos-4 no bloco, recebem `card_last4 = '@online'` (armazenado como string, aceita o `@`).
- Não conseguindo determinar → `card_last4 = null` (comportamento atual).

**Tipo de compra (`purchase_type`)**
- Se a IA marca `parcela_atual`/`parcela_total`, ou o regex `detectParcel` da descrição encontra parcela → `installment`.
- Caso contrário → `cash`.
- Categoria (Alimentação, Transporte, etc.) permanece inalterada.

---

## Regras de reprocessamento

**Preservação de categoria**
- Antes de chamar a IA, carregar transações anteriores do mesmo `document_id` em um map `{ dedupKey → { category_id, purchase_type } }`.
- Após a IA responder, para cada sugestão:
  - Se existe transação com mesma `(date, amount, description)` (ou mesmo `card_last4 + parcela`), sobrescrever `categoria` com a categoria salva.
  - Marcar sugestão como `alreadyImported: true` e anexar `existingTxId`.
- Aprendizado local (`learnCategory`) já existente continua sendo aplicado para sugestões novas.

**Sinalização "Já lançada"**
- No `document_extractions.suggestions`, cada item ganha campos opcionais `already_imported`, `existing_tx_id`, `card_last4`, `purchase_type`.
- Na UI de sugestões:
  - Badge cinza "Já lançada" no lugar do checkbox.
  - Checkbox desabilitado; botões Aprovar/Rejeitar ocultos para esses itens.
  - Filtros existentes (Ocultar duplicadas) passam a considerar `already_imported`.
  - "Selecionar todos" ignora as já lançadas.

---

## Alterações no banco (migração única, aditiva)

```sql
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS purchase_type text
    CHECK (purchase_type IN ('cash','installment')) DEFAULT 'cash';

CREATE INDEX IF NOT EXISTS transactions_card_last4_idx
  ON public.transactions (user_id, card_last4);
```

- Colunas nullable/com default → nenhum registro existente é afetado.
- Nenhuma alteração em `documents`, `document_extractions.status`, RLS, policies ou triggers.

---

## Alterações no código

**`src/routes/api.documents.process.ts`**
- Antes do call de IA, carregar `existingTx` do `document_id` e enviar um dicionário `contexto_categorias` no prompt para reforço.
- Ampliar tool-schema: adicionar `card_last4?: string` e usar `parcela_total > 1` para inferir `installment`.
- Pós-processamento: para cada sugestão, resolver `already_imported` cruzando com `existingTx` (chave `date|amount|description` normalizada) e injetar `card_last4`/`purchase_type`.
- Ao gravar transações, gravar também `card_last4` e `purchase_type`.

**`src/services/invoiceProcessor.ts`**
- Novos helpers: `extractCardLast4(text: string)`, `assignCardBlocks(lines, rawText)`, `derivePurchaseType(suggestion)`.
- Ampliar `ProcessedInvoiceLine` com `cardLast4`, `purchaseType`, `alreadyImported`, `existingTxId`.

**`src/routes/app.documentos.tsx`**
- Renderizar badge "Já lançada", desabilitar checkbox, ocultar Aprovar/Rejeitar dessas linhas.
- Exibir chip com `card_last4` ao lado da descrição.
- `bulkApprove`/`toggleSelectAll` ignoram itens `already_imported`.
- Ao inserir/reaproveitar, propagar `card_last4` e `purchase_type` no `insertOne`/`runBulkInsert`.

**`src/routes/app.transacoes.tsx`**
- Novo filtro "Cartão" (select com valores distintos de `card_last4` do usuário + opção "Todos" + opção "@online").
- Coluna/badge discreta mostrando `•••• 4437` ou `@online` quando presente.
- Filtro "Tipo" ganha alternador "À vista / Parcelado" (aplica sobre `purchase_type`).

**`src/routes/app.index.tsx` (dashboard)**
- Card lateral "Por cartão" (agrupa gasto do mês por `card_last4`), somatório geral mantido como está.

---

## Compatibilidade e integridade

- Migração 100% aditiva; nenhum `DROP`, nenhum `UPDATE` em massa. Registros antigos continuam com `card_last4 = null` e `purchase_type = 'cash'` (default) — visualmente aparecem como "sem cartão / à vista", sem perda de dado.
- Índice único `transactions_dedup_idx (user_id, date, amount, description)` inalterado — reaprovação segue bloqueada pelo `ignoreDuplicates: true` já existente.
- `document_extractions.suggestions` é jsonb livre; campos novos são opcionais e ignorados por leitores antigos.
- Aprendizado local (`localStorage`) permanece e continua funcionando.
- Nenhum arquivo autogerado (`client.ts`, `types.ts`) editado à mão — os tipos são regenerados após a migração.

---

## Validação

1. Reprocessar uma fatura já processada: sugestões com match aparecem com badge "Já lançada" e checkbox desabilitado; categorias preservadas.
2. Fatura com múltiplos titulares: cada bloco recebe seu `card_last4`; filtro por cartão em Transações mostra somente o correspondente.
3. Compra "PARC 03/12" gravada com `purchase_type = 'installment'`; compra normal gravada como `'cash'`.
4. Filtro "Todos os cartões" no dashboard mantém somatório histórico idêntico ao de antes da migração.
5. Transações antigas continuam visíveis, editáveis e filtráveis (com `card_last4 = null`).
