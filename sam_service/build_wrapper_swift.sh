#!/bin/bash
# Build script for Swift Presage wrapper
# This builds the C bridge and Swift wrapper

set -e

echo "🔨 Building Swift Presage wrapper..."

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "⚠️  Swift wrapper is only supported on macOS"
    echo "   Use the C++ wrapper (build_wrapper.sh) for Linux/Ubuntu"
    exit 1
fi

# Check Swift version
if ! command -v swiftc &> /dev/null; then
    echo "❌ Swift compiler not found"
    echo "   Install Xcode command line tools: xcode-select --install"
    exit 1
fi

SWIFT_VERSION=$(swiftc --version | head -n1)
echo "✅ Found Swift: $SWIFT_VERSION"

# Check if SDK is installed
SDK_FOUND=false
BRIDGE_LIB_FLAGS=""
OPENCV_FLAGS=""
GLOG_FLAGS=""
ABSL_FLAGS=""

# Try pkg-config for SmartSpectra SDK
if pkg-config --exists smartspectra 2>/dev/null; then
    echo "✅ Found SDK via pkg-config"
    PKG_CONFIG_FLAGS=$(pkg-config --cflags --libs smartspectra)
    SDK_FOUND=true
elif [ -f "/usr/local/lib/libsmartspectra.dylib" ] || [ -f "/usr/local/lib/libsmartspectra.a" ]; then
    echo "✅ Found SDK libraries in /usr/local/lib"
    PKG_CONFIG_FLAGS="-I/usr/local/include -L/usr/local/lib -lsmartspectra"
    SDK_FOUND=true
elif [ -f "/opt/homebrew/lib/libsmartspectra.dylib" ] || [ -f "/opt/homebrew/lib/libsmartspectra.a" ]; then
    echo "✅ Found SDK libraries in /opt/homebrew/lib"
    PKG_CONFIG_FLAGS="-I/opt/homebrew/include -L/opt/homebrew/lib -lsmartspectra"
    SDK_FOUND=true
else
    echo "⚠️  Warning: Presage SDK not found"
    echo "   Install it first (see PRESAGE_UBUNTU_SETUP.md or build from source)"
    PKG_CONFIG_FLAGS="-I/usr/local/include -L/usr/local/lib"
fi

# Check for OpenCV
if pkg-config --exists opencv4 2>/dev/null; then
    OPENCV_FLAGS=$(pkg-config --cflags --libs opencv4)
elif pkg-config --exists opencv 2>/dev/null; then
    OPENCV_FLAGS=$(pkg-config --cflags --libs opencv)
else
    # Try common macOS locations
    if [ -d "/opt/homebrew/include/opencv4" ]; then
        OPENCV_FLAGS="-I/opt/homebrew/include/opencv4 -L/opt/homebrew/lib -lopencv_core -lopencv_imgproc -lopencv_imgcodecs -lopencv_highgui"
    elif [ -d "/usr/local/include/opencv4" ]; then
        OPENCV_FLAGS="-I/usr/local/include/opencv4 -L/usr/local/lib -lopencv_core -lopencv_imgproc -lopencv_imgcodecs -lopencv_highgui"
    else
        OPENCV_FLAGS="-lopencv_core -lopencv_imgproc -lopencv_imgcodecs -lopencv_highgui"
    fi
fi

# Check for glog
if pkg-config --exists libglog 2>/dev/null; then
    GLOG_FLAGS=$(pkg-config --cflags --libs libglog)
else
    GLOG_FLAGS="-lglog"
fi

# Check for absl
if pkg-config --exists absl_status 2>/dev/null; then
    ABSL_FLAGS=$(pkg-config --cflags --libs absl_status absl_strings absl_base)
else
    ABSL_FLAGS="-labsl_status -labsl_strings -labsl_base"
fi

