import { GoogleGenAI } from "@google/genai";
import { SolverState } from "../types";

export type AIProvider = 'gemini' | 'deepseek';

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

const SYSTEM_PROMPT = `
你是一位运筹学（Operations Research）专家助教，专门帮助用户理解“运输问题”的求解过程。
请用简洁、通俗的中文回答。
如果用户询问当前步骤，请重点解释“为什么这样做”以及“数学意义”。
不要使用 Markdown 的加粗或标题语法，保持纯文本格式以便在聊天框中显示。
`;

export const sendMessageToAI = async (
  provider: AIProvider,
  apiKey: string,
  messages: ChatMessage[],
  solverState: SolverState | null
): Promise<string> => {
  
  // 1. Context Preparation
  let systemContext = SYSTEM_PROMPT;
  if (solverState) {
    const gridSummary = solverState.grid.map(row => 
      row.map(c => `(${c.row},${c.col}):C=${c.cost},X=${c.allocation??0},B=${c.isBasin},Δ=${c.opportunityCost??'N/A'}`).join('|')
    ).join('\n');

    systemContext += `
    \n[当前运输表状态]
    阶段: ${solverState.status}
    迭代: ${solverState.iteration}
    总运费: ${solverState.totalCost}
    矩阵数据:
    ${gridSummary}
    `;
  }

  try {
    // --- DEEPSEEK IMPLEMENTATION ---
    if (provider === 'deepseek') {
      if (!apiKey) {
        throw new Error(`未配置 DeepSeek API Key。`);
      }
      // Convert format for OpenAI-compatible API
      // Map 'model' role to 'assistant' for OpenAI format
      const apiMessages = [
        { role: "system", content: systemContext },
        ...messages.map(m => ({ 
            role: m.role === 'model' ? 'assistant' : m.role, 
            content: m.content 
        }))
      ];

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: apiMessages,
          stream: false,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `DeepSeek 请求失败: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "DeepSeek 未返回内容";
    } 
    
    // --- GEMINI IMPLEMENTATION ---
    else {
      // Use process.env.API_KEY exclusively for Gemini
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Gemini history format
      const history = messages.slice(0, -1).map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));
      
      const lastMessage = messages[messages.length - 1].content;

      const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: systemContext
        },
        history: history
      });

      const result = await chat.sendMessage({ message: lastMessage });
      return result.text || "";
    }

  } catch (error: any) {
    console.error("AI Service Error:", error);
    return `AI 响应错误: ${error.message}`;
  }
};
