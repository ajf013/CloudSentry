import { NextRequest, NextResponse } from "next/server";
import { getAzureToken, fetchAzureApi } from "@/lib/azure";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const subscriptionId = searchParams.get("subscriptionId");
  
  if (!subscriptionId) {
    return NextResponse.json({ error: "subscriptionId is required" }, { status: 400 });
  }

  try {
    const token = await getAzureToken();
    
    // 1. Fetch Secure Score
    let secureScore = null;
    try {
      const scoreData = await fetchAzureApi(
        `/subscriptions/${subscriptionId}/providers/Microsoft.Security/secureScores/ascScore?api-version=2020-01-01`,
        token
      );
      
      const rawScore = scoreData.properties?.score || {};
      const rawPercentage = rawScore.percentage ?? 0;
      const percentage = rawPercentage <= 1 ? rawPercentage * 100 : rawPercentage;
      
      secureScore = {
        current: rawScore.current || 0,
        max: rawScore.max || 0,
        percentage: percentage
      };
    } catch (scoreErr) {
      console.error("Error fetching secure score:", scoreErr);
      // Fallback/Default
      secureScore = { current: 0, max: 100, percentage: 0 };
    }

    // 2. Fetch Assessments (Recommendations) via Azure Resource Graph
    let recommendations = [];
    try {
      const argQuery = {
        subscriptions: [subscriptionId],
        query: "securityresources | where type == 'microsoft.security/assessments' | extend status = properties.status.code, displayName = properties.displayName, severity = properties.metadata.severity, description = properties.metadata.description, remediation = properties.metadata.remediationSteps, categories = properties.metadata.categories, scoreWeight = properties.metadata.scoreWeight | project id, name, status, displayName, severity, description, remediation, categories, scoreWeight"
      };
      
      const graphData = await fetchAzureApi(
        "/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01",
        token,
        "POST",
        argQuery
      );
      
      // Azure Resource Graph returns data inside data.rows or data.value (based on API response format)
      recommendations = graphData.data || [];
      
      // If empty, throw to trigger fallback to standard live Assessments API
      if (recommendations.length === 0) {
        throw new Error("Resource Graph returned 0 records");
      }
    } catch (graphErr) {
      console.warn("Resource Graph failed or returned empty, falling back to standard Assessments API:", graphErr);
      
      // Fallback: Fetch standard assessments API
      try {
        const fallbackData = await fetchAzureApi(
          `/subscriptions/${subscriptionId}/providers/Microsoft.Security/assessments?api-version=2021-06-01`,
          token
        );
        recommendations = (fallbackData.value || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          status: item.properties?.status?.code || "Unhealthy",
          displayName: item.properties?.displayName || item.name,
          severity: item.properties?.metadata?.severity || "Medium",
          description: item.properties?.metadata?.description || "",
          remediation: item.properties?.metadata?.remediationSteps || "",
          categories: item.properties?.metadata?.categories || [],
          scoreWeight: item.properties?.metadata?.scoreWeight || 0
        }));
      } catch (fallbackErr) {
        console.error("All assessment fetch attempts failed:", fallbackErr);
        recommendations = [];
      }
    }

    return NextResponse.json({
      secureScore,
      recommendations
    });
  } catch (error: any) {
    console.error("Failed to fetch defender data:", error);
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message === "TOKEN_MISSING") {
      return NextResponse.json(
        { error: "Microsoft account connection required", code: "TOKEN_MISSING" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message || "Failed to fetch dashboard data" }, { status: 500 });
  }
}
