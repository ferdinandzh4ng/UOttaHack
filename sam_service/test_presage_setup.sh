#!/bin/bash
# Test script to verify Presage SDK setup in Docker

set -e

echo "🧪 Testing Presage SDK Setup"
echo "============================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
echo "1. Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running${NC}"
    echo "   Start Docker Desktop and try again"
    exit 1
fi
echo -e "${GREEN}✅ Docker is running${NC}"
echo ""

# Check if image exists or needs to be built
echo "2. Checking Docker image..."
IMAGE_NAME="sam_service-vitals-service"
if ! docker images | grep -q "$IMAGE_NAME"; then
    echo -e "${YELLOW}⚠️  Image not found. Building...${NC}"
    cd "$(dirname "$0")"
    docker-compose -f docker-compose.vitals.yml build
else
    echo -e "${GREEN}✅ Docker image exists${NC}"
fi
echo ""

# Test SDK installation in container
echo "3. Testing SDK installation in container..."
cd "$(dirname "$0")"
CONTAINER_NAME="uottahack-vitals-service-test"

# Start container in background
docker-compose -f docker-compose.vitals.yml up -d

# Wait for container to be ready
sleep 5

# Check if SDK is installed
if docker exec $CONTAINER_NAME dpkg -l | grep -q libsmartspectra-dev; then
    echo -e "${GREEN}✅ SDK package installed${NC}"
else
    echo -e "${RED}❌ SDK package not found${NC}"
    docker-compose -f docker-compose.vitals.yml down
    exit 1
fi

# Check if SDK libraries are available
if docker exec $CONTAINER_NAME ldconfig -p | grep -q smartspectra; then
    echo -e "${GREEN}✅ SDK libraries found${NC}"
else
    echo -e "${YELLOW}⚠️  SDK libraries not in cache (may still work)${NC}"
fi

# Check if wrapper exists
if docker exec $CONTAINER_NAME test -f /app/presage_wrapper; then
    echo -e "${GREEN}✅ Wrapper executable exists${NC}"
    
    # Test wrapper (will fail without API key, but should show usage)
    if docker exec $CONTAINER_NAME /app/presage_wrapper 2>&1 | grep -q "Usage"; then
        echo -e "${GREEN}✅ Wrapper is executable${NC}"
    else
        echo -e "${YELLOW}⚠️  Wrapper may have issues${NC}"
    fi
else
    echo -e "${RED}❌ Wrapper not found${NC}"
    echo "   Build may have failed. Check logs:"
    echo "   docker-compose -f docker-compose.vitals.yml logs"
fi
echo ""

# Test Python service
echo "4. Testing Python service..."
if docker exec $CONTAINER_NAME python3 -c "import cv2; import numpy" 2>/dev/null; then
    echo -e "${GREEN}✅ Python dependencies installed${NC}"
else
    echo -e "${RED}❌ Python dependencies missing${NC}"
fi

# Test health endpoint
echo ""
echo "5. Testing health endpoint..."
sleep 2
if curl -f http://localhost:5002/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Service is healthy${NC}"
    curl -s http://localhost:5002/health | python3 -m json.tool || echo "Response received"
else
    echo -e "${YELLOW}⚠️  Health endpoint not responding (service may still be starting)${NC}"
fi
echo ""

# Summary
echo "============================"
echo "Test Summary"
echo "============================"
echo ""
echo "To test with real API key:"
echo "  1. Set PRESAGE_API_KEY in .env file"
echo "  2. Restart: docker-compose -f docker-compose.vitals.yml restart"
echo "  3. Test: curl -X POST http://localhost:5002/api/vitals/session/start \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"session_id\": \"test\", \"api_key\": \"YOUR_KEY\"}'"
echo ""
echo "To view logs:"
echo "  docker-compose -f docker-compose.vitals.yml logs -f"
echo ""
echo "To stop:"
echo "  docker-compose -f docker-compose.vitals.yml down"
echo ""

