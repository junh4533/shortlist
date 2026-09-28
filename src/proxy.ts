/** Gate every request with HTTP Basic Auth when BASIC_AUTH_USERS is set (friends and family). */
import { NextResponse, type NextRequest } from "next/server";
import { authenticateBasic, parseBasicUsers } from "@/lib/basic-auth";

export function proxy(request: NextRequest) {
  const users = parseBasicUsers(process.env.BASIC_AUTH_USERS);
  if (!users.length) return NextResponse.next();

  const headers = new Headers(request.headers);
  headers.delete("x-user-id");
  const name = authenticateBasic(request.headers.get("authorization"), users);
  if (!name) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="jb", charset="UTF-8"' },
    });
  }
  headers.set("x-user-id", name);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/revalidate).*)"],
};
