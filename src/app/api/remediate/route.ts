import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini client if API key is present
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

async function callGemini(prompt: string, systemInstruction: string) {
  const ai = getGeminiClient();
  if (!ai) return null;

  // Attempt models in order of capability, falling back if overloaded
  const modelsToTry = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    let retries = 3;
    let delay = 500;

    while (retries > 0) {
      try {
        console.log(`[Gemini API] Querying model: ${model} (Retries left: ${retries - 1})`);
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            systemInstruction
          }
        });

        const responseText = response.text;
        if (!responseText) {
          throw new Error("Empty response received from Gemini API");
        }

        let cleanJson = responseText.trim();
        if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/```$/, "").trim();
        }

        console.log(`[Gemini API] Success using model: ${model}`);
        return JSON.parse(cleanJson);
      } catch (error: any) {
        lastError = error;
        const errMsg = error.message || String(error);
        const isTransient = errMsg.includes("503") || 
                            errMsg.includes("UNAVAILABLE") || 
                            errMsg.includes("429") || 
                            errMsg.includes("RESOURCE_EXHAUSTED");

        console.warn(`[Gemini API] Error on model ${model}: ${errMsg}. Transient: ${isTransient}`);

        if (isTransient && retries > 1) {
          retries--;
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // exponential backoff
        } else {
          // Break out of retry loop for this model and proceed to the next fallback model
          break;
        }
      }
    }
  }

  throw lastError || new Error("All Gemini models failed to generate content.");
}

async function callAzureOpenAI(prompt: string, systemInstruction: string) {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";

  if (!apiKey || !endpoint) return null;

  // Clean trailing slashes from endpoint
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
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Azure OpenAI API failed with status ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty content received from Azure OpenAI API");
  }

  let cleanJson = content.trim();
  if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/```$/, "").trim();
  }

  return JSON.parse(cleanJson);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { displayName, description, remediation, resourceId, subscriptionId, assessmentName } = body;
    
    if (!displayName) {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }

    const systemInstruction = "You are an expert Azure Security Engineer and Cloud Architect. You output only valid JSON matching the requested fields, with no markdown wrapping and no backticks. Ensure your commands and scripts are accurate.";

    const prompt = `
      Recommendation Name: ${displayName}
      Description: ${description || "No description provided."}
      Azure Remediation Steps: ${remediation || "No default steps provided."}
      Resource ID: ${resourceId || "Subscription level"}
      Subscription ID: ${subscriptionId}
      Assessment Name/Key: ${assessmentName}

      Provide a structured JSON response to guide the user on how to resolve or exempt this recommendation.
      
      Requirements for the JSON response:
      - "description": A concise, executive summary of what this security rule is, why it failed, and the security risk.
      - "manualFix": A string array detailing clear, step-by-step clicks in the Azure Portal to fix this.
      - "scriptFix": An object containing:
        - "cli": A copy-pasteable Azure CLI bash command to remediate this specific resource.
      - "exemptionRationale": A short paragraph explaining when it is acceptable to exempt this rule (e.g. sandbox env, legacy systems, alternate controls).
      - "exemptionCommand": The exact Azure CLI command to exempt this recommendation. It must follow this pattern:
        az security exemption create --name "ex-${assessmentName || "assessment"}" --resource-id "${resourceId || `/subscriptions/${subscriptionId}`}" --exemption-category "Waiver" --display-name "Exempt: ${displayName}" --description "Business waiver for security assessment"
    `;

    // Execute in parallel
    const [geminiResult, azureResult] = await Promise.allSettled([
      callGemini(prompt, systemInstruction),
      callAzureOpenAI(prompt, systemInstruction)
    ]);

    const result: any = {
      gemini: null,
      azureOpenAI: null
    };

    if (geminiResult.status === "fulfilled") {
      result.gemini = geminiResult.value;
    } else {
      console.error("Gemini failed:", geminiResult.reason);
      result.geminiError = geminiResult.reason?.message || String(geminiResult.reason);
    }

    if (azureResult.status === "fulfilled") {
      result.azureOpenAI = azureResult.value;
    } else {
      console.error("Azure OpenAI failed:", azureResult.reason);
      result.azureOpenAIError = azureResult.reason?.message || String(azureResult.reason);
    }

    // If both failed, throw an error
    if (!result.gemini && !result.azureOpenAI) {
      throw new Error(`Both AI providers failed. Gemini: ${result.geminiError || "Not configured"}. Azure OpenAI: ${result.azureOpenAIError || "Not configured"}`);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Remediation API handler failed:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to generate remediation guide",
      details: error.toString()
    }, { status: 500 });
  }
}

