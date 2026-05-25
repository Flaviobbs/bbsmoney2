// Catálogo de keywords de comerciantes brasileiros conhecidos para
// categorização automática imediata, sem depender do aprendizado do usuário.
// Cada entrada mapeia um padrão (substring normalizada) para a categoria.
// A categoria deve existir como categoria do usuário (criada pelo trigger
// handle_new_user) — caso contrário, a sugestão é ignorada silenciosamente.

import { normalizeText } from "./invoiceProcessor";

export interface MerchantRule {
  keywords: string[]; // tokens/substrings normalizadas; match se QUALQUER um aparecer
  category: string;
}

export const MERCHANT_RULES: MerchantRule[] = [
  // Alimentação / Delivery
  {
    category: "Alimentação",
    keywords: [
      "ifood", "rappi", "uber eats", "ubereats", "zedelivery", "ze delivery",
      "james delivery", "aiqfome", "restaurante", "lanchonete", "padaria",
      "pizzaria", "hamburgueria", "mcdonalds", "mc donalds", "bk", "burger king",
      "subway", "outback", "habibs", "spoleto", "giraffas", "kfc", "starbucks",
      "kopenhagen", "cacau show",
    ],
  },
  // Supermercado
  {
    category: "Supermercado",
    keywords: [
      "carrefour", "extra", "pao de acucar", "paodeacucar", "assai", "atacadao",
      "sams club", "sam s club", "makro", "tenda", "big bompreco", "hortifruti",
      "mercado", "supermercado", "mambo", "st marche", "verdemar", "dia super",
      "supermarket", "comper", "mart minas", "epa", "verdemais",
    ],
  },
  // Transporte
  {
    category: "Transporte",
    keywords: [
      "uber", "99 app", "99app", "cabify", "blablacar", "bilheteria", "metro",
      "passagem", "rodoviaria", "buser", "clickbus", "estapar", "estacionamento",
      "shellbox", "ipiranga", "petrobras", "shell", "ale combustivel", "posto",
      "combustivel", "gasolina", "etanol", "diesel", "vem fortaleza", "bilhete unico",
      "sptrans", "via mobilidade", "viacao", "azul linhas", "gol linhas", "latam",
      "tam linhas", "voepass", "passaredo",
    ],
  },
  // Moradia
  {
    category: "Moradia",
    keywords: [
      "aluguel", "condominio", "iptu", "imobiliaria", "leroy merlin", "telhanorte",
      "c&c", "obramax", "casas bahia", "magazine luiza moveis", "tok stok",
      "etna", "mobly", "westwing",
    ],
  },
  // Contas e Serviços (utilities)
  {
    category: "Contas e Serviços",
    keywords: [
      "vivo", "claro", "tim", "oi fixo", "oi movel", "algar", "nextel", "sky",
      "skybr", "net combo", "claro net", "enel", "cemig", "cpfl", "light",
      "coelba", "celpe", "neoenergia", "sabesp", "cedae", "copasa", "embasa",
      "compesa", "caesb", "comgas", "ceg", "energisa", "agua", "luz", "energia",
      "internet", "telefonia", "fatura energia", "fatura agua",
    ],
  },
  // Assinaturas / Streaming
  {
    category: "Assinaturas",
    keywords: [
      "netflix", "spotify", "amazon prime", "primevideo", "prime video", "disney",
      "disneyplus", "disney plus", "hbo max", "globoplay", "deezer", "youtube premium",
      "youtube music", "apple music", "apple tv", "icloud", "google one", "dropbox",
      "microsoft 365", "office 365", "adobe", "canva pro", "chatgpt", "openai",
      "claude pro", "anthropic", "github", "notion", "linkedin premium", "duolingo",
      "audible", "kindle unlimited", "paramount", "starplus", "star plus",
    ],
  },
  // Compras / Marketplaces
  {
    category: "Compras",
    keywords: [
      "amazon", "mercadolivre", "mercado livre", "magazinelu", "magazine luiza",
      "magalu", "americanas", "submarino", "shopee", "aliexpress", "shein",
      "casas bahia", "ponto frio", "fastshop", "fast shop", "kabum", "pichau",
      "terabyteshop", "renner", "cea", "c&a", "riachuelo", "marisa", "zara",
      "h&m", "decathlon", "centauro", "netshoes", "dafiti", "amaro", "farm",
    ],
  },
  // Saúde
  {
    category: "Saúde",
    keywords: [
      "drogaraia", "drogasil", "pacheco", "drogaria", "raia", "farmacia", "pague menos",
      "ultrafarma", "araujo farmacia", "hospital", "laboratorio", "fleury",
      "dasa", "delboni", "hermes pardini", "amil", "unimed", "bradesco saude",
      "sulamerica saude", "notredame", "intermedica", "hapvida", "psicologo",
      "dentista", "odontologia", "oticas", "otica", "essilor",
    ],
  },
  // Educação
  {
    category: "Educação",
    keywords: [
      "alura", "rocketseat", "udemy", "coursera", "edx", "kultivi", "descomplica",
      "estrategia concursos", "estrategiaconcursos", "gran cursos", "grancursos",
      "qconcursos", "kumon", "wizard", "ccaa", "fisk", "yazigi", "english live",
      "ef english", "rosetta stone", "babbel", "preply", "italki", "khan academy",
      "veduca", "fgv online", "escola", "faculdade", "universidade", "mensalidade",
      "matricula", "livraria", "saraiva", "cultura",
    ],
  },
  // Lazer
  {
    category: "Lazer",
    keywords: [
      "cinemark", "kinoplex", "uci cinemas", "cinepolis", "ingresso", "sympla",
      "eventbrite", "ticketmaster", "ticket360", "steam", "playstation", "psn",
      "nintendo", "xbox", "epic games", "battle.net", "riot games", "blizzard",
      "twitch", "discord nitro", "spotify podcast", "bar ", "boteco", "pub ",
      "club ", "balada",
    ],
  },
  // Pets
  {
    category: "Pets",
    keywords: [
      "petz", "cobasi", "petlove", "pet shop", "petshop", "agropet", "racao",
      "veterinario", "veterinaria", "petcamp", "dog hero", "doghero",
    ],
  },
  // Receitas
  {
    category: "Salário",
    keywords: ["salario", "remuneracao", "vencimento", "holerite", "folha pagamento", "proventos"],
  },
  {
    category: "Freelance",
    keywords: ["freela", "freelance", "pix recebido cliente", "honorarios", "prestacao servico"],
  },
  {
    category: "Investimentos",
    keywords: [
      "rendimento", "dividendo", "juros sobre capital", "jcp", "resgate cdb",
      "resgate lci", "resgate lca", "resgate tesouro", "tesouro direto",
      "nubank invest", "xp invest", "rico invest", "clear invest", "btg pactual",
    ],
  },
];

// Pré-computa as listas normalizadas uma única vez para performance.
const NORMALIZED_RULES = MERCHANT_RULES.map((rule) => ({
  category: rule.category,
  keywords: rule.keywords.map((k) => normalizeText(k)).filter((k) => k.length > 0),
}));

/**
 * Tenta categorizar uma descrição usando o catálogo de keywords.
 * Retorna a categoria mais específica (keyword mais longa) que casar, ou null.
 */
export function suggestCategoryByKeyword(description: string): string | null {
  if (!description) return null;
  const normalized = normalizeText(description);
  if (!normalized) return null;

  let bestMatch: { category: string; keywordLength: number } | null = null;
  for (const rule of NORMALIZED_RULES) {
    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword)) {
        if (!bestMatch || keyword.length > bestMatch.keywordLength) {
          bestMatch = { category: rule.category, keywordLength: keyword.length };
        }
      }
    }
  }
  return bestMatch?.category ?? null;
}
