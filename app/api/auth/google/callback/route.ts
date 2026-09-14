import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForTokens } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/check?error=no_code", req.url));
  }

  try {
    const { refreshToken, email } = await exchangeCodeForTokens(code);
    const existing = await prisma.googleAuth.findFirst();
    if (existing) {
      await prisma.googleAuth.update({ where: { id: existing.id }, data: { refreshToken, email } });
    } else {
      await prisma.googleAuth.create({ data: { refreshToken, email } });
    }
    return NextResponse.redirect(new URL("/check?connected=1", req.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(new URL(`/check?error=${encodeURIComponent(message)}`, req.url));
  }
}
