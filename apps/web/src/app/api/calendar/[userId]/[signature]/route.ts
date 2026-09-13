import { clerkClient } from "@clerk/nextjs/server";
import { SelectedModulesSchema } from "@mse-timetable/shared";
import { dataset } from "@/lib/dataset";
import { buildIcsFeed } from "@/lib/ics";
import { verifyUserId } from "@/lib/ics-token";

// Needs Node's `crypto` (HMAC verification) and is inherently per-request
// (a fresh Clerk lookup every time), never statically cacheable.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated calendar-subscription feed (see
 * SPECIFICATION.md §7A) — Google/Outlook/Apple Calendar poll this URL
 * directly with no session, so access control is the HMAC signature in the
 * URL itself, not Clerk's normal auth (this route is exempted in
 * middleware.ts).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string; signature: string }> }) {
  const { userId, signature } = await params;
  if (!verifyUserId(userId, signature)) {
    return new Response("Not found", { status: 404 });
  }

  // A deleted account or one with no selection yet still gets a valid,
  // empty calendar rather than an error response — some calendar apps drop
  // a subscription after repeated fetch failures.
  let selectedModules: Record<string, string[]> = {};
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const parsed = SelectedModulesSchema.safeParse(user.unsafeMetadata?.selectedModules);
    if (parsed.success) selectedModules = parsed.data;
  } catch {
    // deleted/unknown account
  }

  const sessions = dataset.sessions.filter((s) => (selectedModules[s.semester] ?? []).includes(s.moduleCode));

  return new Response(buildIcsFeed(sessions), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="mse-timetable.ics"',
      "Cache-Control": "no-store",
    },
  });
}
