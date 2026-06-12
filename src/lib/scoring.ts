import { Company } from "./types";

export interface ScoreComponent {
  label: string;
  points: number;
}

export interface EvidenceScore {
  total: number;
  components: ScoreComponent[];
}

const RECENT_BATCH = /^[WSF]2[4-9]/i;

function daysSince(dateStr: unknown): number | null {
  if (typeof dateStr !== "string") return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Deterministic breakout score computed from raw evidence gathered across
 * sources during the run. Repeatable: the same evidence always produces the
 * same score. The LLM's job is the narrative, not the arithmetic.
 */
export function computeEvidenceScore(evidence: Company[]): EvidenceScore {
  const components: ScoreComponent[] = [];
  const add = (label: string, points: number) => {
    if (points !== 0) components.push({ label, points });
  };

  const sources = new Set(evidence.map((e) => e.source));

  for (const e of evidence) {
    const d = e.sourceData || {};

    switch (e.source) {
      case "yc": {
        const batch = typeof d.batch === "string" ? d.batch : "";
        if (RECENT_BATCH.test(batch)) add(`YC ${batch} (recent batch)`, 15);
        else if (batch) add(`YC ${batch}`, 6);
        if (d.isHiring === true) add("YC profile marked hiring", 8);
        break;
      }
      case "hackernews": {
        const points = asNum(d.points) || 0;
        if (points >= 200) add(`HN ${points} points`, 14);
        else if (points >= 50) add(`HN ${points} points`, 9);
        else if (points >= 10) add(`HN ${points} points`, 4);
        if (d.type === "launch_hn" || d.type === "show_hn") add("Show/Launch HN post", 5);
        break;
      }
      case "hn-whoishiring": {
        add("Posting in HN Who's Hiring", 14);
        break;
      }
      case "github": {
        const stars = asNum(d.stars) || 0;
        const trending = asNum(d.trending_stars) || 0;
        if (trending >= 500) add(`+${trending} stars this week`, 15);
        else if (trending >= 100) add(`+${trending} stars this week`, 10);
        else if (trending > 0) add(`+${trending} stars this week`, 5);
        // Sweet spot: real traction but not yet broken out.
        if (stars >= 1000 && stars <= 20000) add(`${stars} stars (breakout range)`, 8);
        else if (stars >= 200) add(`${stars} stars`, 4);
        break;
      }
      case "sec-edgar": {
        const age = daysSince(d.filing_date);
        if (age !== null && age <= 30) add("Form D filed <30d ago", 15);
        else if (age !== null && age <= 90) add("Form D filed <90d ago", 10);
        else add("Form D on record", 5);
        break;
      }
      case "news": {
        const hasAmount = typeof d.amount === "string" && d.amount.length > 0;
        const round = typeof d.round === "string" ? d.round.toLowerCase() : "";
        if (hasAmount) add(`Funding news (${d.amount})`, 12);
        else add("Funding news coverage", 6);
        if (round.includes("seed") || round.includes("series a")) add(`Early round (${d.round})`, 5);
        break;
      }
      case "twitter": {
        if (e.signals?.hiring) add("Hiring tweets", 10);
        if (e.signals?.launches) add("Launch tweets", 6);
        if (e.signals?.funding) add("Funding tweets", 6);
        const engagement = asNum(d.total_engagement) || 0;
        if (engagement >= 5000) add(`${engagement} tweet engagement`, 6);
        else if (engagement >= 500) add(`${engagement} tweet engagement`, 3);
        break;
      }
      case "crunchbase": {
        const age = daysSince(d.last_funding_date);
        if (age !== null && age <= 180) add(`Raised ${d.last_funding_round || "round"} <6mo ago`, 10);
        const employees = asNum(d.employee_count);
        if (employees !== null && employees >= 11 && employees <= 100) {
          add(`${employees} employees (scaling range)`, 5);
        }
        break;
      }
      case "jobs": {
        const openRoles = asNum(d.open_roles) || 0;
        if (openRoles >= 10) add(`${openRoles} open roles`, 14);
        else if (openRoles >= 3) add(`${openRoles} open roles`, 10);
        else if (openRoles >= 1) add(`${openRoles} open role(s)`, 5);
        break;
      }
    }
  }

  // Cross-source corroboration is the strongest tell.
  if (sources.size >= 3) add(`Corroborated by ${sources.size} sources`, 12);
  else if (sources.size === 2) add("Corroborated by 2 sources", 6);

  const total = Math.min(
    100,
    components.reduce((sum, c) => sum + c.points, 0)
  );
  return { total, components };
}

/**
 * Blend the deterministic evidence score with the LLM's judgment. Evidence
 * dominates when present; with no gathered evidence we can only fall back to
 * the LLM's number.
 */
export function blendScores(llmScore: number, evidence: EvidenceScore): number {
  if (evidence.components.length === 0) return llmScore;
  return Math.round(0.55 * evidence.total + 0.45 * llmScore);
}
