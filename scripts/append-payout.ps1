$text = @'


/* -------------------------------------------------------------------------- */
/*  Payout                                                                    */
/* -------------------------------------------------------------------------- */

/// A partner withdrawal request against their available balance.
///
/// We treat payouts as an append-only ledger: each row captures a
/// single request, the destination it was made to, and the lifecycle
/// status. `amount` is in Taka (Int) like the rest of the monetary
/// columns. The available balance for a partner is computed by
/// subtracting the sum of all non-FAILED payouts from the sum of
/// their DELIVERED orders — see /api/payouts.
model Payout {
  id           String       @id @default(cuid())
  restaurantId String
  /// Amount in Taka the partner is requesting. Must be > 0 and
  /// <= the partner's available balance at request time.
  amount       Int
  /// One of bKash / Nagad / Rocket / Card. Matches the four chips
  /// on the partner-facing "Request Payout" modal so the persisted
  /// value is exactly what the partner picked.
  method       PayoutMethod
  /// Free-form destination captured on the modal — bKash/Nagad/Rocket
  /// wallet numbers, or the last 4 digits of a Visa/Mastercard. We
  /// never store the full PAN.
  destination  String
  /// Optional human-readable note from the partner (e.g. "Friday
  /// payroll"). Capped at 200 chars to keep the table tight.
  note         String?
  /// PENDING until the (future) gateway integration confirms the
  /// transfer; COMPLETED on success; FAILED on permanent rejection.
  /// PROCESSING covers the in-flight window once we wire bKash etc.
  status       PayoutStatus @default(PENDING)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  restaurant Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@index([restaurantId])
  @@index([status])
}
'@
Add-Content -Path 'D:\KhaiDai\khaidai\prisma\schema.prisma' -Value $text
"Appended"
