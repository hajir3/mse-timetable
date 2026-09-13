"use client";

import { useState } from "react";
import { CalendarPlus, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Lets a user subscribe their selected modules into Google/Outlook/Apple
 * Calendar via a signed, per-user ICS feed URL (see
 * app/api/calendar/[userId]/[signature]/route.ts) — added once, then those
 * calendar apps refresh it on their own (typically within a few hours)
 * whenever the selection changes. See SPECIFICATION.md §7A.
 */
export function SubscribeCalendarButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const webcalUrl = url.replace(/^https?:\/\//, "webcal://");

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarPlus />
        Subscribe
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto sm:max-w-md sm:rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Subscribe to your calendar</SheetTitle>
          <SheetDescription>
            Add this link once in Google Calendar, Outlook, or Apple Calendar. It stays in sync on its own
            whenever you change your selected modules — usually within a few hours, not instantly.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs"
            />
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <a href={webcalUrl} className="text-sm text-primary underline underline-offset-2">
            Open directly in your device&apos;s calendar app
          </a>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            <li>
              <strong className="text-foreground">Google Calendar</strong>: Settings → Add calendar → From URL
              → paste the link
            </li>
            <li>
              <strong className="text-foreground">Apple Calendar</strong>: File → New Calendar Subscription →
              paste the link
            </li>
            <li>
              <strong className="text-foreground">Outlook.com</strong>: Add calendar → Subscribe from web →
              paste the link
            </li>
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
