import { useEffect, useRef, useState } from "react";
import { breakDownSeconds, formatSeconds } from "../formatSeconds";
import "./FlipDurationDisplay.css";

function formatSegment(value: number, pad?: number): string {
  return pad !== undefined ? String(value).padStart(pad, "0") : String(value);
}

/** Split-flap style digit panel (upper / lower halves) matching mechanical flip-clock visuals. */
function FlipDigitFace({ text }: { text: string }) {
  return (
    <>
      <div className="flip-digit-half flip-digit-half--upper" aria-hidden="true">
        <span className="flip-digit-char">{text}</span>
      </div>
      <div className="flip-digit-half flip-digit-half--lower" aria-hidden="true">
        <span className="flip-digit-char">{text}</span>
      </div>
    </>
  );
}

/** One flip animation for a single displayed character (digit). */
function FlipDigitFlapper({ digitChar }: { digitChar: string }) {
  const digitRef = useRef(digitChar);
  const displayedRef = useRef(digitChar);

  useEffect(() => {
    digitRef.current = digitChar;
  }, [digitChar]);

  const [faceText, setFaceText] = useState(() => digitChar);
  const [incomingText, setIncomingText] = useState(() => digitChar);
  const [flipped, setFlipped] = useState(false);
  const [instant, setInstant] = useState(false);

  /**
   * When the tab is backgrounded, CSS transitions are often paused and `transitionend` may never fire.
   * That leaves `flipped` stuck true and refs out of sync, so later updates don't animate. Resync from
   * the current prop when we become visible again.
   */
  const wasDocumentHiddenRef = useRef(document.visibilityState === "hidden");
  useEffect(() => {
    function onVisibilityChange() {
      const hidden = document.visibilityState === "hidden";
      if (!hidden && wasDocumentHiddenRef.current) {
        const latest = digitRef.current;
        displayedRef.current = latest;
        setFaceText(latest);
        setIncomingText(latest);
        setFlipped(false);
        setInstant(false);
      }
      wasDocumentHiddenRef.current = hidden;
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (digitChar === displayedRef.current) return;
    setIncomingText(digitChar);
    const id = requestAnimationFrame(() => setFlipped(true));
    return () => cancelAnimationFrame(id);
  }, [digitChar]);

  function handleTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.propertyName !== "transform") return;
    if (!flipped) return;

    displayedRef.current = incomingText;
    setFaceText(incomingText);
    setInstant(true);
    setFlipped(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setInstant(false);
        const latest = digitRef.current;
        if (latest !== displayedRef.current) {
          setIncomingText(latest);
          requestAnimationFrame(() => setFlipped(true));
        }
      });
    });
  }

  return (
    <div className="flip-digit-cell">
      <div className="flip-digit-panel">
        <div className="flip-digit-inner">
          <div
            className={
              "flip-cube" +
              (instant ? " flip-cube--instant" : "") +
              (flipped ? " flip-cube--flipped" : "")
            }
            onTransitionEnd={handleTransitionEnd}
          >
            <div className="flip-face" aria-hidden="true">
              <FlipDigitFace text={faceText} />
            </div>
            <div className="flip-face flip-face--back" aria-hidden="true">
              <FlipDigitFace text={incomingText} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlipSegmentDigits({
  value,
  pad,
  keyPrefix
}: {
  value: number;
  pad?: number;
  keyPrefix: string;
}) {
  const formatted = formatSegment(value, pad);
  const chars = formatted.split("");

  return (
    <div className="flip-segment-housing">
      <div className="flip-segment-digits-row">
        {chars.map((ch, i) => (
          <FlipDigitFlapper key={`${keyPrefix}-${i}`} digitChar={ch} />
        ))}
      </div>
    </div>
  );
}

export function FlipSegment({
  value,
  label,
  pad
}: {
  value: number;
  label: string;
  pad?: number;
}) {
  return (
    <div className="flip-segment">
      <p className="flip-segment-label">{label}</p>
      <FlipSegmentDigits value={value} pad={pad} keyPrefix={label} />
    </div>
  );
}

export type FlipDurationDisplayProps = {
  /** Non-negative duration in seconds (fractional part uses floor when breaking down). */
  totalSeconds: number;
  className?: string;
};

/**
 * Flip-card duration display (calendar units + clock-style hours/minutes/seconds).
 * Swap this component on the home screen or reuse {@link FlipSegment} elsewhere.
 */
export function FlipDurationDisplay({ totalSeconds, className }: FlipDurationDisplayProps) {
  const parts = breakDownSeconds(totalSeconds, "floor");
  const ariaLabel = formatSeconds(totalSeconds);

  const showYears = parts.years > 0;
  const showWeeks = parts.weeks > 0;
  const showDays = parts.days > 0;
  const showCalendar = showYears || showWeeks || showDays;

  const showHours = parts.hours > 0;

  return (
    <div className={"flip-duration-display" + (className ? ` ${className}` : "")}>
      <span className="flip-duration-sr">{ariaLabel}</span>
      {showCalendar ? (
        <div className="flip-duration-group flip-duration-group--calendar" aria-hidden="true">
          {showYears ? <FlipSegment value={parts.years} label="Y" /> : null}
          {showWeeks ? <FlipSegment value={parts.weeks} label="W" /> : null}
          {showDays ? <FlipSegment value={parts.days} label="D" /> : null}
        </div>
      ) : null}
      <div className="flip-duration-group flip-duration-group--clock" aria-hidden="true">
        <div
          className={
            "flip-duration-clock" +
            (showHours ? " flip-duration-clock--with-hours" : " flip-duration-clock--no-hours")
          }
        >
          {showHours ? (
            <p className="flip-segment-label flip-duration-clock__label flip-duration-clock__label--hours">Hours</p>
          ) : null}
          <p className="flip-segment-label flip-duration-clock__label flip-duration-clock__label--minutes">Minutes</p>
          <p className="flip-segment-label flip-duration-clock__label flip-duration-clock__label--seconds">Seconds</p>
          {showHours ? (
            <>
              <div className="flip-duration-clock__digits flip-duration-clock__digits--hours">
                <FlipSegmentDigits value={parts.hours} pad={2} keyPrefix="clock-h" />
              </div>
              <span className="flip-duration-colon flip-duration-clock__colon flip-duration-clock__colon--a">:</span>
            </>
          ) : null}
          <div className="flip-duration-clock__digits flip-duration-clock__digits--minutes">
            <FlipSegmentDigits value={parts.minutes} pad={2} keyPrefix="clock-m" />
          </div>
          <span
            className={
              "flip-duration-colon flip-duration-clock__colon" +
              (showHours ? " flip-duration-clock__colon--b" : " flip-duration-clock__colon--between-ms")
            }
          >
            :
          </span>
          <div className="flip-duration-clock__digits flip-duration-clock__digits--seconds">
            <FlipSegmentDigits value={parts.seconds} pad={2} keyPrefix="clock-s" />
          </div>
        </div>
      </div>
    </div>
  );
}
