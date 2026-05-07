## Status atual

- **Fase 1** ✅ Auth, contas, categorias, transações, dashboard básico
- **Fase 2** ✅ Contas a pagar/receber com recorrência
- **Fase 3** ✅ Orçamentos por categoria e metas

## Fase 4 — Inteligência (próxima)

Foco em diferenciar o produto via IA e automação leve, conforme RF10–RF15 do documento de requisitos.

### 4.1 Upload e processamento de PDFs (RF10–RF12)

- Bucket de Storage `documents` (privado, RLS por `user_id`)
- Tabelas `documents` e `document_extractions`
- Página `/app/documentos`: upload, lista com status (`uploaded`/`processing`/`processed`/`failed`)
- Edge function `extract-pdf-text`: baixa PDF do storage, extrai texto (pdf-parse) e salva
- Edge function `suggest-transactions-from-pdf`: usa Lovable AI (`google/gemini-2.5-flash`) para sugerir transações estruturadas (descrição, valor, data, categoria)
- UI de aprovação: usuário revisa cada sugestão antes de virar `transaction` (origem `pdf`)

### 4.2 API de entrada simulada tipo WhatsApp (RF13)

- Edge function pública `simulate-whatsapp-entry` (sob `/api/public/` ou edge function direta)
- Recebe `{ message, user_id }`, usa Lovable AI para extrair valor/categoria/tipo/data
- Cria `transaction` com `source='whatsapp_simulado'`
- Tela de teste em `/app/configuracoes` com input + curl de exemplo

### 4.3 Insights financeiros com IA (RF14–RF15)

- Tabela `ai_insights` (period_start, period_end, summary, recommendations, risk_alerts)
- Edge function `generate-financial-insights`: agrega transações do mês (totais por categoria, evolução, top despesas) e envia agregados para Lovable AI
- Página `/app/insights`: botão "Gerar insights do mês", histórico de análises anteriores
- Card resumo no dashboard com último insight

### 4.4 Ajustes de modelo

Migration adicionando:
- `transactions.source` (enum: `manual`/`pdf`/`whatsapp_simulado`/`ia`), default `manual`
- `transactions.merchant`, `transactions.notes`, `transactions.document_id`
- Tabelas `documents`, `document_extractions`, `ai_insights`, `ingestion_logs`

## Escopo recomendado para esta fase

Sugiro dividir em **duas entregas** para manter previsibilidade:

- **Fase 4a**: Insights com IA (4.3 + ajustes mínimos de modelo) — entrega rápida, alto valor percebido
- **Fase 4b**: PDFs + WhatsApp simulado (4.1 + 4.2) — mais complexa, envolve storage e parsing

## Fora do escopo (Fase 5+)

WhatsApp real, Open Finance, OCR de PDFs escaneados, importação CSV, app mobile, modo familiar, previsão de fluxo de caixa.

## Pergunta

Quer que eu comece pela **4a (Insights IA)** ou prefere ir direto para a **4b (PDFs + WhatsApp simulado)**? Ou seguir as duas juntas como Fase 4 completa?