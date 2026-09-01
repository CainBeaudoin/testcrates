import Foundation
import UIKit

// Puts an item's picture somewhere the widget extension can actually read it.
//
// A Live Activity's content state is capped at 4KB, so the image can't travel
// inside it, and widget extensions can't fetch anything at render time — so
// neither AsyncImage nor a URL in the state would ever draw. The working
// approach is the shared app group: the app downloads and downscales, writes
// a file, and the state carries only the filename.
enum AppGroup {
    // Must match the App Groups capability on both targets (see project.yml).
    static let identifier = "group.com.chosen.app"

    static var container: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }
}

actor ThumbnailCache {
    static let shared = ThumbnailCache()

    // The island's expanded leading region is small; 120pt at 3x covers it
    // with room to spare and keeps each file well under 100KB.
    private let maxPixels: CGFloat = 360

    private var directory: URL? {
        guard let container = AppGroup.container else { return nil }
        let dir = container.appendingPathComponent("activity-thumbs", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Downloads, downscales and stores the image, returning the filename to
    /// put in the activity state. Returns nil on any failure — the widget
    /// falls back to a rarity glyph, which is a fine result and never worth
    /// blocking or retrying an open for.
    func store(from url: URL?) async -> String? {
        guard let url, let directory else { return nil }

        let name = Insecure.filename(for: url.absoluteString)
        let destination = directory.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: destination.path) {
            prune(keeping: name)
            return name
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let image = UIImage(data: data), let scaled = downscale(image) else { return nil }
            guard let png = scaled.pngData() else { return nil }
            try png.write(to: destination, options: .atomic)
            prune(keeping: name)
            return name
        } catch {
            return nil
        }
    }

    private func downscale(_ image: UIImage) -> UIImage? {
        let longest = max(image.size.width, image.size.height)
        guard longest > maxPixels else { return image }
        let scale = maxPixels / longest
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }

    /// One open needs one thumbnail, so the directory never has to grow past
    /// a handful — this keeps the recent few and drops the rest rather than
    /// accumulating every item a player has ever pulled.
    private func prune(keeping name: String) {
        guard let directory else { return }
        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey]
        )) ?? []
        guard files.count > 8 else { return }
        let sorted = files.sorted {
            let a = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let b = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return a > b
        }
        for file in sorted.dropFirst(4) where file.lastPathComponent != name {
            try? FileManager.default.removeItem(at: file)
        }
    }
}

private enum Insecure {
    /// A stable, filesystem-safe name for a URL. Not a security boundary —
    /// just a way to reuse the file when the same item comes up twice.
    static func filename(for string: String) -> String {
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in Data(string.utf8) {
            hash ^= UInt64(byte)
            hash = hash &* 0x100000001b3
        }
        return String(format: "%016llx.png", hash)
    }
}
