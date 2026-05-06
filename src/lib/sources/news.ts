import { getApifyClient } from "../apify";
import { Company } from "../types";

interface OrganicResult {
  title: string;
  url: string;
  description?: string;
  date?: string;
  emphasizedKeywords?: string[];
}

const FUNDING_PATTERNS: RegExp[] = [
  /^([A-Z][\w.&'-]+(?:\s[A-Z][\w.&'-]+){0,2})\s+raises\b/i,
  /^([A-Z][\w.&'-]+(?:\s[A-Z][\w.&'-]+){0,2})\s+secures\b/i,
  /^([A-Z][\w.&'-]+(?:\s[A-Z][\w.&'-]+){0,2})\s+closes\b/i,
  /^([A-Z][\w.&'-]+(?:\s[A-Z][\w.&'-]+){0,2})\s+lands\b/i,
  /^([A-Z][\w.&'-]+(?:\s[A-Z][\w.&'-]+){0,2})\s+nabs\b/i,
  /^([A-Z][\w.&'-]+(?:\s[A-Z][\w.&'-]+){0,2}),?\s+(?:a |an )?\w+\s+startup/i,
];

const AMOUNT_PATTERN = /\$\s*[\d.]+\s*(?:million|billion|m\b|b\b|k\b)/i;
const ROUND_PATTERN = /\b(seed|pre-seed|series\s*[a-e]|growth)\b/i;

// Words that indicate the title is a list/listicle/guide article, not a
// real funding announcement. Reject anything starting with these.
const ARTICLE_NOISE_PREFIXES = [
  /^list\s/i,
  /^top\s/i,
  /^best\s/i,
  /^how\s/i,
  /^why\s/i,
  /^guide\s/i,
  /^the\s+(top|best|biggest|most|complete)\s/i,
  /^\d+\s+(top|best|biggest|hot)/i,
  /^fundraising\s/i,
  /^venture\s/i,
  /^a\s+complete\s/i,
  /^overview\s/i,
];

function looksLikeListicle(title: string): boolean {
  return ARTICLE_NOISE_PREFIXES.some((p) => p.test(title));
}

function extractCompanyName(title: string): string | null {
  if (looksLikeListicle(title)) return null;
  for (const pattern of FUNDING_PATTERNS) {
    const match = title.match(pattern);
    if (match && match[1].length > 2 && match[1].length < 40) {
      const name = match[1].trim();
      // Reject names that are obviously generic phrases.
      if (/^(the|a|an|this|that|some|several|new|recent)\s/i.test(name)) return null;
      return name;
    }
  }
  return null;
}

function extractAmount(text: string): string | undefined {
  return text.match(AMOUNT_PATTERN)?.[0];
}

function extractRound(text: string): string | undefined {
  return text.match(ROUND_PATTERN)?.[0];
}

export async function fetchNewsCompanies(keywords: string[] = []): Promise<Company[]> {
  const client = getApifyClient();
  if (!client) {
    throw new Error("News source requires APIFY_API_TOKEN in .env.local");
  }

  const year = new Date().getFullYear();
  const baseTerms = keywords.length > 0 ? keywords.slice(0, 3).join(" ") : "AI";
  const queries = [
    `"${baseTerms}" startup raises ${year}`,
    `"${baseTerms}" seed series A funding ${year}`,
    `"${baseTerms}" startup announces funding round`,
  ];

  const run = await client.actor("apify/google-search-scraper").call(
    {
      queries: queries.join("\n"),
      maxPagesPerQuery: 1,
      resultsPerPage: 10,
      languageCode: "en",
      countryCode: "us",
    },
    { timeout: 90 }
  );

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const seen = new Set<string>();
  const companies: Company[] = [];

  for (const item of items) {
    const results = (item.organicResults as OrganicResult[]) || [];
    for (const result of results.slice(0, 8)) {
      const name = extractCompanyName(result.title);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;

      const combined = `${result.title} ${result.description || ""}`;
      // Require evidence of actual funding in title or snippet — drops generic
      // articles that happen to match the company-name regex.
      const hasAmount = AMOUNT_PATTERN.test(combined);
      const hasRound = ROUND_PATTERN.test(combined);
      if (!hasAmount && !hasRound) continue;

      seen.add(key);

      companies.push({
        name,
        url: result.url,
        description: result.title,
        source: "news",
        sourceData: {
          headline: result.title,
          snippet: result.description,
          published: result.date,
          source_url: result.url,
          amount: extractAmount(combined),
          round: extractRound(combined),
        },
        signals: {
          funding: true,
        },
      });

      if (companies.length >= 15) break;
    }
    if (companies.length >= 15) break;
  }

  return companies;
}
