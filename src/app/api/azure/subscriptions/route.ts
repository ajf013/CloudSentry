import { NextResponse } from "next/server";
import { getAzureToken, fetchAzureApi } from "@/lib/azure";

export async function GET() {
  try {
    const token = await getAzureToken();
    const data = await fetchAzureApi("/subscriptions?api-version=2020-01-01", token);
    
    // Azure returns { value: [ { subscriptionId, displayName, state, ... } ] }
    return NextResponse.json(data.value || []);
  } catch (error: any) {
    console.error("Failed to list subscriptions:", error);
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message === "TOKEN_MISSING") {
      return NextResponse.json(
        { error: "Microsoft account connection required", code: "TOKEN_MISSING" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message || "Failed to fetch subscriptions" }, { status: 500 });
  }
}
