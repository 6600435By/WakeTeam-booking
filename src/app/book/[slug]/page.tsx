import { BookingWidget } from "@/components/widget/BookingWidget";

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { slug } = await params;
  const { embed } = await searchParams;
  const isEmbed = embed === "1";

  return (
    <main
      className={
        isEmbed
          ? "box-border flex h-[100dvh] min-h-0 flex-col overflow-hidden p-0"
          : "mx-auto flex h-[100dvh] min-h-0 max-w-lg flex-col overflow-hidden px-3 py-3 sm:max-w-xl sm:px-4 sm:py-4"
      }
    >
      <BookingWidget slug={slug} fillViewport />
    </main>
  );
}
