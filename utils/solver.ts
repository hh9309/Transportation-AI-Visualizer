import { Cell, ProblemState, LoopNode } from '../types';

// --- Helpers ---

export const createEmptyGrid = (rows: number, cols: number, costs: number[][]): Cell[][] => {
  const grid: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const rowCells: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      rowCells.push({
        row: r,
        col: c,
        cost: costs[r][c],
        allocation: null,
        isBasin: false,
        highlight: 'none'
      });
    }
    grid.push(rowCells);
  }
  return grid;
};

export const calculateTotalCost = (grid: Cell[][]) => {
  let sum = 0;
  grid.forEach(row => row.forEach(c => {
    if (c.allocation) sum += c.allocation * c.cost;
  }));
  return sum;
};

// --- Problem Generator ---

export const generateRandomProblem = (rows: number, cols: number): ProblemState => {
  // Generate random costs (2-15) to encourage more iterations
  const costs: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const rowCost: number[] = [];
    for (let c = 0; c < cols; c++) {
      // Random [2, 15] -> Math.floor(Math.random() * 14) + 2
      rowCost.push(Math.floor(Math.random() * 14) + 2); 
    }
    costs.push(rowCost);
  }

  // Generate random supply and demand
  let supply = Array.from({ length: rows }, () => Math.floor(Math.random() * 50) + 20);
  let demand = Array.from({ length: cols }, () => Math.floor(Math.random() * 50) + 20);

  // Balance the problem
  const totalSupply = supply.reduce((a, b) => a + b, 0);
  const totalDemand = demand.reduce((a, b) => a + b, 0);

  if (totalSupply > totalDemand) {
    // Add difference to a random demand node
    const diff = totalSupply - totalDemand;
    demand[Math.floor(Math.random() * cols)] += diff;
  } else if (totalDemand > totalSupply) {
    // Add difference to a random supply node
    const diff = totalDemand - totalSupply;
    supply[Math.floor(Math.random() * rows)] += diff;
  }

  return {
    costs,
    supply,
    demand,
    initialSupply: [...supply],
    initialDemand: [...demand],
    rowCount: rows,
    colCount: cols
  };
};

// --- Algorithms ---

export const solveLeastCost = (problem: ProblemState): Cell[][] => {
  const rows = problem.rowCount;
  const cols = problem.colCount;
  let grid = createEmptyGrid(rows, cols, problem.costs);
  
  // Working copies of supply/demand
  let s = [...problem.initialSupply];
  let d = [...problem.initialDemand];
  
  // List of all cells sorted by cost
  let cellsList: {r: number, c: number, cost: number}[] = [];
  for(let r=0; r<rows; r++){
      for(let c=0; c<cols; c++){
          cellsList.push({r, c, cost: problem.costs[r][c]});
      }
  }
  cellsList.sort((a, b) => a.cost - b.cost);

  let basicCellsCount = 0;

  for (const cell of cellsList) {
      if (s[cell.r] > 0 && d[cell.c] > 0) {
          const allocation = Math.min(s[cell.r], d[cell.c]);
          grid[cell.r][cell.c].allocation = allocation;
          grid[cell.r][cell.c].isBasin = true;
          basicCellsCount++;
          
          s[cell.r] -= allocation;
          d[cell.c] -= allocation;
      }
  }

  // Degeneracy Handling: Ensure m + n - 1 basic cells
  const requiredBasic = rows + cols - 1;
  if (basicCellsCount < requiredBasic) {
      let needed = requiredBasic - basicCellsCount;
      // Simple strategy: fill lowest cost empty cells with 0
      for (const cell of cellsList) {
          if (needed <= 0) break;
          if (!grid[cell.r][cell.c].isBasin) {
               grid[cell.r][cell.c].isBasin = true;
               grid[cell.r][cell.c].allocation = 0; // Artificial zero
               needed--;
          }
      }
  }

  return grid;
};

export const calculatePotentials = (grid: Cell[][], rows: number, cols: number): { u: (number|null)[], v: (number|null)[] } => {
  let u: (number|null)[] = new Array(rows).fill(null);
  let v: (number|null)[] = new Array(cols).fill(null);
  
  // Start with u[0] = 0
  u[0] = 0;
  
  let changed = true;
  while (changed) {
      changed = false;
      for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
              if (grid[r][c].isBasin) {
                  // If we know u[r] but not v[c]
                  if (u[r] !== null && v[c] === null) {
                      v[c] = grid[r][c].cost - u[r]!;
                      changed = true;
                  }
                  // If we know v[c] but not u[r]
                  else if (v[c] !== null && u[r] === null) {
                      u[r] = grid[r][c].cost - v[c]!;
                      changed = true;
                  }
              }
          }
      }
  }
  return { u, v };
};

export const calculateOpportunityCosts = (grid: Cell[][], u: (number|null)[], v: (number|null)[]) => {
  let newGrid = grid.map(row => row.map(c => ({...c})));
  let minDelta = Infinity;
  let enteringCell: {r: number, c: number} | null = null;

  for (let r = 0; r < newGrid.length; r++) {
      for (let c = 0; c < newGrid[0].length; c++) {
          if (!newGrid[r][c].isBasin && u[r] !== null && v[c] !== null) {
              const delta = newGrid[r][c].cost - (u[r]! + v[c]!);
              newGrid[r][c].opportunityCost = delta;
              if (delta < minDelta) {
                  minDelta = delta;
                  enteringCell = { r, c };
              }
          } else {
              newGrid[r][c].opportunityCost = undefined;
          }
      }
  }
  return { grid: newGrid, minDelta, enteringCell };
};

