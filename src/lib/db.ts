import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { ScoredCompany, ThesisCriteria } from "./types";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = path.join(process.cwd(), ".data");
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, "tipoff.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thesis TEXT NOT NULL,
      criteria TEXT,
      result_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS sightings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      url TEXT,
      description TEXT,
      score INTEGER NOT NULL,
      reasoning TEXT,
      sources TEXT NOT NULL DEFAULT '[]',
      signals TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sightings_name_key ON sightings(name_key, id);
    CREATE INDEX IF NOT EXISTS idx_sightings_run ON sightings(run_id);
  `);
  return db;
}

/** Normalize a company name so the same company matches across runs. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export interface RunRow {
  id: number;
  thesis: string;
  criteria: string | null;
  result_count: number;
  duration_ms: number | null;
  created_at: string;
}

export interface SightingRow {
  id: number;
  run_id: number;
  name: string;
  name_key: string;
  url: string | null;
  description: string | null;
  score: number;
  reasoning: string | null;
  sources: string;
  signals: string;
  created_at: string;
}

export function createRun(thesis: string, criteria: ThesisCriteria): number {
  const res = getDb()
    .prepare("INSERT INTO runs (thesis, criteria) VALUES (?, ?)")
    .run(thesis, JSON.stringify(criteria));
  return Number(res.lastInsertRowid);
}

export function finishRun(runId: number, resultCount: number, durationMs: number): void {
  getDb()
    .prepare("UPDATE runs SET result_count = ?, duration_ms = ? WHERE id = ?")
    .run(resultCount, durationMs, runId);
}

export function saveSighting(runId: number, company: ScoredCompany): void {
  getDb()
    .prepare(
      `INSERT INTO sightings (run_id, name, name_key, url, description, score, reasoning, sources, signals)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      runId,
      company.name,
      nameKey(company.name),
      company.url,
      company.description,
      company.score,
      company.reasoning,
      JSON.stringify(company.sources),
      JSON.stringify(company.signals)
    );
}

/** Most recent sighting of this company from any run before `beforeRunId`. */
export function previousSighting(name: string, beforeRunId: number): SightingRow | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM sightings WHERE name_key = ? AND run_id < ? ORDER BY id DESC LIMIT 1"
    )
    .get(nameKey(name), beforeRunId) as SightingRow | undefined;
}

export function listRuns(limit = 50): RunRow[] {
  return getDb()
    .prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?")
    .all(limit) as RunRow[];
}

export function getRun(id: number): RunRow | undefined {
  return getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
}

export function getRunSightings(runId: number): SightingRow[] {
  return getDb()
    .prepare("SELECT * FROM sightings WHERE run_id = ? ORDER BY score DESC")
    .all(runId) as SightingRow[];
}

/** Highest-scored recent sightings, deduped by company — powers the idle "recent finds". */
export function recentTopSightings(limit = 6): SightingRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM sightings WHERE id IN (
         SELECT MAX(id) FROM sightings GROUP BY name_key
       ) ORDER BY id DESC, score DESC LIMIT ?`
    )
    .all(limit) as SightingRow[];
}
