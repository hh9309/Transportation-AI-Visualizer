
export type CellType = 'basic' | 'non-basic';

export interface Cell {
  row: number;
  col: number;
  cost: number;
  allocation: number | null; // null represents empty non-basic cell
  isBasin: boolean; // Part of the basis
  highlight?: 'entering' | 'leaving' | 'loop-plus' | 'loop-minus' | 'none';
  opportunityCost?: number; // Delta_ij
}

export interface ProblemState {
  costs: number[][]; // [row][col]
  supply: number[];
  demand: number[];
  initialSupply: number[];
  initialDemand: number[];
  rowCount: number;
  colCount: number;
}

export type SolverStatus = 'input' | 'ready' | 'potentials' | 'deltas' | 'loop' | 'optimal';

export interface SolverState {
  grid: Cell[][];
  u: (number | null)[]; // Row potentials
  v: (number | null)[]; // Col potentials
  totalCost: number;
  status: SolverStatus;
  message: string;
  stepDescription: string;
  iteration: number;
}

export interface LoopNode {
  r: number;
  c: number;
}

export interface LogEntry {
  id: number;
  iteration: number;
  phase: string;
  description: string;
  cost?: number;
  type: 'info' | 'success' | 'warning' | 'error';
}
