## Objetivo
Criar e integrar um favicon moderno e responsivo para o BBSMoney, com símbolo de dinheiro, que permaneça bem visível tanto em abas de navegador com tema claro quanto escuro.

## Estado atual
- Pasta `public/` vazia.
- `src/routes/__root.tsx` não referencia nenhum favicon.
- Tema escuro é o padrão do app, mas há suporte a tema claro via `ThemeProvider`.

## Plano de execução

### 1. Gerar ícone base
- Usar `imagegen` para gerar um ícone PNG 512×512.
- Conceito: forma arredondada (quadrado com cantos arredondados ou círculo) com fundo na cor primária do projeto (roxo/violeta) e um símbolo de moeda/cifrão em branco ou tom claro.
- Isso garante contraste em abas claras e escuras sem depender de `prefers-color-scheme`.

### 2. Redimensionar para formatos de favicon
- Converter/redimensionar o PNG 512×512 para:
  - `favicon.ico` (multi-resolução: 16×16, 32×32, 48×48)
  - `favicon-32x32.png`
  - `favicon-16x16.png`
  - `apple-touch-icon.png` (180×180)
- Usar ImageMagick (`convert`) via `code--exec` para gerar os tamanhos e o ICO.

### 3. Integrar no projeto
- Mover/copiar os arquivos gerados para a pasta `public/`.
- Adicionar as tags `<link rel="...">` no `head().links` de `src/routes/__root.tsx` para referenciar os favicons.

## Critérios de aceite
- [ ] Favicon visível na aba do navegador no tema escuro.
- [ ] Favicon visível na aba do navegador no tema claro.
- [ ] Apple touch icon presente para iOS.
- [ ] Nenhum erro 404 para favicon no painel de rede.