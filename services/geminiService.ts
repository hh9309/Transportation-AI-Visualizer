
import { GoogleGenAI } from "@google/genai";
import { SolverState } from "../types";

// Default instance
let ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getAIExplanation = async (
  state: SolverState,
  context: string,
  modelId: string = 'gemini-2.5-flash',
  apiKey?: string
): Promise<string> => {
  
  // If a custom key is provided (e.g. for DeepSeek simulation or user's own key), 
  // re-instantiate or use it. For this demo, we use Gemini for all to ensure stability,
  // but if the user provided a key, we try to use it with the Gemini SDK.
  let activeModel = 'gemini-2.5-flash';
  
  if (apiKey) {
      ai = new GoogleGenAI({ apiKey });
  } else {
      // Revert to default if no key passed
      ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  // Simplify the grid for the prompt to save tokens
  const gridSummary = state.grid.map(row => 
    row.map(c => `(${c.row},${c.col}): C=${c.cost}, Alloc=${c.allocation ?? 0}, Basic=${c.isBasin}, Delta=${c.opportunityCost ?? 'N/A'}`).join(' | ')
  ).join('\n');

  const prompt = `
    你是一位运筹学（Operations Research）专家和助教。
    用户正在使用“表上作业法”解决运输问题。
    
    当前步骤说明: ${context}
    当前状态: ${state.status}
    当前迭代次数: ${state.iteration}
    当前总运费: ${state.totalCost}
    
    表格状态矩阵:
    ${gridSummary}

    请用中文简要解释这一步的数学原理（2-3句话）。
    - 解释重点在于“为什么这么做”以及“下一步会对结果产生什么影响”。
    - 如果是调整（Pivot），请解释运费是如何降低的。
    - 如果是寻找闭回路，请解释闭回路的意义。
    - 不要使用Markdown格式（如**加粗**），仅使用纯文本。
  `;

  try {
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: prompt,
    });
    return response.text || "无法生成解释。";
  } catch (error) {
    console.error("AI Error:", error);
    return "AI 助教暂时无法连接（请检查 API Key）。";
  }
};
