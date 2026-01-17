cmake_minimum_required(VERSION 3.27.0)
project(PresageWrapper CXX)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
# Try to find SmartSpectra via find_package first
find_package(SmartSpectra QUIET)

# If not found via package, try manual detection (for SDK built from source)
if(NOT SmartSpectra_FOUND)
    message(STATUS "SmartSpectra not found via find_package, trying manual detection...")
    
    # Get the source directory (parent of this CMakeLists.txt)
    get_filename_component(WRAPPER_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}" ABSOLUTE)
    get_filename_component(SAM_SERVICE_DIR "${WRAPPER_SOURCE_DIR}" DIRECTORY)
    
    # Check if SmartSpectra was built locally (in sam_service/SmartSpectra/cpp/build)
    set(LOCAL_SMARTSPECTRA_BUILD "${SAM_SERVICE_DIR}/SmartSpectra/cpp/build")
    set(LOCAL_SMARTSPECTRA_SOURCE "${SAM_SERVICE_DIR}/SmartSpectra/cpp")
    
    # Try to find SmartSpectra libraries manually
    find_library(SMARTSPECTRA_LIBRARY 
        NAMES smartspectra libsmartspectra
        PATHS 
            ${LOCAL_SMARTSPECTRA_BUILD}
            /usr/lib/x86_64-linux-gnu
            /usr/local/lib
            /usr/lib
            ${CMAKE_PREFIX_PATH}/lib
    )
    
    # Try to find headers (check build directory first, then installed locations)
    find_path(SMARTSPECTRA_INCLUDE_DIR
        NAMES smartspectra/container/foreground_container.hpp
        PATHS
            ${LOCAL_SMARTSPECTRA_SOURCE}/smartspectra
            ${LOCAL_SMARTSPECTRA_BUILD}/smartspectra
            /usr/include
            /usr/local/include
            ${CMAKE_PREFIX_PATH}/include
    )
    
    if(SMARTSPECTRA_LIBRARY AND SMARTSPECTRA_INCLUDE_DIR)
        message(STATUS "Found SmartSpectra manually:")
        message(STATUS "  Library: ${SMARTSPECTRA_LIBRARY}")
        message(STATUS "  Headers: ${SMARTSPECTRA_INCLUDE_DIR}")
        set(SMARTSPECTRA_LIBRARIES ${SMARTSPECTRA_LIBRARY})
        set(SMARTSPECTRA_INCLUDE_DIRS ${SMARTSPECTRA_INCLUDE_DIR})
        set(SMARTSPECTRA_FOUND TRUE)
    else()
        message(FATAL_ERROR "SmartSpectra SDK not found!\n\n"
            "Options:\n"
            "1. Install via package manager:\n"
            "   sudo apt install libsmartspectra-dev\n\n"
            "2. Build from source and install:\n"
            "   cd SmartSpectra/cpp/build\n"
            "   sudo ninja install  # or sudo make install\n\n"
            "3. Build from source and set CMAKE_PREFIX_PATH:\n"
            "   export CMAKE_PREFIX_PATH=${LOCAL_SMARTSPECTRA_BUILD}:$CMAKE_PREFIX_PATH\n"
            "   ./build_wrapper_cmake.sh\n\n"
            "4. Use the shell script build method instead:\n"
            "   ./build_wrapper.sh")
    endif()
endif()

find_package(OpenCV REQUIRED)

# Find glog (Google Logging)
find_package(glog QUIET)
if(NOT glog_FOUND)
    # Fallback: try to find it manually
    find_library(GLOG_LIBRARY glog)
    if(GLOG_LIBRARY)
        set(GLOG_LIBRARIES ${GLOG_LIBRARY})
    else()
        message(WARNING "glog not found, trying default")
        set(GLOG_LIBRARIES glog)
    endif()
endif()

# Find Abseil
find_package(absl QUIET)
if(NOT absl_FOUND)
    # Fallback: try to find Abseil libraries manually
    find_library(ABSL_STATUS_LIBRARY absl::absl_status)
    find_library(ABSL_STRINGS_LIBRARY absl::absl_strings)
    find_library(ABSL_BASE_LIBRARY absl::absl_base)
    if(ABSL_STATUS_LIBRARY AND ABSL_STRINGS_LIBRARY AND ABSL_BASE_LIBRARY)
        set(ABSL_LIBRARIES ${ABSL_STATUS_LIBRARY} ${ABSL_STRINGS_LIBRARY} ${ABSL_BASE_LIBRARY})
    else()
        message(WARNING "Abseil not found via find_package, trying default")
        set(ABSL_LIBRARIES absl_status absl_strings absl_base)
    endif()
endif()

# Create executable
add_executable(presage_wrapper presage_wrapper.cpp)

# Include directories
target_include_directories(presage_wrapper PRIVATE
    ${SMARTSPECTRA_INCLUDE_DIRS}
    ${OpenCV_INCLUDE_DIRS}
)

# Link libraries
if(SmartSpectra_FOUND)
    # Use imported target if found via find_package
    target_link_libraries(presage_wrapper
        SmartSpectra::Container
        ${OpenCV_LIBS}
        ${GLOG_LIBRARIES}
        ${ABSL_LIBRARIES}
        pthread
    )
else()
    # Use manual library paths
    target_link_libraries(presage_wrapper
        ${SMARTSPECTRA_LIBRARIES}
        ${OpenCV_LIBS}
        ${GLOG_LIBRARIES}
        ${ABSL_LIBRARIES}
        pthread
    )
endif()

# Set output directory
set_target_properties(presage_wrapper PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}
)

