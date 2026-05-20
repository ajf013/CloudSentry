import { auth, clerkClient } from "@clerk/nextjs/server";

export async function getAzureToken(scope: string = "https://management.azure.com/.default") {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  
  // 1. Determine which credentials to use (clerk user metadata or env fallback)
  let clientId = process.env.AZURE_CLIENT_ID;
  let clientSecret = process.env.AZURE_CLIENT_SECRET;
  let tenantId = process.env.NEXT_PUBLIC_AZURE_TENANT_ID;
  
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const customCreds = user.publicMetadata?.azureCredentials as {
      clientId?: string;
      clientSecret?: string;
      tenantId?: string;
    } | undefined;
    
    if (customCreds?.clientId && customCreds?.clientSecret && customCreds?.tenantId) {
      clientId = customCreds.clientId;
      clientSecret = customCreds.clientSecret;
      tenantId = customCreds.tenantId;
    }
  } catch (error) {
    console.warn("Failed to check Clerk metadata for custom credentials, using env defaults:", error);
  }
  
  if (!clientId || !clientSecret || !tenantId) {
    throw new Error("TOKEN_MISSING");
  }
  
  try {
    // 2. Fetch the OAuth access token from Microsoft Entra ID using Client Credentials flow
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: scope,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Microsoft token error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    if (!data.access_token) {
      throw new Error("No access token returned from Microsoft");
    }
    
    return data.access_token;
  } catch (error: any) {
    console.error("Error fetching Client Credentials Azure token:", error);
    throw new Error(error.message || "TOKEN_FETCH_FAILED");
  }
}

// Custom fetcher for Azure REST API
export async function fetchAzureApi(endpoint: string, token: string, method: string = "GET", body?: any) {
  const url = `https://management.azure.com${endpoint}`;
  const headers: HeadersInit = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };
  
  const options: RequestInit = {
    method,
    headers
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    console.error(`Azure API error on ${endpoint}: Status ${response.status}`, text);
    throw new Error(`Azure API error (${response.status}): ${text}`);
  }
  
  return response.json();
}
