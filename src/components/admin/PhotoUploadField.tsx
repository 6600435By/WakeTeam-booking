"use client";

import { useEffect, useRef, useState } from "react";
import { PhotoCropModal } from "./PhotoCropModal";
import { validateImageUpload, formatMaxUploadSize } from "@/lib/upload-image";
import { WidgetPhotoCard, widgetSampleLabels } from "@/components/widget/WidgetPhotoCard";
import type { WidgetPhotoKind } from "@/lib/widget-photo-layout";

type Props = {
  label: string;
  kind: WidgetPhotoKind;
  value: string | null;
  onChange: (url: string | null) => void;
};

export function PhotoUploadField({ label, kind, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const pendingObjectUrl = useRef<string | null>(null);
  const sample = widgetSampleLabels(kind);

  useEffect(
    () => () => {
      if (pendingObjectUrl.current) {
        URL.revokeObjectURL(pendingObjectUrl.current);
      }
    },
    [],
  );

  function openCropper(src: string, isObjectUrl: boolean) {
    if (pendingObjectUrl.current) {
      URL.revokeObjectURL(pendingObjectUrl.current);
      pendingObjectUrl.current = null;
    }
    if (isObjectUrl) pendingObjectUrl.current = src;
    setCropSrc(src);
    setError("");
  }

  function closeCropper() {
    if (pendingObjectUrl.current) {
      URL.revokeObjectURL(pendingObjectUrl.current);
      pendingObjectUrl.current = null;
    }
    setCropSrc(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFileSelect(file: File | null) {
    if (!file) return;
    const validationError = validateImageUpload(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    openCropper(URL.createObjectURL(file), true);
  }

  async function uploadBlob(blob: Blob) {
    setUploading(true);
    setError("");
    try {
      if (blob.size > 2 * 1024 * 1024) {
        throw new Error(`После обрезки файл больше ${formatMaxUploadSize()}`);
      }
      const form = new FormData();
      form.append("file", blob, "photo.jpg");
      form.append("kind", kind);
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
      onChange(data.url);
      closeCropper();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <span className="mb-1 block text-xs text-slate-500">{label}</span>

      {value && (
        <div className="mb-3 max-w-md">
          <p className="mb-1 text-xs text-slate-400">Текущее фото в виджете</p>
          <WidgetPhotoCard
            kind={kind}
            title={sample.title}
            subtitle={sample.subtitle}
            photoUrl={value}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {uploading ? "Загрузка…" : value ? "Заменить фото" : "Загрузить фото"}
        </button>
        {value && (
          <>
            <button
              type="button"
              disabled={uploading}
              onClick={() => openCropper(value, false)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Изменить кадр
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => onChange(null)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
            >
              Удалить
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">
        JPEG, PNG или WebP до {formatMaxUploadSize()}. После выбора — кадрирование под
        виджет.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {cropSrc && (
        <PhotoCropModal
          kind={kind}
          imageSrc={cropSrc}
          onCancel={closeCropper}
          onConfirm={(blob) => void uploadBlob(blob)}
        />
      )}
    </div>
  );
}
