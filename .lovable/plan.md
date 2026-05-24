## Contexto

Já existe um trigger `handle_new_user()` em Postgres que, ao criar um usuário, insere automaticamente:

- 8 categorias de despesa: Alimentação, Moradia, Transporte, Lazer, Saúde, Educação, Compras, Outros
- 4 categorias de receita: Salário, Freelance, Investimentos, Outras receitas
- 1 conta padrão "Conta Principal"

O pedido é garantir **pelo menos 10 categorias principais pré-configuradas, cada uma com cor distinta**, em todo novo cadastro. Hoje temos 8 de despesa — abaixo do mínimo solicitado se considerarmos apenas despesas. Vou expandir para 12 categorias de despesa (cobrindo as 10 principais do escopo do BBSMoney + algumas extras úteis), cada uma com cor única e ícone próprio.

## Mudanças

### 1. Migration: atualizar `handle_new_user()`

Substituir a lista de categorias de despesa por 12 itens, todos com cores únicas e distintas das categorias de receita:

| Categoria         | Cor       | Ícone           |
|-------------------|-----------|-----------------|
| Alimentação       | `#f97316` | Utensils        |
| Supermercado      | `#16a34a` | ShoppingCart    |
| Moradia           | `#0ea5e9` | Home            |
| Transporte        | `#14b8a6` | Car             |
| Saúde             | `#ef4444` | HeartPulse      |
| Educação          | `#eab308` | GraduationCap   |
| Lazer             | `#a855f7` | Gamepad2        |
| Compras           | `#ec4899` | ShoppingBag     |
| Assinaturas       | `#8b5cf6` | Repeat          |
| Contas e Serviços | `#6366f1` | Receipt         |
| Pets              | `#f59e0b` | PawPrint        |
| Outros            | `#64748b` | Tag             |

Categorias de receita permanecem (Salário, Freelance, Investimentos, Outras receitas) com suas cores atuais — já distintas entre si.

### 2. Backfill opcional para o usuário atual

Como você é o único usuário ativo do projeto e provavelmente já tem categorias, **não** vou sobrescrever as existentes. A migration cobre apenas novos cadastros. Se quiser, posso adicionar um bloco que insere apenas as categorias novas (Supermercado, Assinaturas, Contas e Serviços, Pets) para usuários que ainda não as tenham — me avise se preferir essa opção.

## Arquivos afetados

- Nova migration SQL substituindo a função `public.handle_new_user()` (mantém o trigger e o restante do comportamento: criação de perfil e conta padrão).

Nenhuma alteração de frontend é necessária — a tela de Categorias já lê dinamicamente da tabela.