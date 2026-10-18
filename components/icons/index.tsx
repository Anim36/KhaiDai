/** Feat 3 — Inbox icon used in the admin sidebar nav. */
export function InboxIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <path
        d="M3 13.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5.5M3 13.5l3.6-7.6A2 2 0 0 1 8.4 4.5h7.2a2 2 0 0 1 1.8 1.4L21 13.5M3 13.5h5.4a3 3 0 0 0 2.85 2.05h1.5A3 3 0 0 0 15.6 13.5H21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chart / data icon used by Partner Analytics + Rider Leaderboard.          */
/* -------------------------------------------------------------------------- */

/** Bar-chart icon (20×20). Three ascending bars, brand-coloured stroke. */
/** Trophy icon (20×20) for leaderboard + bonus badges. */
export function TrophyIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <path
        d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM4 4h3v3a3 3 0 0 1-3-3zM20 4h-3v3a3 3 0 0 0 3-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Bar-chart icon (20×20). Three ascending bars, brand-coloured stroke. */
export function BarChartIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <path
        d="M3 17V8M8 17V4M13 17V11M17 17V6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M3 17H17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
import type { SVGProps } from "react";

/**
 * Icons are pixel-faithful reproductions of the Figma "homepage" frame (node 4:9).
 * Every <path> was extracted from the Figma asset CDN, and the hard-coded
 * `stroke="#…"` was replaced with `currentColor` so the color is controlled by
 * the surrounding `text-…` / `className="…"` Tailwind utility — matching how
 * the rest of the design system is themed.
 */
type Props = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number, vb = "0 0 24 24") => ({
  width: size,
  height: size,
  viewBox: vb,
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true,
} as const);

/* -------------------------------------------------------------------------- */
/*  Brand / logo                                                              */
/* -------------------------------------------------------------------------- */

