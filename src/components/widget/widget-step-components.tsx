"use client";

import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { isCompletePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { WidgetSettings } from "@/lib/widget-settings";
import {
  WidgetBackButton,
  WidgetChipButton,
  WidgetChoiceButton,
  WidgetField,
  WidgetPanel,
  WidgetPhoneInput,
  WidgetPriceBadge,
  WidgetPrimaryButton,
  WidgetStepEnter,
  WidgetStatusText,
  WidgetSummaryCard,
  WidgetTextArea,
  WidgetTextInput,
} from "@/components/widget/widget-primitives";
import { WidgetCarouselDatePicker } from "./WidgetCarouselDatePicker";
import {
  formatSlotTime,
  formatTariffLine,
  slotGridClass,
  slotGridScrollClass,
  slotGridScrollStyle,
  supHasFree,
  wakeHasFree,
  WAKE_CELL_MINUTES,
} from "./widget-booking-utils";
import type {
  ActivityKind,
  SupSlot,
  WakeSlot,
  WidgetBranch,
  WidgetPriceRule,
} from "./widget-types";

export function WidgetStepBackButton({ onClick }: { onClick: () => void }) {
  return <WidgetBackButton onClick={onClick} />;
}

export function TariffsBlock({
  open,
  onToggle,
  rules,
  durationMinutes,
  bookingDurations,
  theme,
}: {
  open: boolean;
  onToggle: () => void;
  rules: WidgetPriceRule[];
  durationMinutes: number;
  bookingDurations?: number[];
  theme: WidgetSettings["theme"];
}) {
  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-80"
        style={{ color: theme.primaryColor }}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        Тарифы
        <ChevronDown
          className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
          strokeWidth={2.25}
        />
      </button>
      {open && (
        <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-600">
          {rules.map((r, i) => (
            <li key={i}>
              {formatTariffLine(r, durationMinutes, bookingDurations)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WidgetActivityCard({
  title,
  priceHint,
  onClick,
  theme,
  children,
}: {
  title: string;
  priceHint: string;
  onClick: () => void;
  theme: WidgetSettings["theme"];
  children?: React.ReactNode;
}) {
  const cardClass =
    "group w-full overflow-hidden rounded-xl border border-slate-200/90 bg-white text-left shadow-sm ring-1 ring-black/[0.03] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--widget-primary)]/30 hover:shadow-md active:translate-y-0";

  return (
    <div className={cardClass} style={{ background: theme.cardBackground }}>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full min-h-[4.75rem] flex-col justify-center p-3 sm:min-h-[5rem] sm:p-3.5"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold tracking-tight text-slate-900">{title}</span>
          <WidgetPriceBadge>{priceHint}</WidgetPriceBadge>
        </div>
        {!children && (
          <span className="mt-1.5 invisible min-h-[1.25rem] text-xs" aria-hidden>
            Тарифы
          </span>
        )}
      </button>
      {children ? <div className="border-t border-slate-100 px-3 pb-3 pt-2">{children}</div> : null}
    </div>
  );
}

export function WidgetDateTimeStep(props: {
  kind: ActivityKind;
  date: string;
  setDate: (d: string) => void;
  durationMinutes?: number;
  setDurationMinutes?: (d: number) => void;
  allowedDurations?: number[];
  showDurationPicker?: boolean;
  slotsLoading: boolean;
  wakeSlots?: WakeSlot[];
  selectedWakeStarts?: string[];
  onToggleWakeStart?: (startAt: string) => void;
  supSlots?: SupSlot[];
  selectedSupStarts?: string[];
  onToggleSupStart?: (startAt: string) => void;
  supQuantity?: number;
  setSupQuantity?: (n: number) => void;
  maxSupQuantity?: number;
  displayPrice: number | null;
  emptyHint?: string;
  otherBranches?: WidgetBranch[];
  showBranchAlternatives?: boolean;
  checkingOtherBranches?: boolean;
  onPickOtherBranch?: () => void;
  alternateStaff?: { id: string; name: string }[];
  checkingAlternateStaff?: boolean;
  onSwitchStaff?: (staffId: string) => void;
  onBack?: () => void;
  onNext?: () => void;
  nextLoading?: boolean;
  nextLabel?: string;
  hideBack?: boolean;
  theme: WidgetSettings["theme"];
  slotMinutes?: number;
  bookingDurationMinutes?: number;
}) {
  const slotMinutes = props.slotMinutes ?? WAKE_CELL_MINUTES;
  const bookingMinutes =
    props.kind === "sup"
      ? (props.bookingDurationMinutes ?? props.durationMinutes ?? slotMinutes)
      : slotMinutes;
  const slots =
    props.kind === "wake"
      ? (props.wakeSlots ?? [])
      : (props.supSlots ?? []).filter((s) => s.availableBoards > 0);

  const maxQty = props.maxSupQuantity ?? 0;
  const selectedWakeCount = props.selectedWakeStarts?.length ?? 0;
  const selectedSupCount = props.selectedSupStarts?.length ?? 0;
  const wakeList = props.wakeSlots ?? [];
  const wakeAllBusy = props.kind === "wake" && wakeList.length > 0 && !wakeHasFree(wakeList);
  const branchAltList = props.otherBranches ?? [];
  const showBranchFallback =
    props.showBranchAlternatives &&
    branchAltList.length > 0 &&
    !!props.onPickOtherBranch &&
    (props.kind === "sup"
      ? !props.slotsLoading && !supHasFree(props.supSlots ?? [])
      : !props.slotsLoading &&
        !props.checkingAlternateStaff &&
        !props.checkingOtherBranches &&
        (wakeList.length === 0 || wakeAllBusy) &&
        (props.alternateStaff?.length ?? 0) === 0);

  return (
    <WidgetStepEnter stepKey={`time-${props.kind}`} className="mt-2">
      {!props.hideBack && props.onBack && (
        <WidgetBackButton onClick={props.onBack} />
      )}

      {props.showDurationPicker && props.setDurationMinutes && props.allowedDurations && (
        <>
          <Label className="mt-3 block text-sm font-medium text-slate-700">
            Длительность
          </Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {props.allowedDurations.map((d) => (
              <WidgetChoiceButton
                key={d}
                selected={props.durationMinutes === d}
                onClick={() => props.setDurationMinutes!(d)}
                theme={props.theme}
              >
                {d} мин
              </WidgetChoiceButton>
            ))}
          </div>
        </>
      )}

      <WidgetCarouselDatePicker date={props.date} onChange={props.setDate} />

      {props.slotsLoading && (
        <WidgetStatusText className="mt-2">Загрузка слотов…</WidgetStatusText>
      )}

      {!props.slotsLoading && props.kind === "wake" && wakeAllBusy && (
        <WidgetStatusText tone="warning" className="mt-2">
          На эту дату все слоты заняты
        </WidgetStatusText>
      )}

      {props.kind === "wake" && props.checkingAlternateStaff && (
        <WidgetStatusText className="mt-2">Проверяем другие реверсы…</WidgetStatusText>
      )}

      {props.kind === "wake" &&
        wakeAllBusy &&
        !props.checkingAlternateStaff &&
        props.alternateStaff &&
        props.alternateStaff.length > 0 &&
        props.onSwitchStaff && (
          <>
            <WidgetStatusText className="mt-2 text-slate-600">
              Свободное время на другом реверсе:
            </WidgetStatusText>
            <div className="mt-2 flex flex-wrap gap-2">
              {props.alternateStaff.map((st) => (
                <WidgetChipButton
                  key={st.id}
                  onClick={() => props.onSwitchStaff!(st.id)}
                >
                  {st.name}
                </WidgetChipButton>
              ))}
            </div>
          </>
        )}

      {props.checkingOtherBranches && (
        <WidgetStatusText className="mt-2">Проверяем другие филиалы…</WidgetStatusText>
      )}

      {showBranchFallback && (
        <WidgetPanel className="mt-2">
          <p className="text-sm text-slate-600">
            {props.emptyHint ?? "Попробуйте другой филиал"}
          </p>
          <div className="flex flex-wrap gap-2">
            {branchAltList.map((b) => (
              <WidgetChipButton
                key={b.id}
                onClick={props.onPickOtherBranch}
              >
                {b.name}
              </WidgetChipButton>
            ))}
          </div>
          <button
            type="button"
            className="text-sm font-medium text-[var(--widget-primary)] transition-opacity hover:opacity-80"
            onClick={props.onPickOtherBranch}
          >
            Выбрать другой филиал
          </button>
        </WidgetPanel>
      )}

      {props.kind === "sup" && (
        <p className="mt-2 text-xs text-slate-500">
          Шаг слотов: {slotMinutes} мин
          {props.showDurationPicker
            ? ` · длительность записи: ${bookingMinutes} мин`
            : ""}
        </p>
      )}

      <div
        className={slotGridScrollClass}
        style={slotGridScrollStyle}
        aria-label={
          props.kind === "wake"
            ? `Выберите один или несколько интервалов по ${slotMinutes} минут`
            : `Выберите один или несколько слотов с шагом ${slotMinutes} минут`
        }
      >
        <div className={slotGridClass}>
        {props.kind === "wake" &&
          (props.wakeSlots ?? []).map((sl) => {
            const time = formatSlotTime(sl.startAt);
            const free = sl.status === "free";
            const selected = props.selectedWakeStarts?.includes(sl.startAt) ?? false;
            return (
              <WidgetChoiceButton
                key={sl.startAt}
                disabled={!free}
                selected={selected}
                aria-pressed={selected}
                onClick={() => free && props.onToggleWakeStart?.(sl.startAt)}
                theme={props.theme}
                className="min-h-9 w-full px-1 py-1.5 text-xs sm:text-sm"
              >
                {time}
              </WidgetChoiceButton>
            );
          })}

        {props.kind === "sup" &&
          (props.supSlots ?? [])
            .filter((s) => s.availableBoards > 0)
            .map((sl) => {
            const time = formatSlotTime(sl.startAt);
            const selected = props.selectedSupStarts?.includes(sl.startAt) ?? false;
            return (
              <WidgetChoiceButton
                key={sl.startAt}
                selected={selected}
                aria-pressed={selected}
                onClick={() => props.onToggleSupStart?.(sl.startAt)}
                theme={props.theme}
                className="min-h-10 w-full flex-col gap-0.5 px-1 py-1.5 text-xs sm:text-sm"
              >
                <span>{time}</span>
                <span className="text-[10px] font-normal opacity-75">
                  {sl.availableBoards} шт.
                </span>
              </WidgetChoiceButton>
            );
          })}
        </div>
      </div>

      {!props.slotsLoading &&
        slots.length === 0 &&
        !showBranchFallback &&
        props.kind === "wake" && (
        <WidgetSummaryCard className="mt-2">
          <p>Нет слотов на эту дату</p>
        </WidgetSummaryCard>
      )}

      {!props.slotsLoading &&
        slots.length === 0 &&
        !showBranchFallback &&
        props.kind === "sup" && (
        <WidgetSummaryCard className="mt-2">
          <p>Нет слотов на эту дату</p>
        </WidgetSummaryCard>
      )}

      {props.kind === "sup" && selectedSupCount > 0 && (
        <WidgetPanel className="mt-3">
          <p className="text-sm text-slate-700">
            Выбрано: <strong className="font-semibold">{selectedSupCount}</strong>{" "}
            {selectedSupCount === 1 ? "слот" : "слота"}
            {bookingMinutes > 0 ? ` по ${bookingMinutes} мин` : ""}
          </p>
          <p className="text-sm font-medium text-slate-700">
            Доступно сапов: {maxQty}
            {selectedSupCount > 1 ? " (минимум по выбранным слотам)" : ""}
          </p>
          <Label className="text-sm font-medium text-slate-700">
            {selectedSupCount > 1
              ? "Количество сапов на каждый слот"
              : "Количество сапов"}
          </Label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
              <WidgetChoiceButton
                key={n}
                selected={props.supQuantity === n}
                onClick={() => props.setSupQuantity?.(n)}
                theme={props.theme}
                className="min-w-10"
              >
                {n}
              </WidgetChoiceButton>
            ))}
          </div>
          {props.displayPrice != null && (
            <p className="text-sm text-slate-700">
              Стоимость:{" "}
              <strong className="font-semibold tabular-nums">
                {props.displayPrice} Br
              </strong>
            </p>
          )}
          <WidgetPrimaryButton
            disabled={!props.supQuantity}
            loading={props.nextLoading}
            onClick={props.onNext}
            theme={props.theme}
          >
            {props.nextLabel ?? "Далее"}
          </WidgetPrimaryButton>
        </WidgetPanel>
      )}

      {props.kind === "wake" && selectedWakeCount > 0 && (
        <WidgetPanel className="mt-3">
          <p className="text-sm text-slate-700">
            Выбрано: <strong className="font-semibold">{selectedWakeCount}</strong>{" "}
            интервалов ({selectedWakeCount * slotMinutes} мин)
          </p>
          {props.displayPrice != null && (
            <p className="text-sm text-slate-700">
              Стоимость:{" "}
              <strong className="font-semibold tabular-nums">
                {props.displayPrice} Br
              </strong>
            </p>
          )}
          {props.onNext && (
            <WidgetPrimaryButton
              loading={props.nextLoading}
              onClick={props.onNext}
              theme={props.theme}
            >
              {props.nextLabel ?? "Далее"}
            </WidgetPrimaryButton>
          )}
        </WidgetPanel>
      )}
    </WidgetStepEnter>
  );
}

export function WidgetContactsStep({
  summary,
  displayPrice,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  phone,
  setPhone,
  email,
  setEmail,
  comment,
  setComment,
  submitLabel,
  loading,
  onBack,
  onSubmit,
  theme,
}: {
  summary: string;
  displayPrice: number | null;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  comment: string;
  setComment: (v: string) => void;
  submitLabel: string;
  loading: boolean;
  onBack: () => void;
  onSubmit: () => void;
  theme: WidgetSettings["theme"];
}) {
  return (
    <WidgetStepEnter stepKey="contacts" className="mt-3 space-y-3">
      <WidgetBackButton onClick={onBack} />
      <WidgetSummaryCard>{summary}</WidgetSummaryCard>
      {displayPrice != null && (
        <p className="text-sm text-slate-700">
          Стоимость:{" "}
          <strong className="font-semibold tabular-nums">{displayPrice} Br</strong>
        </p>
      )}
      <div className="space-y-2.5">
        <WidgetField id="widget-first-name" label="Имя" required>
          <WidgetTextInput
            id="widget-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
        </WidgetField>
        <WidgetField id="widget-last-name" label="Фамилия">
          <WidgetTextInput
            id="widget-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
        </WidgetField>
        <WidgetField id="widget-phone" label="Телефон" required>
          <WidgetPhoneInput
            id="widget-phone"
            value={phone}
            onChange={setPhone}
          />
        </WidgetField>
        <WidgetField id="widget-email" label="Email">
          <WidgetTextInput
            id="widget-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />
        </WidgetField>
        <WidgetField id="widget-comment" label="Комментарий">
          <WidgetTextArea
            id="widget-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
        </WidgetField>
      </div>
      <WidgetPrimaryButton
        onClick={onSubmit}
        disabled={!firstName || !isCompletePhone(phone)}
        loading={loading}
        loadingLabel="Отправка…"
        theme={theme}
      >
        {submitLabel}
      </WidgetPrimaryButton>
    </WidgetStepEnter>
  );
}
