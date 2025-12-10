import React, { useState, useEffect, useRef } from 'react';
import Tableau from './components/Tableau';
import { ProblemState, SolverState, LogEntry } from './types';
import { solveLeastCost, calculatePotentials, calculateOpportunityCosts, findLoop, applyPivot, generateRandomProblem, createEmptyGrid, calculateTotalCost } from './utils/solver';
import { getAIExplanation } from './services/geminiService';
import { Play, RotateCcw, Brain, CheckCircle, ArrowRight, Settings, Activity, List, Calculator, Cpu, ChevronRight, Key, Plus, Minus, FastForward, Zap } from 'lucide-react';
import { clsx } from 'clsx';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const App: React.FC = () => {
  // --- Configuration State ---
  const [config, setConfig] = useState({ rows: 3, cols: 4 });

  // --- Problem State ---
  const [problem, setProblem] = useState<ProblemState | null>(null);

  const [solver, setSolver] = useState<SolverState>({
    grid: [],
    u: [],
    v: [],
    totalCost: 0,
    status: 'input',
    message: "请配置问题规模",
    stepDescription: "选择产地和销地数量，生成平衡型运输问题。",
    iteration: 0
  });

  const [history, setHistory] = useState<LogEntry[]>([]);
  const [aiTip, setAiTip] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  const [customKey, setCustomKey] = useState("");
  const [isAutoSolving, setIsAutoSolving] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [aiTip]);

  // Auto Solve Effect
  useEffect(() => {
    let timer: number;
    // Only trigger next iteration if we are in 'ready' state (stable state between iterations)
    if (isAutoSolving && solver.status === 'ready') {
      timer = window.setTimeout(() => {
         handleNextIteration();
      }, 500); 
    } else if (solver.status === 'optimal') {
      setIsAutoSolving(false);
    }
    return () => clearTimeout(timer);
  }, [isAutoSolving, solver.status]);

  // --- Actions ---

  const addLog = (iter: number, phase: string, desc: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', cost?: number) => {
    setHistory(prev => {
      return [...prev, {
        id: Date.now(),
        iteration: iter,
        phase,
        description: desc,
        cost: cost ?? solver.totalCost,
        type
      }];
    });
  };

  const handleGenerate = () => {
    setIsAutoSolving(false);
    const newProblem = generateRandomProblem(config.rows, config.cols);
    setProblem(newProblem);
    
    // VISUAL UPDATE: Show empty table immediately (Input Stage)
    const emptyGrid = createEmptyGrid(newProblem.rowCount, newProblem.colCount, newProblem.costs);

    setSolver({
      grid: emptyGrid,
      u: new Array(newProblem.rowCount).fill(null),
      v: new Array(newProblem.colCount).fill(null),
      totalCost: 0,
      status: 'input', // Ready for initial solution
      message: "运输表已构建",
      stepDescription: "请确认单位运价、产量和销量。点击“开始求解”以使用最小元素法生成初始基可行解。",
      iteration: 0
    });
    setHistory([]);
    setAiTip("");
  };

  const handleStart = () => {
    if (!problem) return;

    // 1. Initial Basic Feasible Solution (Least Cost)
    const initialGrid = solveLeastCost(problem);
    const cost = calculateTotalCost(initialGrid);
    
    const newState: SolverState = {
      grid: initialGrid,
      u: new Array(problem.rowCount).fill(null),
      v: new Array(problem.colCount).fill(null),
      totalCost: cost,
      status: 'ready', // CHANGED: 'ready' means we have a valid grid, ready to check optimality
      message: "初始基可行解 (IBFS)",
      stepDescription: "最小元素法：优先分配运价最低的路径。这是第一次迭代的起点。",
      iteration: 1
    };
    setSolver(newState);
    
    setHistory([{
      id: Date.now(),
      iteration: 1,
      phase: "初始化",
      description: "生成初始可行解 (最小元素法)",
      cost: cost,
      type: 'info'
    }]);
  };

  // --- Step-by-Step Logic (Granular) ---
  const handleNextStep = () => {
    if (!problem) return;

    setSolver(prev => {
      let nextState = { ...prev };
      
      switch (prev.status) {
        case 'ready': // Start of an iteration cycle
          // Step 1: Calculate Potentials
          const { u, v } = calculatePotentials(prev.grid, problem.rowCount, problem.colCount);
          nextState.u = u;
          nextState.v = v;
          nextState.status = 'potentials';
          nextState.message = `迭代 ${prev.iteration}: 计算位势`;
          nextState.stepDescription = `根据基变量满足 u_i + v_j = c_ij 的条件，求解各行各列的位势。`;
          return nextState;

        case 'potentials':
          // Step 2: Calculate Deltas
          const { grid: gridWithDeltas, minDelta, enteringCell } = calculateOpportunityCosts(prev.grid, prev.u, prev.v);
          
          if (minDelta >= 0) {
            // OPTIMAL
            nextState.grid = gridWithDeltas;
            nextState.status = 'optimal';
            nextState.message = "最优解达成！";
            nextState.stepDescription = "所有非基变量检验数 Δ_ij ≥ 0，无法继续优化。";
            addLog(prev.iteration, "检验", "所有检验数 ≥ 0，达到最优", 'success', prev.totalCost);
          } else {
            // NOT OPTIMAL -> Mark Entering Cell
            if (enteringCell) {
              gridWithDeltas[enteringCell.r][enteringCell.c].highlight = 'entering';
            }
            nextState.grid = gridWithDeltas;
            nextState.status = 'deltas';
            nextState.message = `迭代 ${prev.iteration}: 检验非优`;
            nextState.stepDescription = `发现最小检验数 ${minDelta} (小于0)。选定该单元格为调入变量，需要调整运输方案。`;
            addLog(prev.iteration, "检验", `发现负检验数 ${minDelta}，需优化`, 'warning');
          }
          return nextState;

        case 'deltas':
          // Step 3: Find Loop
          let enteringNode = { r: -1, c: -1 };
          prev.grid.forEach(row => row.forEach(c => {
            if (c.highlight === 'entering') enteringNode = { r: c.row, c: c.col };
          }));

          const loop = findLoop(enteringNode, prev.grid);
          if (loop) {
            const gridWithLoop = prev.grid.map(row => row.map(cell => ({...cell})));
            loop.forEach((node, idx) => {
              if (idx === 0) return;
              const type = idx % 2 === 0 ? 'loop-plus' : 'loop-minus';
              gridWithLoop[node.r][node.c].highlight = type;
            });
            nextState.grid = gridWithLoop;
            nextState.status = 'loop';
            nextState.message = `迭代 ${prev.iteration}: 构建闭回路`;
            nextState.stepDescription = "找到闭回路。偶数点(+)增加运量，奇数点(-)减少运量。计算调整量 θ。";
          } else {
             nextState.message = "错误：闭回路查找失败";
             addLog(prev.iteration, "错误", "闭回路查找失败", 'error');
          }
          return nextState;

        case 'loop':
          // Step 4: Apply Pivot & GO TO READY
          let eNode = { r: -1, c: -1 };
          prev.grid.forEach(row => row.forEach(c => {
            if (c.highlight === 'entering') eNode = { r: c.row, c: c.col };
          }));
          const loopToApply = findLoop(eNode, prev.grid);
          
          if (loopToApply) {
             const { newGrid, theta } = applyPivot(prev.grid, loopToApply);
             const newCost = calculateTotalCost(newGrid);
             
             // Clean slate for next iteration
             const cleanGrid = newGrid.map(row => row.map(c => ({
                ...c, 
                opportunityCost: undefined,
                highlight: 'none' as const
             })));

             nextState.grid = cleanGrid;
             nextState.totalCost = newCost;
             nextState.u = new Array(problem.rowCount).fill(null);
             nextState.v = new Array(problem.colCount).fill(null);
             
             // IMPORTANT: Reset to 'ready' state for the NEXT iteration
             nextState.status = 'ready'; 
             nextState.iteration = prev.iteration + 1;
             nextState.message = `迭代 ${prev.iteration + 1}: 调整完成，准备检验`;
             nextState.stepDescription = `调整运量 θ=${theta}，总运费更新为 ¥${newCost}。现在点击“下一步”开始计算新方案的位势和检验数。`;
             
             addLog(prev.iteration, "调整", `调整运量 θ=${theta}，运费降至 ${newCost}`, 'info', newCost);
          }
          return nextState;

        default:
          return prev;
      }
    });
  };

  // --- Auto / Full Iteration Logic (Sequence with Delays) ---
  const handleNextIteration = async () => {
    if (!problem) return;
    
    // Safety check: only run full iteration from ready state (or IBFS)
    // We capture the current grid state to perform calculations
    const currentGrid = solver.grid;
    const currentIteration = solver.iteration;

    // 1. Calculate Potentials
    const { u, v } = calculatePotentials(currentGrid, problem.rowCount, problem.colCount);
    
    // VISUAL: Show Potentials
    setSolver(prev => ({
        ...prev,
        u, v,
        status: 'potentials',
        message: `迭代 ${currentIteration}: 计算位势`,
        stepDescription: "根据基变量计算行位势 u 和列位势 v。"
    }));

    await delay(2000); // Wait 2s

    // 2. Calculate Deltas & Find Loop
    // Recalculate based on currentGrid + u/v (pure math)
    const { grid: gridWithDeltas, minDelta, enteringCell } = calculateOpportunityCosts(currentGrid, u, v);

    if (minDelta >= 0) {
        // Optimal Reached
        setSolver(prev => ({
            ...prev,
            grid: gridWithDeltas,
            status: 'optimal',
            message: "最优解达成！",
            stepDescription: "所有非基变量检验数 ≥ 0。",
            totalCost: calculateTotalCost(gridWithDeltas)
        }));
        addLog(currentIteration, "检验", "所有检验数 ≥ 0，达到最优", 'success', calculateTotalCost(gridWithDeltas));
        return;
    }

    // Identify Loop
    let loopToDisplay = null;
    let gridWithLoop = gridWithDeltas;
    
    if (enteringCell) {
        gridWithDeltas[enteringCell.r][enteringCell.c].highlight = 'entering';
        loopToDisplay = findLoop(enteringCell, gridWithDeltas);
        
        if (loopToDisplay) {
             gridWithLoop = gridWithDeltas.map(row => row.map(cell => ({...cell})));
             loopToDisplay.forEach((node, idx) => {
               if (idx === 0) return;
               const type = idx % 2 === 0 ? 'loop-plus' : 'loop-minus';
               gridWithLoop[node.r][node.c].highlight = type;
             });
        }
    }

    // VISUAL: Show Loop (skip separate 'deltas' view for smoothness in auto mode)
    setSolver(prev => ({
        ...prev,
        grid: gridWithLoop,
        status: 'loop',
        message: `迭代 ${currentIteration}: 寻找闭回路`,
        stepDescription: `最小检验数 Δ=${minDelta}。构建闭回路准备调整。`
    }));

    await delay(2000); // Wait 2s

    // 3. Apply Pivot & Show Result
    if (loopToDisplay) {
        const { newGrid, theta } = applyPivot(gridWithLoop, loopToDisplay);
        const cleanGrid = newGrid.map(row => row.map(c => ({
          ...c, opportunityCost: undefined, highlight: 'none' as const
        })));
        const newCost = calculateTotalCost(cleanGrid);

        setSolver(prev => ({
            ...prev,
            grid: cleanGrid,
            u: new Array(problem.rowCount).fill(null),
            v: new Array(problem.colCount).fill(null),
            status: 'ready', // Back to ready for next iteration
            iteration: currentIteration + 1,
            totalCost: newCost,
            message: `迭代 ${currentIteration + 1}: 调整完成`,
            stepDescription: `调整量 θ=${theta}，运费降至 ¥${newCost}。`
        }));
        addLog(currentIteration, "调整", `调整运量 θ=${theta}，运费降至 ${newCost}`, 'info', newCost);
    }
  };

  const handleAutoSolve = () => {
      setIsAutoSolving(true);
      if (solver.status === 'input') {
          handleStart();
      }
  };

  const askAI = async () => {
    if (!customKey) {
      alert("请先输入 API Key 才能使用 AI 助教功能。");
      return;
    }

    setLoadingAi(true);
    const tip = await getAIExplanation(solver, solver.stepDescription, selectedModel, customKey);
    setAiTip(tip);
    setLoadingAi(false);
  };

  // --- Render Helpers ---

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100 flex flex-col">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Activity className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Transportation AI Visualizer</h1>
              <p className="text-xs text-slate-500 font-medium">运筹学运输问题表上作业法求解系统</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="hidden md:flex items-center px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-600">
                <Settings className="w-3 h-3 mr-2" />
                MODI 闭回路法
             </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 lg:p-6 grid grid-cols-12 gap-6">
          
        {/* LEFT SIDEBAR: Config & History */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 max-h-[calc(100vh-100px)] sticky top-24">
           
           {/* Step 1: Configuration / Status Panel */}
           <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 transition-all">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4" /> 问题配置
              </h2>

              {!problem ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">产地数 (Rows)</label>
                      <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                        <button onClick={() => setConfig(p => ({...p, rows: Math.max(2, p.rows-1)}))} className="p-2 hover:bg-white rounded shadow-sm"><Minus className="w-3 h-3"/></button>
                        <span className="flex-1 text-center font-mono font-bold">{config.rows}</span>
                        <button onClick={() => setConfig(p => ({...p, rows: Math.min(6, p.rows+1)}))} className="p-2 hover:bg-white rounded shadow-sm"><Plus className="w-3 h-3"/></button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">销地数 (Cols)</label>
                      <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                        <button onClick={() => setConfig(p => ({...p, cols: Math.max(2, p.cols-1)}))} className="p-2 hover:bg-white rounded shadow-sm"><Minus className="w-3 h-3"/></button>
                        <span className="flex-1 text-center font-mono font-bold">{config.cols}</span>
                        <button onClick={() => setConfig(p => ({...p, cols: Math.min(6, p.cols+1)}))} className="p-2 hover:bg-white rounded shadow-sm"><Plus className="w-3 h-3"/></button>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={handleGenerate}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-sm transition-all"
                  >
                    构造运输表
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-4">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">当前总运费</div>
                      <div className="text-2xl font-mono font-bold text-indigo-600 tracking-tight">
                        ¥ {solver.totalCost}
                      </div>
                    </div>
                    <div className="text-right">
                       <div className="text-xs text-slate-500 mb-1">迭代轮次</div>
                       <div className="text-lg font-mono font-bold text-slate-700">{solver.iteration}</div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {solver.status === 'input' ? (
                      <button 
                        onClick={handleStart}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                      >
                        <Play className="w-5 h-5 fill-current" /> 开始求解
                      </button>
                    ) : (
                      <>
                        {solver.status !== 'optimal' && !isAutoSolving && (
                          <>
                             {/* Primary Step Action */}
                             <button 
                                onClick={handleNextStep}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                              >
                                 <ArrowRight className="w-5 h-5" /> 
                                 {solver.status === 'ready' ? '计算位势 (逐步)' :
                                  solver.status === 'potentials' ? '计算检验数 (逐步)' :
                                  solver.status === 'deltas' ? '寻找闭回路 (逐步)' :
                                  '调整运量 (逐步)'}
                              </button>

                              {/* Iteration Shortcuts */}
                              {(solver.status === 'ready' || solver.status === 'input') && (
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <button 
                                      onClick={handleNextIteration}
                                      disabled={solver.status !== 'ready' && solver.status !== 'input'}
                                      className="py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                                    >
                                      <Zap className="w-3 h-3" /> 下一轮迭代
                                    </button>
                                    <button 
                                      onClick={handleAutoSolve}
                                      className="py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all"
                                    >
                                      <FastForward className="w-3 h-3" /> 自动求解
                                    </button>
                                </div>
                              )}
                          </>
                        )}

                        {isAutoSolving && (
                           <button 
                              onClick={() => setIsAutoSolving(false)}
                              className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 animate-pulse"
                            >
                              <Minus className="w-4 h-4" /> 停止自动求解
                            </button>
                        )}
                        
                        {!isAutoSolving && (
                           <button 
                            onClick={() => setProblem(null)}
                            className="w-full py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm mt-2"
                          >
                            <RotateCcw className="w-3 h-3" /> 重新配置问题
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
           </div>

           {/* Solution Process History */}
           {problem && (
             <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col min-h-[300px]">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <List className="w-4 h-4" /> 求解过程记录
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar relative">
                  <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-slate-100"></div>
                  {history.length === 0 && (
                    <div className="text-center text-slate-400 text-sm py-8 relative z-10">暂无记录</div>
                  )}
                  {history.map((log) => (
                    <div key={log.id} className="relative pl-8 z-10 group animate-in slide-in-from-bottom-2 duration-300">
                      <div className={clsx(
                        "absolute left-[1px] top-1.5 w-4 h-4 rounded-full border-2 bg-white transition-colors",
                        log.type === 'success' ? "border-green-500 group-hover:bg-green-500" :
                        log.type === 'warning' ? "border-orange-500 group-hover:bg-orange-500" :
                        "border-indigo-400 group-hover:bg-indigo-400"
                      )}></div>
                      <div className="flex flex-col">
                         <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 rounded">
                              第 {log.iteration} 轮
                            </span>
                            <span className="text-xs font-bold text-slate-500">{log.phase}</span>
                         </div>
                         <div className="text-sm font-medium text-slate-700">{log.description}</div>
                         <div className="mt-1 text-xs font-mono text-indigo-500 bg-indigo-50 inline-block px-1.5 rounded">
                           Cost: ¥{log.cost}
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
             </div>
           )}
        </div>

        {/* CENTER: Visualization */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-4">
           {/* Step Status Banner */}
           <div className="bg-white border-l-4 border-indigo-500 rounded-r-xl shadow-sm p-4 flex items-start gap-4 min-h-[100px]">
              <div className={clsx(
                "p-2 rounded-lg shrink-0 transition-colors",
                solver.status === 'optimal' ? "bg-green-100 text-green-600" : "bg-indigo-50 text-indigo-600"
              )}>
                {solver.status === 'optimal' ? <CheckCircle className="w-6 h-6" /> : <Activity className="w-6 h-6" />}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                   <h3 className="font-bold text-slate-800 text-lg mb-1">{solver.message}</h3>
                   {solver.status !== 'input' && (
                     <span className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-1 rounded">
                       Status: {solver.status}
                     </span>
                   )}
                </div>
                <p className="text-slate-600 leading-relaxed text-sm">{solver.stepDescription}</p>
              </div>
           </div>

           {/* Main Tableau */}
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-1 overflow-hidden min-h-[500px] flex flex-col">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    运输表
                    {solver.status === 'potentials' && <span className="text-[10px] text-white bg-indigo-500 px-1.5 rounded">MODI</span>}
                    {solver.status === 'ready' && <span className="text-[10px] text-indigo-600 bg-indigo-100 px-1.5 rounded">Ready</span>}
                 </h3>
                 <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-indigo-100 border border-indigo-300"></div> 基变量</div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300"></div> (+) 调入</div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300"></div> (-) 调出</div>
                 </div>
              </div>
              <div className="p-4 flex-1 flex items-center justify-center bg-slate-50/30 overflow-auto relative">
                 {!problem ? (
                   <div className="text-center text-slate-400">
                      <Calculator className="w-16 h-16 mx-auto mb-4 opacity-20" />
                      <p>请在左侧配置并生成问题</p>
                   </div>
                 ) : (
                   <Tableau solverState={solver} problem={problem} />
                 )}
              </div>
           </div>
           
           {/* Math Hints */}
           <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                 <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">当前计算公式</h4>
                 <div className="text-sm font-mono text-slate-600 bg-slate-50 p-2 rounded min-h-[40px] flex items-center">
                    {solver.status === 'potentials' && <span>u<sub>i</sub> + v<sub>j</sub> = c<sub>ij</sub> (对于基变量)</span>}
                    {solver.status === 'deltas' && <span>Δ<sub>ij</sub> = c<sub>ij</sub> - (u<sub>i</sub> + v<sub>j</sub>)</span>}
                    {solver.status === 'loop' && <span>θ = min(分配量<sub>(-)</sub>)</span>}
                    {solver.status === 'ready' && <span>Total Cost = Σ (x<sub>ij</sub> × c<sub>ij</sub>)</span>}
                    {solver.status === 'input' && <span>Supply = Demand</span>}
                    {solver.status === 'optimal' && <span className="text-green-600">Total Cost = Σ (x<sub>ij</sub> × c<sub>ij</sub>)</span>}
                 </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                 <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">算法提示</h4>
                 <div className="text-xs text-slate-500 leading-relaxed">
                    {solver.status === 'optimal' 
                      ? "所有检验数非负，当前解即为最优解。" 
                      : "每次迭代：先算位势 u,v → 算空格检验数 Δ → 找最小负 Δ 进基 → 找闭回路调整。调整后必须重新计算位势。"}
                 </div>
              </div>
           </div>
        </div>

        {/* RIGHT: AI Tutor */}
        <div className="col-span-12 lg:col-span-3 max-h-[calc(100vh-100px)] sticky top-24">
           <div className="bg-white rounded-2xl shadow-xl shadow-indigo-100/50 border border-slate-200 h-full flex flex-col overflow-hidden">
              <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-5 text-white">
                 <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold flex items-center gap-2 text-lg"><Brain className="w-5 h-5"/> AI 智能助教</h3>
                    <div className="px-2 py-0.5 bg-white/20 rounded-full text-[10px] font-medium border border-white/10 backdrop-blur-sm">Live</div>
                 </div>
                 
                 {/* Model Selector */}
                 <div className="space-y-3">
                   <div>
                     <label className="text-[10px] uppercase font-bold text-indigo-200 mb-1 flex items-center gap-1">
                       <Cpu className="w-3 h-3" /> 模型选择
                     </label>
                     <div className="relative group">
                       <select 
                         value={selectedModel}
                         onChange={(e) => {
                           setSelectedModel(e.target.value);
                         }}
                         className="w-full pl-3 pr-8 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none cursor-pointer hover:bg-white/20 transition-colors"
                       >
                          <option value="gemini-2.5-flash" className="text-slate-900">Google Gemini 2.5 Flash</option>
                          <option value="deepseek-v3" className="text-slate-900">DeepSeek V3 (Custom Key)</option>
                       </select>
                       <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 rotate-90 pointer-events-none" />
                     </div>
                   </div>

                   {/* API Key Input (Always Shown now) */}
                   <div className="animate-in fade-in slide-in-from-top-2">
                      <label className="text-[10px] uppercase font-bold text-indigo-200 mb-1 flex items-center gap-1">
                        <Key className="w-3 h-3" /> API Key
                      </label>
                      <input 
                        type="password" 
                        placeholder={selectedModel.includes('deepseek') ? "请输入 DeepSeek Key..." : "请输入 Gemini Key..."}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-xs text-white placeholder:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-white/30"
                        value={customKey}
                        onChange={(e) => setCustomKey(e.target.value)}
                      />
                   </div>
                 </div>
              </div>

              {/* Chat Area */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4 custom-scrollbar">
                  {!aiTip && (
                    <div className="flex flex-col items-center justify-center h-40 text-center opacity-60">
                       <Brain className="w-8 h-8 text-indigo-300 mb-2" />
                       <p className="text-xs text-slate-500 max-w-[200px]">点击下方按钮，让 {selectedModel.split('-')[0]} 解释当前步骤的数学逻辑。</p>
                    </div>
                  )}
                  
                  {aiTip && (
                    <div className="flex gap-3">
                       <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shrink-0 text-white font-bold text-xs shadow-md">AI</div>
                       <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 text-sm text-slate-700 leading-relaxed animate-in fade-in slide-in-from-left-2">
                          {aiTip}
                       </div>
                    </div>
                  )}
              </div>

              {/* Action Area */}
              <div className="p-4 bg-white border-t border-slate-200">
                 <button 
                   onClick={askAI}
                   disabled={loadingAi || solver.status === 'input'}
                   className="w-full py-3 bg-slate-900 hover:bg-indigo-900 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-200 active:scale-95"
                 >
                   <Brain className="w-4 h-4" /> 解释当前步骤
                 </button>
              </div>
           </div>
        </div>

      </main>
    </div>
  );
};

export default App;