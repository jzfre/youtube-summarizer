import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (await verifySession(token)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next && next !== "/login") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
