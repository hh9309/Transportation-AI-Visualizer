import { GoogleGenAI } from "@google/genai";
import { SolverState } from "../types";

export const getAIExplanation = async (
  state: SolverState,
  context: string,
  modelId: string = 'gemini-2.5-flash'
): Promise<string> => {
  
  // The API key must be obtained exclusively from the environment variable process.env.API_KEY.
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
      console.error("API Key is missing from environment variables.");
      return "系统配置错误：未找到 API Key。";
  }

  // Simplify the grid for the prompt to save tokens
  const gridSummary = state.grid.map(row => 
    row.map(c => `(${c.row},${c.col}): C=${c.cost}, Alloc=${c.allocation ?? 0}, Basic=${c.isBasin}, Delta=${c.opportunityCost ?? 'N/A'}`).join(' | ')
  ).join('\n');

  const prompt = `
    你是一位运筹学（Operations Research）专家和助教。
    用户正在使用“Transportation AI Visualizer”求解运输问题。
    
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

  // Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
    });
    
    // Correct way to access text from GenerateContentResponse
    return response.text || "无法生成解释。";
  } catch (error) {
    console.error("AI Error:", error);
    return "AI 助教连接失败。";
  }
};
