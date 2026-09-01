import SwiftUI

// The site's visual language, as far as the system lets a Live Activity carry
// it: the mark, the near-black surface, the rarity colours. Everything else
// about the island's shape, blur and placement is Apple's and is left alone.

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }

    static let chosenBackground = Color(hex: 0x0B0B0E) // --bg
    static let chosenSurface = Color(hex: 0x1A1A20)    // --surface-2
    static let chosenText = Color(hex: 0xE6E6EB)       // --text
    static let chosenDim = Color(hex: 0x8A8A94)        // --text-dim
}

/// The Chosen hexagon, traced from the same coordinates as the SVG in
/// index.html so the island's mark and the site's header logo are the one
/// shape.
struct ChosenMark: Shape {
    func path(in rect: CGRect) -> Path {
        let unit = CGSize(width: 100, height: 100)
        let scale = min(rect.width / unit.width, rect.height / unit.height)
        let offset = CGPoint(
            x: rect.midX - (unit.width * scale) / 2,
            y: rect.midY - (unit.height * scale) / 2
        )
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: offset.x + x * scale, y: offset.y + y * scale)
        }

        var path = Path()
        path.move(to: point(50, 6))
        path.addLine(to: point(92, 28))
        path.addLine(to: point(92, 72))
        path.addLine(to: point(50, 94))
        path.addLine(to: point(8, 72))
        path.addLine(to: point(8, 28))
        path.closeSubpath()

        path.move(to: point(50, 6))
        path.addLine(to: point(50, 94))
        return path
    }
}

/// The compact leading slot, and the minimal presentation. Tinted by the
/// result so a legendary reads as gold at a glance without any text at all.
struct MarkBadge: View {
    var tint: Color
    var size: CGFloat = 16

    var body: some View {
        ChosenMark()
            .stroke(tint, style: StrokeStyle(lineWidth: 1.6, lineJoin: .round))
            .frame(width: size, height: size)
    }
}

/// "CHOSEN", small and spaced, for the expanded presentation's header.
struct Wordmark: View {
    var tint: Color = .chosenDim

    var body: some View {
        HStack(spacing: 5) {
            MarkBadge(tint: tint, size: 11)
            Text("CHOSEN")
                .font(.system(size: 10, weight: .black))
                .kerning(1.4)
                .foregroundColor(tint)
        }
    }
}
