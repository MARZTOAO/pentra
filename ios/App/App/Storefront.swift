import Capacitor
import StoreKit
import UIKit

/*
 * Pentra's own native code for the iPhone app.
 *
 * Everything else in the app is the shared React build; this file is
 * the one place that needs to ask iOS something only iOS knows.
 */

/// The app's main screen: Capacitor's own, plus Pentra's plugin.
/// SceneDelegate.swift creates this instead of CAPBridgeViewController.
class PentraViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(StorefrontPlugin())
    }
}

/// Which country's App Store this iPhone is signed in to, as a
/// three-letter code ("USA"). The web side (canSellProHere in
/// src/lib/billing.ts) shows Pro's checkout only for "USA", because
/// that's the only App Store where Apple allows linking to buy on the
/// web. This is the Apple account's country, not the phone's language
/// or where it is.
@objc(StorefrontPlugin)
public class StorefrontPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StorefrontPlugin"
    public let jsName = "Storefront"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCountryCode", returnType: CAPPluginReturnPromise)
    ]

    @objc func getCountryCode(_ call: CAPPluginCall) {
        Task {
            var code = await Storefront.current?.countryCode ?? ""

            #if DEBUG
            // The Simulator usually has no App Store account, so there's
            // no storefront to read. Debug builds (Xcode's Play button)
            // fall back to the phone's region setting so checkout can be
            // tested. Builds for TestFlight and the App Store never do.
            if code.isEmpty {
                let region: String?
                if #available(iOS 16, *) {
                    region = Locale.current.region?.identifier
                } else {
                    region = Locale.current.regionCode
                }
                code = region == "US" ? "USA" : (region ?? "")
            }
            #endif

            call.resolve(["countryCode": code])
        }
    }
}
