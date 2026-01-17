#!/bin/bash
# Docker entrypoint script

set -e

echo "🚀 Starting Vitals Service..."

cd /app

# Try to build SDK from source if available and not already built
if [ -d "/tmp/SmartSpectra/cpp" ] && [ ! -f "/usr/local/lib/libsmartspectra.so" ] && [ ! -f "/usr/local/lib/libsmartspectra.a" ]; then
    echo "🔨 Building SmartSpectra SDK from source..."
    cd /tmp/SmartSpectra/cpp
    if [ -d "build" ]; then
        cd build
        ninja 2>/dev/null || make -j$(nproc) 2>/dev/null || echo "⚠️  SDK build skipped (may already be built)"
        sudo ninja install 2>/dev/null || sudo make install 2>/dev/null || echo "⚠️  SDK install skipped"
        ldconfig 2>/dev/null || true
    fi
    cd /app
fi

# Build the wrapper if SDK is available
if [ -f "build_wrapper.sh" ]; then
    echo "🔨 Building wrapper..."
    ./build_wrapper.sh 2>&1 | tail -5 || echo "⚠️  Wrapper build failed - service will use fallback mode"
fi

# Start the service
echo "🚀 Starting Python service..."
exec python3 vitals_service.py

