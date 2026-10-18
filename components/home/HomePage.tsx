import { CategoriesStrip } from "./CategoriesStrip";
import { Footer } from "./Footer";
import { HeroSection } from "./HeroSection";
import { PopularRestaurants } from "./PopularRestaurants";
import { PromoCarousel } from "./PromoCarousel";
import { TopNav } from "./TopNav";
import { TopTrendingDishes } from "./TopTrendingDishes";

export function HomePage() {
  return (
    <main className="min-h-screen w-full bg-white">
      {/* Mobile only: collapse the location pill + search bar
          when the user scrolls down so the hero owns the full
          viewport. Re-expands on scroll-up. Desktop (lg+) is
          unaffected — the single-row layout doesn't have these
          rows to collapse. */}
      <TopNav hideLocationAndSearchOnScroll />
      <HeroSection />
      <CategoriesStrip />
      <PromoCarousel />
      <PopularRestaurants />
      <TopTrendingDishes />
      <Footer />
    </main>
  );
}
