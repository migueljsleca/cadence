"use client";

import { useEffect, useRef, useState } from "react";

const bricks = [
  1, 2, 3, 1,
  3, 1, 4, 2,
  2, 4, 1, 3,
  1, 3, 2, 4,
];

const intensityLevels = [0, 1, 2, 3, 4, 5];

export function Footer() {
  const [hovering, setHovering] = useState(false);
  const frameRef = useRef<number | null>(null);
  const [offsets, setOffsets] = useState(() => bricks.map((_, i) => (Math.floor(i / 4) + i % 4)));

  useEffect(() => {
    if (!hovering) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    let lastTime = 0;

    function step(time: number) {
      if (time - lastTime > 300) {
        setOffsets((prev) => prev.map((o) => (o + 1) % intensityLevels.length));
        lastTime = time;
      }
      frameRef.current = requestAnimationFrame(step);
    }

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [hovering]);

  return (
    <footer className="pointer-events-none">
      <div className="flex items-start gap-3">
        <div
          className="pointer-events-auto grid grid-cols-4 gap-[2px]"
          aria-hidden="true"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          {bricks.map((intensity, i) => (
            <span
              key={i}
              className="h-[5px] w-[5px] rounded-[1.5px] transition-[background-color] duration-300 ease-out"
              style={{
                backgroundColor: `var(--activity-${hovering ? intensityLevels[(intensity + offsets[i]) % intensityLevels.length] : intensity})`,
                transitionDelay: `${offsets[i] * 40}ms`,
              }}
            />
          ))}
        </div>
        <div className="-translate-y-[2px] flex flex-col gap-1">
          <span className="font-mono text-[12px] leading-none text-muted-foreground/60">brick by brick</span>
          <a
            href="https://www.strava.com/athletes/46854365"
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto font-mono text-[12px] leading-none text-muted-foreground/60 transition-colors duration-200 hover:text-accent"
          >
            made by miguel leça
          </a>
        </div>
      </div>
    </footer>
  );
}