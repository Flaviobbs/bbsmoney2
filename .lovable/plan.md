## 1) Filtro por categoria na aba "Transações"

Adicionar um terceiro filtro ao lado de busca/tipo, em `src/routes/app.transacoes.tsx`:

- Novo estado `filterCategory: string` ("all" por padrão).
- Novo `<Select>` "Categoria" listando todas as categorias do usuário (já carregadas em `cats`), com opção "Todas" e um separador visual entre receitas e despesas (ou simplesmente ordenadas por nome com pequeno indicador da cor).
- Aplicar o filtro em `filtered`: se `filterCategory !== "all"`, manter só transações com `category_id === filterCategory` (incluindo opção especial "Sem categoria" → `category_id === null`).
- Quando o usuário alterar o filtro de tipo (Receitas/Despesas) e a categoria selecionada não pertencer ao novo tipo, resetar `filterCategory` para "all".
- Layout responsivo: empilhar os selects abaixo da busca em telas estreitas.

## 2) Evitar duplicatas ao reprocessar PDFs

A causa: ao reprocessar um documento, a IA gera as mesmas sugestões e a aprovação (individual ou em lote) insere tudo novamente em `transactions`. Solução em duas camadas no `src/routes/app.documentos.tsx`:

### a) Detecção de duplicatas no momento da aprovação

Critério de duplicata (transação "idêntica"):

- mesmo `user_id`
- mesmo `date`
- mesmo `amount` (comparado como número)
- mesma `description` (case-insensitive, trim)

Antes de inserir (tanto no `approve` individual quanto no `bulkApprove`), consultar `transactions` filtrando por esses campos. Se houver match:

- **Aprovação individual**: abrir um diálogo de confirmação ("Já existe uma transação idêntica em DD/MM/AAAA no valor de R$ X. Deseja cadastrar mesmo assim?"). Botões: "Cadastrar duplicada" / "Pular".
- **Aprovação em lote**: para cada sugestão duplicada, acumular num diálogo único listando todas as duplicatas detectadas, com 3 ações: "Pular duplicadas" (insere apenas as únicas), "Cadastrar tudo mesmo assim" (insere todas), "Cancelar".

### b) Marcação visual nas sugestões

Ao expandir a lista de sugestões de um documento, fazer uma única consulta às transações do usuário para o intervalo de datas das sugestões e marcar cada item duplicado com um badge "Já cadastrada" (cinza). Itens duplicados ainda podem ser selecionados/aprovados, mas o usuário vê de antemão.

### Detalhes técnicos

- Consulta de duplicatas: `supabase.from("transactions").select("date,amount,description").eq("user_id", user.id).in("date", [datas...]).in("amount", [valores...])` e filtrar no cliente por descrição normalizada — evita N+1 e custa uma única ida ao banco por ação.
- Normalização de descrição: `.trim().toLowerCase()`.
- Comparação de valor: arredondar para 2 casas (`Math.round(n*100)`) para evitar problemas de float.
- Não alterar a lógica do endpoint `api.documents.process.ts` — a duplicação ocorre na aprovação, não na extração. As sugestões continuam sendo regeneradas normalmente ao reprocessar.

### Arquivos afetados

- `src/routes/app.transacoes.tsx` — novo filtro de categoria.
- `src/routes/app.documentos.tsx` — detecção de duplicatas, badge visual, diálogo de confirmação para aprovação individual e em lote.

Sem mudanças de schema nem de backend.