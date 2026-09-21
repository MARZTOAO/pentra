/**
 * A place an advert can go.
 *
 * Designed into the home page layout now so that switching ads on
 * later doesn't mean squeezing a banner into a page that wasn't built
 * for one. Until there's an ad network configured, this renders
 * NOTHING — not a box, not a gap — so nobody sees an empty rectangle
 * labelled "advertisement".
 *
 * To switch on: set VITE_ADSENSE_CLIENT (the ca-pub-… id) and give
 * each slot its numeric id from the AdSense dashboard. The script tag
 * that AdSense needs goes in index.html at the same time.
 *
 * Ads belong on the public site, not inside the app. Nothing behind
 * sign-in imports this.
 */
export function AdSlot({
  slot,
  format = "auto",
  className = "",
}: {
  /** The numeric slot id from AdSense, once one exists. */
  slot?: string;
  format?: "auto" | "horizontal" | "rectangle";
  className?: string;
}) {
  const client = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;

  if (!client || !slot) return null;

  return (
    <div className={"mx-auto w-full max-w-5xl px-4 " + className}>
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
