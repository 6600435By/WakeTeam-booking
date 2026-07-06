import type { AdminRole } from "@/lib/admin-roles";

export type TourStepDef = {
  /** CSS selector, e.g. [data-onboarding="nav-journal"] */
  element?: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
  /** Navigate before highlighting (tour waits for element) */
  navigateTo?: string;
};

function welcome(name: string): TourStepDef {
  return {
    title: `Добро пожаловать${name ? `, ${name}` : ""}!`,
    description:
      "Краткий тур покажет, как начать рабочий день. Можно пропустить — подробности всегда в разделе «Справка».",
  };
}

function helpStep(): TourStepDef {
  return {
    element: '[data-onboarding="nav-help"]',
    title: "Справка",
    description:
      "Здесь — подробные инструкции, типовые сценарии и ответы на частые вопросы. Кнопка «Повторить тур» тоже там.",
    side: "bottom",
  };
}

const OPERATOR_STEPS: TourStepDef[] = [
  {
    element: '[data-onboarding="nav-journal"]',
    title: "Журнал",
    description: "Главный экран — расписание записей на выбранный день. Здесь вы видите, кто и во сколько приедет.",
    side: "bottom",
  },
  {
    element: '[data-onboarding="nav-shift"]',
    title: "Учёт времени",
    description: "Первым делом каждый рабочий день откройте смену в этом разделе. Без открытой смены учёт времени не ведётся.",
    side: "bottom",
  },
  {
    element: '[data-onboarding="shift-open"]',
    title: "Начать смену",
    description:
      "Нажмите «Начать смену» и укажите время начала. В конце дня закройте смену здесь же — она уйдёт на проверку администратору.",
    side: "top",
    navigateTo: "/admin/shift",
  },
  {
    element: '[data-onboarding="journal-date"]',
    title: "Дата в журнале",
    description:
      "Переключайте день стрелками или календарём. Кнопка «сегодня» возвращает к текущей дате.",
    side: "bottom",
    navigateTo: "/admin/journal",
  },
  {
    element: '[data-onboarding="journal-grid"]',
    title: "Сетка записей",
    description:
      "Каждая ячейка — время и ресурс (катер, инструктор). Обычно журнал только для просмотра. Если в вашей смене стоит «Работает как админ» — можно создавать и менять записи.",
    side: "top",
  },
];

const BRANCH_ADMIN_STEPS: TourStepDef[] = [
  {
    element: '[data-onboarding="admin-nav"]',
    title: "Ваши разделы",
    description:
      "Журнал, филиал, клиенты, абонементы, сотрудники, учёт времени и проверка смен — всё, что нужно для работы филиала.",
    side: "bottom",
  },
  {
    element: '[data-onboarding="shift-open"]',
    title: "Откройте смену",
    description: "Начните день с открытия смены. Это фиксирует ваше рабочее время и активирует полный доступ к журналу.",
    side: "top",
    navigateTo: "/admin/shift",
  },
  {
    element: '[data-onboarding="journal-date"]',
    title: "Навигация по дате",
    description: "Выбирайте день для просмотра и редактирования записей.",
    side: "bottom",
    navigateTo: "/admin/journal",
  },
  {
    element: '[data-onboarding="journal-grid"]',
    title: "Новая запись",
    description:
      "Кликните свободный слот в сетке — откроется форма. Укажите телефон клиента, услугу, время и ресурс. На телефоне — кнопка «+» внизу экрана.",
    side: "top",
    navigateTo: "/admin/journal",
  },
  {
    element: '[data-onboarding="nav-shift-review"]',
    title: "Проверка смен",
    description:
      "В конце дня проверяйте и утверждайте смены операторов вашего филиала. Без утверждения зарплата не начислится.",
    side: "bottom",
  },
  {
    element: '[data-onboarding="nav-branches"]',
    title: "Филиал",
    description:
      "Часы работы, праздники, услуги, катера и тарифы настраиваются здесь. Изменения влияют на виджет записи и журнал.",
    side: "bottom",
  },
];

