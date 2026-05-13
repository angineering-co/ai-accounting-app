import Script from "next/script";

/**
 * Loads the Google Ads gtag.js library and configures the conversion account.
 *
 * Coexists with @next/third-parties' <GoogleAnalytics />: both share the same
 * window.dataLayer / gtag() global. Loading gtag.js twice with different IDs
 * is officially supported by Google.
 */
export function GoogleAds({ adsId }: { adsId: string }) {
  return (
    <>
      <Script
        id="google-ads-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${adsId}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${adsId}');
        `}
      </Script>
    </>
  );
}
