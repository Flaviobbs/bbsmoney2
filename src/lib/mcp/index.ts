import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTransactions from "./tools/list-transactions";
import createTransaction from "./tools/create-transaction";
import listCategories from "./tools/list-categories";
import monthlySummary from "./tools/monthly-summary";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "bbsmoney-mcp",
  title: "BBSMoney",
  version: "0.1.0",
  instructions:
    "Ferramentas para o BBSMoney, um SaaS de finanças pessoais. Use `list_transactions` e `monthly_summary` para consultar dados, `list_categories` para obter categorias e `create_transaction` para registrar novas transações.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTransactions, createTransaction, listCategories, monthlySummary],
});
