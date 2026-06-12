import { Company } from "../types";

interface GreenhouseJob {
  title: string;
  location?: { name?: string };
  updated_at?: string;
}

interface LeverPosting {
  text: string;
  categories?: { location?: string; team?: string };
  createdAt?: number;
}

function slugCandidates(company: string): string[] {
  const lower = company.toLowerCase().trim();
  const candidates = [
    lower.replace(/[^a-z0-9]+/g, ""),
    lower.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  ];
  return Array.from(new Set(candidates)).filter(Boolean);
}

async function tryGreenhouse(slug: string): Promise<GreenhouseJob[] | null> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { jobs?: GreenhouseJob[] };
  return data.jobs || [];
}

async function tryLever(slug: string): Promise<LeverPosting[] | null> {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as LeverPosting[];
  return Array.isArray(data) ? data : null;
}

interface AshbyJob {
  title: string;
  location?: string;
}

async function tryAshby(slug: string): Promise<AshbyJob[] | null> {
  const res = await fetch(
    `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { jobs?: AshbyJob[] };
  return data.jobs || null;
}

const SENIOR_RE = /senior|staff|principal|lead|head of|director|vp /i;
const ENG_RE = /engineer|developer|scientist|research|ml|ai|infra|platform|data/i;

/**
 * Check a company's public Greenhouse/Lever job board by trying common slug
 * variants of its name. Open-role count is hard, verifiable hiring evidence —
 * no scraping, no API key.
 */
export async function checkJobOpenings(companyName: string): Promise<Company | null> {
  if (!companyName?.trim()) return null;

  for (const slug of slugCandidates(companyName)) {
    const [gh, lever, ashby] = await Promise.all([
      tryGreenhouse(slug),
      tryLever(slug),
      tryAshby(slug),
    ]);

    let board: string | null = null;
    let boardUrl = "";
    let roles: { title: string; location: string }[] = [];

    if (gh && gh.length > 0) {
      board = "greenhouse";
      boardUrl = `https://boards.greenhouse.io/${slug}`;
      roles = gh.map((j) => ({ title: j.title, location: j.location?.name || "" }));
    } else if (lever && lever.length > 0) {
      board = "lever";
      boardUrl = `https://jobs.lever.co/${slug}`;
      roles = lever.map((j) => ({
        title: j.text,
        location: j.categories?.location || "",
      }));
    } else if (ashby && ashby.length > 0) {
      board = "ashby";
      boardUrl = `https://jobs.ashbyhq.com/${slug}`;
      roles = ashby.map((j) => ({ title: j.title, location: j.location || "" }));
    }

    if (!board) continue;

    const seniorCount = roles.filter((r) => SENIOR_RE.test(r.title)).length;
    const engCount = roles.filter((r) => ENG_RE.test(r.title)).length;

    return {
      name: companyName,
      url: boardUrl,
      description: `${roles.length} open roles on ${board} (${engCount} technical, ${seniorCount} senior)`,
      source: "jobs",
      sourceData: {
        board,
        board_url: boardUrl,
        open_roles: roles.length,
        senior_roles: seniorCount,
        technical_roles: engCount,
        sample_titles: roles.slice(0, 8).map((r) => r.title),
      },
      signals: {
        hiring: true,
      },
    };
  }

  return null;
}
