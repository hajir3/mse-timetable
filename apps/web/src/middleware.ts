import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 deprecated the `middleware.ts` convention in favor of
// `proxy.ts`, but Clerk's SDK (as of @clerk/nextjs 7.9.2) is still built
// around the classic `clerkMiddleware`/`NextMiddleware` types — this file
// still works (just prints a deprecation warning at build time). Revisit
// once Clerk ships an official `proxy.ts`-based integration.

// /api/calendar is the signed, unauthenticated ICS subscription feed —
// calendar apps poll it directly with no Clerk session (see route.ts).
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/calendar(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/", "/(api|trpc)(.*)"],
};
