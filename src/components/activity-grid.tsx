"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
} from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { motion } from "motion/react";
import type { ActivityCell } from "@/lib/activities";
import { cn } from "@/lib/utils";

type ActivityGridProps = {
  cells: ActivityCell[];
  animationKey?: string;
  animateCellsOnMount?: boolean;
  size?: "hero" | "compact";
};

type ActivityTimelineViewportProps = {
  cells: ActivityCell[];
};

type DateRangeOption =
  | {
      type: "all";
      label: "all time";
    }
  | {
      type: "year";
      label: string;
      year: number;
    };

type DateRange = {
  start: string;
  end: string;
};

type TooltipState = {
  cell: ActivityCell;
  left: number;
  top: number;
};

type GridCellButtonProps = {
  cell: ActivityCell;
  label: string;
  animationKey: string;
  animateOnMount: boolean;
  onSelect: (cell: ActivityCell, element: HTMLButtonElement) => void;
};

type WeeklyActivityTotal = {
  weekIndex: number;
  totalSeconds: number;
  runSeconds: number;
  rideSeconds: number;
};

type WeeklyTooltipState = {
  week: WeeklyActivityTotal;
  left: number;
  top: number;
};

type ActivityTotals = {
  runSeconds: number;
  rideSeconds: number;
  elevationGainMeters: number;
};

type MonthMarker = {
  key: string;
  label: string;
  weekIndex: number;
  year: string;
};

const dayLabels = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const weeklyBarStrokeWidth = 2;
const timelineStartThreshold = 24;
const weeklyGuideHours = [5, 10, 15, 20];
const monthLabelWeekGap = 8;
const heroCellSize = 18;
const heroCellGap = 4;
const activityGridHeight = dayLabels.length * heroCellSize + (dayLabels.length - 1) * heroCellGap;
const weeklyBarHeight = activityGridHeight;

function getRandomCellStaggerDelay(cell: ActivityCell, animationKey: string) {
  return hashStringToUnit(`${animationKey}:delay:${cell.date}:${cell.weekIndex}:${cell.dayIndex}`) * 0.8;
}

function getRandomCellFadeDuration(cell: ActivityCell, animationKey: string) {
  return 0.16 + hashStringToUnit(`${animationKey}:duration:${cell.date}`) * 0.22;
}

function hashStringToUnit(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;

  return (hash >>> 0) / 4294967295;
}

function getWeeklyBarStaggerDelay(week: WeeklyActivityTotal) {
  return Math.min(week.weekIndex * 0.01, 1.2);
}

const GridCellButton = memo(function GridCellButton({
  cell,
  label,
  animationKey,
  animateOnMount,
  onSelect,
}: GridCellButtonProps) {
  return (
    <motion.button
      type="button"
      className={cn(
        "aspect-square rounded-[4px] transition-[background-color,transform] duration-200 ease-out will-change-[opacity,transform] hover:scale-[1.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        cell.movingTimeSeconds === 0 && "opacity-75"
      )}
      style={{
        backgroundColor: `var(--activity-${cell.intensity})`,
        gridColumn: cell.weekIndex + 1,
        gridRow: cell.dayIndex + 1,
      }}
      aria-label={label}
      initial={animateOnMount ? { opacity: 0 } : false}
      animate={{
        opacity: cell.movingTimeSeconds === 0 ? 0.75 : 1,
      }}
      transition={{
        delay: animateOnMount ? getRandomCellStaggerDelay(cell, animationKey) : 0,
        duration: animateOnMount ? getRandomCellFadeDuration(cell, animationKey) : 0.2,
        ease: [0.16, 1, 0.3, 1],
      }}
      onFocus={(event) => onSelect(cell, event.currentTarget)}
      onMouseEnter={(event) => onSelect(cell, event.currentTarget)}
      onClick={(event) => onSelect(cell, event.currentTarget)}
    />
  );
});

