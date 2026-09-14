/* eslint-disable @next/next/no-img-element */
// Qualitech brand mark — renders the product logo (a center-cropped square of
// the supplied shield artwork, served from /qualitech-logo.png). `object-cover`
// fills the square badge; the logo's near-black background matches the app
// surface so the rounded corners read as a clean app-icon tile. `unique` is
// accepted for call-site compatibility but unused now that this is a raster.
export default function BrandMark({
  className,
}: {
  className?: string;
  unique?: string;
}) {
  return (
    <img
      src="/qualitech-logo.png"
      alt="Qualitech"
      draggable={false}
      className={`object-cover ${className ?? ''}`}
    />
  );
}
