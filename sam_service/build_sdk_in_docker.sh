#!/bin/bash
# Build Presage SDK inside Docker container
# This script builds the SDK in a Docker container and extracts the built libraries

set -e

echo "🐳 Building Presage SmartSpectra SDK in Docker"
echo ""

# Check if source code exists
if [ ! -d "SmartSpectra" ]; then
    echo "❌ SmartSpectra source code not found!"
    echo ""
    echo "You need to:"
    echo "  1. Contact support@presagetech.com for repository access"
    echo "  2. Clone the repository: git clone https://github.com/Presage-Security/SmartSpectra.git"
    echo "  3. Run this script again"
    exit 1
fi

echo "✅ Source code found"
echo ""

# Create a temporary Dockerfile for building the SDK
cat > Dockerfile.sdk-build << 'EOF'
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    gpg \
    lsb-release \
    libcurl4-openssl-dev \
    libssl-dev \
    pkg-config \
    libv4l-dev \
    libgles2-mesa-dev \
    libunwind-dev \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Install CMake 3.27.0
RUN curl -L -o cmake.sh https://github.com/Kitware/CMake/releases/download/v3.27.0/cmake-3.27.0-linux-x86_64.sh && \
    chmod +x cmake.sh && \
    ./cmake.sh --skip-license --prefix=/usr/local && \
    rm cmake.sh

# Add Presage repository
RUN curl -s "https://presage-security.github.io/PPA/KEY.gpg" | gpg --dearmor | tee /etc/apt/trusted.gpg.d/presage-technologies.gpg >/dev/null && \
    curl -s --compressed -o /etc/apt/sources.list.d/presage-technologies.list "https://presage-security.github.io/PPA/presage-technologies.list"

# Install Physiology Edge library
RUN apt-get update && \
    apt-get install -y libphysiologyedge-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy source code
WORKDIR /build
COPY SmartSpectra ./SmartSpectra

# Build the SDK
WORKDIR /build/SmartSpectra/cpp
RUN mkdir build && cd build && \
    cmake -G "Ninja" -DCMAKE_BUILD_TYPE=Release -DBUILD_SAMPLES=ON .. && \
    ninja

# Install to /output for extraction
RUN cd build && DESTDIR=/output ninja install

# Keep container running so we can extract files
CMD ["sleep", "infinity"]
EOF

echo "📦 Building SDK in Docker container..."
docker build -f Dockerfile.sdk-build -t presage-sdk-builder .

echo ""
echo "📤 Extracting built libraries..."

# Create output directory
mkdir -p sdk_output

# Copy built libraries and headers
docker create --name sdk-extract presage-sdk-builder
docker cp sdk-extract:/output/usr/local/lib/. sdk_output/lib/ 2>/dev/null || echo "No libraries found"
docker cp sdk-extract:/output/usr/local/include/. sdk_output/include/ 2>/dev/null || echo "No headers found"
docker rm sdk-extract

echo ""
echo "✅ SDK build complete!"
echo ""
echo "📁 Built files are in: sam_service/sdk_output/"
echo ""
echo "Next steps:"
echo "  1. Copy libraries to your system: sudo cp -r sdk_output/lib/* /usr/local/lib/"
echo "  2. Copy headers: sudo cp -r sdk_output/include/* /usr/local/include/"
echo "  3. Update library cache: sudo ldconfig"
echo "  4. Build wrapper: ./build_wrapper.sh"

# Cleanup
rm -f Dockerfile.sdk-build

