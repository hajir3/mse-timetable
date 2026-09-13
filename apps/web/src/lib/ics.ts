import type { Session } from "@mse-timetable/shared";
import { aggregateByDayAndBucket } from "@/lib/aggregate-sessions";

// Fixed regardless of which host actually serves the feed (localhost while
// testing, a Vercel preview URL, prod) — a VEVENT UID only needs to be a
// stable, globally unique string across refetches, not a real address.
const UID_HOST = "timetable.mse.hajir.ch";

// Standard CET/CEST rules — identical to Europe/Berlin and Europe/Paris,
// and unchanging, so hardcoding it here is simpler than pulling in a tzdata
// library for one fixed block.
const VTIMEZONE_LINES = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Zurich",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// RFC 5545: content lines must be folded at 75 octets, continued with a
// CRLF followed by a single space.
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let offset = 0;
  let limit = 75;
  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // don't split a UTF-8 sequence
    chunks.push(bytes.subarray(offset, end).toString("utf8"));
    offset = end;
    limit = 74; // continuation lines lose one octet to the leading space
  }
  return chunks.join("\r\n ");
}

function localDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Builds a full ICS feed: one VEVENT per merged course block (see
 * aggregateByDayAndBucket) — the same blocks the week view renders, not one
 * event per raw lecture/tutorial row.
 */
export function buildIcsFeed(sessions: Session[], now: Date = new Date()): string {
  const cards = [...aggregateByDayAndBucket(sessions).values()].sort((a, b) =>
    a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date),
  );
  const dtstamp = utcStamp(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MSE Timetable//timetable.mse.hajir.ch//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:MSE Timetable",
    "X-WR-TIMEZONE:Europe/Zurich",
    "X-PUBLISHED-TTL:PT4H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    ...VTIMEZONE_LINES,
  ];

  for (const card of cards) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${card.date}-${card.timeOfDay}-${card.moduleCode}@${UID_HOST}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Zurich:${localDateTime(card.date, card.start)}`,
      `DTEND;TZID=Europe/Zurich:${localDateTime(card.date, card.end)}`,
      `SUMMARY:${escapeText(card.moduleCode)}`,
      `LOCATION:${escapeText(card.mode === "online" ? "Online" : card.room)}`,
    );
    if (card.hasRoomException) {
      lines.push("DESCRIPTION:Room change for this session");
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
