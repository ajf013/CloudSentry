import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

async function callGemini(prompt: string, systemInstruction: string) {
  const ai = getGeminiClient();
  if (!ai) return null;

  const modelsToTry = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    let retries = 3;
    let delay = 500;

    while (retries > 0) {
      try {
        console.log(`[Copilot API] Querying Gemini model: ${model}`);
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction
          }
        });
        return response.text;
      } catch (error: any) {
        lastError = error;
        const errMsg = error.message || String(error);
        const isTransient = errMsg.includes("503") || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED");

        if (isTransient && retries > 1) {
          retries--;
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
        } else {
          break;
        }
      }
    }
  }
  throw lastError || new Error("All Gemini models failed in Copilot.");
}

async function callAzureOpenAI(prompt: string, systemInstruction: string) {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";

  if (!apiKey || !endpoint) return null;

  const cleanEndpoint = endpoint.replace(/\/$/, "");
  const url = `${cleanEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Azure OpenAI failed in Copilot: ${errorText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, context } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400 });
    }

    const { tenantName, activeSubscription, secureScore, recommendations } = context || {};

    const systemInstruction = `
You are the CloudSentry AI Security Copilot. You assist cloud administrators in analyzing their security posture and hardening resources.
Current Session Directory Context:
- Active Tenant: ${tenantName || "Unknown tenant"}
- Active Subscription: ${activeSubscription || "None selected"}
- Security Posture Score: ${secureScore ? Math.round(secureScore.percentage) + "%" : "Unknown"}
- Unhealthy Rules: ${recommendations ? recommendations.filter((r: any) => r.status === "Unhealthy").length : 0} rules failing.

Failing Security Rules List:
${recommendations ? recommendations.filter((r: any) => r.status === "Unhealthy").slice(0, 10).map((r: any, index: number) => `${index + 1}. ${r.displayName} (Severity: ${r.severity})`).join("\n") : "None loaded."}

Answer the user's questions clearly and concisely. If they ask about fixing a specific issue or group of issues, provide actionable advice. Use markdown for format, tables, and code snippets.
    `;

    // Construct prompt from conversation history
    const conversationHistory = messages.map((m: any) => `${m.sender === "user" ? "User" : "Copilot"}: ${m.text}`).join("\n");
    const prompt = `Conversation history:\n${conversationHistory}\n\nCopilot, please answer the last question.`;

    let reply = "";
    
    // Prioritize Gemini first, fall back to Azure OpenAI
    try {
      const geminiReply = await callGemini(prompt, systemInstruction);
      if (geminiReply) {
        reply = geminiReply;
      }
    } catch (e: any) {
      console.warn("Gemini Copilot failed, attempting Azure OpenAI fallback", e);
      try {
        const azureReply = await callAzureOpenAI(prompt, systemInstruction);
        if (azureReply) {
          reply = azureReply;
        }
      } catch (azureErr: any) {
        console.error("Azure OpenAI Copilot also failed", azureErr);
        throw new Error("Both Gemini and Azure OpenAI engines failed to respond.");
      }
    }

    if (!reply) {
      // Return mock response if no API keys are present (for local testing/demo fallback)
      reply = `**[Demo Mode]** I see you are asking about your CloudSentry security posture. Currently, your score is **${secureScore ? Math.round(secureScore.percentage) : "68"}%** with **${recommendations ? recommendations.filter((r: any) => r.status === "Unhealthy").length : "15"}** unhealthy rules.
      
To improve your posture immediately:
1. Hardening your storage account firewalls would increase your score weight by about 12 points.
2. Enabling MFA on your tenant admins is recommended to mitigate identity takeover risks.

Let me know if you would like me to draft a Terraform template or Azure CLI script to fix these!`;
    }

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error("Copilot API handler failed:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to process chat conversation",
      details: error.toString()
    }, { status: 500 });
  }
}
