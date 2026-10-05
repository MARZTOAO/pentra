import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iPhone/iPad app (Capacitor).
 *
 * Capacitor wraps the same React build the website and the Windows app
 * use: `npm run build` writes it to dist/, `npx cap sync ios` copies
 * dist/ into the Xcode project, and the app shows it in a web view.
 * Same code, same Supabase, same accounts. App-only setup in the page
 * itself lives in src/lib/native.ts.
 *
 * Tauri (src-tauri/) is still the Windows app; nothing here touches it.
 *
 * appId is the bundle id Apple will know the app by. It can't be
 * changed once the app is on the App Store, so leave it alone.
 */
const config: CapacitorConfig = {
  appId: "gg.pentra.app",
  appName: "Pentra",
  webDir: "dist",

  // Carbon's background, so there's no white flash between the launch
  // screen and the first frame of the app.
  backgroundColor: "#0e0f11",

  plugins: {
    // The keyboard shrinks the app rather than covering it, so the chat
    // box stays visible above it.
    Keyboard: { resize: "native" },

    // While Pentra is open, a push doesn't also drop a banner over it:
    // the bell and the chat list already update live.
    PushNotifications: { presentationOptions: [] },
  },
};

export default config;
