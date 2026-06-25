import {
  WIDGET_PHOTO_LAYOUT,
  type WidgetPhotoKind,
} from "@/lib/widget-photo-layout";

export type CropTransform = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
    img.src = src;
  });
}

/** Масштаб «cover» для заполнения области кадрирования */
export function coverScale(
  imageWidth: number,
  imageHeight: number,
  cropWidth: number,
  cropHeight: number,
): number {
  return Math.max(cropWidth / imageWidth, cropHeight / imageHeight);
}

export function clampPan(
  offsetX: number,
  offsetY: number,
  imageWidth: number,
  imageHeight: number,
  cropWidth: number,
  cropHeight: number,
  zoom: number,
): CropTransform {
  const scale = coverScale(imageWidth, imageHeight, cropWidth, cropHeight) * zoom;
  const displayW = imageWidth * scale;
  const displayH = imageHeight * scale;
  const maxX = Math.max(0, (displayW - cropWidth) / 2);
  const maxY = Math.max(0, (displayH - cropHeight) / 2);
  return {
    zoom,
    offsetX: Math.min(maxX, Math.max(-maxX, offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, offsetY)),
  };
}

export async function cropImageForWidget(
  imageSrc: string,
  kind: WidgetPhotoKind,
  cropWidth: number,
  cropHeight: number,
  transform: CropTransform,
): Promise<Blob> {
  const img = await loadImageElement(imageSrc);
  const layout = WIDGET_PHOTO_LAYOUT[kind];
  const scale =
    coverScale(img.naturalWidth, img.naturalHeight, cropWidth, cropHeight) *
    transform.zoom;
  const displayW = img.naturalWidth * scale;
  const displayH = img.naturalHeight * scale;

  const imgLeft = (cropWidth - displayW) / 2 + transform.offsetX;
  const imgTop = (cropHeight - displayH) / 2 + transform.offsetY;

  let sx = (-imgLeft) / scale;
  let sy = (-imgTop) / scale;
  let sw = cropWidth / scale;
  let sh = cropHeight / scale;

  sx = Math.max(0, sx);
  sy = Math.max(0, sy);
  if (sx + sw > img.naturalWidth) sw = img.naturalWidth - sx;
  if (sy + sh > img.naturalHeight) sh = img.naturalHeight - sy;

  const canvas = document.createElement("canvas");
  canvas.width = layout.exportWidth;
  canvas.height = layout.exportHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");

  ctx.drawImage(
    img,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    layout.exportWidth,
    layout.exportHeight,
  );

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
