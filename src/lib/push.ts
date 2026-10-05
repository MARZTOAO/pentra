import { isNativeApp } from "./platform";
import { supabase } from "./supabase";

/**
 * Push notifications on iPhone.
 *
 * When someone is signed in to the iPhone app, ask iOS for permission
 * (once — iOS remembers the answer), get this phone's push token, and
 * file it with the database (register_push_token, supabase/102). From
 * then on the 'push' Edge Function can reach this phone.
 *
 * Tapping a push opens the screen it's about: every push carries a
 * `url` like "/messages" or "/p/123", the same places the bell links to.
 *
 * Does nothing on the website or in the Windows app.
 */

let token: string | null = null;
let listening = false;

export async function startPush(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    if (!listening) {
      listening = true;

      await PushNotifications.addListener("registration", async ({ value }) => {
        token = value;
        // Awaited on purpose: a Supabase request isn't sent until
        // something waits for its answer.
        const { error } = await supabase.rpc("register_push_token", { p_token: value });
        if (error) console.warn("Couldn't register for push", error.message);
      });

      await PushNotifications.addListener("registrationError", (e) => {
        console.warn("Push registration failed", e);
      });

      // Tapped a push (also when the tap is what started the app).
      await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        const url = (notification.data as { url?: unknown } | undefined)?.url;
        if (typeof url === "string" && url.startsWith("/")) window.location.hash = url;
      });
    }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return;

    // iOS answers through the "registration" listener above.
    await PushNotifications.register();
  } catch (e) {
    console.warn("Push setup failed", e);
  }
}

/**
 * On sign-out: stop pushes for this account reaching this phone, so
 * whoever signs in next doesn't get them.
 */
export async function stopPush(): Promise<void> {
  if (!isNativeApp() || !token) return;
  const t = token;
  token = null;
  try {
    await supabase.rpc("unregister_push_token", { p_token: t });
  } catch {
    // Signing out still goes ahead; a stale token is cleaned up the
    // first time Apple says it's no longer valid.
  }
}
