"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area, type MediaSize } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { computeCropMinZoom, exportCroppedImage } from "@/lib/crop-image";
import { WIDGET_PHOTO_LAYOUT, type WidgetPhotoKind } from "@/lib/widget-photo-layout";
import { WidgetPhotoCard, widgetSampleLabels } from "@/components/widget/WidgetPhotoCard";

type Props = {
  kind: WidgetPhotoKind;
  imageSrc: string;
  title?: string;
  subtitle?: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
};

export function PhotoCropModal({
  kind,
  imageSrc,
  title,
  subtitle,
  onCancel,
  onConfirm,
}: Props) {
  const layout = WIDGET_PHOTO_LAYOUT[kind];
  const sample = widgetSampleLabels(kind);
  const previewTitle = title?.trim() || sample.title;
  const previewSubtitle = subtitle?.trim() || sample.subtitle || null;

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(0.25);
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  useEffect(() => {
    if (!mediaSize || !cropSize) return;
    const nextMin = computeCropMinZoom(mediaSize, cropSize);
    setMinZoom(nextMin);
    setZoom((current) => Math.max(nextMin, current));
  }, [mediaSize, cropSize]);

  const updatePreview = useCallback(async () => {
    if (!croppedAreaPixels) return;
    try {
      const blob = await exportCroppedImage(imageSrc, croppedAreaPixels, kind);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setPreviewUrl(null);
    }
  }, [imageSrc, kind, croppedAreaPixels]);

  useEffect(() => {
    const t = setTimeout(() => {
      void updatePreview();
    }, 150);
    return () => clearTimeout(t);
  }, [updatePreview]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function resetFrame() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }

  async function handleConfirm() {
    if (!croppedAreaPixels) {
      setError("Подождите, пока загрузится превью");
      return;
    }
    setProcessing(true);
    setError("");
    try {
      const blob = await exportCroppedImage(imageSrc, croppedAreaPixels, kind);
      onConfirm(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка обрезки");
    } finally {
      setProcessing(false);
    }
  }

  const aspectLabel = layout.aspectRatio >= 2 ? "панорама" : "широкий";

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[92vh] w-full max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Настройка фото</DialogTitle>
          <DialogDescription>
            Перетащите и масштабируйте изображение. Рамка совпадает с карточкой в
            виджете ({aspectLabel}, {layout.exportWidth}×{layout.exportHeight}).
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-4 h-56 w-full overflow-hidden rounded-lg bg-slate-900 sm:h-64">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={layout.aspectRatio}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            onMediaLoaded={setMediaSize}
            onCropSizeChange={setCropSize}
            restrictPosition={false}
            showGrid={false}
            objectFit="horizontal-cover"
            minZoom={minZoom}
            maxZoom={4}
            zoomWithScroll
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="min-w-0 flex-1 text-sm text-slate-700">
            Масштаб
            <input
              type="range"
              min={minZoom}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
          <button
            type="button"
            onClick={resetFrame}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Сбросить
          </button>
        </div>

        {mediaSize && (
          <p className="text-xs text-slate-400">
            Исходник: {mediaSize.naturalWidth}×{mediaSize.naturalHeight} px
            {zoom < 1 ? ` · масштаб ${Math.round(zoom * 100)}%` : ""}
          </p>
        )}

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          Как в виджете
        </p>
        <div className="mt-2">
          <WidgetPhotoCard
            kind={kind}
            title={previewTitle}
            subtitle={previewSubtitle}
            photoUrl={previewUrl}
            strictAspect
          />
          {!previewUrl && (
            <p className="mt-1 text-xs text-slate-400">Формируем превью…</p>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={processing || !previewUrl}
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
      </DialogContent>
    </Dialog>
  );
}
