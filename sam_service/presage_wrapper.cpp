// Presage SDK Wrapper for Python Integration
// This is a C++ executable that processes a single frame and outputs JSON
// Based on Presage SmartSpectra SDK Hello World example

#include <iostream>
#include <string>
#include <fstream>
#include <sstream>
#include <cstring>
#include <memory>
#include <chrono>
#include <thread>
#include <mutex>
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

MetricsResult g_metrics_result;
std::mutex g_metrics_mutex;
bool g_processing_complete = false;

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
    // Optional: log status changes for debugging
    return absl::OkStatus();
}

int main(int argc, char** argv) {
    // Initialize Google Logging (required by SDK)
    google::InitGoogleLogging(argv[0]);
    FLAGS_alsologtostderr = false;  // Suppress stderr logging
    FLAGS_logtostderr = false;
    
    if (argc < 3) {
        std::cerr << "Usage: " << argv[0] << " <frame_path> <api_key>" << std::endl;
        return 1;
    }
    
    std::string frame_path = argv[1];
    std::string api_key = argv[2];
    
    // Validate frame file exists
    std::ifstream file_check(frame_path);
    if (!file_check.good()) {
        std::cerr << "Error: Frame file not found: " << frame_path << std::endl;
        return 1;
    }
    file_check.close();
    
    // Load the frame image
    cv::Mat frame = cv::imread(frame_path);
    if (frame.empty()) {
        std::cerr << "Error: Could not load frame image from " << frame_path << std::endl;
        return 1;
    }
    
    // NOTE: The Presage SDK is designed for continuous video processing.
    // For single frame processing, we create a minimal video file from the image.
    // The SDK expects video input, so we'll create a short video loop from the frame.
    
    // Create a temporary video file from the single frame using ffmpeg
    std::string temp_video_path = frame_path + ".tmp_video.mp4";
    bool use_temp_video = false;
    
    // Use ffmpeg to create a 2-second video loop from the frame (gives SDK time to process)
    std::string ffmpeg_check = "which ffmpeg > /dev/null 2>&1";
    if (system(ffmpeg_check.c_str()) == 0) {
        std::string ffmpeg_cmd = "ffmpeg -y -loop 1 -i \"" + frame_path + 
                                "\" -c:v libx264 -t 2 -pix_fmt yuv420p -r 30 \"" + 
                                temp_video_path + "\" > /dev/null 2>&1";
        if (system(ffmpeg_cmd.c_str()) == 0) {
            use_temp_video = true;
        } else {
            std::cerr << "Warning: Failed to create video from frame, trying direct image" << std::endl;
        }
    } else {
        std::cerr << "Warning: ffmpeg not found, trying direct image (may not work)" << std::endl;
    }
    
    // Configure video source path
    std::string video_input_path;
    if (use_temp_video) {
        video_input_path = temp_video_path;
    } else {
        // Try using the image directly (may work with some SDK versions)
        video_input_path = frame_path;
    }
    
    try {
        // Create settings for continuous mode
        container::settings::Settings<
            container::settings::OperationMode::Continuous,
            container::settings::IntegrationMode::Rest
        > settings;
        
        // Configure video source (matching the example)
        settings.video_source.device_index = -1;  // No camera, use video file
        settings.video_source.input_video_path = video_input_path;
        settings.video_source.input_video_time_path = "";
        // Use frame dimensions or default to 1280x720 (matching example)
        settings.video_source.capture_width_px = (frame.cols > 0) ? frame.cols : 1280;
        settings.video_source.capture_height_px = (frame.rows > 0) ? frame.rows : 720;
        settings.video_source.codec = presage::camera::CaptureCodec::MJPG;
        settings.video_source.auto_lock = true;
        
        // Basic settings (matching the example)
        settings.headless = true;  // No GUI needed for wrapper
        settings.enable_edge_metrics = true;
        settings.verbosity_level = 0;  // Minimal logging (set to 1 for more debug info)
        
        // Continuous mode buffer
        settings.continuous.preprocessed_data_buffer_duration_s = 0.5;
        
        // API key for REST
        settings.integration.api_key = api_key;
        
        // Create container
        auto container = std::make_unique<container::CpuContinuousRestForegroundContainer>(settings);
        
        // Set up callbacks
        auto status = container->SetOnCoreMetricsOutput(OnCoreMetricsOutput);
        if (!status.ok()) {
            std::cerr << "Error: Failed to set metrics callback: " << status.message() << std::endl;
            return 1;
        }
        
        status = container->SetOnStatusChange(OnStatusChange);
        if (!status.ok()) {
            std::cerr << "Warning: Failed to set status callback: " << status.message() << std::endl;
        }
        
        // Initialize the container
        status = container->Initialize();
        if (!status.ok()) {
            std::cerr << "Error: Failed to initialize container: " << status.message() << std::endl;
            return 1;
        }
        
        // Reset metrics state
        {
            std::lock_guard<std::mutex> lock(g_metrics_mutex);
            g_metrics_result = MetricsResult();
            g_processing_complete = false;
        }
        
        // Run processing (this will process the frame)
        // The SDK will call our callback when metrics are available
        status = container->Run();
        
        // Wait for metrics to be processed (with timeout)
        // The SDK processes frames continuously, so we wait for at least one complete reading
        auto start_time = std::chrono::steady_clock::now();
        const auto timeout = std::chrono::seconds(15);  // Increased timeout for video processing
        
        // Wait for metrics with periodic checks
        while (!g_processing_complete) {
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
            
            auto elapsed = std::chrono::steady_clock::now() - start_time;
            if (elapsed > timeout) {
                std::cerr << "Warning: Timeout waiting for metrics after " 
                         << std::chrono::duration_cast<std::chrono::seconds>(elapsed).count() 
                         << " seconds" << std::endl;
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
        
        // Output JSON result
        // If no metrics were obtained, return null values (Python service will handle fallback)
        std::cout << "{"
                  << "\"heart_rate\":" << (heart_rate > 0 ? std::to_string(heart_rate) : "null")
                  << ",\"breathing_rate\":" << (breathing_rate > 0 ? std::to_string(breathing_rate) : "null")
                  << "}" << std::endl;
        
        // Clean up temporary video file if created
        if (use_temp_video) {
            std::remove(temp_video_path.c_str());
        }
        
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "Error: Exception occurred: " << e.what() << std::endl;
        // Clean up temporary video file if created
        if (use_temp_video) {
            std::remove(temp_video_path.c_str());
        }
        // Still output JSON with null values
        std::cout << R"({"heart_rate":null,"breathing_rate":null})" << std::endl;
        return 1;
    }
}
