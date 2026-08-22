// No display-name field exists anywhere on users/userProfiles (see
// docs/plan.md) — a generic time-of-day greeting rather than a fabricated
// name. Computed from the server's own clock, same caveat as todayIso().
function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function GreetingHeader({ jobsToday }: { jobsToday: number }) {
  const greeting = greetingForHour(new Date().getHours());
  return (
    <div>
      <h1 className="flex items-center gap-2 font-display text-3xl font-semibold text-(--text-heading)">
        {greeting} <span aria-hidden>🌱</span>
      </h1>
      <p className="mt-1 text-sm text-(--text-muted)">
        {jobsToday === 0
          ? "Your garden is looking good. Nothing due today."
          : `Your garden is looking good. You have ${jobsToday} job${jobsToday === 1 ? "" : "s"} today.`}
      </p>
    </div>
  );
}
