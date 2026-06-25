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
};

export function WidgetPhotoCard({
  kind,
  title,
  subtitle,
  photoUrl,
  onClick,
  className = "",
}: Props) {
  const inner = (
    <>
      <div className="relative w-full overflow-hidden" style={widgetPhotoAspectStyle(kind)}>
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
        <div className="absolute inset-0 flex flex-col justify-end p-4">
          <span className="text-lg font-bold text-white drop-shadow-md">{title}</span>
          {subtitle ? (
            <span className="mt-1 line-clamp-2 text-sm text-white/90">{subtitle}</span>
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
