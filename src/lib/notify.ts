import { ScoredCompany } from "./types";

/**
 * Post never-seen-before finds to a Slack incoming webhook, if configured.
 * Best-effort: notification failures never break a run.
 */
export async function notifyNewFinds(
  thesis: string,
  companies: ScoredCompany[]
): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  const newFinds = companies.filter((c) => c.isNew).slice(0, 5);
  if (newFinds.length === 0) return;

  const lines = newFinds.map(
    (c) =>
      `• *${c.name}* — score ${c.score}${c.url ? ` — <${c.url}|${c.url.replace(/^https?:\/\//, "")}>` : ""}\n   ${c.description}`
  );

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*Tipoff* found ${newFinds.length} new compan${newFinds.length === 1 ? "y" : "ies"} for _"${thesis}"_:\n${lines.join("\n")}`,
      }),
    });
  } catch (err) {
    console.error("[tipoff] Slack notification failed:", err);
  }
}
