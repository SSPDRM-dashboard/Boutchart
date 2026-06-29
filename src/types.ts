export interface Athlete {
  name: string;
  club: string;
  weight: string;
  school?: string;
  gender?: string;
}

export interface WeightCategory {
  name: string;
  count: number;
  size: number; // Bracket size (nearest power of 2, e.g. 2, 4, 8, 16, 32, 64)
  status: 'ready' | 'warn' | 'bad'; // ready (2+), warn (>64), bad (<2)
  ring: number;
  entrants: Athlete[];
}

export interface BracketNode {
  name: string;
  club: string;
  weight: string;
  isBye: boolean;
  checked: boolean;
  seed?: number; // For round 0
  bout?: number; // Sequential ring-wide match ID
}

export interface BracketModel {
  categoryKey: string;
  size: number;
  numRounds: number;
  nodes: BracketNode[][]; // nodes[roundIdx][nodeIdx]
  standings?: string[];
}

export interface AppState {
  tournamentName: string;
  roster: Athlete[];
  ringCount: number;
  shuffleSeed: boolean;
  categoryConfig: Record<string, { ring: number }>;
}

export interface DuplicateGroup {
  signature: string; // "name||club||category"
  name: string;
  club: string;
  weight: string;
  indices: number[];
  count: number;
}

export interface SavedEvent {
  id: string;
  timestamp: number;
  tournamentName: string;
  athleteCount: number;
  categoryCount: number;
  bracketCount: number;
  roster: Athlete[];
  categories: Record<string, WeightCategory>;
  brackets: Record<string, BracketModel>;
  ringCount: number;
  ringLabelFormat: 'number' | 'letter';
  boutLabelFormat?: 'alpha-2' | 'thousands-3';
  shuffleSeed: boolean;
  dismissedDuplicates: string[];
}

