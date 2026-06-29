"use client";

import {
  widgetPhotoAspectStyle,
  WIDGET_PHOTO_LAYOUT,
  type WidgetPhotoKind,
} from "@/lib/widget-photo-layout";

type Props = {
  kind: WidgetPhotoKind;
  title: string;
  subtitle?: string | null;
  photoUrl?: string | null;
  onClick?: () => void;
  className?: string;
  /** Крупнее текст в админ-превью */
  previewSize?: "widget" | "large";
};

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

  const inner = (
    <>
      <div
        className={`relative w-full overflow-hidden ${isLarge ? "min-h-[7.5rem] sm:min-h-[9rem]" : ""}`}
        style={widgetPhotoAspectStyle(kind)}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-black/45" />
        <div
          className={`absolute inset-0 flex flex-col justify-end ${isLarge ? "p-4 sm:p-5" : "p-2.5"}`}
        >
          <span
            className={`font-bold leading-tight text-white drop-shadow-md ${
              isLarge ? "text-lg sm:text-xl" : "text-base"
            }`}
          >
            {title}
          </span>
          {subtitle ? (
            <span
              className={`mt-0.5 line-clamp-2 leading-snug text-white/90 ${
                isLarge ? "text-sm sm:text-base" : "text-xs"
              }`}
            >
              {subtitle}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  const baseClass = `relative block w-full overflow-hidden rounded-lg border border-slate-200 text-left shadow-sm ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} transition hover:border-[#c0c100] active:scale-[0.99]`}
      >
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
