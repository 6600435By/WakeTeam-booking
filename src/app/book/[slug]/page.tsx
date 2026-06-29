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
          ? "p-1 sm:p-2"
          : "mx-auto max-w-lg px-3 py-6 sm:max-w-xl sm:px-4 sm:py-8"
      }
    >
      <BookingWidget slug={slug} />
    </main>
  );
}
