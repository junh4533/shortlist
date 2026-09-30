/** Gate protected routes with HTTP Basic Auth or a beta email cookie when BASIC_AUTH_USERS is set. */
import { NextResponse, type NextRequest } from "next/server";
import { authenticateBasic, parseBasicUsers } from "@/lib/basic-auth";
import { SESSION_COOKIE } from "@/lib/auth/session";

function isPublicPath(pathname: string) {
  if (pathname === "/" || pathname === "/welcome" || pathname === "/landing") return true;
  if (pathname === "/login" || pathname === "/pending") return true;
  if (pathname === "/about" || pathname.startsWith("/about/")) return true;
  if (pathname === "/icon.svg" || pathname === "/favicon.ico") return true;
  return false;
}

export function proxy(request: NextRequest) {
  const users = parseBasicUsers(process.env.BASIC_AUTH_USERS);
  if (!users.length) return NextResponse.next();

  const headers = new Headers(request.headers);
  headers.delete("x-user-id");

  const basicName = authenticateBasic(request.headers.get("authorization"), users);
  if (basicName) {
    headers.set("x-user-id", basicName);
    return NextResponse.next({ request: { headers } });
  }

  if (request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.next({ request: { headers } });
  }

  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request: { headers } });
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="jb", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/revalidate).*)"],
};
