import { formatInTimeZone } from "date-fns-tz";
import { addMinutes, TZ } from "@/lib/time";

const MINSK_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Minsk",
  "X-LIC-LOCATION:Europe/Minsk",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0300",
  "TZNAME:+03",
  "DTSTART:19700101T000000",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  const max = 75;
  if (line.length <= max) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, max));
  rest = rest.slice(max);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, max - 1)}`);
    rest = rest.slice(max - 1);
  }
  return parts.join("\r\n");
}

function formatIcsLocal(date: Date): string {
  return formatInTimeZone(date, TZ, "yyyyMMdd'T'HHmmss");
}

export type BookingCalendarEvent = {
  uid: string;
  startIso: string;
  endIso: string;
  summary: string;
  description: string;
  location?: string;
};

function formatIcsUtcStamp(date: Date): string {
  return `${formatInTimeZone(date, "UTC", "yyyyMMdd'T'HHmmss")}Z`;
}

export function buildBookingIcs(event: BookingCalendarEvent): string {
  const now = new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WakeTeam//Booking Widget//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    MINSK_VTIMEZONE,
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${formatIcsUtcStamp(now)}`,
    `DTSTART;TZID=Europe/Minsk:${formatIcsLocal(new Date(event.startIso))}`,
    `DTEND;TZID=Europe/Minsk:${formatIcsLocal(new Date(event.endIso))}`,
    foldIcsLine(`SUMMARY:${escapeIcsText(event.summary)}`),
    foldIcsLine(`DESCRIPTION:${escapeIcsText(event.description)}`),
  ];

  if (event.location) {
    lines.push(foldIcsLine(`LOCATION:${escapeIcsText(event.location)}`));
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function sessionRangeFromSlots(
  slotStarts: string[],
  lastSlotMinutes: number,
): { startIso: string; endIso: string } | null {
  if (slotStarts.length === 0) return null;
  const sorted = [...slotStarts].sort();
  const startIso = sorted[0]!;
  const endIso = addMinutes(new Date(sorted[sorted.length - 1]!), lastSlotMinutes).toISOString();
  return { startIso, endIso };
}

export function downloadIcsFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
