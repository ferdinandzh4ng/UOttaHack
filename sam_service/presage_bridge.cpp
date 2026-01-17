// C Bridge Implementation for Presage SDK
// This wraps the C++ Presage SDK to provide a C interface for Swift

#include "presage_bridge.h"
#include <iostream>
#include <string>
#include <fstream>
#include <memory>
#include <chrono>
#include <thread>
#include <mutex>
#include <cstring>
#include <cstdlib>

// Presage SDK headers
#include <smartspectra/container/foreground_container.hpp>
#include <smartspectra/container/settings.hpp>
#include <physiology/modules/messages/metrics.h>
#include <physiology/modules/messages/status.h>
#include <glog/logging.h>
#include <opencv2/opencv.hpp>
#include <absl/status/status.h>

using namespace presage::smartspectra;

// Global variables for metrics collection
struct MetricsResult {
    float heart_rate = 0.0f;
    float breathing_rate = 0.0f;
    bool has_data = false;
};

static MetricsResult g_metrics_result;
static std::mutex g_metrics_mutex;
static bool g_processing_complete = false;
static bool g_glog_initialized = false;

// Callback for core metrics output
absl::Status OnCoreMetricsOutput(const presage::physiology::MetricsBuffer& metrics, int64_t timestamp) {
    std::lock_guard<std::mutex> lock(g_metrics_mutex);
    
    // Extract the latest heart rate
    if (!metrics.pulse().rate().empty()) {
        g_metrics_result.heart_rate = metrics.pulse().rate().rbegin()->value();
        g_metrics_result.has_data = true;
    }
    
    // Extract the latest breathing rate
    if (!metrics.breathing().rate().empty()) {
        g_metrics_result.breathing_rate = metrics.breathing().rate().rbegin()->value();
        g_metrics_result.has_data = true;
    }
    
    // Mark processing as complete once we have both metrics
    if (g_metrics_result.heart_rate > 0 && g_metrics_result.breathing_rate > 0) {
        g_processing_complete = true;
    }
    
    return absl::OkStatus();
}

// Callback for status changes
absl::Status OnStatusChange(presage::physiology::StatusValue imaging_status) {
    return absl::OkStatus();
}

