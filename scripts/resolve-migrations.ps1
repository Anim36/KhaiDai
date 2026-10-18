# Apply outstanding migrations as "applied" since the DB already has them
$npx = "npx"
$migrations = @(
  "20260924151554_add_opening_hours",
  "20260924152250_add_menuitem_popular",
  "20260924195745_add_rider_payment_fields",
  "20260925092222_add_order_ready_status",
  "20260925180000_add_customer_profile_models",
  "20260925200000_split_notifications_enabled",
  "20260926070000_address_lat_lng",
  "20260926080000_restaurant_lat_lng",
  "20260926090000_payout_model",
  "20260926170000_restructure_profiles",
  "20260926180000_rider_location_tracking",
  "20260926190000_rider_dispatch_fields",
  "20260927190000_admin_role_and_suspend",
  "20260928044532_rider_zone_sessions_delivery_config",
  "20260928143135_rider_notify_prefs",
  "20261001100000_add_reviews",
  "20261001110000_add_promo_codes",
  "20261002100000_add_notifications",
  "20261003100000_partner_promo_scope",
  "20261003110000_harden_constraints",
  "20261003120000_add_composite_indexes",
  "20261003130000_add_soft_delete",
  "20261003140000_add_audit_log",
  "20261004090000_promo_code_image_url",
  "20261004100000_restaurant_online_status",
  "20261004110000_promo_code_description",
  "20261005090000_email_otp",
  "20261005100000_user_phone_unique",
  "20261005110000_restaurant_verification",
  "20261005120000_rider_verification"
)
foreach ($m in $migrations) {
  Write-Host "Marking $m applied..."
  & $npx prisma migrate resolve --applied $m 2>&1 | Select-Object -First 5
  Write-Host ""
}