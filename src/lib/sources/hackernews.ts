import { Company } from "../types";

interface AlgoliaHNHit {
  objectID: string;
  title?: string;
  url?: string;
  author?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
  created_at_i?: number;
  story_text?: string;
  comment_text?: string;
  story_id?: number;
  _tags?: string[];
}

const HN_ALGOLIA = "https://hn.algolia.com/api/v1/search";

function extractCompanyName(title: string): string {
  return title
    .replace(/^Show HN:\s*/i, "")
    .replace(/^Launch HN:\s*/i, "")
    .split(/[–\-:|—]/)[0]
    .trim();
}

export async function fetchHNCompanies(keywords: string[] = []): Promise<Company[]> {
  const query = keywords.length > 0 ? keywords.join(" ") : "startup launch";

  // Prefer Show HN / Launch HN posts; fall back to general stories.
  const showUrl = `${HN_ALGOLIA}?query=${encodeURIComponent(query)}&tags=(story,show_hn)&hitsPerPage=30`;
  const res = await fetch(showUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HN Algolia search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { hits?: AlgoliaHNHit[] };
  const hits = data.hits || [];

  const seen = new Set<string>();
  const companies: Company[] = [];

  for (const hit of hits) {
    if (!hit.title) continue;
    if (!hit.url) continue;
    if ((hit.points || 0) < 10) continue;

    const name = extractCompanyName(hit.title);
    if (!name || name.length > 60) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const isShowHN = (hit._tags || []).includes("show_hn") || /^show hn:/i.test(hit.title);
    const isLaunchHN = /^launch hn:/i.test(hit.title);

    companies.push({
      name,
      url: hit.url,
      description: hit.title,
      source: "hackernews",
      sourceData: {
        points: hit.points,
        num_comments: hit.num_comments,
        author: hit.author,
        created_at: hit.created_at,
        hn_id: hit.objectID,
        hn_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        type: isLaunchHN ? "launch_hn" : isShowHN ? "show_hn" : "story",
      },
      signals: {
        launches: isShowHN || isLaunchHN,
      },
    });

    if (companies.length >= 15) break;
  }

  return companies;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Search the latest monthly "Ask HN: Who is hiring?" thread. Top-level
 * comments conventionally start with "Company | Role | Location", which makes
 * this the strongest free hiring-velocity signal available.
 */
export async function fetchHNHiringCompanies(keywords: string[] = []): Promise<Company[]> {
  // Locate the most recent thread posted by the whoishiring bot.
  const threadUrl = `${HN_ALGOLIA}_by_date?query=${encodeURIComponent("Ask HN: Who is hiring?")}&tags=story,author_whoishiring&hitsPerPage=1`;
  const threadRes = await fetch(threadUrl, { headers: { Accept: "application/json" } });
  if (!threadRes.ok) {
    throw new Error(`HN Who's Hiring thread lookup failed: ${threadRes.status}`);
  }
  const threadData = (await threadRes.json()) as { hits?: AlgoliaHNHit[] };
  const thread = threadData.hits?.[0];
  if (!thread) {
    throw new Error("Could not find a recent HN Who's Hiring thread");
  }

  const query = keywords.length > 0 ? keywords.join(" ") : "";
  const commentsUrl = `${HN_ALGOLIA}?query=${encodeURIComponent(query)}&tags=comment,story_${thread.objectID}&hitsPerPage=40`;
  const res = await fetch(commentsUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HN Who's Hiring comment search failed: ${res.status}`);
  }
  const data = (await res.json()) as { hits?: AlgoliaHNHit[] };

  const seen = new Set<string>();
  const companies: Company[] = [];

  for (const hit of data.hits || []) {
    if (!hit.comment_text) continue;
    const text = stripHtml(hit.comment_text);

    // Convention: "Company | Role | Location | ..." — skip replies/free-form comments.
    const firstSegment = text.split("|")[0].trim();
    if (!firstSegment || firstSegment.length > 50 || !text.includes("|")) continue;
    // Drop trailing parentheticals like "Acme (YC W24)" noise from the key only.
    const name = firstSegment.replace(/\s*\(.*?\)\s*$/, "").trim();
    if (!name || name.split(" ").length > 6) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const urlMatch = text.match(/https?:\/\/[^\s)]+/);
    const header = text.split("|").slice(0, 4).join(" | ").slice(0, 160);

    companies.push({
      name,
      url: urlMatch ? urlMatch[0] : "",
      description: header,
      source: "hn-whoishiring",
      sourceData: {
        thread_title: thread.title,
        thread_url: `https://news.ycombinator.com/item?id=${thread.objectID}`,
        comment_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        posted_at: hit.created_at,
        excerpt: text.slice(0, 300),
      },
      signals: {
        hiring: true,
      },
    });

    if (companies.length >= 20) break;
  }

  return companies;
}