/** Figma: imgCookingPot (24×24, white stroke on brand-red badge). */
export function PotIcon({ size = 24, ...p }: Props) {
  return (
    <svg {...base(size)} {...p}>
      <path
        d="M1.9992 12.0005H22.0008M20.0006 12.0005V20.0007C20.0006 20.5312 19.7899 21.0399 19.4148 21.415C19.0397 21.7901 18.531 22.0008 18.0005 22.0008H5.99952C5.46904 22.0008 4.9603 21.7901 4.58519 21.415C4.21009 21.0399 3.99936 20.5312 3.99936 20.0007V12.0005M3.99936 8.00036L20.0006 4.00024M8.8595 6.77988L8.40947 4.96982C8.34499 4.71505 8.33136 4.45006 8.36935 4.19002C8.40734 3.92997 8.49621 3.67996 8.63089 3.45428C8.76556 3.22859 8.94339 3.03166 9.15422 2.87474C9.36505 2.71782 9.60474 2.60399 9.85958 2.53975L11.7997 2.05973C12.0552 1.99542 12.3208 1.98219 12.5814 2.02082C12.842 2.05946 13.0924 2.14918 13.3182 2.28485C13.544 2.42051 13.7408 2.59944 13.8973 2.81137C14.0537 3.0233 14.1668 3.26404 14.2299 3.51978L14.68 5.31983"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Top-nav icons                                                             */
/* -------------------------------------------------------------------------- */

/** Figma: imgMapPin (18×18). */
export function MapPinIcon({ size = 18, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 18 18")} {...p}>
      <path
        d="M9.4507 16.35C10.8456 15.1454 14.9994 11.2451 14.9994 7.49996C14.9994 5.90851 14.3673 4.38224 13.2422 3.25692C12.1171 2.1316 10.5911 1.4994 9 1.4994C7.40886 1.4994 5.88289 2.1316 4.75778 3.25692C3.63268 4.38224 3.0006 5.90851 3.0006 7.49996C3.0006 11.2451 7.15443 15.1454 8.5493 16.35C8.67924 16.4478 8.83742 16.5006 9 16.5006C9.16258 16.5006 9.32076 16.4478 9.4507 16.35Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgMapPin1 (20×20, hero search pill). */
export function MapPinHeroIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <path
        d="M10.5008 18.1667C12.0506 16.8282 16.666 12.4945 16.666 8.33328C16.666 6.56501 15.9637 4.86916 14.7136 3.6188C13.4635 2.36844 11.7679 1.666 10 1.666C8.23207 1.666 6.53654 2.36844 5.28643 3.6188C4.03631 4.86916 3.334 6.56501 3.334 8.33328C3.334 12.4945 7.94937 16.8282 9.49922 18.1667C9.6436 18.2753 9.81935 18.334 10 18.334C10.1806 18.334 10.3564 18.2753 10.5008 18.1667Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgChevronDown (14×14). */
export function ChevronIcon({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 14 14")} {...p}>
      <path
        d="M3.5 5.25L7 8.75L10.5 5.25"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgSearch (18×18). */
export function SearchIcon({ size = 18, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 18 18")} {...p}>
      <path
        d="M15.7501 15.7501L12.4951 12.4951M14.25 8.25C14.25 11.5637 11.5637 14.25 8.25 14.25C4.93629 14.25 2.25 11.5637 2.25 8.25C2.25 4.93629 4.93629 2.25 8.25 2.25C11.5637 2.25 14.25 4.93629 14.25 8.25Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgShoppingCart (18×18). */
export function CartIcon({ size = 18, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 18 18")} {...p}>
      <path
        d="M1.5372 1.5372H3.0372L5.0322 10.8527C5.10538 11.1938 5.2952 11.4988 5.56898 11.7151C5.84276 11.9314 6.18338 12.0455 6.5322 12.0377H13.8672C14.2086 12.0372 14.5396 11.9202 14.8055 11.7061C15.0714 11.492 15.2563 11.1936 15.3297 10.8602L16.5672 5.28739H3.8397M6.74985 15.7506C6.74985 16.1648 6.41406 16.5006 5.99985 16.5006C5.58563 16.5006 5.24985 16.1648 5.24985 15.7506C5.24985 15.3363 5.58563 15.0005 5.99985 15.0005C6.41406 15.0005 6.74985 15.3363 6.74985 15.7506ZM14.9998 15.7506C14.9998 16.1648 14.6641 16.5006 14.2498 16.5006C13.8356 16.5006 13.4998 16.1648 13.4998 15.7506C13.4998 15.3363 13.8356 15.0005 14.2498 15.0005C14.6641 15.0005 14.9998 15.3363 14.9998 15.7506Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Arrow / dividers                                                          */
/* -------------------------------------------------------------------------- */

/** Figma: imgArrowRight (16×16, brand-red). */
export function ArrowRightIcon({ size = 16, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 16 16")} {...p}>
      <path
        d="M3.3328 8H12.6672M8 12.6672L12.6672 8L8 3.3328"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgLine (24×1) — vertical divider inside the nav search bar. */
export function VerticalDivider({ size = 24, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 1")} {...p}>
      <line x1="0" y1="0.5" x2="24" y2="0.5" stroke="currentColor" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Restaurant-card icons                                                     */
/* -------------------------------------------------------------------------- */

/** Figma: imgStar (14×14, #FF9500). */
export function StarIcon({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 14 14")} {...p}>
      <path
        d="M6.83751 1.2127C6.78855 1.2431 6.74906 1.28657 6.7235 1.33822L5.37658 4.06764C5.28774 4.24746 5.15654 4.40301 4.99426 4.52088C4.83198 4.63875 4.64348 4.71543 4.445 4.7443L1.43208 5.18472C1.37474 5.19283 1.32083 5.21688 1.27649 5.25413C1.23216 5.29138 1.19917 5.34033 1.1813 5.39542C1.16342 5.4505 1.16138 5.50949 1.17539 5.56568C1.18941 5.62187 1.21893 5.67299 1.26058 5.71322L3.43992 7.83481C3.58377 7.9749 3.69139 8.14788 3.75348 8.33883C3.81557 8.52979 3.83028 8.73298 3.79633 8.93089L3.28242 11.9286C3.27242 11.9856 3.27861 12.0443 3.3003 12.0979C3.32199 12.1516 3.35829 12.1981 3.40509 12.2321C3.45189 12.2661 3.50729 12.2864 3.56501 12.2905C3.62273 12.2946 3.68044 12.2824 3.73158 12.2553L6.42483 10.839C6.60233 10.7458 6.79981 10.6971 7.00029 10.6971C7.20077 10.6971 7.39825 10.7458 7.57575 10.839L10.2696 12.2553C10.3207 12.2825 10.3785 12.2949 10.4363 12.2908C10.4942 12.2868 10.5497 12.2666 10.5966 12.2326C10.6435 12.1985 10.6798 12.1519 10.7015 12.0982C10.7232 12.0445 10.7294 11.9857 10.7193 11.9286L10.2048 8.93031C10.171 8.73249 10.1858 8.52942 10.2479 8.33859C10.31 8.14775 10.4175 7.97486 10.5613 7.83481L12.7406 5.71264C12.7819 5.67236 12.8111 5.62133 12.8249 5.56531C12.8387 5.50929 12.8366 5.45053 12.8188 5.39566C12.8009 5.34079 12.7681 5.29201 12.724 5.25484C12.6798 5.21766 12.6262 5.19358 12.5691 5.1853L9.55558 4.7443C9.35732 4.7152 9.16909 4.63843 9.00703 4.52057C8.84497 4.40271 8.71394 4.24729 8.62517 4.06764L7.27767 1.33822C7.2521 1.28657 7.21261 1.2431 7.16365 1.2127C7.11469 1.18231 7.05821 1.1662 7.00058 1.1662C6.94295 1.1662 6.88647 1.18231 6.83751 1.2127Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgClock (14×14). */
export function ClockIcon({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 14 14")} {...p}>
      <path
        d="M7 3.49972V7L9.33352 8.16676M12.8338 7C12.8338 10.2219 10.2219 12.8338 7 12.8338C3.77808 12.8338 1.1662 10.2219 1.1662 7C1.1662 3.77808 3.77808 1.1662 7 1.1662C10.2219 1.1662 12.8338 3.77808 12.8338 7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgTruck (14×14). */
export function TruckIcon({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 14 14")} {...p}>
      <path
        d="M8.16676 10.4996V3.50035C8.16676 3.19096 8.04383 2.89425 7.82502 2.67547C7.60621 2.4567 7.30944 2.3338 7 2.3338H2.33296C2.02352 2.3338 1.72675 2.4567 1.50794 2.67547C1.28913 2.89425 1.1662 3.19096 1.1662 3.50035V9.91637C1.1662 10.0711 1.22766 10.2194 1.33707 10.3288C1.44647 10.4382 1.59486 10.4996 1.74958 10.4996H2.91634M2.91634 10.4996C2.91634 11.1439 3.43872 11.6662 4.0831 11.6662C4.72748 11.6662 5.24986 11.1439 5.24986 10.4996M2.91634 10.4996C2.91634 9.85538 3.43872 9.3331 4.0831 9.3331C4.72748 9.3331 5.24986 9.85538 5.24986 10.4996M5.24986 10.4996H8.75014M8.75014 10.4996C8.75014 11.1439 9.27252 11.6662 9.9169 11.6662C10.5613 11.6662 11.0837 11.1439 11.0837 10.4996M8.75014 10.4996C8.75014 9.85538 9.27252 9.3331 9.9169 9.3331C10.5613 9.3331 11.0837 9.85538 11.0837 10.4996M11.0837 10.4996H12.2504C12.4051 10.4996 12.5535 10.4382 12.6629 10.3288C12.7723 10.2194 12.8338 10.0711 12.8338 9.91637V7.78742C12.8336 7.65505 12.7883 7.5267 12.7055 7.42346L10.6753 4.88621C10.6207 4.8179 10.5515 4.76272 10.4727 4.72476C10.394 4.6868 10.3077 4.66702 10.2203 4.6669H8.16676"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgFlame (20×20, white stroke on the trending badge). */
export function FlameIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <path
        d="M13.3337 7.91689C11.6669 6.52795 10.5556 4.72232 10 2.5C8.61095 3.61116 7.91643 4.72232 7.91643 5.83347C7.91643 7.50021 9.16657 8.33358 9.16657 10.0003C9.16657 10.5529 8.94705 11.0828 8.55631 11.4735C8.16556 11.8642 7.6356 12.0837 7.083 12.0837C6.5304 12.0837 6.00044 11.8642 5.60969 11.4735C5.21895 11.0828 4.99943 10.5529 4.99943 10.0003C4.45844 10.7216 4.166 11.5988 4.166 12.5004C4.166 14.0476 4.78065 15.5314 5.87474 16.6254C6.96883 17.7194 8.45273 18.334 10 18.334C11.5473 18.334 13.0312 17.7194 14.1253 16.6254C15.2193 15.5314 15.834 14.0476 15.834 12.5004C15.834 10.8337 15.0006 9.30584 13.3337 7.91689Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Category icons (all 32×32 viewBox)                                        */
/* -------------------------------------------------------------------------- */

/** Figma: imgIceCreamBowl (32×32) — used by "Biryani" in the design. */
export function IceCreamBowlIcon({ size = 32, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 32 32")} {...p}>
      <path
        d="M10.6672 28H21.3328M16 24V28M6.85425 14.6666C6.64733 13.9702 6.60584 13.2352 6.73307 12.5199C6.8603 11.8047 7.15274 11.129 7.58711 10.5467C8.02147 9.96444 8.58577 9.49162 9.23507 9.16591C9.88437 8.8402 10.6007 8.6706 11.3271 8.6706C12.0535 8.6706 12.7699 8.8402 13.4192 9.16591C14.0685 9.49162 14.6328 9.96444 15.0672 10.5467C15.5015 11.129 15.794 11.8047 15.9212 12.5199C16.0484 13.2352 16.0069 13.9702 15.8 14.6666M16.1868 14.6666C15.9799 13.9702 15.9384 13.2352 16.0656 12.5199C16.1929 11.8047 16.4853 11.129 16.9197 10.5467C17.354 9.96444 17.9183 9.49162 18.5676 9.16591C19.2169 8.8402 19.9333 8.6706 20.6597 8.6706C21.3861 8.6706 22.1025 8.8402 22.7518 9.16591C23.4011 9.49162 23.9654 9.96444 24.3997 10.5467C24.8341 11.129 25.1265 11.8047 25.2538 12.5199C25.381 13.2352 25.3395 13.9702 25.1326 14.6666M20.6662 8.66669C20.6662 8.05385 20.5455 7.44701 20.311 6.88082C20.0765 6.31464 19.7328 5.80018 19.2995 5.36684C18.8662 4.9335 18.3518 4.58975 17.7857 4.35523C17.2195 4.12071 16.6128 4 16 4C15.3872 4 14.7805 4.12071 14.2143 4.35523C13.6482 4.58975 13.1338 4.9335 12.7005 5.36684C12.2672 5.80018 11.9235 6.31464 11.689 6.88082C11.4545 7.44701 11.3338 8.05385 11.3338 8.66669M16 22.6666C22.666 22.6666 26.6656 19.08 26.6656 14.6666H5.3344C5.3344 19.08 9.334 22.6666 16 22.6666Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgHamburger (32×32) — "Burgers & Pizza". */
export function HamburgerIcon({ size = 32, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 32 32")} {...p}>
      <path
        d="M16 21.3333H5.33248C4.62518 21.3333 3.94685 21.0524 3.44671 20.5523C2.94657 20.0522 2.6656 19.3739 2.6656 18.6667C2.6656 17.9594 2.94657 17.2811 3.44671 16.781C3.94685 16.281 4.62518 16 5.33248 16H26.6675C27.3748 16 28.0532 16.281 28.5533 16.781C29.0534 17.2811 29.3344 17.9594 29.3344 18.6667C29.3344 19.3739 29.0534 20.0522 28.5533 20.5523C28.0532 21.0524 27.3748 21.3333 26.6675 21.3333H21.0004M6.66592 16C5.95862 16 5.28029 15.719 4.78015 15.219C4.28001 14.7189 3.99904 14.0406 3.99904 13.3333C3.99904 10.858 5.26342 8.48401 7.51404 6.73367C9.76466 4.98333 12.8171 4 16 4C19.1829 4 22.2353 4.98333 24.486 6.73367C26.7366 8.48401 28.001 10.858 28.001 13.3333C28.001 14.0406 27.72 14.7189 27.2198 15.219C26.7197 15.719 26.0414 16 25.3341 16M6.66592 21.3333C5.95862 21.3333 5.28029 21.6143 4.78015 22.1144C4.28001 22.6145 3.99904 23.2928 3.99904 24C3.99904 25.0609 4.4205 26.0783 5.17071 26.8284C5.92091 27.5786 6.93841 28 7.99936 28H24.0006C25.0616 28 26.0791 27.5786 26.8293 26.8284C27.5795 26.0783 28.001 25.0609 28.001 24C28.001 23.2928 27.72 22.6145 27.2198 22.1144C26.7197 21.6143 26.0414 21.3333 25.3341 21.3333M8.89266 16L17.0666 22.1333C17.6325 22.5577 18.3437 22.7399 19.0439 22.6399C19.3906 22.5903 19.7242 22.473 20.0255 22.2946C20.3269 22.1162 20.5901 21.8802 20.8003 21.6L25.0006 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgCookingPot1 (32×32) — used by "Chinese & Thai". */
export function CookingPotIcon({ size = 32, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 32 32")} {...p}>
      <path
        d="M2.6656 16.0007H29.3344M26.6675 16.0007V26.6676C26.6675 27.3749 26.3865 28.0532 25.8864 28.5533C25.3863 29.0534 24.7079 29.3344 24.0006 29.3344H7.99936C7.29206 29.3344 6.61373 29.0534 6.11359 28.5533C5.61345 28.0532 5.33248 27.3749 5.33248 26.6676V16.0007M5.33248 10.6672L26.6675 5.33365M11.8127 9.03984L11.2126 6.62643C11.1267 6.28673 11.1085 5.93342 11.1591 5.58669C11.2098 5.23996 11.3283 4.90661 11.5079 4.6057C11.6874 4.30479 11.9245 4.04222 12.2056 3.83299C12.4867 3.62376 12.8063 3.47198 13.1461 3.38633L15.733 2.74631C16.0736 2.66055 16.4278 2.64292 16.7752 2.69443C17.1227 2.74594 17.4565 2.86557 17.7576 3.04646C18.0587 3.22735 18.3211 3.46593 18.5297 3.74849C18.7383 4.03106 18.889 4.35205 18.9732 4.69304L19.5733 7.09311"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgCakeSlice (32×32) — "Sweets & Desserts". */
export function CakeSliceIcon({ size = 32, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 32 32")} {...p}>
      <path
        d="M21.3333 17.3329H4M21.3333 22.6663H4M9.6 10.5324L5.08267 13.8658C4.74672 14.1138 4.47373 14.4373 4.28568 14.8102C4.09763 15.183 3.99978 15.5948 4 16.0124V26.6658C4 27.0194 4.14048 27.3585 4.39052 27.6086C4.64057 27.8586 4.97971 27.9991 5.33333 27.9991H26.6667C27.0203 27.9991 27.3594 27.8586 27.6095 27.6086C27.8595 27.3585 28 27.0194 28 26.6658V15.1271C28 12.4604 24.7467 7.09243 19.4133 4.42577C19.191 4.29849 18.9367 4.23797 18.6808 4.25145C18.425 4.26492 18.1784 4.35183 17.9707 4.50177L13.8667 7.46577M14.6667 9.33293C14.6667 10.8057 13.4728 11.9996 12 11.9996C10.5272 11.9996 9.33333 10.8057 9.33333 9.33293C9.33333 7.86017 10.5272 6.66627 12 6.66627C13.4728 6.66627 14.6667 7.86017 14.6667 9.33293Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgCircleX (32×32) — used by "Snacks" in the design. */
export function CircleXIcon({ size = 32, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 32 32")} {...p}>
      <path
        d="M20.0003 11.9997L11.9997 20.0003M11.9997 11.9997L20.0003 20.0003M29.3344 16C29.3344 23.3644 23.3644 29.3344 16 29.3344C8.63561 29.3344 2.6656 23.3644 2.6656 16C2.6656 8.63561 8.63561 2.6656 16 2.6656C23.3644 2.6656 29.3344 8.63561 29.3344 16Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgSalad (32×32) — "Healthy Foods". */
export function SaladIcon({ size = 32, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 32 32")} {...p}>
      <path
        d="M9.33333 27.9992H22.6667M15.1738 15.9998C14.3663 16.0074 13.5858 15.7093 12.9889 15.1654C12.3919 14.6216 12.0227 13.8721 11.9552 13.0674C11.8877 12.2627 12.127 11.4622 12.625 10.8265C13.1231 10.1908 13.843 9.7669 14.6405 9.63983C14.5128 9.0748 14.5409 8.48571 14.7218 7.93539C14.9026 7.38507 15.2295 6.89417 15.6675 6.51504C16.1054 6.13592 16.6381 5.88279 17.2087 5.78266C17.7792 5.68253 18.3663 5.73916 18.9072 5.9465C19.144 5.57365 19.4555 5.25387 19.822 5.0073C20.1885 4.76072 20.602 4.5927 21.0366 4.51379C21.4713 4.43488 21.9175 4.44681 22.3473 4.54882C22.777 4.65082 23.181 4.8407 23.5338 5.1065C24.1493 4.6228 24.9206 4.38144 25.702 4.42809C26.4834 4.47474 27.2205 4.80617 27.774 5.35966C28.3275 5.91315 28.6589 6.65032 28.7056 7.43168C28.7522 8.21305 28.5109 8.98441 28.0272 9.59983C28.3282 9.99974 28.5313 10.4647 28.62 10.9573C28.7087 11.45 28.6806 11.9566 28.538 12.4364C28.3953 12.9162 28.1421 13.3558 27.7987 13.72C27.4552 14.0842 27.0311 14.3627 26.5605 14.5332C26.6822 15.0131 26.6958 15.514 26.6005 15.9998M17.3333 15.9992L22.6667 10.6659M14.5334 9.6665C13.8021 8.88685 12.8528 8.34561 11.8094 8.11333C10.7659 7.88104 9.67673 7.96848 8.68371 8.36424C7.6907 8.76001 6.83994 9.44575 6.24233 10.3321C5.64472 11.2184 5.32798 12.2642 5.3334 13.3332C5.3334 14.3065 5.60007 15.2132 6.0534 15.9998M16 27.9992C19.1826 27.9992 22.2348 26.7349 24.4853 24.4845C26.7357 22.2341 28 19.1818 28 15.9992H4C4 19.1818 5.26428 22.2341 7.51472 24.4845C9.76516 26.7349 12.8174 27.9992 16 27.9992Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Footer — social / app-store                                              */
/* -------------------------------------------------------------------------- */

/** Figma: imgFacebook (18×18, #9CA3AF). */
export function FacebookIcon({ size = 18, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 18 18")} {...p}>
      <path
        d="M11.2502 1.4994H13.5V4.49964H11.2502C11.0513 4.49964 10.8605 4.57866 10.7199 4.71933C10.5792 4.85999 10.5002 5.05077 10.5002 5.2497V7.49988H13.5L12.7501 10.5001H10.5002V16.5006H7.50044V10.5001H5.2506V7.49988H7.50044V5.2497C7.50044 4.25506 7.8955 3.30116 8.59871 2.59784C9.30192 1.89452 10.2557 1.4994 11.2502 1.4994Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgInstagram (18×18, #9CA3AF). */
export function InstagramIcon({ size = 18, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 18 18")} {...p}>
      <path
        d="M13.1253 4.87467H13.1328M5.2497 1.4994H12.7503C14.8215 1.4994 16.5006 3.17847 16.5006 5.2497V12.7503C16.5006 14.8215 14.8215 16.5006 12.7503 16.5006H5.2497C3.17847 16.5006 1.4994 14.8215 1.4994 12.7503V5.2497C1.4994 3.17847 3.17847 1.4994 5.2497 1.4994ZM12 8.52769C12.0926 9.15192 11.986 9.78945 11.6953 10.3496C11.4047 10.9097 10.9448 11.364 10.3811 11.6477C9.81742 11.9314 9.17863 12.0302 8.55558 11.9299C7.93254 11.8297 7.35697 11.5355 6.91074 11.0893C6.46452 10.643 6.17035 10.0675 6.0701 9.44442C5.96984 8.82138 6.06859 8.18258 6.35231 7.6189C6.63603 7.05521 7.09027 6.59534 7.65041 6.30469C8.21055 6.01404 8.84808 5.90742 9.47232 5.99999C10.1091 6.09441 10.6986 6.39111 11.1537 6.84628C11.6089 7.30145 11.9056 7.89094 12 8.52769Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgTwitter (18×18, #9CA3AF). */
export function TwitterIcon({ size = 18, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 18 18")} {...p}>
      <path
        d="M15.0005 5.54939C15.9756 4.57435 16.5006 2.99928 16.5006 2.99928C16.5006 2.99928 15.0755 3.89932 14.2504 3.89932C12.0002 1.79922 8.32495 3.5993 9 6.74945C6.4498 6.82445 3.89959 5.6994 2.24946 3.74931C0.37431 7.19947 2.24946 11.6247 5.99976 12.7497C4.79966 13.7998 3.14953 14.3248 1.4994 14.2498C7.94992 18.525 16.2006 13.0497 15.0005 5.54939Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgYoutube (18×18, #9CA3AF). */
export function YoutubeIcon({ size = 18, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 18 18")} {...p}>
      <path
        d="M1.87434 5.25041C1.35042 7.72266 1.35042 10.2772 1.87434 12.7495C1.94318 13.0005 2.07618 13.2294 2.26028 13.4134C2.44437 13.5975 2.67322 13.7305 2.9243 13.7994C6.94674 14.4658 11.0515 14.4658 15.0739 13.7994C15.325 13.7305 15.5538 13.5975 15.7379 13.4134C15.922 13.2294 16.055 13.0005 16.1239 12.7495C16.6478 10.2772 16.6478 7.72266 16.1239 5.25041C16.055 4.99935 15.922 4.77053 15.7379 4.58645C15.5538 4.40237 15.325 4.26938 15.0739 4.20054C11.0514 3.53422 6.94675 3.53422 2.9243 4.20054C2.67322 4.26938 2.44437 4.40237 2.26028 4.58645C2.07618 4.77053 1.94318 4.99935 1.87434 5.25041Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgCircleX1 (20×20, white stroke) — "Google Play" badge mark. */
export function GooglePlayBadgeIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <path
        d="M12.5002 7.4998L7.4998 12.5002M7.4998 7.4998L12.5002 12.5002M18.334 10C18.334 14.6027 14.6027 18.334 10 18.334C5.39726 18.334 1.666 14.6027 1.666 10C1.666 5.39726 5.39726 1.666 10 1.666C14.6027 1.666 18.334 5.39726 18.334 10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgApple (20×20, white stroke) — App Store badge mark. */
export function AppleIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <path
        d="M9.99993 5.43953V2.49938C9.99993 2.27835 10.0877 2.06638 10.244 1.91009C10.4003 1.7538 10.6123 1.666 10.8333 1.666M9.99993 5.43953C10.7194 4.79603 11.6098 4.37441 12.5635 4.22577C13.5173 4.07713 14.4937 4.20772 15.3749 4.60178C16.256 4.99583 17.0043 5.6365 17.5294 6.44645C18.0545 7.25641 18.3339 8.20102 18.3339 9.16628C18.3469 12.235 17.2307 15.2012 15.1978 17.5C14.8247 17.9174 14.3223 18.1975 13.771 18.2955C13.2198 18.3934 12.6517 18.3034 12.1576 18.0401C11.4936 17.6858 10.7526 17.5005 9.99995 17.5005C9.24734 17.5005 8.50631 17.6858 7.8423 18.0401C7.34825 18.3034 6.7801 18.3934 6.22886 18.2955C5.67762 18.1975 5.17519 17.9174 4.80208 17.5C2.77598 15.1971 1.66076 12.2336 1.66602 9.16628C1.66604 8.20102 1.94545 7.25641 2.47052 6.44645C2.99559 5.6365 3.74387 4.99583 4.62504 4.60178C5.50622 4.20772 6.48261 4.07713 7.43637 4.22577C8.39013 4.37441 9.28046 4.79603 9.99993 5.43953Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: imgCheck (10x10) - checkbox tick mark. */
export function CheckIcon({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 10 10")} {...p}>
      <path
        d="M8.333 2.5L3.75013 7.083L1.667 4.99982"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Figma: filter / sliders icon - used for the sort dropdown header. */
export function SlidersIcon({ size = 18, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <path
        d="M4 21V14M4 10V3M12 21V12M12 8V3M20 21V16M20 12V3M1 14H7M9 8H15M17 16H23"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Figma: small search icon used in the sidebar search box. */
export function SearchSmallIcon({ size = 16, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 16 16")} {...p}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Figma: imgMinus (16×16) - minus circle, used in cart qty controls. */
export function MinusIcon({ size = 16, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 16 16")} {...p}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M5 8H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Figma: imgPlus (16×16) - plus circle, used in cart qty controls. */
export function PlusIcon({ size = 16, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 16 16")} {...p}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M8 5V11M5 8H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Figma: imgAlertCircle (20×20) - alert/info circle for the notice line. */
export function AlertCircleIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M10 6.5V10.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="13.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** Figma: imgRocket (20×20) - Rocket Mobile Banking payment row. */
export function RocketIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <path d="M16.5 2C12.5 4 9 5.5 6.5 9.5L9 12l3.5 3.5C16.5 13 18 9.5 20 5.5L16.5 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M5 17L2 18L3 15L7 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14.5" cy="6.5" r="1.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Figma: imgCreditCard (20×20) - Visa / Mastercard payment row. */
export function CreditCardIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 9H18" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 13H9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Figma: imgBanknote (20×20) - Cash on Delivery payment row. */
export function BanknoteIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <rect x="2" y="6" width="16" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="10" cy="10.5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 8V13" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 8V13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Figma: imgTicket (16×16) - promo code input leading icon. */
export function TicketIcon({ size = 16, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 16 16")} {...p}>
      <path d="M2 5.5C2 4.67 2.67 4 3.5 4H12.5C13.33 4 14 4.67 14 5.5V7C13.17 7 12.5 7.67 12.5 8.5C12.5 9.33 13.17 10 14 10V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V10C2.83 10 3.5 9.33 3.5 8.5C3.5 7.67 2.83 7 2 7V5.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7 5V12" stroke="currentColor" strokeWidth="1.3" strokeDasharray="1.2 1.2" />
    </svg>
  );
}

/** Figma: imgMapPin1 (22×22) - delivery-address pin badge. */
export function MapPinAddressIcon({ size = 22, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 22 22")} {...p}>
      <path d="M11 19.25C12.85 17.7 18.5 12.45 18.5 8.25C18.5 4.94 15.31 2.2 11 2.2C6.69 2.2 3.5 4.94 3.5 8.25C3.5 12.45 9.15 17.7 11 19.25Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="11" cy="8.5" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Figma: imgCircleX (20×20) - bKash mark, filled bg with brand color. */
export function CircleXPaymentIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <circle cx="10" cy="10" r="8" fill="currentColor" />
      <path d="M7 7L13 13M13 7L7 13" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Figma: imgCircleX1 (20×20) - Nagad mark, outline with brand color. */
export function CircleXOutlineIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M7 7L13 13M13 7L7 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Partner-auth icons                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Figma: imgEye (16×16) — password field show/hide toggle. Two states share
 * the same outline; `masked=true` overlays the diagonal strike-through used
 * on the closed-eye variant.
 */
export function EyeIcon({ size = 16, masked = false, ...p }: Props & { masked?: boolean }) {
  return (
    <svg {...base(size, "0 0 16 16")} {...p}>
      <path
        d="M1.5 8C2.5 5 5 3 8 3C11 3 13.5 5 14.5 8C13.5 11 11 13 8 13C5 13 2.5 11 1.5 8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
      {masked ? (
        <path
          d="M2.5 13.5L13.5 2.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

/**
 * Figma: imgUploadCloud (16×16) — document-upload zone glyph on the Register
 * screen's second step. Cloud + up-arrow, currentColor stroke.
 */
export function UploadCloudIcon({ size = 16, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 16 16")} {...p}>
      <path
        d="M11 11.5H5C4.17157 11.5 3.5 10.8284 3.5 10C3.5 9.20507 4.10507 8.55829 4.88197 8.5C4.95132 7.13744 6.05736 6.0625 7.4375 6.0625C8.15602 6.0625 8.81102 6.35388 9.28125 6.82178C9.49322 6.71752 9.73378 6.65625 9.989 6.65625C10.7811 6.65625 11.4375 7.28127 11.5 8.0625C12.466 8.11467 13.25 8.92965 13.25 9.9375C13.25 10.966 12.466 11.5 11.5 11.5H11Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M8 9.5V13.5M6 11L8 9L10 11"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Partner-dashboard icons                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Figma: imgLayoutDashboard (20×20) — sidebar nav item for Dashboard.
 * 4-pane grid + bar above.
 */
export function LayoutDashboardIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11" y="2.5" width="6.5" height="4" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11" y="8.5" width="6.5" height="9" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * Figma: imgChefHat (20×20) — sidebar nav item for Menu.
 * Chef hat silhouette + chin strap line.
 */
export function ChefHatIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <path
        d="M5.5 14.5V16C5.5 16.5523 5.94772 17 6.5 17H13.5C14.0523 17 14.5 16.5523 14.5 16V14.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4 9.5C4 7.29086 5.79086 5.5 8 5.5C8.3453 5.5 8.68039 5.54086 9 5.61751C9.31969 5.54086 9.6547 5.5 10 5.5C12.2091 5.5 14 7.29086 14 9.5C14 11.7091 12.2091 13.5 10 13.5H8C5.79086 13.5 4 11.7091 4 9.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 9C7.5 7.89543 8.39543 7 9.5 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Figma: imgWallet (20×20 nav, 24×24 metric card) — sidebar Earnings nav
 * + the metric card "Today's Revenue" icon. Same glyph in both spots.
 */
export function WalletIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3 10C3 8.34315 4.34315 7 6 7H17C18.6569 7 20 8.34315 20 10V10H16C14.3431 10 13 11.3431 13 13C13 14.6569 14.3431 16 16 16H20V16C20 17.6569 18.6569 19 17 19H6C4.34315 19 3 17.6569 3 16V10Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="16.5" cy="13" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Figma: imgSettings (20×20) — sidebar nav item for Settings. Gear.
 */
export function SettingsIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 1.5V3.5M10 16.5V18.5M3.5 10H1.5M18.5 10H16.5M4.7 4.7L6.1 6.1M13.9 13.9L15.3 15.3M4.7 15.3L6.1 13.9M13.9 6.1L15.3 4.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Figma: imgBell (18×18) — partner-header notification button.
 */
export function BellIcon({ size = 18, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 18 18")} {...p}>
      <path
        d="M3.5 13.5C3.5 13.5 4.5 12.5 4.5 9C4.5 6.51472 6.51472 4.5 9 4.5C11.4853 4.5 13.5 6.51472 13.5 9C13.5 12.5 14.5 13.5 14.5 13.5H3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7 15.5C7.22386 16.4266 8.03732 17.1 9 17.1C9.96268 17.1 10.7761 16.4266 11 15.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Figma: imgRefreshCw (14×14) — orders panel header refresh button.
 * Two opposing arc arrows.
 */
export function RefreshCwIcon({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 14 14")} {...p}>
      <path
        d="M11.5 4.5C10.5 2.5 8.5 1.5 6.5 1.5C3.5 1.5 1.5 3.5 1.5 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M2.5 9.5C3.5 11.5 5.5 12.5 7.5 12.5C10.5 12.5 12.5 10.5 12.5 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M11.5 1.5V4.5H8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 12.5V9.5H5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Figma: imgPencil — menu-item edit action icon. Pencil at a 30°
 * angle pointing into the corner.
 */
export function PencilIcon({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 16 16")} {...p}>
      <path
        d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 4L12 6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Figma: imgTrash — menu-item delete action icon. Trash can + lid.
 */
export function TrashIcon({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 16 16")} {...p}>
      <path
        d="M2.5 4.5H13.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M6 4.5V3.5C6 2.94772 6.44772 2.5 7 2.5H9C9.55228 2.5 10 2.94772 10 3.5V4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M3.5 4.5L4 13C4 13.5523 4.44772 14 5 14H11C11.5523 14 12 13.5523 12 13L12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 7V12M9.5 7V12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Figma: imgImage — photo uploader placeholder glyph. Picture frame
 * with mountain + sun inset.
 */
export function ImageIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3 14L7 10L11 14M10 13L13 10L17 14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Figma: imgSend (or paper-airplane) — the Reply form's submit button.
 * Right-pointing arrow inside a slight upward tilt.
 */
export function SendIcon({ size = 16, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 16 16")} {...p}>
      <path
        d="M14.5 1.5L7 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M14.5 1.5L9.5 14.5L7 9L1.5 6.5L14.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Rider brand glyph — a stylised delivery scooter (24×24).
 *
 * Two wheels, a delivery box at the back, and a small handlebar —
 * single-stroke `currentColor` so it picks up the surrounding text
 * colour (typically white inside the brand-tile, ink on light bg).
 * Used by RiderAuthLayout's brand badge and the /rider/dashboard
 * header avatar.
 */
export function RiderScooterIcon({ size = 24, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      {/* Rear wheel */}
      <circle
        cx="6"
        cy="17"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
      />
      {/* Front wheel */}
      <circle
        cx="18"
        cy="17"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
      />
      {/* Frame — chassis + footboard */}
      <path
        d="M6 17L11 11L15 11L18 17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Handlebar column */}
      <path
        d="M11 11L13 7L17 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Delivery box (square behind the rear wheel) */}
      <path
        d="M2 9H8V13H2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Box top flap */}
      <path
        d="M2 9L5 6L11 6L8 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Figma: imgHelp (20×20) — sidebar nav item for Help. Circle with a
 * question-mark glyph, single-stroke currentColor.
 */
export function HelpIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path
        d="M7.5 7.5C7.5 6.39543 8.39543 5.5 9.5 5.5H10.5C11.6046 5.5 12.5 6.39543 12.5 7.5C12.5 8.60457 11.6046 9.5 10.5 9.5V10.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="10" cy="13.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

/**
 * Figma: imgHistory (20×20) — sidebar nav item for delivery history.
 * Clock face + clockwise arrow, single-stroke currentColor.
 */
export function HistoryIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <path
        d="M3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10C17 13.866 13.866 17 10 17C7.5 17 5.3 15.7 4 13.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M3 5V10H8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M10 6.5V10L12.5 11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Figma: imgPhone (20×20) — active-delivery customer-contact "Call"
 * button. Classic handset glyph, single-stroke currentColor.
 */
export function PhoneIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <path
        d="M5.5 2.5H8L9.5 6.5L7.5 8C8.3893 9.7778 9.7222 11.1111 11.5 12L13 10L17 11.5V14C17 15.3807 15.8807 16.5 14.5 16.5C8.70101 16.5 3.5 11.299 3.5 5.5C3.5 4.11929 4.61929 2.5 6 2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Figma: imgChat (20×20) — active-delivery customer-contact "Message"
 * button. Speech-bubble glyph, single-stroke currentColor.
 */
export function ChatIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <path
        d="M3 5.5C3 4.39543 3.89543 3.5 5 3.5H15C16.1046 3.5 17 4.39543 17 5.5V12C17 13.1046 16.1046 14 15 14H8.5L5 17V14H5C3.89543 14 3 13.1046 3 12V5.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="7" cy="8.75" r="0.9" fill="currentColor" />
      <circle cx="10" cy="8.75" r="0.9" fill="currentColor" />
      <circle cx="13" cy="8.75" r="0.9" fill="currentColor" />
    </svg>
  );
}

/**
 * Figma: imgChevronRight (14×14) — right-direction chevron used by
 * the active-delivery status button and other forward-action CTAs.
 * Mirror of `ChevronIcon` (down) so the file's chevron family stays
 * consistent.
 */
export function ChevronRightIcon({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 14 14")} {...p}>
      <path
        d="M5.25 3.5L8.75 7L5.25 10.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Figma: imgChevronUp (14×14) — up-direction chevron used by the
 * earnings summary delta pill. Single-stroke currentColor so it
 * inherits the surrounding text colour; pair with a `rotate-180`
 * Tailwind class when a downward arrow is needed.
 */
export function ChevronUpIcon({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 14 14")} {...p}>
      <path
        d="M3.5 8.75L7 5.25L10.5 8.75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Figma: imgMail (20×20) — used by the rider help page's email
 * support row. Envelope glyph, single-stroke currentColor.
 */
export function MailIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 20 20")} {...p}>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path
        d="M3 5.5L10 11L17 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Figma: imgHome (18×18) — "Switch to Customer App" link icon used
 * by the partner + rider sidebars. Single-stroke currentColor
 * glyph (house silhouette + door), keeps the file's primitive
 * family consistent.
 */
export function HomeIcon({ size = 18, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 18 18")} {...p}>
      <path
        d="M2.25 8L9 2.5L15.75 8V14.5C15.75 15.0523 15.4477 15.5 15 15.5H3C2.55228 15.5 2.25 15.0523 2.25 14.5V8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M7.5 15.5V10.5C7.5 10.2239 7.72386 10 8 10H10C10.2761 10 10.5 10.2239 10.5 10.5V15.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Heart icon (24×24). `filled` flips between the line outline
 * (default — "not favorited") and the solid heart
 * ("favorited") so callers don't need to import two glyphs.
 */
export function HeartIcon({
  size = 18,
  filled = false,
  ...p
}: Props & { filled?: boolean }) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <path
        d="M12 21S3.75 14.7 3.75 8.8125C3.75 5.70375 6.15675 3.28125 9.1875 3.28125C10.8083 3.28125 12 4.5 12 4.5S13.1917 3.28125 14.8125 3.28125C17.8432 3.28125 20.25 5.70375 20.25 8.8125C20.25 14.7 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Admin-only icons (24×24 primitive, currentColor stroke)                    */
/*                                                                            */
/*  These are not in the customer/partner/rider flows today but the admin     */
/*  sidebar reuses the same icon family. Each is a single-line                */
/*  currentColor glyph so the active/inactive text-color swap works the same  */
/*  way as the rest of `PartnerSidebar.tsx`.                                  */
/* -------------------------------------------------------------------------- */

/** Users / people glyph — used by the admin "Users" nav item. */
export function UsersIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <path
        d="M9 11C11.2091 11 13 9.20914 13 7C13 4.79086 11.2091 3 9 3C6.79086 3 5 4.79086 5 7C5 9.20914 6.79086 11 9 11Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M17 11C18.6569 11 20 9.65685 20 8C20 6.34315 18.6569 5 17 5C15.3431 5 14 6.34315 14 8C14 9.65685 15.3431 11 17 11Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M2 20C2 16.6863 5.13401 14 9 14C12.866 14 16 16.6863 16 20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M17 14C19.7614 14 22 16.2386 22 19V20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Shield / moderation glyph — used by the admin brand badge. */
export function ShieldIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <path
        d="M12 2.5L4 5.5V11C4 15.5 7.5 19.5 12 21.5C16.5 19.5 20 15.5 20 11V5.5L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Storefront / building glyph — used by the admin "Restaurants" nav item. */
export function StoreIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <path
        d="M4 9L5 4H19L20 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M4 9V20H20V9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M4 9C4 10.6569 5.34315 12 7 12C8.65685 12 10 10.6569 10 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10 9C10 10.6569 11.3431 12 13 12C14.6569 12 16 10.6569 16 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M16 9C16 10.6569 17.3431 12 19 12C20.6569 12 22 10.6569 22 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 20V15H15V20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Clipboard / list glyph — used by the admin "Audit Log" nav
 * item and anywhere we need to imply "history of changes".
 */
export function ClipboardIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <path
        d="M8 4H16V6H19C19.5523 6 20 6.44772 20 7V20C20 20.5523 19.5523 21 19 21H5C4.44772 21 4 20.5523 4 20V7C4 6.44772 4.44772 6 5 6H8V4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6H8V4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 12H16M8 16H13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Sidebar icon for the Profile Requests queue — a rider avatar
 * with a small settings cog behind it. Conveys "rider profile
 * change" without needing to lean on a generic cog glyph (the
 * Settings page already owns that).
 */
export function UserCogIcon({ size = 20, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <circle
        cx="9"
        cy="8"
        r="3.4"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M3 19.5c0-2.6 2.7-4.5 6-4.5s6 1.9 6 4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle
        cx="17.5"
        cy="6.5"
        r="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M17.5 2.5v1.4M17.5 9.1v1.4M20.5 6.5h-1.4M15.9 6.5h-1.4M19.6 4.4l-1 .9M16.4 7.6l-1 1M19.6 8.6l-1-.9M16.4 5.4l-1-1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 24x24 three-line "hamburger" menu icon — used by the top-bar
 *  hamburger button on partner/rider/admin mobile views.
 *  Keep this distinct from `HamburgerIcon` (the food-burger glyph). */
export function MenuIcon({ size = 24, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <path
        d="M3 6.5h18M3 12h18M3 17.5h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 24x24 close (×) icon — used by the sidebar drawer close button. */
export function CloseIcon({ size = 24, ...p }: Props) {
  return (
    <svg {...base(size, "0 0 24 24")} {...p}>
      <path
        d="M5.5 5.5l13 13M18.5 5.5l-13 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
