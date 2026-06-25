"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampPan,
  coverScale,
  cropImageForWidget,
  loadImageElement,
  type CropTransform,
} from "@/lib/crop-image";
import { WIDGET_PHOTO_LAYOUT, type WidgetPhotoKind } from "@/lib/widget-photo-layout";
import { WidgetPhotoCard, widgetSampleLabels } from "@/components/widget/WidgetPhotoCard";

type Props = {
  kind: WidgetPhotoKind;
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
};

export function PhotoCropModal({ kind, imageSrc, onCancel, onConfirm }: Props) {
  const layout = WIDGET_PHOTO_LAYOUT[kind];
  const sample = widgetSampleLabels(kind);
  const cropRef = useRef<HTMLDivElement>(null);
  const [cropSize, setCropSize] = useState({ width: 320, height: 320 / layout.aspectRatio });
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    void loadImageElement(imageSrc).then((img) => {
      setNatural({ width: img.naturalWidth, height: img.naturalHeight });
    });
  }, [imageSrc]);

  useEffect(() => {
    const el = cropRef.current;
    if (!el) return;
    function measure() {
      const width = el!.clientWidth;
      const height = width / layout.aspectRatio;
      setCropSize({ width, height });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.aspectRatio]);

  const transform: CropTransform = {
    zoom,
    offsetX: offset.x,
    offsetY: offset.y,
  };

  const displayScale =
    coverScale(natural.width, natural.height, cropSize.width, cropSize.height) * zoom;
  const displayW = natural.width * displayScale;
  const displayH = natural.height * displayScale;
  const imgLeft = (cropSize.width - displayW) / 2 + offset.x;
  const imgTop = (cropSize.height - displayH) / 2 + offset.y;

  const updatePreview = useCallback(async () => {
    try {
      const blob = await cropImageForWidget(
        imageSrc,
        kind,
        cropSize.width,
        cropSize.height,
        transform,
      );
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setPreviewUrl(null);
    }
  }, [imageSrc, kind, cropSize, transform]);

  useEffect(() => {
    const t = setTimeout(() => {
      void updatePreview();
    }, 120);
    return () => clearTimeout(t);
  }, [updatePreview]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function applyPan(nx: number, ny: number) {
    const clamped = clampPan(
      nx,
      ny,
      natural.width,
      natural.height,
      cropSize.width,
      cropSize.height,
      zoom,
    );
    setOffset({ x: clamped.offsetX, y: clamped.offsetY });
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    applyPan(dragRef.current.ox + dx, dragRef.current.oy + dy);
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function handleConfirm() {
    setProcessing(true);
    setError("");
    try {
      const blob = await cropImageForWidget(
        imageSrc,
        kind,
        cropSize.width,
        cropSize.height,
        transform,
      );
      onConfirm(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка обрезки");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Кадрирование для виджета</h3>
        <p className="mt-1 text-xs text-slate-500">
          Перетащите фото и измените масштаб. Рамка совпадает с карточкой в виджете.
        </p>

        <div
          ref={cropRef}
          className="relative mt-4 w-full cursor-grab overflow-hidden rounded-lg bg-slate-900 active:cursor-grabbing"
          style={{ height: cropSize.height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={{
              width: displayW,
              height: displayH,
              left: imgLeft,
              top: imgTop,
            }}
          />
          <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-[#fcff00]/80" />
        </div>

        <label className="mt-4 block text-sm text-slate-700">
          Масштаб
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => {
              const z = parseFloat(e.target.value);
              setZoom(z);
              const clamped = clampPan(
                offset.x,
                offset.y,
                natural.width,
                natural.height,
                cropSize.width,
                cropSize.height,
                z,
              );
              setOffset({ x: clamped.offsetX, y: clamped.offsetY });
            }}
            className="mt-1 w-full"
          />
        </label>

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          Как в виджете
        </p>
        <div className="mt-2">
          <WidgetPhotoCard
            kind={kind}
            title={sample.title}
            subtitle={sample.subtitle}
            photoUrl={previewUrl ?? imageSrc}
          />
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={processing}
            className="rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
          >
            {processing ? "Сохранение…" : "Применить"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
