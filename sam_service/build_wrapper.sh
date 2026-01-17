#!/bin/bash
# Build script for Presage wrapper executable
# Run this after installing the Presage SDK from PPA

set -e

echo "🔨 Building Presage wrapper executable..."

# Check if SDK is installed
SDK_FOUND=false
PKG_CONFIG_FLAGS=""
OPENCV_FLAGS=""
GLOG_FLAGS=""
ABSL_FLAGS=""

# Try pkg-config for SmartSpectra SDK
if pkg-config --exists smartspectra 2>/dev/null; then
    echo "✅ Found SDK via pkg-config"
    PKG_CONFIG_FLAGS=$(pkg-config --cflags --libs smartspectra)
    SDK_FOUND=true
elif [ -f "/usr/lib/x86_64-linux-gnu/libsmartspectra.so" ] || \
     [ -f "/usr/lib/x86_64-linux-gnu/libsmartspectra.a" ]; then
    echo "✅ Found SDK libraries in /usr/lib/x86_64-linux-gnu"
    PKG_CONFIG_FLAGS="-I/usr/include -L/usr/lib/x86_64-linux-gnu -lsmartspectra"
    SDK_FOUND=true
elif [ -f "/usr/local/lib/libsmartspectra.so" ] || [ -f "/usr/local/lib/libsmartspectra.a" ]; then
    echo "✅ Found SDK libraries in /usr/local/lib"
    PKG_CONFIG_FLAGS="-I/usr/local/include -L/usr/local/lib -lsmartspectra"
    SDK_FOUND=true
elif [ -f "/usr/lib/libsmartspectra.so" ] || [ -f "/usr/lib/libsmartspectra.a" ]; then
    echo "✅ Found SDK libraries in /usr/lib"
    PKG_CONFIG_FLAGS="-I/usr/include -L/usr/lib -lsmartspectra"
    SDK_FOUND=true
else
    echo "⚠️  Warning: Presage SDK not found"
    echo "   Install it with: sudo apt install libsmartspectra-dev"
    echo "   The wrapper build will fail without the SDK"
    PKG_CONFIG_FLAGS="-I/usr/include -L/usr/lib"
fi

# Check for OpenCV (required for image processing)
if pkg-config --exists opencv4 2>/dev/null; then
    echo "✅ Found OpenCV4 via pkg-config"
    OPENCV_FLAGS=$(pkg-config --cflags --libs opencv4)
elif pkg-config --exists opencv 2>/dev/null; then
    echo "✅ Found OpenCV via pkg-config"
    OPENCV_FLAGS=$(pkg-config --cflags --libs opencv)
else
    echo "⚠️  Warning: OpenCV not found via pkg-config"
    echo "   Trying default paths..."
    OPENCV_FLAGS="-I/usr/include/opencv4 -lopencv_core -lopencv_imgproc -lopencv_imgcodecs -lopencv_highgui"
fi

# Check for glog (Google Logging, required by SDK)
if pkg-config --exists libglog 2>/dev/null; then
    echo "✅ Found glog via pkg-config"
    GLOG_FLAGS=$(pkg-config --cflags --libs libglog)
else
    echo "✅ Using default glog flags"
    GLOG_FLAGS="-lglog"
fi

# Check for absl (Abseil, required by SDK)
if pkg-config --exists absl_status 2>/dev/null; then
    echo "✅ Found Abseil via pkg-config"
    ABSL_FLAGS=$(pkg-config --cflags --libs absl_status absl_strings absl_base)
else
    echo "✅ Using default Abseil flags"
    ABSL_FLAGS="-labsl_status -labsl_strings -labsl_base"
fi

# Determine compiler (use clang++ on macOS, g++ on Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
    CXX_COMPILER="clang++"
    echo "Using clang++ (macOS)"
else
    CXX_COMPILER="g++"
    echo "Using g++ (Linux)"
fi

# Check if compiler exists
if ! command -v $CXX_COMPILER &> /dev/null; then
    echo "❌ $CXX_COMPILER not found"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "   Install Xcode Command Line Tools: xcode-select --install"
    else
        echo "   Install: sudo apt install build-essential"
    fi
    exit 1
fi

# Get proper compiler on macOS (use xcrun to get correct paths)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Use xcrun to get the proper clang++ with correct SDK paths
    if command -v xcrun &> /dev/null; then
        CXX_COMPILER="$(xcrun -f clang++)"
        echo "Using xcrun clang++: $CXX_COMPILER"
    else
        CXX_COMPILER="clang++"
        echo "Using clang++ (macOS)"
    fi
    CXX_STD_INCLUDES=""
else
    CXX_STD_INCLUDES=""
fi

# Compile the wrapper
echo "Compiling wrapper with all dependencies..."
$CXX_COMPILER -o presage_wrapper presage_wrapper.cpp \
    ${CXX_STD_INCLUDES} \
    ${PKG_CONFIG_FLAGS} \
    ${OPENCV_FLAGS} \
    ${GLOG_FLAGS} \
    ${ABSL_FLAGS} \
    -std=c++17 \
    -Wall \
    -fPIC \
    -pthread \
    -O2

if [ $? -eq 0 ]; then
    echo "✅ Wrapper built successfully: ./presage_wrapper"
    if [ "$SDK_FOUND" = true ]; then
        echo ""
        echo "Test it with:"
        echo "  ./presage_wrapper <frame.jpg> <api_key>"
    else
        echo ""
        echo "⚠️  Note: Wrapper built but SDK may not be properly linked."
        echo "   Install SDK: sudo apt install libsmartspectra-dev"
    fi
else
    echo "❌ Build failed. Make sure:"
    echo "   1. g++ compiler is installed: sudo apt install build-essential"
    echo "   2. Presage SDK is installed: sudo apt install libsmartspectra-dev"
    echo "   3. OpenCV is installed: sudo apt install libopencv-dev"
    echo "   4. Google Logging is installed: sudo apt install libgoogle-glog-dev"
    echo "   5. Abseil is installed (usually comes with SDK)"
    exit 1
fi

