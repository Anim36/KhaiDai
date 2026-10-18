// NOTE: this file used to host the demo data for the Customer Profile
// page (Addresses / Payment Methods / Favorites / Past Orders). It
// has been removed because the Customer Profile is now wired to the
// real API endpoints:
//
//   • Addresses      → /api/addresses
//   • Payment Methods → /api/payment-methods
//   • Favorites      → /api/favorites
//   • Profile / notif → /api/users/me
//   • Orders          → /api/orders
//
// The file is intentionally kept empty (a no-op module) so any stale
// imports surface as compile errors and can be cleaned up if found.
// We deliberately don't export the prior mock arrays.
export {};