# Step 1: Build the C bridge library
echo ""
echo "📦 Step 1: Building C bridge..."
if ! command -v clang++ &> /dev/null; then
    echo "❌ clang++ not found"
    echo "   Install Xcode command line tools: xcode-select --install"
    exit 1
fi

# Extract compile flags vs link flags
# For compilation, we need -I (include paths) but not -L (library paths) or -l (libraries)
COMPILE_FLAGS=""
LINK_FLAGS=""

# Process PKG_CONFIG_FLAGS to separate compile and link flags
if [ -n "$PKG_CONFIG_FLAGS" ]; then
    for flag in $PKG_CONFIG_FLAGS; do
        if [[ $flag == -I* ]]; then
            COMPILE_FLAGS="$COMPILE_FLAGS $flag"
        elif [[ $flag == -L* ]] || [[ $flag == -l* ]]; then
            LINK_FLAGS="$LINK_FLAGS $flag"
        else
            COMPILE_FLAGS="$COMPILE_FLAGS $flag"
        fi
    done
fi

# Process OPENCV_FLAGS
if [ -n "$OPENCV_FLAGS" ]; then
    for flag in $OPENCV_FLAGS; do
        if [[ $flag == -I* ]]; then
            COMPILE_FLAGS="$COMPILE_FLAGS $flag"
        elif [[ $flag == -L* ]] || [[ $flag == -l* ]]; then
            LINK_FLAGS="$LINK_FLAGS $flag"
        else
            COMPILE_FLAGS="$COMPILE_FLAGS $flag"
        fi
    done
fi

# Add C++ standard library include path (macOS)
if [ -d "/Library/Developer/CommandLineTools/usr/include/c++/v1" ]; then
    COMPILE_FLAGS="$COMPILE_FLAGS -I/Library/Developer/CommandLineTools/usr/include/c++/v1"
fi
if [ -d "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/include/c++/v1" ]; then
    COMPILE_FLAGS="$COMPILE_FLAGS -I/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/include/c++/v1"
fi

# Compile C bridge (compile only, no linking)
# Only pass include flags, not library flags (-L or -l)
echo "Compiling C bridge with includes: $COMPILE_FLAGS"
clang++ -c presage_bridge.cpp -o presage_bridge.o \
    $COMPILE_FLAGS \
    -std=c++17 \
    -fPIC \
    -O2

if [ $? -ne 0 ]; then
    echo "❌ Failed to compile C bridge"
    exit 1
fi

# Create static library
ar rcs libpresage_bridge.a presage_bridge.o
echo "✅ C bridge compiled"

# Step 2: Build Swift wrapper
echo ""
echo "📦 Step 2: Building Swift wrapper..."

# Build Swift with C bridge (linking phase)
# Swift needs both compile flags (for headers) and link flags (for libraries)
echo "Linking with libraries: $LINK_LIBS ${GLOG_FLAGS} ${ABSL_FLAGS}"
swiftc presage_wrapper.swift \
    presage_bridge.o \
    -o presage_wrapper \
    $COMPILE_INCLUDES \
    $LINK_LIBS \
    ${GLOG_FLAGS} \
    ${ABSL_FLAGS} \
    -import-objc-header presage_bridge.h \
    -Xlinker -rpath -Xlinker /usr/local/lib \
    -Xlinker -rpath -Xlinker /opt/homebrew/lib \
    -Xcc -I. \
    -Xcc $COMPILE_INCLUDES \
    -Xcc $CXX_INCLUDE_PATHS

if [ $? -eq 0 ]; then
    echo "✅ Swift wrapper built successfully: ./presage_wrapper"
    echo ""
    echo "Test it with:"
    echo "  ./presage_wrapper <frame.jpg> <api_key>"
    
    # Clean up intermediate files (keep .o for now in case of issues)
    # rm -f presage_bridge.o libpresage_bridge.a
    
    echo ""
    echo "✅ Build complete!"
else
    echo "❌ Swift wrapper build failed"
    rm -f presage_bridge.o libpresage_bridge.a
    exit 1
fi

