import ActivityKit
import SwiftUI
import WebKit

// The companion app is a WKWebView around the existing site and a bridge into
// ActivityKit. That is the whole native layer, deliberately: the platform is
// the web app, and the only thing a website genuinely cannot do is render into
// the Dynamic Island.
//
// Nothing here changes how the site behaves. It injects one object
// (window.ChosenNative) that the page uses to decide whether Live Activities
// are worth talking to, and it listens on one message handler.
final class WebHost: NSObject, ObservableObject {
    static let shared = WebHost()

    private(set) var webView: WKWebView!
    private var pendingDeepLink: URL?
    private var isLoaded = false

    /// Where the site lives. Overridable in Info.plist so a debug build can
    /// point at a dev server without a second target.
    private var siteURL: URL {
        let configured = Bundle.main.object(forInfoDictionaryKey: "ChosenWebURL") as? String
        return URL(string: configured ?? "") ?? URL(string: "https://testcrates.vercel.app")!
    }

    private var liveActivitiesAvailable: Bool {
        guard #available(iOS 16.2, *), UIDevice.current.userInterfaceIdiom == .phone else { return false }
        return LiveActivityController.shared.isAvailable
    }

    override private init() {
        super.init()

        let controller = WKUserContentController()
        controller.add(self, name: "chosen")
        controller.addUserScript(WKUserScript(
            source: Self.bridgeScript(enabled: liveActivitiesAvailable),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        // The crate opening has sound; the site gates it behind its own mute
        // button and a user gesture, so it doesn't need a second gate here.
        config.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.043, green: 0.043, blue: 0.055, alpha: 1) // --bg #0b0b0e
        webView.scrollView.backgroundColor = webView.backgroundColor

        if #available(iOS 16.2, *) {
            LiveActivityController.shared.reclaimOrphans()
            LiveActivityController.shared.onPushToken = { [weak self] token in
                self?.publishPushToken(token)
            }
            observeActivityAuthorization()
        }

        webView.load(URLRequest(url: siteURL))
    }

    // MARK: - Injected bridge

    private static func bridgeScript(enabled: Bool) -> String {
        """
        window.ChosenNative = Object.assign(window.ChosenNative || {}, {
          platform: 'ios',
          liveActivities: \(enabled),
          version: 1
        });
        """
    }

    /// The user can switch Live Activities off (or back on) in Settings while
    /// the app is open, so the flag the page reads is kept current rather than
    /// fixed at launch.
    private func observeActivityAuthorization() {
        guard #available(iOS 16.2, *) else { return }
        Task { [weak self] in
            for await enabled in ActivityAuthorizationInfo().activityEnablementUpdates {
                await MainActor.run {
                    self?.webView.evaluateJavaScript(
                        "if (window.ChosenNative) window.ChosenNative.liveActivities = \(enabled);"
                    )
                }
            }
        }
    }

    /// Handed to the page so it can ask the backend to push to this activity
    /// (see api/live-activity/update.mjs). The page is the only side that
    /// knows whether a server push is wanted, so it gets the token rather
    /// than the app guessing.
    private func publishPushToken(_ token: String) {
        let js = """
        if (window.ChosenNative) {
          window.ChosenNative.pushToken = '\(token)';
          window.dispatchEvent(new CustomEvent('chosen:pushtoken', { detail: '\(token)' }));
        }
        """
        webView.evaluateJavaScript(js)
    }

    // MARK: - Deep links

    /// chosen://result?item=… from a tapped Live Activity. Delivered into the
    /// running page rather than reloading it — a reload would throw away the
    /// reveal the user just tapped through from.
    func handle(_ url: URL) {
        guard isLoaded else {
            pendingDeepLink = url
            return
        }
        // An open being deep-linked into is an open the user has now seen.
        if #available(iOS 16.2, *) { LiveActivityController.shared.end() }

        let escaped = url.absoluteString.replacingOccurrences(of: "'", with: "\\'")
        webView.evaluateJavaScript("window.Chosen && window.Chosen.handleDeepLink('\(escaped)');")
    }
}

// MARK: - Bridge messages

extension WebHost: WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard #available(iOS 16.2, *) else { return }
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }

        let activities = LiveActivityController.shared
        switch type {
        case "liveActivity.start":
            activities.startOpening(crate: body["crate"] as? String ?? "Crate")

        case "liveActivity.item":
            activities.report(item: .init(
                rarity: (body["rarity"] as? String).flatMap(PackRarity.init(rawValue:)),
                rarityLabel: body["rarityLabel"] as? String,
                name: body["itemName"] as? String,
                value: body["itemValue"] as? Double,
                imageURL: (body["imageURL"] as? String).flatMap(URL.init(string:)),
                deepLink: body["deepLink"] as? String
            ))

        case "liveActivity.credits":
            guard let amount = body["amount"] as? Int else { return }
            activities.report(credits: .init(
                amount: amount,
                currency: (body["currency"] as? String).flatMap(PackCurrency.init(rawValue:)) ?? .credits,
                balance: body["balance"] as? Int,
                deepLink: body["deepLink"] as? String
            ))

        case "liveActivity.end":
            activities.end()

        default:
            break
        }
    }
}

// MARK: - Navigation

extension WebHost: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoaded = true
        if let pending = pendingDeepLink {
            pendingDeepLink = nil
            handle(pending)
        }
    }

    /// Outbound links (ODTO, KicksDB, socials) belong in Safari — following
    /// them in here would strand the user in a webview with no way back.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        let isSite = url.host == siteURL.host || url.isFileURL || url.scheme == "about"
        if navigationAction.navigationType == .linkActivated && !isSite {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    /// target="_blank" opens nothing in a WKWebView unless this is handled.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }
}

// MARK: - SwiftUI wrapper

struct WebContainer: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { WebHost.shared.webView }
    func updateUIView(_ webView: WKWebView, context: Context) {}
}
