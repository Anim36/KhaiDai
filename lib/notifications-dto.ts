// lib/notifications-dto.ts
//
// Client-safe DTO shape + enum union that the API returns for
// notifications. Mirrors `lib/notifications.ts` but is free of
// Prisma / dotenv imports so it bundles cleanly into "use client"
// components such as `NotificationBell`.

export type NotificationTypeStr = "ORDER_UPDATE" | "PROMOTION" | "SYSTEM";

export type NotificationDto = {
  id: string;
  title: string;
  message: string | null;
  type: NotificationTypeStr;
  isRead: boolean;
  relatedOrderId: string | null;
  createdAt: string;
};
