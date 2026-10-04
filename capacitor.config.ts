import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iPhone/iPad app (Capacitor).
 *
 * Capacitor wraps the same React build the website and the Windows app
 * use: `npm run build` writes it to dist/, `npx cap sync ios` copies
 * dist/ into the Xcode project, and the app shows it in a web view.
 * Same code, same Supabase, same accounts.
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
};

export default config;
