import SwiftUI
import WidgetKit

// The extension exists for one thing: the pack-opening Live Activity. No home
// screen or lock screen widgets are declared, so nothing new appears in the
// widget gallery.
@main
struct ChosenWidgetBundle: WidgetBundle {
    var body: some Widget {
        PackLiveActivity()
    }
}