export function ActivityTimelineViewport({ cells }: ActivityTimelineViewportProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const targetScrollRef = useRef(0);
  const [hasScrolled, setHasScrolled] = useState(false);
  const dateRangeOptions = useMemo(() => buildDateRangeOptions(cells), [cells]);
  const [selectedRangeLabel, setSelectedRangeLabel] = useState<DateRangeOption["label"]>("all time");
  const latestActivityDate = useMemo(() => getLatestActivityDate(cells), [cells]);
  const selectedRange = useMemo(
    () => getDateRange(dateRangeOptions, selectedRangeLabel, latestActivityDate),
    [dateRangeOptions, latestActivityDate, selectedRangeLabel]
  );
  const displayCells = useMemo(() => buildDisplayCells(cells, selectedRange), [cells, selectedRange]);
  const rangeActivityCells = useMemo(
    () => filterCellsByDateRange(cells, selectedRange),
    [cells, selectedRange]
  );
  const newestFirstCells = useMemo(() => reverseWeekOrder(displayCells), [displayCells]);
  const weeklyTotals = useMemo(() => buildWeeklyTotals(newestFirstCells), [newestFirstCells]);
  const activityTotals = useMemo(() => buildActivityTotals(rangeActivityCells), [rangeActivityCells]);
  const visibleWeeklyGuides = weeklyGuideHours;

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller) return;

    scroller.scrollLeft = 0;
    targetScrollRef.current = 0;
    setHasScrolled(false);
  }, [newestFirstCells]);

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller) return;

    const handleScroll = () => {
      setHasScrolled(scroller.scrollLeft > timelineStartThreshold);
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const syncScrolledState = useCallback((scroller: HTMLDivElement) => {
    setHasScrolled(scroller.scrollLeft > timelineStartThreshold);
  }, []);

  const stopSmoothScroll = useCallback(() => {
    if (animationFrameRef.current === null) return;

    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }, []);

  const animateScroll = useCallback(function step() {
    const scroller = scrollerRef.current;

    if (!scroller) {
      animationFrameRef.current = null;
      return;
    }

    const distance = targetScrollRef.current - scroller.scrollLeft;

    if (Math.abs(distance) < 0.5) {
      scroller.scrollLeft = targetScrollRef.current;
      syncScrolledState(scroller);
      animationFrameRef.current = null;
      return;
    }

    scroller.scrollLeft += distance * 0.18;
    syncScrolledState(scroller);
    animationFrameRef.current = window.requestAnimationFrame(step);
  }, [syncScrolledState]);

  const startSmoothScroll = useCallback(() => {
    if (animationFrameRef.current !== null) return;

    animationFrameRef.current = window.requestAnimationFrame(animateScroll);
  }, [animateScroll]);

  useEffect(() => {
    function handlePageWheel(event: WheelEvent) {
      const scroller = scrollerRef.current;

      if (!scroller) return;

      const primaryDelta =
        Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;

      const nextScroll = Math.min(
        Math.max(targetScrollRef.current + primaryDelta, 0),
        maxScroll
      );

      targetScrollRef.current =
        primaryDelta < 0 && nextScroll <= timelineStartThreshold ? 0 : nextScroll;

      startSmoothScroll();

      event.preventDefault();
    }

    window.addEventListener("wheel", handlePageWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", handlePageWheel);
      stopSmoothScroll();
    };
  }, [startSmoothScroll, stopSmoothScroll]);

  return (
    <div className="w-full">
      <div className="mb-10 ml-[calc(8vw+3.75rem)] -translate-y-8 font-mono leading-none tracking-normal md:ml-[calc(18vw+3.75rem)]">
        <h1 className="text-[24px] font-medium text-foreground">
          cadence<span className="text-accent">.</span>
        </h1>
        <DateRangeFilter
          options={dateRangeOptions}
          selectedLabel={selectedRangeLabel}
          onSelect={setSelectedRangeLabel}
        />
        <dl className="mt-5 flex gap-8 text-[14px]">
          <div>
            <dt className="text-muted-foreground/70">run</dt>
            <dd className="mt-1 text-foreground">{formatTotalHours(activityTotals.runSeconds)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground/70">ride</dt>
            <dd className="mt-1 text-foreground">{formatTotalHours(activityTotals.rideSeconds)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground/70">elevation</dt>
            <dd className="mt-1 text-foreground">
              {formatElevation(activityTotals.elevationGainMeters)}
            </dd>
          </div>
        </dl>
      </div>
      <div
        ref={scrollerRef}
        data-cadence-scroller
        className="w-full overflow-x-auto overflow-y-hidden px-[8vw] pb-14 pt-7 [scrollbar-width:none] md:px-[18vw] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max items-start">
          <div className="sticky left-0 z-20 mr-3 grid w-12 shrink-0 grid-rows-7 gap-[4px] pr-2">
            {hasScrolled ? (
              <div className="activity-label-fade pointer-events-none absolute -bottom-[188px] -left-[8vw] -top-8 right-[-1.5rem] md:-left-[18vw]" />
            ) : null}
            {dayLabels.map((day) => (
              <div
                key={day}
                className="relative z-10 flex h-[18px] items-center font-mono text-[12px] leading-none text-muted-foreground/70"
              >
                {day}
              </div>
            ))}
            {visibleWeeklyGuides.map((hours) => (
              <span
                key={hours}
                className="pointer-events-none absolute left-0 z-10 -translate-y-1/2 font-mono text-[12px] leading-none text-muted-foreground/70"
                style={{
                  top: activityGridHeight + 12 + (hours / 20) * weeklyBarHeight,
                }}
              >
                {hours}h
              </span>
            ))}
          </div>

          <motion.div
            key={selectedRangeLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <ActivityGrid
              cells={newestFirstCells}
              animationKey={selectedRangeLabel}
              animateCellsOnMount
              size="hero"
            />
            <WeeklyTotalBars weeks={weeklyTotals} animateOnMount />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function DateRangeFilter({
  options,
  selectedLabel,
  onSelect,
}: {
  options: DateRangeOption[];
  selectedLabel: DateRangeOption["label"];
  onSelect: (label: DateRangeOption["label"]) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedOption = options.find((option) => option.label === selectedLabel) ?? options[0];
  const availableOptions = options.filter((option) => option.label !== selectedLabel);
  const [visibleOptions, setVisibleOptions] = useState(availableOptions);

  const handleSelect = (label: DateRangeOption["label"]) => {
    if (label === selectedLabel) {
      if (!isExpanded) {
        setVisibleOptions(availableOptions);
      }

      setIsExpanded((current) => !current);
      return;
    }

    setIsExpanded(false);
    onSelect(label);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsExpanded(false);
    }
  };

  return (
    <div className="mt-5 font-mono text-[14px] leading-none" onBlur={handleBlur}>
      <div className="text-muted-foreground/70">date range</div>
      <div className="mt-1 flex min-h-4 flex-wrap items-center overflow-visible" aria-label="Date range">
        <button
          type="button"
          className="group inline-flex items-center gap-2 whitespace-nowrap text-foreground transition-colors duration-150 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          aria-pressed="true"
          aria-expanded={isExpanded}
          onClick={() => handleSelect(selectedOption.label)}
        >
          <span>{selectedOption.label}</span>
          <span
            className={cn(
              "inline-flex size-3 items-center justify-center text-muted-foreground transition-colors duration-300 ease-out group-hover:text-accent",
              isExpanded && "text-accent"
            )}
            aria-hidden="true"
          >
            {isExpanded ? <X className="size-3" strokeWidth={2} /> : <Plus className="size-3" strokeWidth={2} />}
          </span>
        </button>
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden transition-[max-height,max-width,opacity,transform] duration-500 ease-out md:h-4 md:flex-nowrap md:pl-4",
            isExpanded
              ? "mt-2 max-h-24 max-w-[84vw] basis-full translate-x-0 opacity-100 md:mt-0 md:max-h-4 md:max-w-[60vw] md:basis-auto"
              : "pointer-events-none max-h-0 max-w-0 basis-0 -translate-x-1 opacity-0 md:basis-auto"
          )}
          aria-hidden={!isExpanded}
        >
          {visibleOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              className="whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              aria-pressed="false"
              tabIndex={isExpanded ? undefined : -1}
              onClick={() => handleSelect(option.label)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeeklyTotalBars({
  weeks,
  animateOnMount,
}: {
  weeks: WeeklyActivityTotal[];
  animateOnMount: boolean;
}) {
  const [tooltip, setTooltip] = useState<WeeklyTooltipState | null>(null);
  const barsRef = useRef<HTMLDivElement>(null);

  const showTooltip = useCallback((week: WeeklyActivityTotal, element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();

    setTooltip({
      week,
      left: rect.left + rect.width / 2,
      top: rect.bottom + 16,
    });
  }, []);

  useEffect(() => {
    const barsEl = barsRef.current;
    if (!barsEl) return;

    const scroller = barsEl.closest("[data-cadence-scroller]");
    if (!scroller) return;

    const clearTooltip = () => setTooltip(null);

    scroller.addEventListener("scroll", clearTooltip, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", clearTooltip);
    };
  }, []);

  return (
    <div
      ref={barsRef}
      data-weekly-bars
      className="relative mt-3 grid grid-flow-col items-start gap-[4px]"
      style={{
        gridTemplateColumns: `repeat(${weeks.length}, ${heroCellSize}px)`,
        height: weeklyBarHeight,
      }}
      onMouseLeave={() => setTooltip(null)}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;

        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }

        setTooltip(null);
      }}
    >
      {weeklyGuideHours.map((hours) => (
        <div
          key={hours}
          className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-muted-foreground/20"
          style={{
            top: (hours / 20) * weeklyBarHeight,
          }}
          aria-hidden="true"
        />
      ))}

      {weeks.map((week) => {
        const hours = week.totalSeconds / 3600;
        const totalHeight =
          hours > 0
            ? Math.min(Math.max((hours / 20) * weeklyBarHeight, 8), weeklyBarHeight)
            : 0;

        return (
          <button
            key={week.weekIndex}
            type="button"
            className="group relative flex w-[18px] cursor-default items-start justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            style={{ height: weeklyBarHeight }}
            aria-label={`Week total: ${formatWeeklyActivitySummary(week)}`}
            onFocus={(event) => showTooltip(week, event.currentTarget)}
            onMouseEnter={(event) => showTooltip(week, event.currentTarget)}
          >
            {totalHeight > 0 ? (
              <motion.span
                className="block w-[18px]"
                style={{ height: weeklyBarHeight }}
                initial={animateOnMount ? { opacity: 0, y: 3 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: animateOnMount ? getWeeklyBarStaggerDelay(week) : 0,
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <svg
                  className="w-[18px] overflow-visible text-muted-foreground/30 opacity-65 transition-[color,opacity] duration-150 group-hover:text-muted-foreground/80 group-hover:opacity-100 group-focus-visible:text-muted-foreground/80 group-focus-visible:opacity-100"
                  style={{ height: weeklyBarHeight }}
                  viewBox={`0 0 ${heroCellSize} ${weeklyBarHeight}`}
                  aria-hidden="true"
                >
                  <line
                    x1={heroCellSize / 2}
                    x2={heroCellSize / 2}
                    y1={weeklyBarStrokeWidth / 2}
                    y2={Math.max(totalHeight - weeklyBarStrokeWidth / 2, weeklyBarStrokeWidth / 2)}
                    stroke="currentColor"
                    strokeWidth={weeklyBarStrokeWidth}
                    strokeLinecap="round"
                  />
                </svg>
              </motion.span>
            ) : null}
          </button>
        );
      })}
      {tooltip && tooltip.week.totalSeconds > 0 ? <WeeklyActivityTooltip tooltip={tooltip} /> : null}
    </div>
  );
}

function WeeklyActivityTooltip({ tooltip }: { tooltip: WeeklyTooltipState }) {
  return createPortal(
    <span
      className="pointer-events-none fixed z-[100] -translate-x-1/2 whitespace-nowrap text-center font-mono text-[12px] leading-[1.25] text-muted-foreground"
      style={{
        left: tooltip.left,
        top: tooltip.top,
      }}
    >
      {getWeeklyActivityTooltipItems(tooltip.week).map((item) => (
        <span key={item.label} className="block [&+span]:mt-1">
          <span>{item.label}</span>
          <span className="block text-foreground">{item.value}</span>
        </span>
      ))}
    </span>,
    document.body
  );
}

export function ActivityGrid({
  cells,
  animationKey = "default",
  animateCellsOnMount = true,
  size = "hero",
}: ActivityGridProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const monthMarkers = useMemo(() => buildMonthMarkers(cells, monthLabelWeekGap), [cells]);
  const cellLabels = useMemo(
    () =>
      new Map(
        cells.map((cell) => [
          cell.date,
          `${formatDate(cell.date)}: ${formatMovingTime(cell.movingTimeSeconds)}`,
        ])
      ),
    [cells]
  );

  const showTooltip = useCallback((cell: ActivityCell, element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();

    setTooltip({
      cell,
      left: rect.left + rect.width / 2,
      top: rect.top,
    });
  }, []);

  const hideTooltipOnBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setTooltip(null);
  }, []);

  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const gridEl = gridRef.current;
    if (!gridEl) return;

    const scroller = gridEl.closest("[data-cadence-scroller]");
    if (!scroller) return;

    const clearTooltip = () => setTooltip(null);

    scroller.addEventListener("scroll", clearTooltip, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", clearTooltip);
    };
  }, []);

  if (cells.length === 0) {
    return (
      <div className="flex min-h-[160px] items-center justify-center text-sm text-muted-foreground">
        Place your Strava export at the project root as activities.csv.
      </div>
    );
  }

  const weeks = Math.max(...cells.map((cell) => cell.weekIndex)) + 1;

  return (
    <div ref={gridRef} className="relative" onBlur={hideTooltipOnBlur} onMouseLeave={() => setTooltip(null)}>
      {size === "hero" && monthMarkers.length > 0 ? (
        <div
          className="pointer-events-none absolute -top-7 left-0 right-0 h-4 font-mono text-[12px] leading-none text-muted-foreground/70"
          aria-hidden="true"
        >
          {monthMarkers.map((marker) => (
            <span
              key={marker.key}
              className="absolute top-0 whitespace-nowrap"
              style={{
                left: marker.weekIndex * (heroCellSize + heroCellGap),
              }}
            >
              {marker.label}
            </span>
          ))}
        </div>
      ) : null}
      <motion.div
        className={cn(
          "grid grid-flow-col grid-rows-7",
          size === "compact"
            ? "auto-cols-[14px] gap-[5px] md:auto-cols-[18px] md:gap-[7px]"
            : "auto-cols-[18px] gap-[4px]"
        )}
        style={{ width: "max-content" }}
        aria-label={`${weeks} weeks of activity history`}
      >
        {cells.map((cell) => (
          <GridCellButton
            key={cell.date}
            cell={cell}
            label={cellLabels.get(cell.date) ?? cell.date}
            animationKey={animationKey}
            animateOnMount={animateCellsOnMount}
            onSelect={showTooltip}
          />
        ))}
      </motion.div>

      {tooltip ? <ActivityTooltip tooltip={tooltip} /> : null}
    </div>
  );
}

function ActivityTooltip({ tooltip }: { tooltip: TooltipState }) {
  return createPortal(
    <div
      className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-center font-mono text-[12px] text-popover-foreground shadow-2xl shadow-black/40"
      style={{
        left: tooltip.left,
        top: tooltip.top,
      }}
    >
      <div className="font-medium">{formatDate(tooltip.cell.date)}</div>
      <div className="text-muted-foreground">{formatCompactMovingTime(tooltip.cell.movingTimeSeconds)}</div>
    </div>,
    document.body
  );
}

export function formatMovingTime(seconds: number) {
  if (seconds <= 0) return "0 min";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function formatCompactMovingTime(seconds: number) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

function formatTooltipMovingTime(seconds: number) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function formatMonthLabel(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
  }).format(new Date(`${date}T12:00:00`)).toLowerCase();
}

function reverseWeekOrder(cells: ActivityCell[]) {
  if (cells.length === 0) return cells;

  const lastWeekIndex = Math.max(...cells.map((cell) => cell.weekIndex));

  return cells.map((cell) => ({
    ...cell,
    weekIndex: lastWeekIndex - cell.weekIndex,
  }));
}

function buildWeeklyTotals(cells: ActivityCell[]): WeeklyActivityTotal[] {
  const totals = new Map<number, WeeklyActivityTotal>();

  for (const cell of cells) {
    const week = totals.get(cell.weekIndex) ?? {
      weekIndex: cell.weekIndex,
      totalSeconds: 0,
      runSeconds: 0,
      rideSeconds: 0,
    };

    week.totalSeconds += cell.movingTimeSeconds;
    week.runSeconds += cell.runSeconds;
    week.rideSeconds += cell.rideSeconds;
    totals.set(cell.weekIndex, week);
  }

  return [...totals.values()].sort((a, b) => a.weekIndex - b.weekIndex);
}

function getWeeklyActivityTooltipItems(week: WeeklyActivityTotal) {
  return [
    { label: "run", value: formatTooltipMovingTime(week.runSeconds), seconds: week.runSeconds },
    { label: "ride", value: formatTooltipMovingTime(week.rideSeconds), seconds: week.rideSeconds },
  ].filter((item) => item.seconds > 0);
}

function formatWeeklyActivitySummary(week: WeeklyActivityTotal) {
  return getWeeklyActivityTooltipItems(week)
    .map((item) => `${item.label} ${item.value}`)
    .join(", ");
}

function buildDateRangeOptions(cells: ActivityCell[]): DateRangeOption[] {
  const years = new Set<number>();

  for (const cell of cells) {
    if (cell.activityCount === 0) continue;
    years.add(Number(cell.date.slice(0, 4)));
  }

  return [
    { type: "all", label: "all time" },
    ...[...years]
      .sort((a, b) => b - a)
      .map((year) => ({
        type: "year" as const,
        label: String(year),
        year,
      })),
  ];
}

function getDateRange(
  options: DateRangeOption[],
  selectedLabel: DateRangeOption["label"],
  latestActivityDate: string | null
): DateRange | null {
  const option = options.find((candidate) => candidate.label === selectedLabel);

  if (!option || option.type === "all" || !latestActivityDate) {
    return null;
  }

  const yearStart = `${option.year}-01-01`;
  const yearEnd = `${option.year}-12-31`;

  return {
    start: yearStart,
    end: latestActivityDate.slice(0, 4) === String(option.year) ? latestActivityDate : yearEnd,
  };
}

function getLatestActivityDate(cells: ActivityCell[]) {
  const activeDates = cells
    .filter((cell) => cell.activityCount > 0)
    .map((cell) => cell.date)
    .sort();

  return activeDates[activeDates.length - 1] ?? null;
}

function filterCellsByDateRange(cells: ActivityCell[], range: DateRange | null) {
  if (!range) return cells;

  return cells.filter((cell) => cell.date >= range.start && cell.date <= range.end);
}

function buildDisplayCells(cells: ActivityCell[], range: DateRange | null) {
  if (!range || cells.length === 0) return cells;

  const sourceByDate = new Map(cells.map((cell) => [cell.date, cell]));
  const displayStart = startOfWeek(parseDateKey(range.start));
  const displayEnd = endOfWeek(parseDateKey(range.end));
  const displayCells: ActivityCell[] = [];
  let cursor = new Date(displayStart);
  let weekIndex = 0;

  while (cursor <= displayEnd) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = formatDateKey(cursor);
      const source = sourceByDate.get(date);

      displayCells.push(
        source && date >= range.start && date <= range.end
          ? { ...source, weekIndex, dayIndex }
          : createEmptyActivityCell(date, weekIndex, dayIndex)
      );

      cursor = addDays(cursor, 1);
    }

    weekIndex += 1;
  }

  return displayCells;
}

