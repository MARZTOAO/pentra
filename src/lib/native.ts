import { isNativeApp, openInBrowser } from "./platform";

/**
 * Setup for the iPhone/iPad app (Capacitor). The native-app twin of
 * initDesktop() in desktop.ts: called once from main.tsx before React
 * renders, and does nothing at all on the website or in the Windows
 * app.
 *
 * The plugins are imported only inside the app, so the website never
 * downloads them.
 */
export function initNative(): void {
  if (!isNativeApp()) return;

  const root = document.documentElement;

  // Lets the stylesheet tell the iPhone app apart (see index.css).
  root.dataset.native = "";

  // iOS zooms the whole page in when you tap a text box whose text is
  // smaller than 16px, and doesn't zoom back out. In an app that reads
  // as broken. maximum-scale=1 stops it; iOS still lets people pinch to
  // zoom for accessibility.
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport && !viewport.content.includes("maximum-scale")) {
    viewport.content += ", maximum-scale=1";
  }

  // White clock and battery: every Pentra palette is dark. "Dark" here
  // is Capacitor's name for "the style for dark backgrounds".
  void import("@capacitor/status-bar")
    .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: Style.Dark }))
    .catch(() => {});

  // While the keyboard is up, the bottom tab bar would sit on top of it
  // and squeeze the chat box. index.css hides it while this is set.
  void import("@capacitor/keyboard")
    .then(({ Keyboard }) => {
      void Keyboard.addListener("keyboardWillShow", () => {
        root.dataset.keyboard = "";
      });
      void Keyboard.addListener("keyboardWillHide", () => {
        delete root.dataset.keyboard;
      });
    })
    .catch(() => {});

  // Links to other websites (in posts, chat, the footer) open in a
  // Safari sheet over the app, not inside Pentra's own web view, where
  // there would be no way back. Capture phase, so it runs before
  // anything on the page can swallow the click.
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || !(e.target instanceof Element)) return;
      const a = e.target.closest<HTMLAnchorElement>("a[href]");
      if (!a) return;

      const url = a.href;
      if (!/^https?:\/\//i.test(url)) return;
      if (new URL(url).host === window.location.host) return;

      e.preventDefault();
      void openInBrowser(url);
    },
    true,
  );
}
