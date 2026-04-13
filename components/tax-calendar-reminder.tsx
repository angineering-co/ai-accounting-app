"use client";

import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUpcomingTaxEvents, type UpcomingTaxEvent } from "@/lib/domain/tax-calendar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

function urgencyColor(daysUntil: number) {
  if (daysUntil < 7) return "border-rose-200 bg-rose-50 text-rose-700";
  if (daysUntil <= 30) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatDate(event: UpcomingTaxEvent) {
  return `${event.date.getMonth() + 1}/${event.date.getDate()}`;
}

function daysLabel(days: number) {
  if (days === 0) return "今天";
  return `${days} 天後`;
}

export function TaxCalendarReminder() {
  const { events, nextEvents } = useMemo(() => {
    const all = getUpcomingTaxEvents();
    return { events: all, nextEvents: all.filter((e) => e.isNext) };
  }, []);

  if (nextEvents.length === 0) return null;

  const nextEvent = nextEvents[0];

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="tax-calendar" className="border-0">
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              <span className="text-base font-medium text-slate-700">
                下次截止：{formatDate(nextEvent)}{" "}
                {nextEvents.length === 1
                  ? nextEvent.label
                  : `${nextEvent.label} 等 ${nextEvents.length} 項`}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full px-2 py-0 text-sm font-medium",
                  urgencyColor(nextEvent.daysUntil),
                )}
              >
                {daysLabel(nextEvent.daysUntil)}
              </Badge>
            </div>
          </AccordionTrigger>

          <AccordionContent className="px-4">
            <div className="space-y-1">
              {events.map((event) => (
                <div
                  key={`${event.month}-${event.day}-${event.label}`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-base",
                    event.isNext
                      ? "border-l-2 border-emerald-500 bg-emerald-50/60 font-medium text-slate-900"
                      : "text-slate-600",
                  )}
                >
                  <span className="w-12 shrink-0 tabular-nums">
                    {formatDate(event)}
                  </span>
                  <span className="flex-1">{event.label}</span>
                  {event.isNext && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full px-2 py-0 text-sm",
                        urgencyColor(event.daysUntil),
                      )}
                    >
                      {daysLabel(event.daysUntil)}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </AccordionContent>
        </div>
      </AccordionItem>
    </Accordion>
  );
}
