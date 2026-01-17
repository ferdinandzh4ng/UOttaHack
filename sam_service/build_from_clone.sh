#!/bin/bash
# Build Presage SmartSpectra SDK from cloned repository
# This builds the SDK from source on macOS

set -e

echo "🔨 Building Presage SmartSpectra SDK from Source"
echo "================================================"
echo ""

# Check if repository is cloned
if [ ! -d "SmartSpectra/cpp" ]; then
    echo "❌ SmartSpectra repository not found"
    echo "   Clone it first: git clone https://github.com/Presage-Security/SmartSpectra.git"
    exit 1
fi

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "⚠️  This script is for macOS. For Linux, use Docker or follow Ubuntu build instructions."
    exit 1
fi

# Check for required tools
echo "1. Checking prerequisites..."

if ! command -v cmake &> /dev/null; then
    echo "❌ CMake not found"
    echo "   Install: brew install cmake"
    exit 1
fi

CMAKE_VERSION=$(cmake --version | head -n1 | cut -d' ' -f3)
echo "✅ CMake found: $CMAKE_VERSION"

if ! command -v ninja &> /dev/null; then
    echo "⚠️  Ninja not found (recommended for faster builds)"
    echo "   Install: brew install ninja"
    echo "   Will use Make instead..."
    USE_NINJA=false
else
    echo "✅ Ninja found"
    USE_NINJA=true
fi

# Check for Homebrew dependencies
echo ""
echo "2. Checking dependencies..."

MISSING_DEPS=()

if ! brew list opencv &> /dev/null 2>&1; then
    MISSING_DEPS+=("opencv")
fi

if ! brew list glog &> /dev/null 2>&1; then
    MISSING_DEPS+=("glog")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo "⚠️  Missing dependencies: ${MISSING_DEPS[*]}"
    echo "   Install with: brew install ${MISSING_DEPS[*]}"
    read -p "   Install now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew install ${MISSING_DEPS[*]}
    else
        echo "   Please install dependencies and run again"
        exit 1
    fi
else
    echo "✅ All dependencies installed"
fi

# Check for Physiology Edge library
echo ""
echo "3. Checking Physiology Edge library..."
if pkg-config --exists physiologyedge 2>/dev/null || \
   [ -f "/usr/local/lib/libphysiologyedge.dylib" ] || \
   [ -f "/opt/homebrew/lib/libphysiologyedge.dylib" ]; then
    echo "✅ Physiology Edge library found"
else
    echo "⚠️  Physiology Edge library not found"
    echo "   This is required for the SDK to build"
    echo "   Options:"
    echo "   1. Install from Presage PPA (if available for macOS)"
    echo "   2. Build from source (requires partner access)"
    echo "   3. Use Docker approach instead"
    echo ""
    read -p "   Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Build the SDK
echo ""
echo "4. Building SmartSpectra SDK..."
cd SmartSpectra/cpp

# Create build directory
if [ -d "build" ]; then
    echo "⚠️  Build directory exists. Remove it? (y/n)"
    read -p "   " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf build
    fi
fi

mkdir -p build
cd build

# Configure with CMake
echo "   Configuring with CMake..."
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

# Build
echo "   Building (this may take a while)..."
if [ "$USE_NINJA" = true ]; then
    ninja
else
    make -j$(sysctl -n hw.ncpu)
fi

# Install
echo ""
echo "5. Installing SDK..."
read -p "   Install to /usr/local? (requires sudo) (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ "$USE_NINJA" = true ]; then
        sudo ninja install
    else
        sudo make install
    fi
    echo "✅ SDK installed to /usr/local"
else
    echo "⚠️  SDK built but not installed"
    echo "   Libraries are in: $(pwd)/lib"
    echo "   Headers are in: $(pwd)/include"
    echo "   You may need to set LD_LIBRARY_PATH and include paths"
fi

# Build wrapper
echo ""
echo "6. Building wrapper..."
cd ../../..  # Back to sam_service

if [ -f "build_wrapper.sh" ]; then
    ./build_wrapper.sh
else
    echo "⚠️  build_wrapper.sh not found"
    echo "   Wrapper build skipped"
fi

echo ""
echo "✅ Build complete!"
echo ""
echo "Next steps:"
echo "1. Test wrapper: ./presage_wrapper test_frame.jpg YOUR_API_KEY"
echo "2. Start service: python3 vitals_service.py"
echo ""

