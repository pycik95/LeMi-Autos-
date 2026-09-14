import { NextResponse } from "next/server";
import { googleAuthUrl } from "@/lib/gmail";

export async function GET() {
  return NextResponse.redirect(googleAuthUrl());
}
