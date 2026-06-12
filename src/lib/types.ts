export interface Company {
  name: string;
  url: string;
  description: string;
  source: string;
  sourceData: Record<string, unknown>;
  signals: {
    hiring?: boolean;
    github?: boolean;
    funding?: boolean;
    launches?: boolean;
  };
}

export interface ScoredCompany extends Company {
  score: number;
  reasoning: string;
  sources: string[];
  /** True if this company has never appeared in a previous run. */
  isNew?: boolean;
  /** Score change vs the most recent previous sighting (null if first sighting). */
  delta?: number | null;
}

export interface ThesisCriteria {
  industry: string;
  stage: string;
  signals: string[];
  keywords: string[];
  raw: string;
  geography?: string;
  time_window_days?: number;
  exclusions?: string[];
  funding_stage_target?: string[];
  priority_sources?: string[];
}

export interface InvestigationEvent {
  type: "thinking" | "tool_call" | "tool_result" | "status" | "result" | "done" | "error";
  message?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  company?: ScoredCompany;
  iteration?: number;
}

export interface FeedMessage {
  type: "thinking" | "tool_call" | "tool_result" | "status" | "error";
  text: string;
  iteration?: number;
}
