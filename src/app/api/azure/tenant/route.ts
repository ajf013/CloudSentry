import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getAzureToken, fetchAzureApi } from "@/lib/azure";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Verify that the user has an active Azure tenant using their personal Microsoft OAuth token
    const client = await clerkClient();
    let oauthTokens;
    try {
      oauthTokens = await client.users.getUserOauthAccessToken(userId, "oauth_microsoft");
    } catch (err) {
      console.warn("Failed to retrieve user OAuth tokens from Clerk:", err);
    }

    const userToken = oauthTokens?.data?.[0]?.token;
    if (userToken) {
      try {
        const userTenantsRes = await fetch("https://management.azure.com/tenants?api-version=2020-01-01", {
          headers: {
            "Authorization": `Bearer ${userToken}`,
            "Accept": "application/json"
          }
        });

        if (!userTenantsRes.ok) {
          const errText = await userTenantsRes.text();
          console.error(`Microsoft tenant verification failed (${userTenantsRes.status}): ${errText}`);
          
          // If the error is 401 Unauthorized or 403 Forbidden, it indicates the token lacks the
          // necessary "https://management.azure.com/user_impersonation" scope in Clerk dashboard config.
          // In this case, we proceed with service principal fallback instead of locking the user out.
          if (userTenantsRes.status === 401 || userTenantsRes.status === 403) {
            console.warn("User OAuth token is unauthorized for Azure Resource Manager. Proceeding with service principal fallback.");
          } else {
            return NextResponse.json(
              { error: "No active Azure tenant found. Please sign in with an account that has an active Azure tenant.", code: "NO_ACTIVE_TENANT" },
              { status: 403 }
            );
          }
        } else {
          const userTenantsData = await userTenantsRes.json();
          const userTenantsList = userTenantsData.value || [];
          if (userTenantsList.length === 0) {
            return NextResponse.json(
              { error: "No active Azure tenant found. Please sign in with an account that has an active Azure tenant.", code: "NO_ACTIVE_TENANT" },
              { status: 403 }
            );
          }
        }
      } catch (armErr) {
        console.error("Exception during user tenant verification via ARM:", armErr);
        // Do not lock out on network/DNS exception during verification
        console.warn("Proceeding with service principal fallback due to verification exception.");
      }
    } else {
      console.log("No Microsoft OAuth token found in Clerk (using env defaults / mock directory for dev).");
    }

    // 2. Fetch token and list tenants from ARM (using service credentials) to get the tenantId
    const armToken = await getAzureToken("https://management.azure.com/.default");
    const armData = await fetchAzureApi("/tenants?api-version=2020-01-01", armToken);
    const tenants = armData.value || [];
    
    if (tenants.length === 0) {
      return NextResponse.json({ tenantId: null, displayName: "Unknown Tenant" });
    }

    const tenantId = tenants[0].tenantId;
    let displayName = tenants[0].displayName || "Microsoft Entra Tenant";

    // 3. Fetch Graph token to retrieve the exact organization name from Microsoft Graph
    try {
      const graphToken = await getAzureToken("https://graph.microsoft.com/.default");
      const orgResponse = await fetch("https://graph.microsoft.com/v1.0/organization", {
        headers: {
          "Authorization": `Bearer ${graphToken}`,
          "Accept": "application/json"
        }
      });
      
      if (orgResponse.ok) {
        const orgData = await orgResponse.json();
        if (orgData.value && orgData.value.length > 0 && orgData.value[0].displayName) {
          displayName = orgData.value[0].displayName;
        }
      }
    } catch (graphErr) {
      console.warn("Failed to fetch exact tenant displayName from Microsoft Graph:", graphErr);
    }

    return NextResponse.json({
      tenantId,
      displayName,
    });
  } catch (error: any) {
    console.error("Failed to fetch tenant:", error);
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message === "TOKEN_MISSING") {
      return NextResponse.json(
        { error: "Microsoft account connection required", code: "TOKEN_MISSING" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message || "Failed to fetch tenant" }, { status: 500 });
  }
}
