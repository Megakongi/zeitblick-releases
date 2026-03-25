import Vision
import AppKit
import Foundation
import Quartz

let args = CommandLine.arguments
guard args.count > 1 else {
    print("Usage: swift ocr_pdf.swift <pdf_path>")
    exit(1)
}

let pdfPath = args[1]
let pdfURL = URL(fileURLWithPath: pdfPath)

guard let pdfDocument = PDFDocument(url: pdfURL) else {
    print("ERROR: Cannot open PDF")
    exit(1)
}

guard let page = pdfDocument.page(at: 0) else {
    print("ERROR: No page 0")
    exit(1)
}

// Render page to image at 2x resolution
let pageRect = page.bounds(for: .mediaBox)
let scale: CGFloat = 2.0
let width = Int(pageRect.width * scale)
let height = Int(pageRect.height * scale)

let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(data: nil, width: width, height: height,
                              bitsPerComponent: 8, bytesPerRow: 0,
                              space: colorSpace,
                              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue) else {
    print("ERROR: Cannot create context")
    exit(1)
}

// White background
context.setFillColor(CGColor.white)
context.fill(CGRect(x: 0, y: 0, width: width, height: height))

// Scale and draw
context.scaleBy(x: scale, y: scale)
page.draw(with: .mediaBox, to: context)

guard let cgImage = context.makeImage() else {
    print("ERROR: Cannot make image")
    exit(1)
}

// OCR with Vision
let requestHandler = VNImageRequestHandler(cgImage: cgImage, options: [:])

let request = VNRecognizeTextRequest { request, error in
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        print("ERROR: No results")
        return
    }
    
    // Sort by position (top to bottom, left to right)
    let sorted = observations.sorted { a, b in
        let ay = 1.0 - a.boundingBox.origin.y - a.boundingBox.height
        let by = 1.0 - b.boundingBox.origin.y - b.boundingBox.height
        if abs(ay - by) < 0.01 {
            return a.boundingBox.origin.x < b.boundingBox.origin.x
        }
        return ay < by
    }
    
    for obs in sorted {
        guard let candidate = obs.topCandidates(1).first else { continue }
        let box = obs.boundingBox
        // Convert to percentage coords for easier mapping
        let x = box.origin.x * 100
        let y = (1.0 - box.origin.y - box.height) * 100
        let w = box.width * 100
        let h = box.height * 100
        print(String(format: "[%.1f,%.1f,%.1f,%.1f] %.2f \"%@\"", x, y, w, h, candidate.confidence, candidate.string))
    }
}

request.recognitionLevel = .accurate
request.recognitionLanguages = ["de-DE", "en-US"]
request.usesLanguageCorrection = true

do {
    try requestHandler.perform([request])
} catch {
    print("ERROR: \(error)")
}
