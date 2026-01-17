// C Bridge Header for Presage SDK
// This provides a C interface to the C++ Presage SDK for Swift interop

#ifndef PRESAGE_BRIDGE_H
#define PRESAGE_BRIDGE_H

#ifdef __cplusplus
extern "C" {
#endif

// Result structure for metrics
typedef struct {
    float heart_rate;
    float breathing_rate;
    int success;  // 1 if successful, 0 if failed
    char error_message[256];  // Error message if failed
} PresageMetrics;

// Process a single frame and return metrics
// Returns 0 on success, non-zero on error
// Metrics are populated in the result structure
int presage_process_frame(const char* frame_path, const char* api_key, PresageMetrics* result);

// Initialize Presage SDK (optional, called automatically if needed)
int presage_init(void);

// Cleanup Presage SDK (optional)
void presage_cleanup(void);

#ifdef __cplusplus
}
#endif

#endif // PRESAGE_BRIDGE_H

