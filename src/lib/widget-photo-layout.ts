export type WidgetPhotoKind = "branch" | "staff";

/** Пропорции и размер экспорта — совпадают с карточками виджета */
export const WIDGET_PHOTO_LAYOUT: Record<
  WidgetPhotoKind,
  {
    /** CSS aspect-ratio: width / height */
    aspectRatio: number;
    exportWidth: number;
    exportHeight: number;
    sampleTitle: string;
    sampleSubtitle: string;
  }
> = {
  branch: {
    aspectRatio: 10 / 3,
    exportWidth: 1000,
    exportHeight: 300,
    sampleTitle: "Название филиала",
    sampleSubtitle: "Описание филиала",
  },
  staff: {
    aspectRatio: 4 / 1,
    exportWidth: 1000,
    exportHeight: 250,
    sampleTitle: "Реверс №1",
    sampleSubtitle: "",
  },
};

export function widgetPhotoAspectStyle(kind: WidgetPhotoKind): { aspectRatio: string } {
  const { aspectRatio } = WIDGET_PHOTO_LAYOUT[kind];
  return { aspectRatio: `${aspectRatio}` };
}
