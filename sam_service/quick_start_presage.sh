#!/bin/bash
# Quick start script for Presage SDK setup on Ubuntu 22.04
# This script automates the setup process

set -e

echo "🚀 Presage SmartSpectra SDK Quick Start for Ubuntu 22.04"
echo "=================================================="
echo ""

# Check if running as root (for apt commands)
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  This script needs sudo privileges for package installation"
    echo "   Please run: sudo $0"
    exit 1
fi

# Step 1: Update package list
echo "📦 Step 1: Updating package list..."
apt update

# Step 2: Install prerequisites
echo ""
echo "📦 Step 2: Installing prerequisites..."
apt install -y gpg curl build-essential git lsb-release \
    libcurl4-openssl-dev libssl-dev pkg-config libv4l-dev \
    libgles2-mesa-dev libunwind-dev libopencv-dev libgoogle-glog-dev

# Step 3: Install CMake 3.27.0
echo ""
echo "📦 Step 3: Installing CMake 3.27.0..."
if ! command -v cmake &> /dev/null || [ "$(cmake --version | head -n1 | cut -d' ' -f3 | cut -d'.' -f1,2)" != "3.27" ]; then
    curl -L -o /tmp/cmake-3.27.0-linux-x86_64.sh https://github.com/Kitware/CMake/releases/download/v3.27.0/cmake-3.27.0-linux-x86_64.sh
    chmod +x /tmp/cmake-3.27.0-linux-x86_64.sh
    /tmp/cmake-3.27.0-linux-x86_64.sh --skip-license --prefix=/usr/local
    rm /tmp/cmake-3.27.0-linux-x86_64.sh
    echo "✅ CMake 3.27.0 installed"
else
    echo "✅ CMake already installed"
fi

# Step 4: Add Presage repository
echo ""
echo "📦 Step 4: Adding Presage repository..."
curl -s "https://presage-security.github.io/PPA/KEY.gpg" | gpg --dearmor | tee /etc/apt/trusted.gpg.d/presage-technologies.gpg >/dev/null
curl -s --compressed -o /etc/apt/sources.list.d/presage-technologies.list "https://presage-security.github.io/PPA/presage-technologies.list"
echo "✅ Presage repository added"

# Step 5: Install SmartSpectra SDK
echo ""
echo "📦 Step 5: Installing SmartSpectra SDK..."
apt update
apt install -y libsmartspectra-dev

# Step 6: Verify installation
echo ""
echo "🔍 Step 6: Verifying installation..."
if dpkg -l | grep -q libsmartspectra-dev; then
    echo "✅ SmartSpectra SDK installed successfully"
else
    echo "❌ Installation verification failed"
    exit 1
fi

# Step 7: Update library cache
echo ""
echo "📦 Step 7: Updating library cache..."
ldconfig

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Get your API key from: https://physiology.presagetech.com"
echo "2. Add it to your .env file: PRESAGE_API_KEY=your_key_here"
echo "3. Build the wrapper: cd sam_service && ./build_wrapper.sh"
echo "4. Test: ./presage_wrapper test_frame.jpg YOUR_API_KEY"
echo "5. Start service: python3 vitals_service.py"
echo ""
echo "For Docker setup, see: PRESAGE_UBUNTU_SETUP.md"

