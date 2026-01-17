#!/bin/bash
# Build script for Presage SmartSpectra SDK on macOS
# Prerequisites: Contact support@presagetech.com for partner license and source access

set -e

echo "🔧 Building Presage SmartSpectra SDK from source on macOS"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check for Git
if ! command -v git &> /dev/null; then
    echo "❌ Git not found. Install with: brew install git"
    exit 1
fi
echo "✅ Git found"

# Check for CMake
if ! command -v cmake &> /dev/null; then
    echo "❌ CMake not found. Install with: brew install cmake"
    exit 1
fi

CMAKE_VERSION=$(cmake --version | head -n1 | cut -d' ' -f3)
CMAKE_MAJOR=$(echo $CMAKE_VERSION | cut -d'.' -f1)
CMAKE_MINOR=$(echo $CMAKE_VERSION | cut -d'.' -f2)

if [ "$CMAKE_MAJOR" -lt 3 ] || ([ "$CMAKE_MAJOR" -eq 3 ] && [ "$CMAKE_MINOR" -lt 27 ]); then
    echo "❌ CMake 3.27.0 or newer required. Current: $CMAKE_VERSION"
    echo "   Install with: brew install cmake"
    exit 1
fi
echo "✅ CMake $CMAKE_VERSION found"

# Check for Ninja or make
if command -v ninja &> /dev/null; then
    BUILD_SYSTEM="Ninja"
    echo "✅ Ninja found"
elif command -v make &> /dev/null; then
    BUILD_SYSTEM="Unix Makefiles"
    echo "✅ Make found"
else
    echo "❌ Neither Ninja nor make found"
    echo "   Install Ninja: brew install ninja"
    echo "   Or install Xcode command-line tools: xcode-select --install"
    exit 1
fi

# Check for Xcode command-line tools (for make)
if [ "$BUILD_SYSTEM" = "Unix Makefiles" ]; then
    if ! xcode-select -p &> /dev/null; then
        echo "⚠️  Xcode command-line tools not found. Install with: xcode-select --install"
    fi
fi

echo ""
echo "📦 Cloning SmartSpectra repository..."

# Clone repository
if [ ! -d "SmartSpectra" ]; then
    git clone https://github.com/Presage-Security/SmartSpectra.git
else
    echo "Repository already exists, updating..."
    cd SmartSpectra
    git pull
    cd ..
fi

echo ""
echo "🔨 Building SDK..."

cd SmartSpectra/cpp

# Create build directory
mkdir -p build
cd build

# Configure with CMake
if [ "$BUILD_SYSTEM" = "Ninja" ]; then
    cmake -G "Ninja" -DCMAKE_BUILD_TYPE=Release -DBUILD_SAMPLES=ON ..
    echo ""
    echo "🏗️  Building with Ninja..."
    ninja
else
    cmake -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release -DBUILD_SAMPLES=ON ..
    echo ""
    echo "🏗️  Building with Make..."
    make -j$(sysctl -n hw.ncpu)
fi

echo ""
echo "✅ Build complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Install the SDK: cd build && sudo ninja install (or sudo make install)"
echo "   2. Update your Python service to use the built SDK"
echo "   3. Or copy the built libraries to your project"

