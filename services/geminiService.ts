import { GoogleGenAI } from "@google/genai";
import { SolverState } from "../types";

// Removed global instance to avoid 'process is not defined' error in browser/Netlify deployments
// let ai = new GoogleGenAI({ apiKey: process.env.API_KEY }); 

export const getAIExplanation = async (
  state: SolverState,
  context: string,
  modelId: string = 'gemini-2.5-flash',
  apiKey?: string
): Promise<string> => {
  
  // Ensure we have a key before proceeding
  if (!apiKey) {
      return "请在右侧设置中输入 API Key 以使用 AI 智能助教功能。";
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

  // Handle DeepSeek models via fetch since SDK is for Google GenAI
  if (modelId.includes('deepseek')) {
    try {
      // Using standard DeepSeek endpoint structure with the requested v1 base
      // User requested URL: https://api.deepseek.com/v1
      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat", // DeepSeek V3 is 'deepseek-chat'
          messages: [
            { role: "system", content: "You are a helpful Operations Research assistant." },
            { role: "user", content: prompt }
          ],
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "AI 未返回解释。";

    } catch (error) {
      console.error("DeepSeek Error:", error);
      return `DeepSeek 连接失败: ${error instanceof Error ? error.message : "未知错误"}`;
    }
  }

  // Fallback to Google Gemini
  // Instantiate the client dynamically with the user-provided key
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: modelId, // Use the passed model ID (e.g. gemini-2.5-flash)
      contents: prompt,
    });
    return response.text || "无法生成解释。";
  } catch (error) {
    console.error("AI Error:", error);
    return "AI 助教连接失败。请检查您的 API Key 是否正确，或者该 Key 是否有权限访问所选模型。";
  }
};