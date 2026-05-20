import { NextResponse } from "next/server";
import { getAzureToken, fetchAzureApi } from "@/lib/azure";

export async function GET() {
  try {
    // 1. Fetch token and list tenants from ARM to get the tenantId
    const armToken = await getAzureToken("https://management.azure.com/.default");
    const armData = await fetchAzureApi("/tenants?api-version=2020-01-01", armToken);
    const tenants = armData.value || [];
    
    if (tenants.length === 0) {
      return NextResponse.json({ tenantId: null, displayName: "Unknown Tenant" });
    }

    const tenantId = tenants[0].tenantId;
    let displayName = tenants[0].displayName || "Microsoft Entra Tenant";

    // 2. Fetch Graph token to retrieve the exact organization name from Microsoft Graph
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