function createEmptyActivityCell(date: string, weekIndex: number, dayIndex: number): ActivityCell {
  return {
    date,
    weekIndex,
    dayIndex,
    movingTimeSeconds: 0,
    runSeconds: 0,
    rideSeconds: 0,
    distanceKm: 0,
    elevationGainMeters: 0,
    activityCount: 0,
    intensity: 0,
  };
}

function buildActivityTotals(cells: ActivityCell[]): ActivityTotals {
  return cells.reduce(
    (totals, cell) => {
      totals.runSeconds += cell.runSeconds;
      totals.rideSeconds += cell.rideSeconds;
      totals.elevationGainMeters += cell.elevationGainMeters;
      return totals;
    },
    {
      runSeconds: 0,
      rideSeconds: 0,
      elevationGainMeters: 0,
    }
  );
}

function formatTotalHours(seconds: number) {
  return `${Math.round(seconds / 3600).toLocaleString("en")}h`;
}

function formatElevation(meters: number) {
  return `${Math.round(meters).toLocaleString("en")}m`;
}

function startOfWeek(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysFromMonday = (next.getDay() + 6) % 7;

  next.setDate(next.getDate() - daysFromMonday);
  return next;
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  next.setDate(next.getDate() + days);
  return next;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function buildMonthMarkers(cells: ActivityCell[], minimumWeekGap: number): MonthMarker[] {
  if (cells.length === 0) return [];

  const monthStarts = new Map<string, MonthMarker>();
  const firstVisualWeek = Math.min(...cells.map((cell) => cell.weekIndex));
  const firstVisualCells = cells
    .filter((cell) => cell.weekIndex === firstVisualWeek)
    .sort((a, b) => b.date.localeCompare(a.date));
  const latestCell = firstVisualCells[0];

  if (latestCell) {
    const monthKey = latestCell.date.slice(0, 7);

    monthStarts.set(monthKey, {
      key: `${monthKey}-current`,
      label: formatTimelineMonthLabel(latestCell.date),
      weekIndex: firstVisualWeek,
      year: latestCell.date.slice(0, 4),
    });
  }

  for (const cell of cells) {
    if (!cell.date.endsWith("-01")) continue;

    const monthKey = cell.date.slice(0, 7);
    if (monthStarts.has(monthKey)) continue;

    monthStarts.set(monthKey, {
      key: monthKey,
      label: formatTimelineMonthLabel(cell.date),
      weekIndex: cell.weekIndex,
      year: cell.date.slice(0, 4),
    });
  }

  const markers = [...monthStarts.values()].sort((a, b) => a.weekIndex - b.weekIndex);
  const sparseMarkers: MonthMarker[] = [];

  for (const marker of markers) {
    const previous = sparseMarkers[sparseMarkers.length - 1];
    const isJanuary = marker.key.slice(5, 7) === "01";

    if (isJanuary || !previous || marker.weekIndex - previous.weekIndex >= minimumWeekGap) {
      sparseMarkers.push(marker);
    }
  }

  return sparseMarkers;
}

function formatTimelineMonthLabel(date: string) {
  const label = formatMonthLabel(date);

  if (date.slice(5, 7) === "01") {
    return `${label} ${date.slice(0, 4)}`;
  }

  return label;
}
