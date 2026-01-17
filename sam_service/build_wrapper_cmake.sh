#!/bin/bash
# Build script for Presage wrapper using CMake (recommended method)
# This matches the example CMakeLists.txt approach

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔨 Building Presage wrapper with CMake..."

# Check for CMake
if ! command -v cmake &> /dev/null; then
    echo "❌ CMake not found"
    echo "   Install: sudo apt install cmake (Linux) or brew install cmake (macOS)"
    exit 1
fi

CMAKE_VERSION=$(cmake --version | head -n1 | cut -d' ' -f3)
echo "✅ CMake found: $CMAKE_VERSION"

# Check minimum version (3.27.0 for SmartSpectra)
REQUIRED_VERSION="3.27.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$CMAKE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "⚠️  Warning: CMake version $CMAKE_VERSION may be too old"
    echo "   Recommended: CMake 3.27.0 or newer"
    echo "   Continuing anyway..."
fi

# Create build directory
BUILD_DIR="build_wrapper"
if [ -d "$BUILD_DIR" ]; then
    echo "📁 Cleaning existing build directory..."
    rm -rf "$BUILD_DIR"
fi

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Configure with CMake
echo "⚙️  Configuring with CMake..."

# Check if CMAKE_PREFIX_PATH is set (for SDK built from source)
CMAKE_ARGS="-DCMAKE_BUILD_TYPE=Release"
if [ -n "$CMAKE_PREFIX_PATH" ]; then
    echo "   Using CMAKE_PREFIX_PATH: $CMAKE_PREFIX_PATH"
    CMAKE_ARGS="$CMAKE_ARGS -DCMAKE_PREFIX_PATH=$CMAKE_PREFIX_PATH"
fi

# Also check common SDK locations
if [ -d "/usr/local/lib" ] && [ -f "/usr/local/lib/libsmartspectra.so" ] || [ -f "/usr/local/lib/libsmartspectra.a" ]; then
    if [ -z "$CMAKE_PREFIX_PATH" ]; then
        echo "   Found SDK in /usr/local, adding to search path"
        CMAKE_ARGS="$CMAKE_ARGS -DCMAKE_PREFIX_PATH=/usr/local"
    fi
fi

if cmake .. $CMAKE_ARGS; then
    echo "✅ CMake configuration successful"
else
    echo "❌ CMake configuration failed"
    echo ""
    echo "The SmartSpectra SDK needs to be built and installed first."
    echo ""
    echo "Option 1: Build and install SDK from source"
    echo "  cd SmartSpectra/cpp/build"
    echo "  ninja  # or: make -j\$(nproc)"
    echo "  sudo ninja install  # or: sudo make install"
    echo "  cd ../../.."
    echo "  ./build_wrapper_cmake.sh"
    echo ""
    echo "Option 2: Use the shell script method (more flexible)"
    echo "  ./build_wrapper.sh"
    echo ""
    echo "Option 3: Install via package manager (if available)"
    echo "  sudo apt install libsmartspectra-dev"
    echo "  ./build_wrapper_cmake.sh"
    echo ""
    echo "For more details, see: CLONE_AND_BUILD.md"
    exit 1
fi

# Build
echo "🔨 Building wrapper executable..."
if cmake --build . --config Release; then
    echo "✅ Build successful!"
    echo ""
    echo "Wrapper executable: $BUILD_DIR/presage_wrapper"
    echo ""
    echo "Test it with:"
    echo "  $BUILD_DIR/presage_wrapper <frame.jpg> <api_key>"
    echo ""
    echo "Or copy to main directory:"
    echo "  cp $BUILD_DIR/presage_wrapper ../presage_wrapper"
else
    echo "❌ Build failed"
    exit 1
fi

