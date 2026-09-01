import ActivityKit
import Foundation

// Owns the one Live Activity a pack open can have.
//
// Everything here is driven by the web layer over the bridge — this type
// decides *how* to present a result, never what the result is. There is no
// pack logic in this target on purpose: the roll, the pity rules, the pricing
// and the balances all live in the web app, and duplicating any of it here
// would mean two implementations that can disagree.
//
// Local updates are the fast path. The activity is still requested with a
// push token so the backend can drive it too (api/live-activity/update.mjs)
// for results that settle while the app isn't running; the token is handed to
// the page, which is the only side that knows when a server push is wanted.
@available(iOS 16.2, *)
@MainActor
final class LiveActivityController {
    static let shared = LiveActivityController()

    // How long a result stays up before the activity dismisses itself. Long
    // enough to glance at after the phone comes out of a pocket, short enough
    // that it never becomes a persistent status bar — Live Activities are for
    // something in progress, and this one is over.
    private let resultDwell: TimeInterval = 12

    // If the app dies mid-open, the activity would otherwise sit there
    // claiming to be opening forever. The system greys it out after this.
    private let openingStale: TimeInterval = 120

    private var activity: Activity<PackActivityAttributes>?
    private var dismissTask: Task<Void, Never>?
    private var tokenTask: Task<Void, Never>?

    /// Set once the system issues a push token for the running activity.
    private(set) var pushToken: String?

    /// Called with the hex push token so the web layer can ask the backend to
    /// push to this activity.
    var onPushToken: ((String) -> Void)?

    private init() {}

    /// Live Activities can be turned off per-app in Settings, and only exist
    /// on iPhone. Checked on every entry point rather than cached — the user
    /// can revoke it while the app is open.
    var isAvailable: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// Ends anything left over from a previous launch. An activity outlives
    /// the process that started it, so without this a crash mid-open leaves a
    /// permanent "OPENING" on the Lock Screen.
    func reclaimOrphans() {
        for stale in Activity<PackActivityAttributes>.activities {
            Task { await stale.end(nil, dismissalPolicy: .immediate) }
        }
        activity = nil
    }

    // MARK: - Phases

    func startOpening(crate: String) {
        guard isAvailable else { return }
        cancelDismiss()

        let state = PackActivityAttributes.ContentState(phase: .opening)
        let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(openingStale))

        // A batch of crates chains straight into the next open. Reusing the
        // running activity keeps that as one continuous island instead of a
        // dismiss/present flicker between every crate.
        if let activity {
            Task { await activity.update(content) }
            return
        }

        do {
            let started = try Activity.request(
                attributes: PackActivityAttributes(crateLabel: crate, startedAt: Date()),
                content: content,
                pushType: .token
            )
            activity = started
            observePushToken(for: started)
        } catch {
            // Most often the per-app activity limit, or authorization revoked
            // between the check above and here. The web app's own reveal is
            // unaffected, so there is nothing to report to the user.
            activity = nil
        }
    }

    func report(item: ItemResult) {
        guard let activity else { return }
        cancelDismiss()

        Task {
            // Fetched here, not in the widget: widget extensions can't do
            // network work at render time, so the thumbnail has to already be
            // on disk in the shared container before the state that names it.
            let file = await ThumbnailCache.shared.store(from: item.imageURL)
            let state = PackActivityAttributes.ContentState(
                phase: .itemWon,
                rarity: item.rarity,
                rarityLabel: item.rarityLabel,
                itemName: item.name,
                itemValue: item.value,
                imageFile: file,
                deepLink: item.deepLink
            )
            await activity.update(ActivityContent(state: state, staleDate: nil))
            scheduleDismiss()
        }
    }

    func report(credits: CreditsResult) {
        guard let activity else { return }
        cancelDismiss()

        let state = PackActivityAttributes.ContentState(
            phase: .creditsWon,
            creditsAmount: credits.amount,
            currency: credits.currency,
            balance: credits.balance,
            deepLink: credits.deepLink
        )
        Task {
            await activity.update(ActivityContent(state: state, staleDate: nil))
            scheduleDismiss()
        }
    }

    func end() {
        cancelDismiss()
        tokenTask?.cancel()
        tokenTask = nil
        pushToken = nil
        guard let activity else { return }
        self.activity = nil
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }

    // MARK: - Dismissal

    private func scheduleDismiss() {
        dismissTask = Task { [resultDwell] in
            try? await Task.sleep(nanoseconds: UInt64(resultDwell * 1_000_000_000))
            guard !Task.isCancelled else { return }
            end()
        }
    }

    private func cancelDismiss() {
        dismissTask?.cancel()
        dismissTask = nil
    }

    // MARK: - Push token

    private func observePushToken(for activity: Activity<PackActivityAttributes>) {
        tokenTask?.cancel()
        tokenTask = Task { [weak self] in
            for await data in activity.pushTokenUpdates {
                let hex = data.map { String(format: "%02x", $0) }.joined()
                await MainActor.run {
                    self?.pushToken = hex
                    self?.onPushToken?(hex)
                }
            }
        }
    }
}

// MARK: - Inputs from the bridge

@available(iOS 16.2, *)
extension LiveActivityController {
    struct ItemResult {
        var rarity: PackRarity?
        var rarityLabel: String?
        var name: String?
        var value: Double?
        var imageURL: URL?
        var deepLink: String?
    }

    struct CreditsResult {
        var amount: Int
        var currency: PackCurrency
        var balance: Int?
        var deepLink: String?
    }
}
