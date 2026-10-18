// TypeScript ambient declarations for side-effect CSS imports.
//
// Leaflet ships its CSS under `leaflet/dist/leaflet.css` and isn't
// bundled with type declarations. Importing it for its side effects
// (the JSON of map glyphs that Leaflet draws) would trip TS without
// this shim. Declared once here so the .d.ts stays maintainable as
// the project grows.

declare module "*.css" {
  const content: { [className: string]: string };
  export default content;
}

declare module "leaflet/dist/leaflet.css";
declare module "leaflet/dist/leaflet.css?raw";
declare module "leaflet/dist/leaflet.css.map";
