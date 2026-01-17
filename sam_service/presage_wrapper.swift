// Presage SDK Wrapper for Python Integration (Swift version)
// This Swift executable uses a C bridge to call the Presage C++ SDK

import Foundation

// Import the C bridge
// Note: This requires the bridge to be compiled and linked
@_silgen_name("presage_process_frame")
func presage_process_frame(_ framePath: UnsafePointer<CChar>, 
                           _ apiKey: UnsafePointer<CChar>, 
                           _ result: UnsafeMutablePointer<PresageMetrics>) -> Int32

@_silgen_name("presage_init")
func presage_init() -> Int32

@_silgen_name("presage_cleanup")
func presage_cleanup()

// C structure matching presage_bridge.h
struct PresageMetrics {
    var heart_rate: Float
    var breathing_rate: Float
    var success: Int32
    var error_message: (CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar,
                        CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar)
}

// Helper to convert C string array to Swift String
func getErrorMessage(from metrics: PresageMetrics) -> String {
    return withUnsafePointer(to: metrics.error_message) {
        $0.withMemoryRebound(to: CChar.self, capacity: 256) {
            String(cString: $0)
        }
    }
}

// Main entry point
guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: \(CommandLine.arguments[0]) <frame_path> <api_key>\n", stderr)
    exit(1)
}

let framePath = CommandLine.arguments[1]
let apiKey = CommandLine.arguments[2]

// Validate frame file exists
guard FileManager.default.fileExists(atPath: framePath) else {
    fputs("Error: Frame file not found: \(framePath)\n", stderr)
    exit(1)
}

// Initialize Presage SDK
presage_init()

// Process frame
var metrics = PresageMetrics(
    heart_rate: 0.0,
    breathing_rate: 0.0,
    success: 0,
    error_message: (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
)

let result = framePath.withCString { framePtr in
    apiKey.withCString { keyPtr in
        withUnsafeMutablePointer(to: &metrics) { metricsPtr in
            presage_process_frame(framePtr, keyPtr, metricsPtr)
        }
    }
}

// Output JSON
let json: [String: Any?] = [
    "heart_rate": metrics.success != 0 && metrics.heart_rate > 0 ? metrics.heart_rate : nil,
    "breathing_rate": metrics.success != 0 && metrics.breathing_rate > 0 ? metrics.breathing_rate : nil
]

do {
    let jsonData = try JSONSerialization.data(withJSONObject: json, options: [])
    if let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    } else {
        print("{\"heart_rate\":null,\"breathing_rate\":null}")
    }
} catch {
    // If error message is available, log it to stderr
    if metrics.success == 0 {
        let errorMsg = getErrorMessage(from: metrics)
        if !errorMsg.isEmpty {
            fputs("Error: \(errorMsg)\n", stderr)
        }
    }
    print("{\"heart_rate\":null,\"breathing_rate\":null}")
}

// Cleanup
presage_cleanup()

exit(result == 0 && metrics.success != 0 ? 0 : 1)
