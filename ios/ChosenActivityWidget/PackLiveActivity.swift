import ActivityKit
import SwiftUI
import WidgetKit

// The Dynamic Island and Lock Screen presentations of one pack open.
//
// Compact states are kept to a glyph and one short token — "OPENING",
// "+333", "★ RARE". No balances, no navigation, nothing persistent: the
// island is showing one thing that is happening right now, and it ends when
// that thing is over.

struct PackLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PackActivityAttributes.self) { context in
            LockScreenView(state: context.state, crate: context.attributes.crateLabel)
                .activityBackgroundTint(Color.chosenBackground)
                .activitySystemActionForegroundColor(Color.chosenText)
        } dynamicIsland: { context in
            let state = context.state
            let tint = Color(hex: state.tintHex)

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ArtworkView(state: state, tint: tint)
                        .padding(.leading, 4)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    if let value = state.valueText {
                        ValueChip(text: value, tint: tint)
                            .padding(.trailing, 4)
                    }
                }

                DynamicIslandExpandedRegion(.center) {
                    HStack {
                        Wordmark()
                        Spacer(minLength: 8)
                        Text(context.attributes.crateLabel.uppercased())
                            .font(.system(size: 10, weight: .semibold))
                            .kerning(0.6)
                            .foregroundColor(.chosenDim)
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(state.headline)
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.chosenText)
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                            if let subhead = state.subhead {
                                Text(subhead)
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(state.phase == .itemWon ? tint : .chosenDim)
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        if state.phase == .opening {
                            OpeningBar(tint: tint)
                        } else if let url = state.url {
                            // A Link rather than a Button: this navigates,
                            // and an AppIntent button would be iOS 17-only
                            // for no gain.
                            Link(destination: url) {
                                Text(state.actionTitle)
                                    .font(.system(size: 12, weight: .bold))
                                    .kerning(0.4)
                                    .foregroundColor(.chosenBackground)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 8)
                                    .background(tint, in: Capsule())
                            }
                        }
                    }
                    .padding(.top, 2)
                }
            } compactLeading: {
                MarkBadge(tint: tint)
                    .padding(.leading, 2)
            } compactTrailing: {
                Text(state.compactTrailingText)
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundColor(tint)
                    .lineLimit(1)
                    // The slot is ~44pt; "★ LEGENDARY" has to shrink rather
                    // than truncate to "★ LEGEND…".
                    .minimumScaleFactor(0.6)
                    .contentTransition(.opacity)
                    .padding(.trailing, 2)
            } minimal: {
                MarkBadge(tint: tint, size: 14)
            }
            .widgetURL(state.url)
            .keylineTint(tint)
        }
    }
}

// MARK: - Pieces

/// The item's thumbnail if the app managed to cache one (see ThumbnailCache),
/// the rarity mark if not, and a credits glyph for a payout.
private struct ArtworkView: View {
    var state: PackActivityAttributes.ContentState
    var tint: Color

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.chosenSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(tint.opacity(0.35), lineWidth: 1)
                )

            if let image = thumbnail {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .padding(4)
            } else if state.phase == .creditsWon {
                Text("◈")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(tint)
            } else {
                MarkBadge(tint: tint, size: 24)
            }
        }
        .frame(width: 48, height: 48)
    }

    private var thumbnail: UIImage? {
        guard
            let file = state.imageFile,
            let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: AppGroupID.value
            )
        else { return nil }
        let url = container
            .appendingPathComponent("activity-thumbs", isDirectory: true)
            .appendingPathComponent(file)
        return UIImage(contentsOfFile: url.path)
    }
}

private struct ValueChip: View {
    var text: String
    var tint: Color

    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .foregroundColor(tint)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(tint.opacity(0.14), in: Capsule())
    }
}

/// An indeterminate sweep while the result is unknown. Deliberately plain —
/// the reveal itself is on screen, and the island shouldn't compete with it.
private struct OpeningBar: View {
    var tint: Color

    var body: some View {
        ProgressView()
            .progressViewStyle(.linear)
            .tint(tint)
            .frame(height: 3)
    }
}

/// Shown on the Lock Screen, and on every iPhone without a Dynamic Island —
/// which is the whole fallback story: same activity, same states, presented
/// as a banner instead.
struct LockScreenView: View {
    var state: PackActivityAttributes.ContentState
    var crate: String

    var body: some View {
        let tint = Color(hex: state.tintHex)

        HStack(spacing: 12) {
            ArtworkView(state: state, tint: tint)

            VStack(alignment: .leading, spacing: 3) {
                Wordmark()
                Text(state.headline)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.chosenText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                if let subhead = state.subhead {
                    Text(subhead)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(state.phase == .itemWon ? tint : .chosenDim)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 4)

            if let value = state.valueText {
                ValueChip(text: value, tint: tint)
            } else if state.phase == .opening {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(tint)
            }
        }
        .padding(14)
    }
}

/// Kept in the widget target so the extension doesn't have to import the
/// app's file just for one string; it must match AppGroup.identifier.
enum AppGroupID {
    static let value = "group.com.chosen.app"
}
