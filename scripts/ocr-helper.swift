// Swift helper for OCR text extraction from PDF pages using macOS Vision framework.
// Outputs JSON array of recognized text items with bounding box coordinates.
// Usage: ocr-helper <pdf_path> [page_number]

import Vision
import AppKit
import Foundation
import Quartz

let args = CommandLine.arguments
guard args.count > 1 else {
    let errorResult: [String: Any] = ["error": "Usage: ocr-helper <pdf_path> [page_number]"]
    if let data = try? JSONSerialization.data(withJSONObject: errorResult),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

let pdfPath = args[1]
let pageNum = args.count > 2 ? (Int(args[2]) ?? 0) : 0
let pdfURL = URL(fileURLWithPath: pdfPath)

guard let pdfDocument = PDFDocument(url: pdfURL) else {
    let errorResult: [String: Any] = ["error": "Cannot open PDF: \(pdfPath)"]
    if let data = try? JSONSerialization.data(withJSONObject: errorResult),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

guard let page = pdfDocument.page(at: pageNum) else {
    let errorResult: [String: Any] = ["error": "No page \(pageNum)"]
    if let data = try? JSONSerialization.data(withJSONObject: errorResult),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

// Render page to image at 3x resolution for better OCR accuracy
let pageRect = page.bounds(for: .mediaBox)
let scale: CGFloat = 3.0
let width = Int(pageRect.width * scale)
let height = Int(pageRect.height * scale)

let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(data: nil, width: width, height: height,
                              bitsPerComponent: 8, bytesPerRow: 0,
                              space: colorSpace,
                              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue) else {
    let errorResult: [String: Any] = ["error": "Cannot create render context"]
    if let data = try? JSONSerialization.data(withJSONObject: errorResult),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

// White background
context.setFillColor(CGColor.white)
context.fill(CGRect(x: 0, y: 0, width: width, height: height))

// Scale and draw PDF page
context.scaleBy(x: scale, y: scale)
page.draw(with: .mediaBox, to: context)

guard let cgImage = context.makeImage() else {
    let errorResult: [String: Any] = ["error": "Cannot render page to image"]
    if let data = try? JSONSerialization.data(withJSONObject: errorResult),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

// Perform OCR with Vision framework
let semaphore = DispatchSemaphore(value: 0)
var ocrResults: [[String: Any]] = []

let request = VNRecognizeTextRequest { request, error in
    defer { semaphore.signal() }
    
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        return
    }
    
    for obs in observations {
        guard let candidate = obs.topCandidates(1).first else { continue }
        let fullText = candidate.string
        
        // Try to get word-level bounding boxes by splitting on spaces
        let words = fullText.components(separatedBy: " ").filter { !$0.isEmpty }
        var wordStart = fullText.startIndex
        
        for word in words {
            guard let wordRange = fullText.range(of: word, range: wordStart..<fullText.endIndex) else {
                continue
            }
            wordStart = wordRange.upperBound
            
            // Get bounding box for this word within the observation
            if let box = try? candidate.boundingBox(for: wordRange) {
                let rect = box.boundingBox
                let item: [String: Any] = [
                    "text": String(word),
                    "confidence": round(Double(candidate.confidence) * 100) / 100,
                    "x": round(Double(rect.origin.x) * 10000) / 100,
                    "y": round(Double(1.0 - rect.origin.y - rect.height) * 10000) / 100,
                    "w": round(Double(rect.width) * 10000) / 100,
                    "h": round(Double(rect.height) * 10000) / 100
                ]
                ocrResults.append(item)
            } else {
                // Fallback: use the full observation bbox
                let box = obs.boundingBox
                let item: [String: Any] = [
                    "text": String(word),
                    "confidence": round(Double(candidate.confidence) * 100) / 100,
                    "x": round(Double(box.origin.x) * 10000) / 100,
                    "y": round(Double(1.0 - box.origin.y - box.height) * 10000) / 100,
                    "w": round(Double(box.width) * 10000) / 100,
                    "h": round(Double(box.height) * 10000) / 100
                ]
                ocrResults.append(item)
            }
        }
    }
}

request.recognitionLevel = .accurate
request.recognitionLanguages = ["de-DE", "en-US"]
request.usesLanguageCorrection = true

let requestHandler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try requestHandler.perform([request])
    semaphore.wait()
} catch {
    let errorResult: [String: Any] = ["error": "OCR failed: \(error.localizedDescription)"]
    if let data = try? JSONSerialization.data(withJSONObject: errorResult),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

// Sort by vertical position (top to bottom), then horizontal (left to right)
ocrResults.sort { a, b in
    let ay = a["y"] as! Double
    let by = b["y"] as! Double
    if abs(ay - by) < 1.0 {
        return (a["x"] as! Double) < (b["x"] as! Double)
    }
    return ay < by
}

// Output as JSON
let result: [String: Any] = [
    "pageWidth": pageRect.width,
    "pageHeight": pageRect.height,
    "items": ocrResults
]

if let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]),
   let str = String(data: data, encoding: .utf8) {
    print(str)
} else {
    print("{\"error\": \"JSON serialization failed\"}")
    exit(1)
}
