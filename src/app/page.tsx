import { ActivityTimelineViewport } from "@/components/activity-grid";
import { getActivityTimeline } from "@/lib/activities";

export const dynamic = "force-dynamic";

export default async function Home() {
  const timeline = await getActivityTimeline();

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <section className="fixed inset-x-0 top-[48svh] -translate-y-1/2">
        <ActivityTimelineViewport cells={timeline.all} />
      </section>
    </main>
  );
}
