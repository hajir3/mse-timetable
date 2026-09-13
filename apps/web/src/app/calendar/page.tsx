import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { CalendarView } from "@/components/calendar/calendar-view";
import { signUserId } from "@/lib/ics-token";

export default async function CalendarPage() {
  const { userId } = await auth();
  const hdrs = await headers();
  const host = hdrs.get("host");
  const origin = host ? `${hdrs.get("x-forwarded-proto") ?? "https"}://${host}` : null;
  const subscribeUrl = userId && origin ? `${origin}/api/calendar/${userId}/${signUserId(userId)}` : null;

  return <CalendarView subscribeUrl={subscribeUrl} />;
}