export const findLoop = (start: {r: number, c: number}, grid: Cell[][]): LoopNode[] | null => {
  const rows = grid.length;
  const cols = grid[0].length;
  
  const path: LoopNode[] = [];
  const visited = new Set<string>();

  const search = (current: LoopNode, isHorizontal: boolean): boolean => {
      path.push(current);
      visited.add(`${current.r},${current.c}`);

      // If we returned to start and have length >= 4, we found a loop
      if (path.length >= 4 && current.r === start.r && current.c === start.c) {
          return true;
      }

      // If we returned to start too early, backtrack
      if (path.length > 1 && current.r === start.r && current.c === start.c) {
           path.pop();
           return false;
      }

      const nextNodes: LoopNode[] = [];

      if (isHorizontal) {
          // Look in same row
          for (let c = 0; c < cols; c++) {
              if (c !== current.c) {
                  if (c === start.c && current.r === start.r) { // Back to start
                      nextNodes.push({r: current.r, c: c});
                  } else if (grid[current.r][c].isBasin) {
                      nextNodes.push({r: current.r, c: c});
                  }
              }
          }
      } else {
          // Look in same col
          for (let r = 0; r < rows; r++) {
              if (r !== current.r) {
                  if (r === start.r && current.c === start.c) { // Back to start
                      nextNodes.push({r: r, c: current.c});
                  } else if (grid[r][current.c].isBasin) {
                      nextNodes.push({r: r, c: current.c});
                  }
              }
          }
      }

      for (const next of nextNodes) {
          // Avoid immediate backtrack 
          if (path.length >= 2) {
              const prev = path[path.length - 2];
              if (prev.r === next.r && prev.c === next.c) continue;
          }
          
          // Allow visiting start again, but no other visited nodes
          const isStart = next.r === start.r && next.c === start.c;
          if (!visited.has(`${next.r},${next.c}`) || isStart) {
              if (search(next, !isHorizontal)) return true;
          }
      }

      path.pop();
      visited.delete(`${current.r},${current.c}`);
      return false;
  };

  if (search({r: start.r, c: start.c}, true)) return path; 
  path.length = 0; 
  visited.clear();
  if (search({r: start.r, c: start.c}, false)) return path;

  return null;
};

export const applyPivot = (grid: Cell[][], loop: LoopNode[]): { newGrid: Cell[][], theta: number } => {
  // Loop: Start (+), Next (-), Next (+), ...
  // Find min allocation in (-) cells
  let theta = Infinity;
  let leavingNode: LoopNode | null = null;

  for (let i = 1; i < loop.length; i += 2) {
      const node = loop[i];
      const alloc = grid[node.r][node.c].allocation;
      if (alloc !== null && alloc < theta) {
          theta = alloc;
          leavingNode = node;
      }
  }

  // Deep copy grid
  const newGrid = grid.map(row => row.map(c => ({...c, allocation: c.allocation ?? 0})));

  // Apply theta
  for (let i = 0; i < loop.length - 1; i++) { 
      const node = loop[i];
      if (i % 2 === 0) {
          // Plus
          newGrid[node.r][node.c].allocation! += theta;
          newGrid[node.r][node.c].isBasin = true;
      } else {
          // Minus
          newGrid[node.r][node.c].allocation! -= theta;
      }
  }

  // Handle leaving variable
  if (leavingNode) {
     newGrid[leavingNode.r][leavingNode.c].isBasin = false;
     newGrid[leavingNode.r][leavingNode.c].allocation = null;
  }
  
  // Ensure entering node is basic
  const start = loop[0];
  newGrid[start.r][start.c].isBasin = true;

  // Cleanup nulls for non-basics
  newGrid.forEach(row => row.forEach(c => {
      if (!c.isBasin) c.allocation = null;
  }));

  return { newGrid, theta };
};

// Helper to run one full iteration (Used for Auto-Solve or 'Next Iteration')
export const performFullIteration = (grid: Cell[][], rows: number, cols: number) => {
    // 1. Potentials
    const { u, v } = calculatePotentials(grid, rows, cols);
    
    // 2. Deltas
    const { grid: gridWithDeltas, minDelta, enteringCell } = calculateOpportunityCosts(grid, u, v);
    
    if (minDelta >= 0) {
        return { isOptimal: true, grid: gridWithDeltas, cost: calculateTotalCost(gridWithDeltas) };
    }

    if (!enteringCell) return { isError: true, message: "无法找到调入变量" };

    // 3. Loop
    const loop = findLoop(enteringCell, gridWithDeltas);
    if (!loop) return { isError: true, message: "无法找到闭回路 (退化或逻辑错误)" };

    // 4. Pivot
    const { newGrid, theta } = applyPivot(gridWithDeltas, loop);
    
    // Clean up highlights for result
    const cleanGrid = newGrid.map(row => row.map(c => ({
        ...c,
        opportunityCost: undefined,
        highlight: 'none' as const
    })));

    return { 
        isOptimal: false, 
        grid: cleanGrid, 
        cost: calculateTotalCost(cleanGrid), 
        theta 
    };
};
