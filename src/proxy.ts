import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import {
  getEnvironmentErrorVariables,
  getPublicEnv,
} from "@/lib/env";

function configurationErrorResponse(error: unknown) {
  const variables = getEnvironmentErrorVariables(error);
  const variableList = variables.length > 0 ? variables.join(", ") : "unknown";

  console.error(`[proxy] Invalid environment configuration: ${variableList}`);

  return NextResponse.json(
    {
      error: "configuration_error",
      message: "הגדרת הסביבה של היישום אינה תקינה.",
      variables,
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

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