const BRANCH_MANAGER_STEPS: TourStepDef[] = [
  {
    element: '[data-onboarding="branch-picker"]',
    title: "Выбор филиала",
    description:
      "Вы управляете несколькими филиалами. Переключайте филиал здесь — журнал и смены покажут данные выбранного парка.",
    side: "bottom",
  },
  {
    element: '[data-onboarding="nav-shift"]',
    title: "Календарь смен",
    description:
      "Планируйте смены сотрудников на неделю: кто работает, в каком филиале, с какими правами (в т.ч. «работает как админ»).",
    side: "bottom",
  },
  {
    element: '[data-onboarding="shift-calendar"]',
    title: "Планирование",
    description:
      "Кликните на ячейку дня сотрудника, чтобы назначить или изменить смену. Можно заполнить неделю массово.",
    side: "top",
    navigateTo: "/admin/shift?tab=calendar",
  },
  {
    element: '[data-onboarding="journal-grid"]',
    title: "Журнал",
    description:
      "Следите за загрузкой катеров во всех ваших филиалах. На своей смене можете редактировать записи.",
    side: "top",
    navigateTo: "/admin/journal",
  },
  {
    element: '[data-onboarding="nav-statistics"]',
    title: "Статистика",
    description: "Отчёты по записям: выручка, отмены, источники. Фильтруйте по филиалу, услуге и периоду.",
    side: "bottom",
  },
  {
    element: '[data-onboarding="nav-shift-review"]',
    title: "Проверка смен",
    description:
      "Утверждайте смены операторов и админов филиалов в вашей зоне. Смены других управляющих — только супер-админ.",
    side: "bottom",
  },
  {
    element: '[data-onboarding="nav-users"]',
    title: "Сотрудники",
    description:
      "Создавайте аккаунты операторов и админов филиалов. Управляющих и супер-админов может назначать только супер-админ.",
    side: "bottom",
  },
];

const SUPER_ADMIN_STEPS: TourStepDef[] = [
  {
    element: '[data-onboarding="admin-nav"]',
    title: "Полный доступ",
    description:
      "Все разделы организации: журнал, статистика, филиалы, сотрудники, смены, бэкапы и логи. Ссылка «Виджет» — предпросмотр онлайн-записи.",
    side: "bottom",
  },
  {
    element: '[data-onboarding="nav-branches"]',
    title: "Филиалы",
    description:
      "Базовая настройка парков: адрес, фото, часы работы, праздники, услуги, ресурсы и тарифы.",
    side: "bottom",
  },
  {
    title: "Виджет онлайн-записи",
    description:
      "Настройки темы и текстов — по адресу /admin/widget. Ссылка «Виджет ↗» в меню — предпросмотр для клиентов.",
  },
  {
    element: '[data-onboarding="shift-calendar"]',
    title: "Календарь смен",
    description: "Планирование смен всех сотрудников по всем филиалам.",
    side: "top",
    navigateTo: "/admin/shift?tab=calendar",
  },
  {
    element: '[data-onboarding="nav-shift-review"]',
    title: "Проверка смен",
    description:
      "Утверждайте смены всех ролей, включая админов и управляющих. Только супер-админ может утвердить смену управляющего.",
    side: "bottom",
  },
  {
    element: '[data-onboarding="nav-backups"]',
    title: "Бэкапы",
    description:
      "Ночные снимки базы. При ошибке выберите бэкап дня до проблемы — восстановится вся база целиком.",
    side: "bottom",
  },
];

export function getTourSteps(
  role: AdminRole,
  userName: string | null,
  compact: boolean,
): TourStepDef[] {
  const name = userName?.trim() ?? "";
  let roleSteps: TourStepDef[];

  switch (role) {
    case "branch_operator":
      roleSteps = OPERATOR_STEPS;
      break;
    case "branch_admin":
      roleSteps = BRANCH_ADMIN_STEPS;
      break;
    case "branch_manager":
      roleSteps = BRANCH_MANAGER_STEPS;
      break;
    case "super_admin":
      roleSteps = SUPER_ADMIN_STEPS;
      break;
    default:
      roleSteps = OPERATOR_STEPS;
  }

  if (compact) {
    roleSteps = roleSteps.filter(
      (s) =>
        !s.element?.includes("journal-grid") &&
        !s.element?.includes("shift-calendar") &&
        !s.element?.includes("journal-new"),
    );
  }

  return [welcome(name), ...roleSteps, helpStep()];
}
