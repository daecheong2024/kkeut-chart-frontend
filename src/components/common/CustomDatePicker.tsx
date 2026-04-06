import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";

interface CustomDatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  className?: string;
  isDateDisabled?: (date: Date) => boolean;
  variant?: "default" | "kiosk";
  disabled?: boolean;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function CustomDatePicker({
  value,
  onChange,
  className,
  isDateDisabled,
  variant = "default",
  disabled = false,
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value || new Date());
  const [popoverLeft, setPopoverLeft] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViewDate(value || new Date());
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function updatePopoverPosition() {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const popupWidth = variant === "kiosk" ? 396 : 328;
      const viewportPadding = 12;
      const minLeft = viewportPadding - rect.left;
      const maxLeft = window.innerWidth - viewportPadding - popupWidth - rect.left;
      const clampedLeft = Math.min(Math.max(0, minLeft), maxLeft);
      setPopoverLeft(Number.isFinite(clampedLeft) ? clampedLeft : 0);
    }

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, variant]);

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const selectedLabel = useMemo(
    () => format(value, variant === "kiosk" ? "yyyy년 MM월 dd일" : "yyyy - MM - dd", { locale: ko }),
    [value, variant]
  );

  const toggleOpen = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  const handlePrevMonth = () => setViewDate((prev) => subMonths(prev, 1));
  const handleNextMonth = () => setViewDate((prev) => addMonths(prev, 1));
  const handleToday = () => {
    const today = new Date();
    setViewDate(today);
    onChange(today);
    setIsOpen(false);
  };

  const handleDayClick = (day: Date) => {
    if (disabled || isDateDisabled?.(day)) return;
    onChange(day);
    setIsOpen(false);
  };

  const triggerClassName =
    variant === "kiosk"
      ? `group flex h-14 w-full items-center justify-between rounded-[20px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] px-4 text-left shadow-[0_14px_30px_rgba(15,23,42,0.06)] transition ${
          disabled
            ? "cursor-not-allowed opacity-55"
            : "cursor-pointer hover:border-sky-200 hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)]"
        }`
      : `group flex h-10 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 transition ${
          disabled
            ? "cursor-not-allowed opacity-55"
            : "cursor-pointer hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"
        }`;

  const popoverClassName =
    variant === "kiosk"
      ? "absolute top-full left-0 z-[100] mt-3 w-[396px] overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-5 shadow-[0_32px_80px_rgba(15,23,42,0.18)]"
      : "absolute top-full left-0 z-[100] mt-2 w-[328px] rounded-2xl border border-gray-100 bg-white p-5 shadow-xl";

  return (
    <div className={`relative ${className || ""}`} ref={containerRef}>
      <button type="button" onClick={toggleOpen} className={triggerClassName} disabled={disabled}>
        <div className="min-w-0">
          {variant === "kiosk" ? (
            <>
              <div className="text-[11px] font-bold tracking-[0.18em] text-slate-400 uppercase">Reservation Date</div>
              <div className="mt-1 truncate text-base font-semibold text-slate-900">{selectedLabel}</div>
            </>
          ) : (
            <span className="text-sm font-medium text-gray-900">{selectedLabel}</span>
          )}
        </div>
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-2xl transition ${
            variant === "kiosk"
              ? "bg-slate-900 text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)]"
              : "text-gray-400 group-hover:text-blue-500"
          }`}
        >
          <CalendarIcon className="h-5 w-5" />
        </span>
      </button>

      {isOpen && (
        <div className={popoverClassName} style={{ left: `${popoverLeft}px` }}>
          <div
            className={
              variant === "kiosk"
                ? "rounded-[24px] bg-[radial-gradient(circle_at_top_left,#dff4ff_0%,#edf6ff_46%,#f8fbff_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                : ""
            }
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`text-xs font-bold ${variant === "kiosk" ? "tracking-[0.22em] text-slate-400 uppercase" : "text-gray-400"}`}>
                  {variant === "kiosk" ? "Monthly View" : "날짜 선택"}
                </div>
                <div className={`mt-1 ${variant === "kiosk" ? "text-[26px] font-black tracking-tight text-slate-900" : "text-lg font-bold text-gray-900"}`}>
                  {format(viewDate, "yyyy년 MM월", { locale: ko })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${
                    variant === "kiosk"
                      ? "border-white/70 bg-white/80 text-slate-600 hover:border-sky-200 hover:text-slate-900"
                      : "border-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                  }`}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${
                    variant === "kiosk"
                      ? "border-white/70 bg-white/80 text-slate-600 hover:border-sky-200 hover:text-slate-900"
                      : "border-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                  }`}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div className={`mt-4 grid grid-cols-7 gap-2 rounded-2xl px-2 py-2 text-center ${variant === "kiosk" ? "bg-slate-50/85" : ""}`}>
            {WEEKDAY_LABELS.map((label, index) => (
              <div
                key={label}
                className={`text-xs font-bold ${
                  index === 0 ? "text-rose-400" : index === 6 ? "text-sky-500" : "text-slate-400"
                }`}
              >
                {label}
              </div>
            ))}
          </div>

          <div className={`mt-3 grid grid-cols-7 gap-2 ${variant === "kiosk" ? "px-1" : ""}`}>
            {days.map((day) => {
              const selected = isSameDay(day, value);
              const currentMonth = isSameMonth(day, viewDate);
              const today = isToday(day);
              const disabledDay = disabled || Boolean(isDateDisabled?.(day));

              let stateClassName = "";
              if (disabledDay) {
                stateClassName = "cursor-not-allowed border-transparent bg-slate-100 text-slate-300";
              } else if (selected) {
                stateClassName =
                  variant === "kiosk"
                    ? "border-transparent bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] text-white shadow-[0_16px_28px_rgba(29,78,216,0.28)]"
                    : "border-transparent bg-blue-500 text-white shadow-md shadow-blue-200";
              } else if (!currentMonth) {
                stateClassName = "border-transparent text-slate-300";
              } else if (today) {
                stateClassName =
                  variant === "kiosk"
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-transparent bg-blue-50 text-blue-600";
              } else {
                stateClassName =
                  variant === "kiosk"
                    ? "border-transparent text-slate-700 hover:border-slate-200 hover:bg-white hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                    : "border-transparent text-gray-700 hover:bg-blue-50 hover:text-blue-600";
              }

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  disabled={disabledDay}
                  className={`flex aspect-square min-h-[42px] items-center justify-center rounded-[18px] border text-sm font-semibold transition ${
                    variant === "kiosk" ? "min-w-[42px]" : "h-10 w-10 rounded-xl"
                  } ${stateClassName}`}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <div className="text-xs text-slate-400">
              {variant === "kiosk" ? `${format(value, "M월 d일 (EEE)", { locale: ko })} 선택됨` : "원하는 날짜를 선택하세요"}
            </div>
            <button
              type="button"
              onClick={handleToday}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                variant === "kiosk"
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "text-blue-600 hover:bg-blue-50"
              }`}
            >
              오늘로 이동
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
