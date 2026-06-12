import { Company } from "../types";

interface GitHubRepo {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  topics?: string[];
  created_at: string;
  pushed_at: string;
  owner: { login: string; type: string };
}

/**
 * Real GitHub repository search via the official API. Free (no Apify):
 * unauthenticated works at low rate; set GITHUB_TOKEN for 30 req/min.
 * Targets the breakout band — meaningful traction, recently active, but
 * not already a household name.
 */
export async function fetchGitHubCompanies(keywords: string[] = []): Promise<Company[]> {
  const query = keywords.length > 0 ? keywords.slice(0, 5).join(" ") : "startup";
  const pushedAfter = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const q = `${query} in:name,description,topics stars:100..20000 pushed:>${pushedAfter}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      throw new Error(
        "GitHub API rate limit hit — set GITHUB_TOKEN in .env.local for a higher limit"
      );
    }
    throw new Error(`GitHub search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { items?: GitHubRepo[] };
  const repos = data.items || [];

  const seen = new Set<string>();
  const companies: Company[] = [];

  for (const repo of repos) {
    const ownerName = repo.owner?.login || repo.full_name.split("/")[0];
    const key = ownerName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const ageDays = (Date.now() - new Date(repo.created_at).getTime()) / 86_400_000;

    companies.push({
      name: ownerName,
      // Many projects set their company site as the repo homepage — prefer it.
      url: repo.homepage || repo.html_url,
      description: repo.description || repo.full_name,
      source: "github",
      sourceData: {
        repo: repo.full_name,
        repo_url: repo.html_url,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        open_issues: repo.open_issues_count,
        language: repo.language,
        topics: repo.topics?.slice(0, 6),
        created_at: repo.created_at,
        pushed_at: repo.pushed_at,
        repo_age_days: Math.round(ageDays),
        owner_type: repo.owner?.type,
      },
      signals: {
        github: true,
      },
    });

    if (companies.length >= 20) break;
  }

  return companies;
}
