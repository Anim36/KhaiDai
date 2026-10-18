import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { restaurantToDetail } from "@/lib/restaurants";
import { RestaurantDetail } from "@/components/restaurants/RestaurantDetail";

type RouteParams = { params: { id: string } };

/**
 * Server component for `/restaurants/[id]`.
 *
 * We pull the restaurant + menu items straight from Prisma using
 * the shared `restaurantToDetail` mapper. The mapper is the same
 * one used by `/api/restaurants/[id]`, so the rendered HTML stays
 * in lock-step with what the API returns — the only difference is
 * the HTTP round-trip, which we skip here for performance.
 *
 * কাজ ৪ — we also pull the restaurant's active promo codes so the
 * chip-row can render without an extra client-side fetch.
 *
 * If no restaurant matches the dynamic segment, return 404 via
 * `notFound()`.
 */
export default async function RestaurantDetailPage({ params }: RouteParams) {
  const row = await prisma.restaurant.findUnique({
    where: { id: params.id },
    include: {
      menu: true,
      promoCodes: {
        where: {
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          description: true,
          discountType: true,
          discountValue: true,
          minOrderAmount: true,
          maxDiscount: true,
          expiresAt: true,
        },
      },
    },
  });
  if (!row) notFound();
  const data = restaurantToDetail(row);
  return (
    <RestaurantDetail
      data={data}
      promoCodes={row.promoCodes.map((p) => ({
        ...p,
        // JSON serialisation converts Dates to strings; the client
        // component already accepts both forms.
        expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      }))}
    />
  );
}

export const dynamic = "force-dynamic";
