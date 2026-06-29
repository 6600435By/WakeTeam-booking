import type { CSSProperties } from "react";

export type WidgetTheme = {
  primaryColor: string;
  accentColor: string;
  buttonBg: string;
  buttonText: string;
  pageBackground: string;
  cardBackground: string;
  stepActiveBg: string;
  stepInactiveBg: string;
};

export type WidgetTexts = {
  title: string;
  subtitle: string;
  submitButton: string;
  stepLabels: string[];
  wakeLabel: string;
  supLabel: string;
  emptySlotsHint: string;
  callAdminLabel: string;
  callAdminPhone: string;
  successTitle: string;
  successMessage: string;
  successCancelReminder: string;
};

export type WidgetBehavior = {
  hideBranchStep: boolean;
  showTariffsExpandable: boolean;
};

export type WidgetSettings = {
  theme: WidgetTheme;
  texts: WidgetTexts;
  behavior: WidgetBehavior;
};

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  theme: {
    primaryColor: "#c0c100",
    accentColor: "#fcff00",
    buttonBg: "#fcff00",
    buttonText: "#0f172a",
    pageBackground: "#f4f2f2",
    cardBackground: "#ffffff",
    stepActiveBg: "#fcff00",
    stepInactiveBg: "#c0c100",
  },
  texts: {
    title: "WAKETEAM.BY",
    subtitle: "Катание на вейкборде и сапборде",
    submitButton: "Записаться",
    stepLabels: ["Филиал", "Услуга", "Реверс", "Время", "Контакты"],
    wakeLabel: "Вейкбординг",
    supLabel: "Сапборд",
    emptySlotsHint: "Если ваше время занято, проверьте другие филиалы",
    callAdminLabel: "Позвонить администратору",
    callAdminPhone: "+375445996565",
    successTitle: "Запись создана",
    successMessage: "Ждём вас на вейк-парке WakeTeam!",
    successCancelReminder:
      "Не сможете приехать? Позвоните администратору и отмените запись:",
  },
  behavior: {
    hideBranchStep: false,
    showTariffsExpandable: true,
  },
};

export function parseWidgetSettings(raw: string | null | undefined): WidgetSettings {
  if (!raw) return DEFAULT_WIDGET_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<WidgetSettings>;
    return {
      theme: { ...DEFAULT_WIDGET_SETTINGS.theme, ...parsed.theme },
      texts: {
        ...DEFAULT_WIDGET_SETTINGS.texts,
        ...parsed.texts,
        successCancelReminder:
          parsed.texts?.successCancelReminder?.trim() ||
          DEFAULT_WIDGET_SETTINGS.texts.successCancelReminder,
      },
      behavior: { ...DEFAULT_WIDGET_SETTINGS.behavior, ...parsed.behavior },
    };
  } catch {
    return DEFAULT_WIDGET_SETTINGS;
  }
}

export function widgetThemeVars(theme: WidgetTheme): CSSProperties {
  return {
    ["--widget-primary" as string]: theme.primaryColor,
    ["--widget-accent" as string]: theme.accentColor,
    ["--widget-btn-bg" as string]: theme.buttonBg,
    ["--widget-btn-text" as string]: theme.buttonText,
    ["--widget-page-bg" as string]: theme.pageBackground,
    ["--widget-card-bg" as string]: theme.cardBackground,
    ["--widget-step-active" as string]: theme.stepActiveBg,
    ["--widget-step-done" as string]: theme.stepInactiveBg,
  };
}

export function formatAdminPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("375")) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10)}`;
  }
  return phone;
}
