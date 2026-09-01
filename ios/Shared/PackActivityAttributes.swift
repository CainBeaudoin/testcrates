import ActivityKit
import Foundation

// The Live Activity's data contract, compiled into both the app and the
// widget extension.
//
// The same shape is produced by three places and has to stay identical in
// all of them:
//   - js/liveActivity.js, which sends it over the WKWebView bridge
//   - api/live-activity/update.mjs, which sends it to APNs as `content-state`
//   - this file, which decodes both
// Renaming a field here without renaming it there is a silent decode failure
// that shows up as an island that never updates.

enum PackPhase: String, Codable, Hashable {
    case opening
    case creditsWon
    case itemWon
}

enum PackRarity: String, Codable, Hashable, CaseIterable {
    case common, uncommon, rare, epic, legendary

    // Mirrors RARITY_META in js/prizeData.js. Kept as a number rather than a
    // SwiftUI Color so the model stays usable from the app target, which has
    // no reason to import SwiftUI to start an activity.
    var hex: UInt32 {
        switch self {
        case .common: return 0xB9B9BE
        case .uncommon: return 0x4ADE80
        case .rare: return 0x4FA3F7
        case .epic: return 0xB678F2
        case .legendary: return 0xF2B84B
        }
    }

    // Falls back to the enum name if the web layer didn't send a label.
    var fallbackLabel: String { rawValue.capitalized }
}

enum PackCurrency: String, Codable, Hashable {
    case credits
    case cash
}

struct PackActivityAttributes: ActivityAttributes {
    // Everything that changes over the life of one open. Apple caps this at
    // 4KB encoded, which is why the item thumbnail is a filename in the
    // shared app group rather than image data.
    struct ContentState: Codable, Hashable {
        var phase: PackPhase

        // itemWon
        var rarity: PackRarity?
        var rarityLabel: String?
        var itemName: String?
        var itemValue: Double?
        // Written into the app group by the app before it updates the
        // activity (see ThumbnailCache). Nil for push-driven updates, which
        // have no way to put a file on the device — those show the rarity
        // glyph instead.
        var imageFile: String?

        // creditsWon
        var creditsAmount: Int?
        var currency: PackCurrency?
        var balance: Int?

        // Where a tap goes. chosen://result?item=… or ?credits=…
        var deepLink: String?

        init(
            phase: PackPhase,
            rarity: PackRarity? = nil,
            rarityLabel: String? = nil,
            itemName: String? = nil,
            itemValue: Double? = nil,
            imageFile: String? = nil,
            creditsAmount: Int? = nil,
            currency: PackCurrency? = nil,
            balance: Int? = nil,
            deepLink: String? = nil
        ) {
            self.phase = phase
            self.rarity = rarity
            self.rarityLabel = rarityLabel
            self.itemName = itemName
            self.itemValue = itemValue
            self.imageFile = imageFile
            self.creditsAmount = creditsAmount
            self.currency = currency
            self.balance = balance
            self.deepLink = deepLink
        }
    }

    // Fixed for the life of the activity: which crate this open was.
    var crateLabel: String
    var startedAt: Date
}

// MARK: - Presentation helpers
// On the model rather than in the views so the compact island, the expanded
// island and the Lock Screen can't drift into describing the same state
// three different ways.

extension PackActivityAttributes.ContentState {
    var tintHex: UInt32 {
        switch phase {
        case .opening: return 0xE6E6EB
        case .creditsWon: return 0x4ADE80
        case .itemWon: return rarity?.hex ?? 0xE6E6EB
        }
    }

    var resolvedRarityLabel: String {
        rarityLabel ?? rarity?.fallbackLabel ?? ""
    }

    // The compact trailing slot is roughly 44pt wide, so this has to stay in
    // the range of "OPENING", "+333" and "★ RARE" — never a name or a price.
    var compactTrailingText: String {
        switch phase {
        case .opening:
            return "OPENING"
        case .creditsWon:
            return "+\(creditsAmount ?? 0)"
        case .itemWon:
            return "★ \(resolvedRarityLabel.uppercased())"
        }
    }

    var headline: String {
        switch phase {
        case .opening:
            return "Opening…"
        case .creditsWon:
            let amount = creditsAmount ?? 0
            return currency == .cash
                ? "$\(amount.formatted(.number)) Earned"
                : "\(amount.formatted(.number)) Credits Earned"
        case .itemWon:
            return itemName ?? "Your pull"
        }
    }

    var subhead: String? {
        switch phase {
        case .opening:
            return nil
        case .creditsWon:
            guard let balance else { return nil }
            return currency == .cash
                ? "Balance $\(balance.formatted(.number))"
                : "Balance \(balance.formatted(.number)) credits"
        case .itemWon:
            return resolvedRarityLabel.isEmpty ? nil : resolvedRarityLabel
        }
    }

    var valueText: String? {
        switch phase {
        case .itemWon:
            guard let itemValue else { return nil }
            return "$\(Int(itemValue).formatted(.number))"
        case .creditsWon, .opening:
            return nil
        }
    }

    var actionTitle: String {
        phase == .itemWon ? "View Item" : "View Result"
    }

    var url: URL? {
        URL(string: deepLink ?? "chosen://result")
    }
}
