import React from 'react';
import { Cell, SolverState } from '../types';
import { clsx } from 'clsx';
import { ArrowRight, CornerDownRight } from 'lucide-react';

interface TableauProps {
  solverState: SolverState;
  problem: { supply: number[]; demand: number[] };
}

const Tableau: React.FC<TableauProps> = ({ solverState, problem }) => {
  const { grid, u, v } = solverState;
  const rows = grid.length;
  const cols = grid[0].length;

  return (
    <div className="overflow-x-auto tableau-scroll pb-4 w-full">
      <div className="inline-block min-w-full">
        <div 
          className="grid gap-3" 
          style={{ gridTemplateColumns: `auto repeat(${cols}, minmax(100px, 1fr)) auto` }}
        >
          {/* Header Row */}
          <div className="p-2 font-bold text-slate-400 text-center flex items-end justify-center text-[10px] uppercase tracking-wider">
            销地 <ArrowRight className="inline w-3 h-3 ml-1" />
          </div>
          {Array.from({ length: cols }).map((_, i) => (
            <div key={`head-${i}`} className="p-3 font-bold text-slate-700 text-center bg-slate-100 rounded-xl shadow-sm border border-slate-200">
              D{i + 1}
            </div>
          ))}
          <div className="p-3 font-bold text-indigo-600 text-center bg-indigo-50/50 rounded-xl border border-indigo-100">
            产量
          </div>

          {/* Main Grid Rows */}
          {grid.map((row, rIndex) => (
            <React.Fragment key={`row-${rIndex}`}>
              {/* Row Header (Sources) - REMOVED u DISPLAY FROM HERE */}
              <div className="flex flex-col items-center justify-center p-2 font-bold text-slate-700 bg-slate-100 rounded-xl border border-slate-200 relative group">
                <span>S{rIndex + 1}</span>
              </div>

              {/* Cells */}
              {row.map((cell, cIndex) => (
                <div
                  key={`cell-${rIndex}-${cIndex}`}
                  className={clsx(
                    "relative h-24 border rounded-xl transition-all duration-300 flex items-center justify-center group",
                    // Basic vs Non-Basic Styling
                    cell.isBasin 
                      ? "border-indigo-500 bg-indigo-50/40 shadow-sm" 
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md",
                    // Highlight Logic
                    cell.highlight === 'entering' && "ring-4 ring-green-200 border-green-500 bg-green-50 z-10 scale-105",
                    cell.highlight === 'leaving' && "ring-4 ring-red-200 border-red-500 bg-red-50 z-10 scale-95 opacity-60",
                    cell.highlight === 'loop-plus' && "border-green-400 bg-green-50 ring-2 ring-green-100",
                    cell.highlight === 'loop-minus' && "border-red-400 bg-red-50 ring-2 ring-red-100"
                  )}
                >
                  {/* Cost (Top Right) */}
                  <div className="absolute top-1.5 right-2 text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                    {cell.cost}
                  </div>

                  {/* Opportunity Cost (Top Left) */}
                  {cell.opportunityCost !== undefined && (
                    <div className={clsx(
                      "absolute top-1.5 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 transition-transform hover:scale-110 cursor-help",
                      cell.opportunityCost < 0 ? "text-white bg-rose-500 animate-pulse" : "text-emerald-700 bg-emerald-100 border border-emerald-200 opacity-60"
                    )} title="检验数 (Delta)">
                      Δ {cell.opportunityCost}
                    </div>
                  )}

                   {/* Loop Markers */}
                   {cell.highlight === 'loop-plus' && (
                    <div className="absolute bottom-1 right-2 w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold border border-green-300 z-10">+</div>
                   )}
                   {cell.highlight === 'loop-minus' && (
                    <div className="absolute bottom-1 right-2 w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold border border-red-300 z-10">-</div>
                   )}


                  {/* Allocation (Center) */}
                  {cell.allocation !== null && (
                    <div className="text-3xl font-mono font-bold text-indigo-700 drop-shadow-sm">
                      {cell.allocation}
                    </div>
                  )}
                  {cell.allocation === null && cell.highlight === 'entering' && (
                     <div className="flex flex-col items-center">
                        <CornerDownRight className="w-5 h-5 text-green-500 mb-1" />
                        <div className="text-[10px] font-bold text-green-600 uppercase tracking-wide bg-green-100 px-1 rounded">New</div>
                     </div>
                  )}
                </div>
              ))}

              {/* Supply Column - ADDED u DISPLAY HERE */}
              <div className="flex flex-col items-center justify-center p-2 font-mono font-bold text-slate-500 bg-slate-50 rounded-xl border border-slate-200/60 relative">
                <span>{problem.supply[rIndex]}</span>
                {u[rIndex] !== null && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-mono text-white bg-indigo-500 px-1.5 py-0.5 rounded shadow-lg shadow-indigo-200 z-20 animate-in zoom-in">
                    u={u[rIndex]}
                  </span>
                )}
              </div>
            </React.Fragment>
          ))}

          {/* Bottom Row (Demand) */}
          <div className="p-2 font-bold text-indigo-600 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-center">
             销量
          </div>
          {Array.from({ length: cols }).map((_, cIndex) => (
            <div key={`dem-${cIndex}`} className="flex flex-col items-center justify-center p-3 font-bold text-slate-500 bg-slate-50 rounded-xl border border-slate-200/60 relative">
               <span className="font-mono">{problem.demand[cIndex]}</span>
               {v[cIndex] !== null && (
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-white bg-indigo-500 px-1.5 py-0.5 rounded shadow-lg shadow-indigo-200 z-20 animate-in zoom-in">
                    v={v[cIndex]}
                  </span>
                )}
            </div>
          ))}
          <div className="bg-slate-100 rounded-xl opacity-20"></div> 

        </div>
      </div>
    </div>
  );
};

export default Tableau;