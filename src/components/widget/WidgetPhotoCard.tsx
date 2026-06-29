"use client";

import { ChevronRight, MapPin, UserRound } from "lucide-react";
import {
  widgetPhotoAspectStyle,
  WIDGET_PHOTO_LAYOUT,
  type WidgetPhotoKind,
} from "@/lib/widget-photo-layout";
import { cn } from "@/lib/utils";

type Props = {
  kind: WidgetPhotoKind;
  title: string;
  subtitle?: string | null;
  photoUrl?: string | null;
  onClick?: () => void;
  className?: string;
  previewSize?: "widget" | "large";
};

function cardTextStyles(subtitle: string | null | undefined, isLarge: boolean) {
  const len = subtitle?.trim().length ?? 0;

  if (isLarge) {
    if (len > 65) {
      return {
        title: "text-base sm:text-lg",
        subtitle: "mt-0.5 line-clamp-2 text-[11px] leading-tight text-white/85",
      };
    }
    if (len > 40) {
      return {
        title: "text-lg sm:text-xl",
        subtitle: "mt-0.5 line-clamp-2 text-xs leading-snug text-white/85",
      };
    }
    return {
      title: "text-lg sm:text-xl",
      subtitle: "mt-1 line-clamp-2 text-sm sm:text-base leading-snug text-white/85",
    };
  }

  if (len > 65) {
    return {
      title: "text-sm sm:text-base",
      subtitle: "mt-0.5 line-clamp-2 text-[10px] leading-tight text-white/85",
    };
  }
  if (len > 40) {
    return {
      title: "text-base sm:text-[1.05rem]",
      subtitle: "mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/85",
    };
  }
  return {
    title: "text-base sm:text-[1.05rem]",
    subtitle: "mt-1 line-clamp-2 text-xs sm:text-sm leading-snug text-white/85",
  };
}

export function WidgetPhotoCard({
  kind,
  title,
  subtitle,
  photoUrl,
  onClick,
  className = "",
  previewSize = "widget",
}: Props) {
  const isLarge = previewSize === "large";
  const KindIcon = kind === "branch" ? MapPin : UserRound;
  const textStyles = cardTextStyles(subtitle, isLarge);

  const inner = (
    <div
      className={cn(
        "relative w-full overflow-hidden",
        isLarge ? "min-h-[7.5rem] sm:min-h-[9rem]" : "min-h-[4.75rem] sm:min-h-[5.25rem]",
      )}
      style={widgetPhotoAspectStyle(kind)}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-600 via-slate-700 to-slate-900" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/15" />
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end overflow-hidden",
          isLarge ? "p-4 sm:p-5" : "p-3 sm:p-3.5",
        )}
      >
        <div className="flex max-h-full items-center justify-between gap-3">
          <div className="min-w-0 flex-1 overflow-hidden">
            <span
              className={cn(
                "block font-semibold leading-tight tracking-tight text-white",
                textStyles.title,
              )}
            >
              {title}
            </span>
            {subtitle ? (
              <span className={textStyles.subtitle}>{subtitle}</span>
            ) : null}
          </div>
          {onClick ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors group-hover:bg-white/25 sm:size-9">
              <ChevronRight className="size-4 sm:size-[1.125rem]" strokeWidth={2.25} />
            </span>
          ) : null}
        </div>
      </div>
      {!photoUrl ? (
        <div className="pointer-events-none absolute left-3 top-3 flex size-8 items-center justify-center rounded-lg bg-white/10 text-white/80 backdrop-blur-sm sm:size-9">
          <KindIcon className="size-4 sm:size-[1.125rem]" strokeWidth={2} />
        </div>
      ) : null}
    </div>
  );

  const baseClass = cn(
    "group relative block w-full overflow-hidden rounded-xl text-left shadow-sm ring-1 ring-black/[0.06] transition-all duration-200",
    onClick &&
      "cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:ring-[var(--widget-primary)]/35 active:translate-y-0 active:scale-[0.995]",
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClass}>
        {inner}
      </button>
    );
  }

  return <div className={baseClass}>{inner}</div>;
}

export function widgetSampleLabels(kind: WidgetPhotoKind) {
  const l = WIDGET_PHOTO_LAYOUT[kind];
  return { title: l.sampleTitle, subtitle: l.sampleSubtitle || null };
}
