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
import { motion } from "motion/react";
import type { ActivityCell } from "@/lib/activities";
import { cn } from "@/lib/utils";

type ActivityGridProps = {
  cells: ActivityCell[];
  size?: "hero" | "compact";
};

type ActivityTimelineViewportProps = {
  cells: ActivityCell[];
};

type TooltipState = {
  cell: ActivityCell;
  left: number;
  top: number;
};

type GridCellButtonProps = {
  cell: ActivityCell;
  label: string;
  onSelect: (cell: ActivityCell, element: HTMLButtonElement) => void;
};

type WeeklyActivityTotal = {
  weekIndex: number;
  totalSeconds: number;
};

const dayLabels = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const staggerOrigin = { week: 0, day: 3 };
const weeklyBarHeight = 164;
const weeklyBarStrokeWidth = 2;
const activityGridHeight = 164;
const timelineStartThreshold = 24;
const weeklyGuideHours = [5, 10, 15, 20];

function getPhysicalStaggerDelay(cell: ActivityCell) {
  const weekDistance = cell.weekIndex - staggerOrigin.week;
  const dayDistance = cell.dayIndex - staggerOrigin.day;
  const distance = Math.sqrt(weekDistance * weekDistance + dayDistance * dayDistance);

  return Math.min(distance * 0.01, 1.2);
}

const GridCellButton = memo(function GridCellButton({
  cell,
  label,
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
      initial={{ opacity: 0, y: 3 }}
      animate={{
        opacity: cell.movingTimeSeconds === 0 ? 0.75 : 1,
        y: 0,
      }}
      transition={{
        delay: getPhysicalStaggerDelay(cell),
        duration: 0.3,
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
  const newestFirstCells = useMemo(() => reverseWeekOrder(cells), [cells]);
  const weeklyTotals = useMemo(() => buildWeeklyTotals(newestFirstCells), [newestFirstCells]);
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
    <div
      ref={scrollerRef}
      data-cadence-scroller
      className="w-full overflow-x-auto overflow-y-hidden px-[18vw] pb-14 pt-20 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max items-start">
        <div className="sticky left-0 z-20 mr-3 grid w-12 shrink-0 grid-rows-7 gap-[4px] pr-2">
          {hasScrolled ? (
            <div className="activity-label-fade pointer-events-auto absolute -bottom-[188px] -left-[18vw] -top-1 right-[-2.25rem]" />
          ) : null}
          {dayLabels.map((day) => (
            <div
              key={day}
              className="relative z-10 flex h-[20px] items-center font-mono text-[12px] leading-none text-muted-foreground/70"
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

        <div>
          <ActivityGrid cells={newestFirstCells} size="hero" />
          <WeeklyTotalBars weeks={weeklyTotals} />
        </div>
      </div>
    </div>
  );
}

function WeeklyTotalBars({ weeks }: { weeks: WeeklyActivityTotal[] }) {
  const [hoveredWeek, setHoveredWeek] = useState<WeeklyActivityTotal | null>(null);
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const barsEl = barsRef.current;
    if (!barsEl) return;

    const scroller = barsEl.closest("[data-cadence-scroller]");
    if (!scroller) return;

    const clearHoveredWeek = () => setHoveredWeek(null);

    scroller.addEventListener("scroll", clearHoveredWeek, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", clearHoveredWeek);
    };
  }, []);

  return (
    <div
      ref={barsRef}
      data-weekly-bars
      className="relative mt-3 grid h-[164px] grid-flow-col items-start gap-[4px]"
      style={{
        gridTemplateColumns: `repeat(${weeks.length}, 20px)`,
      }}
      onMouseLeave={() => setHoveredWeek(null)}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;

        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }

        setHoveredWeek(null);
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
            className="group relative flex h-[164px] w-[20px] cursor-default items-start justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`Week total: ${formatCompactMovingTime(week.totalSeconds)}`}
            onFocus={() => setHoveredWeek(week)}
            onMouseEnter={() => setHoveredWeek(week)}
          >
            {totalHeight > 0 ? (
              <svg
                className="h-[164px] w-[20px] overflow-visible text-muted-foreground/30 opacity-65 transition-[color,opacity] duration-150 group-hover:text-muted-foreground/80 group-hover:opacity-100 group-focus-visible:text-muted-foreground/80 group-focus-visible:opacity-100"
                viewBox={`0 0 20 ${weeklyBarHeight}`}
                aria-hidden="true"
              >
                <line
                  x1="10"
                  x2="10"
                  y1={weeklyBarStrokeWidth / 2}
                  y2={Math.max(totalHeight - weeklyBarStrokeWidth / 2, weeklyBarStrokeWidth / 2)}
                  stroke="currentColor"
                  strokeWidth={weeklyBarStrokeWidth}
                  strokeLinecap="round"
                />
              </svg>
            ) : null}
          </button>
        );
      })}
      {hoveredWeek && hoveredWeek.totalSeconds > 0 ? (
        <span
          className="pointer-events-none absolute top-[calc(100%+16px)] z-30 -translate-x-1/2 whitespace-nowrap font-mono text-[12px] leading-none text-muted-foreground"
          style={{
            left: hoveredWeek.weekIndex * 24 + 10,
          }}
        >
          {formatCompactMovingTime(hoveredWeek.totalSeconds)}
        </span>
      ) : null}
    </div>
  );
}

export function ActivityGrid({ cells, size = "hero" }: ActivityGridProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
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
    setTooltip({
      cell,
      left: element.offsetLeft + element.offsetWidth / 2,
      top: element.offsetTop,
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
      <motion.div
        className={cn(
          "grid grid-flow-col grid-rows-7",
          size === "compact"
            ? "auto-cols-[14px] gap-[5px] md:auto-cols-[18px] md:gap-[7px]"
            : "auto-cols-[20px] gap-[4px]"
        )}
        style={{ width: "max-content" }}
        aria-label={`${weeks} weeks of activity history`}
      >
        {cells.map((cell) => (
          <GridCellButton
            key={cell.date}
            cell={cell}
            label={cellLabels.get(cell.date) ?? cell.date}
            onSelect={showTooltip}
          />
        ))}
      </motion.div>

      <div
        className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-center font-mono text-[12px] text-popover-foreground opacity-0 shadow-2xl shadow-black/40 data-[visible=true]:opacity-100"
        data-visible={Boolean(tooltip)}
        style={{
          left: tooltip?.left ?? 0,
          top: tooltip?.top ?? 0,
        }}
        aria-hidden={!tooltip}
      >
        {tooltip ? (
          <>
            <div className="font-medium">{formatDate(tooltip.cell.date)}</div>
            <div className="text-muted-foreground">
              {formatCompactMovingTime(tooltip.cell.movingTimeSeconds)}
            </div>
          </>
        ) : null}
      </div>
    </div>
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

  return `${String(hours).padStart(2, "0")}h${String(minutes).padStart(2, "0")}m`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
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
    };

    week.totalSeconds += cell.movingTimeSeconds;
    totals.set(cell.weekIndex, week);
  }

  return [...totals.values()].sort((a, b) => a.weekIndex - b.weekIndex);
}
