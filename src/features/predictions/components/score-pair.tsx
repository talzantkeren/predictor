export function ScorePair({
  homeScore,
  awayScore,
  label,
  className,
}: {
  homeScore: number;
  awayScore: number;
  label: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      dir="rtl"
      className={`inline-grid grid-cols-[auto_auto_auto] items-center gap-1 ${className ?? ""}`}
    >
      <span aria-hidden="true" data-score-side="home">
        {homeScore}
      </span>
      <span aria-hidden="true">–</span>
      <span aria-hidden="true" data-score-side="away">
        {awayScore}
      </span>
    </span>
  );
}
