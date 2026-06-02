import { ActivityTimelineViewport } from "@/components/activity-grid";
import { Footer } from "@/components/footer";
import { getActivityTimeline } from "@/lib/activities";

export const dynamic = "force-dynamic";

export default async function Home() {
  const timeline = await getActivityTimeline();

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <section className="fixed inset-x-0 top-[48svh] -translate-y-1/2">
        <ActivityTimelineViewport cells={timeline.all} />
      </section>
      <div className="fixed inset-x-0 bottom-0 ml-[calc(8vw+3.75rem)] pb-6 md:ml-[calc(18vw+3.75rem)]">
        <Footer />
      </div>
    </main>
  );
}
