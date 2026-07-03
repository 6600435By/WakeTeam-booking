import type { Area } from "react-easy-crop";
import {
  WIDGET_PHOTO_LAYOUT,
  type WidgetPhotoKind,
} from "@/lib/widget-photo-layout";

export type { Area };

/** Подгоняет область обрезки под целевое соотношение сторон без растягивания. */
export function fitAreaToTargetAspect(area: Area, targetAspect: number): Area {
  const sourceAspect = area.width / area.height;
  if (!Number.isFinite(sourceAspect) || sourceAspect <= 0) return area;
  if (Math.abs(sourceAspect - targetAspect) < 0.001) return area;

  if (sourceAspect > targetAspect) {
    const width = area.height * targetAspect;
    return {
      x: area.x + (area.width - width) / 2,
      y: area.y,
      width,
      height: area.height,
    };
  }

  const height = area.width / targetAspect;
  return {
    x: area.x,
    y: area.y + (area.height - height) / 2,
    width: area.width,
    height,
  };
}

export function computeCropMinZoom(
  mediaSize: { width: number; height: number },
  cropSize: { width: number; height: number },
): number {
  if (mediaSize.width <= 0 || mediaSize.height <= 0) return 1;
  const fitZoom = Math.min(
    cropSize.width / mediaSize.width,
    cropSize.height / mediaSize.height,
  );
  return Math.min(1, Math.max(0.15, fitZoom));
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
    if (src.startsWith("http://") || src.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
    img.src = src;
  });
}

/** Экспорт выбранной области в фиксированный размер карточки виджета. */
export async function exportCroppedImage(
  imageSrc: string,
  croppedAreaPixels: Area,
  kind: WidgetPhotoKind,
): Promise<Blob> {
  const layout = WIDGET_PHOTO_LAYOUT[kind];
  const img = await loadImageElement(imageSrc);

  const targetAspect = layout.exportWidth / layout.exportHeight;
  const fitted = fitAreaToTargetAspect(
    {
      x: croppedAreaPixels.x,
      y: croppedAreaPixels.y,
      width: croppedAreaPixels.width,
      height: croppedAreaPixels.height,
    },
    targetAspect,
  );

  let sx = Math.max(0, Math.round(fitted.x));
  let sy = Math.max(0, Math.round(fitted.y));
  let sw = Math.min(Math.round(fitted.width), img.naturalWidth - sx);
  let sh = Math.min(Math.round(fitted.height), img.naturalHeight - sy);

  if (sw <= 0 || sh <= 0) {
    throw new Error("Некорректная область обрезки");
  }

  const actualAspect = sw / sh;
  if (Math.abs(actualAspect - targetAspect) > 0.01) {
    if (actualAspect > targetAspect) {
      const newSw = Math.round(sh * targetAspect);
      sx += Math.round((sw - newSw) / 2);
      sw = newSw;
    } else {
      const newSh = Math.round(sw / targetAspect);
      sy += Math.round((sh - newSh) / 2);
      sh = newSh;
    }
    sx = Math.max(0, Math.min(sx, img.naturalWidth - sw));
    sy = Math.max(0, Math.min(sy, img.naturalHeight - sh));
  }

  const canvas = document.createElement("canvas");
  canvas.width = layout.exportWidth;
  canvas.height = layout.exportHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, layout.exportWidth, layout.exportHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Не удалось обрезать изображение"));
      },
      "image/jpeg",
      0.9,
    );
  });
}
