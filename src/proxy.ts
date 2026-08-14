import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import {
  getEnvironmentErrorVariables,
  getPublicEnv,
} from "@/lib/env";
import type { Database } from "@/types/database.generated";

function configurationErrorResponse(error: unknown) {
  const variables = getEnvironmentErrorVariables(error);
  const variableList = variables.length > 0 ? variables.join(", ") : "unknown";
  const publicVariables =
    process.env.VERCEL_ENV === "production" ? [] : variables;

  console.error(`[proxy] Invalid environment configuration: ${variableList}`);

  return NextResponse.json(
    {
      error: "configuration_error",
      message: "הגדרת הסביבה של היישום אינה תקינה.",
      variables: publicVariables,
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export default async function proxy(request: NextRequest) {
  let env: ReturnType<typeof getPublicEnv>;

  try {
    env = getPublicEnv();
  } catch (error) {
    return configurationErrorResponse(error);
  }

  let supabaseResponse = NextResponse.next({
    request,
  });
  let pendingCookies: {
    name: string;
    value: string;
    options: CookieOptions;
  }[] = [];
  let pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
          headers: Record<string, string>,
        ) {
          pendingCookies = cookiesToSet;
          pendingHeaders = headers;

          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );

          Object.entries(headers).forEach(([name, value]) =>
            supabaseResponse.headers.set(name, value),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isProtectedPath =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname === "/leagues" ||
    pathname.startsWith("/leagues/") ||
    pathname === "/update-password";
  const isEntryAuthPath = pathname === "/login" || pathname === "/register";

  function redirectWithAuthCookies(destination: URL) {
    const response = NextResponse.redirect(destination);

    pendingCookies.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options),
    );
    Object.entries(pendingHeaders).forEach(([name, value]) =>
      response.headers.set(name, value),
    );
    response.headers.set("Cache-Control", "private, no-store");

    return response;
  }

  if (!user && isProtectedPath) {
    const destination = new URL("/login", request.url);
    destination.searchParams.set("next", pathname);
    return redirectWithAuthCookies(destination);
  }

  if (user && isEntryAuthPath) {
    return redirectWithAuthCookies(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
