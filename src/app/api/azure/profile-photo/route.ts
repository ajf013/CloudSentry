import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const client = await clerkClient();
    const oauthTokens = await client.users.getUserOauthAccessToken(userId, "oauth_microsoft");
    const token = oauthTokens.data[0]?.token;

    if (!token) {
      console.warn("No Microsoft OAuth token found in Clerk for user:", userId);
      return new NextResponse("Token missing", { status: 400 });
    }

    const response = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // 404 or other errors mean the user doesn't have a profile photo set in Entra ID
      return new NextResponse("Photo not found", { status: 404 });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Failed to fetch profile photo from Microsoft Graph:", error);
    return new NextResponse("Error fetching photo", { status: 500 });
  }
}
