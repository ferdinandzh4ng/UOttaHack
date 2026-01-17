#!/bin/bash
# Simple script to build Presage SDK from cloned repository
# Run this from the sam_service directory

set -e

echo "🔨 Building Presage SmartSpectra SDK"
echo "===================================="
echo ""

# Get absolute path to sam_service
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if repository exists
if [ ! -d "SmartSpectra/cpp" ]; then
    echo "❌ SmartSpectra repository not found in $SCRIPT_DIR"
    echo "   Expected: $SCRIPT_DIR/SmartSpectra/cpp"
    echo ""
    echo "   Clone it with:"
    echo "   cd $SCRIPT_DIR"
    echo "   git clone https://github.com/Presage-Security/SmartSpectra.git"
    exit 1
fi

echo "✅ Found repository at: $SCRIPT_DIR/SmartSpectra"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v cmake &> /dev/null; then
    echo "❌ CMake not found. Install with: brew install cmake"
    exit 1
fi

if ! command -v ninja &> /dev/null; then
    echo "⚠️  Ninja not found. Install with: brew install ninja"
    echo "   Will use Make instead..."
    USE_NINJA=false
else
    USE_NINJA=true
fi

echo "✅ Prerequisites OK"
echo ""

# Navigate to cpp directory
cd SmartSpectra/cpp

# Create build directory
if [ -d "build" ]; then
    echo "⚠️  Build directory exists. Removing old build..."
    rm -rf build
fi

mkdir build
cd build

echo "Configuring CMake..."
echo "  Source: $(pwd)/.."
echo "  Build: $(pwd)"
echo ""

# Configure
if [ "$USE_NINJA" = true ]; then
    cmake -G "Ninja" \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SAMPLES=ON \
        ..
else
    cmake -G "Unix Makefiles" \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SAMPLES=ON \
        ..
fi

echo ""
echo "Building SDK (this may take 10-20 minutes)..."
echo ""

# Build
if [ "$USE_NINJA" = true ]; then
    ninja
else
    make -j$(sysctl -n hw.ncpu)
fi

echo ""
echo "✅ Build complete!"
echo ""
echo "SDK built in: $(pwd)"
echo ""
echo "Next steps:"
echo "1. Install SDK (optional):"
echo "   sudo ninja install    # or: sudo make install"
echo ""
echo "2. Build your wrapper:"
echo "   cd $SCRIPT_DIR"
echo "   ./build_wrapper.sh"
echo ""
echo "3. Test:"
echo "   ./presage_wrapper test_frame.jpg YOUR_API_KEY"
echo ""

