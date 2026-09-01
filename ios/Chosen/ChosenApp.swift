import SwiftUI

@main
struct ChosenApp: App {
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            WebContainer()
                // The site draws its own fixed header and tab bar and already
                // handles the safe areas; letting it paint under the status
                // bar as well would put its header behind the clock.
                .ignoresSafeArea(.keyboard)
                .background(Color(red: 0.043, green: 0.043, blue: 0.055)) // --bg
                .preferredColorScheme(.dark)
                .onOpenURL { url in
                    // chosen://result?item=… — a tapped Live Activity.
                    guard url.scheme == "chosen" else { return }
                    WebHost.shared.handle(url)
                }
        }
    }
}
