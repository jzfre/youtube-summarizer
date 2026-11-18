import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (await verifySession(token)) return NextResponse.next();

  // API clients get a JSON 401 instead of a redirect to the login page HTML.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next && next !== "/login") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Processing routes authenticate inside processingResponse before reading
    // their streamed bodies. Middleware clones and buffers POST bodies before
    // route execution, which would defeat the route's size/time limits.
    "/((?!login|api/|_next/static|_next/image|favicon.ico).*)",
  ],
};