extern "C" {

int presage_init(void) {
    if (!g_glog_initialized) {
        google::InitGoogleLogging("presage_bridge");
        FLAGS_alsologtostderr = false;
        FLAGS_logtostderr = false;
        g_glog_initialized = true;
    }
    return 0;
}

void presage_cleanup(void) {
    // Cleanup if needed
    if (g_glog_initialized) {
        google::ShutdownGoogleLogging();
        g_glog_initialized = false;
    }
}

int presage_process_frame(const char* frame_path, const char* api_key, PresageMetrics* result) {
    if (!frame_path || !api_key || !result) {
        if (result) {
            result->success = 0;
            strncpy(result->error_message, "Invalid parameters", sizeof(result->error_message) - 1);
        }
        return 1;
    }
    
    // Initialize result
    result->heart_rate = 0.0f;
    result->breathing_rate = 0.0f;
    result->success = 0;
    result->error_message[0] = '\0';
    
    // Initialize glog if needed
    presage_init();
    
    try {
        // Validate frame file exists
        std::ifstream file_check(frame_path);
        if (!file_check.good()) {
            strncpy(result->error_message, "Frame file not found", sizeof(result->error_message) - 1);
            return 1;
        }
        file_check.close();
        
        // Load the frame image
        cv::Mat frame = cv::imread(frame_path);
        if (frame.empty()) {
            strncpy(result->error_message, "Could not load frame image", sizeof(result->error_message) - 1);
            return 1;
        }
        
        // Create a temporary video file from the single frame
        std::string temp_video_path = std::string(frame_path) + ".tmp_video.mp4";
        bool use_temp_video = false;
        
        // Use ffmpeg to create a 1-second video from the frame (if available)
        if (system("which ffmpeg > /dev/null 2>&1") == 0) {
            std::string ffmpeg_cmd = "ffmpeg -y -loop 1 -i \"" + std::string(frame_path) + 
                                    "\" -c:v libx264 -t 1 -pix_fmt yuv420p \"" + 
                                    temp_video_path + "\" > /dev/null 2>&1";
            if (system(ffmpeg_cmd.c_str()) == 0) {
                use_temp_video = true;
            }
        }
        
        // Configure video source path
        std::string video_input_path;
        if (use_temp_video) {
            video_input_path = temp_video_path;
        } else {
            video_input_path = frame_path;
        }
        
        // Create settings for continuous mode
        container::settings::Settings<
            container::settings::OperationMode::Continuous,
            container::settings::IntegrationMode::Rest
        > settings;
        
        // Configure video source
        settings.video_source.input_video_path = video_input_path;
        settings.video_source.device_index = -1;
        settings.video_source.input_video_time_path = "";
        settings.video_source.capture_width_px = frame.cols;
        settings.video_source.capture_height_px = frame.rows;
        settings.video_source.codec = presage::camera::CaptureCodec::MJPG;
        settings.video_source.auto_lock = true;
        
        // Basic settings
        settings.headless = true;
        settings.enable_edge_metrics = true;
        settings.verbosity_level = 0;
        
        // Continuous mode buffer
        settings.continuous.preprocessed_data_buffer_duration_s = 0.5;
        
        // API key for REST
        settings.integration.api_key = api_key;
        
        // Create container
        auto container = std::make_unique<container::CpuContinuousRestForegroundContainer>(settings);
        
        // Set up callbacks
        auto status = container->SetOnCoreMetricsOutput(OnCoreMetricsOutput);
        if (!status.ok()) {
            strncpy(result->error_message, "Failed to set metrics callback", sizeof(result->error_message) - 1);
            return 1;
        }
        
        status = container->SetOnStatusChange(OnStatusChange);
        if (!status.ok()) {
            // Non-fatal, continue
        }
        
        // Initialize the container
        status = container->Initialize();
        if (!status.ok()) {
            std::string error = "Failed to initialize: " + status.message();
            strncpy(result->error_message, error.c_str(), sizeof(result->error_message) - 1);
            return 1;
        }
        
        // Reset metrics state
        {
            std::lock_guard<std::mutex> lock(g_metrics_mutex);
            g_metrics_result = MetricsResult();
            g_processing_complete = false;
        }
        
        // Run processing
        status = container->Run();
        
        // Wait for metrics to be processed (with timeout)
        auto start_time = std::chrono::steady_clock::now();
        const auto timeout = std::chrono::seconds(10);
        
        while (!g_processing_complete) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            
            auto elapsed = std::chrono::steady_clock::now() - start_time;
            if (elapsed > timeout) {
                break;
            }
        }
        
        // Get the results
        float heart_rate = 0.0f;
        float breathing_rate = 0.0f;
        
        {
            std::lock_guard<std::mutex> lock(g_metrics_mutex);
            if (g_metrics_result.has_data) {
                heart_rate = g_metrics_result.heart_rate;
                breathing_rate = g_metrics_result.breathing_rate;
            }
        }
        
        // Populate result
        if (heart_rate > 0 && breathing_rate > 0) {
            result->heart_rate = heart_rate;
            result->breathing_rate = breathing_rate;
            result->success = 1;
        } else {
            result->success = 0;
            strncpy(result->error_message, "No metrics obtained", sizeof(result->error_message) - 1);
        }
        
        // Clean up temporary video file if created
        if (use_temp_video) {
            std::remove(temp_video_path.c_str());
        }
        
        return result->success ? 0 : 1;
        
    } catch (const std::exception& e) {
        strncpy(result->error_message, e.what(), sizeof(result->error_message) - 1);
        result->success = 0;
        return 1;
    } catch (...) {
        strncpy(result->error_message, "Unknown exception", sizeof(result->error_message) - 1);
        result->success = 0;
        return 1;
    }
}

} // extern "C"

