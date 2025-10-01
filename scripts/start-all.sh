#!/bin/bash

# Weave Project - Start All Services
# This script starts all three services in separate terminal tabs/windows

set -e

echo "🚀 Starting Weave Project Services..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're on macOS or Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="mac"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="linux"
else
    echo "⚠️  Unsupported platform: $OSTYPE"
    echo "Please start services manually. See STARTUP_GUIDE.md"
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${BLUE}📍 Project directory: $SCRIPT_DIR${NC}"
echo ""

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check Neo4j
if ! curl -s http://localhost:7474 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Neo4j is not running on port 7474${NC}"
    echo "   Please start Neo4j before running this script"
    echo "   See STARTUP_GUIDE.md for instructions"
    exit 1
else
    echo -e "${GREEN}✓ Neo4j is running${NC}"
fi

# Check Ollama
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Ollama is not running on port 11434${NC}"
    echo "   Please start Ollama before running this script"
    echo "   Run: ollama serve"
    exit 1
else
    echo -e "${GREEN}✓ Ollama is running${NC}"
fi

# Check .env.local
if [ ! -f "$SCRIPT_DIR/.env.local" ]; then
    echo -e "${YELLOW}⚠️  .env.local file not found${NC}"
    echo "   Please create .env.local in the weave-project directory"
    exit 1
else
    echo -e "${GREEN}✓ .env.local found${NC}"
fi

echo ""
echo "🎯 Starting services in separate terminal windows..."
echo ""

# Function to start service in new terminal (macOS)
start_service_mac() {
    local service_name=$1
    local service_dir=$2
    local command=$3
    
    echo -e "${BLUE}Starting $service_name...${NC}"
    
    osascript <<EOF
tell application "Terminal"
    do script "cd '$SCRIPT_DIR/$service_dir' && echo '🚀 Starting $service_name...' && $command"
    activate
end tell
EOF
}

# Function to start service in new terminal (Linux with gnome-terminal)
start_service_linux() {
    local service_name=$1
    local service_dir=$2
    local command=$3
    
    echo -e "${BLUE}Starting $service_name...${NC}"
    
    gnome-terminal --tab --title="$service_name" -- bash -c "cd '$SCRIPT_DIR/$service_dir' && echo '🚀 Starting $service_name...' && $command; exec bash"
}

# Start services based on platform
if [ "$PLATFORM" == "mac" ]; then
    # macOS - use Terminal.app
    start_service_mac "Admin Backend" "admin" "npm run dev"
    sleep 2
    start_service_mac "Agent Backend" "agent" "uvicorn app.main:app --reload --port 8000"
    sleep 2
    start_service_mac "Frontend Client" "client" "npm run dev"
    
elif [ "$PLATFORM" == "linux" ]; then
    # Linux - use gnome-terminal
    if command -v gnome-terminal &> /dev/null; then
        start_service_linux "Admin Backend" "admin" "npm run dev"
        sleep 2
        start_service_linux "Agent Backend" "agent" "uvicorn app.main:app --reload --port 8000"
        sleep 2
        start_service_linux "Frontend Client" "client" "npm run dev"
    else
        echo -e "${YELLOW}⚠️  gnome-terminal not found${NC}"
        echo "Please install gnome-terminal or start services manually"
        echo "See STARTUP_GUIDE.md for instructions"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}✅ All services are starting!${NC}"
echo ""
echo "📊 Service URLs:"
echo "   • Admin Backend:  http://localhost:3002"
echo "   • Agent Backend:  http://localhost:8000"
echo "   • Frontend:       http://localhost:5174"
echo ""
echo "🔍 Health Checks:"
echo "   • Admin: http://localhost:3002/health"
echo "   • Agent: http://localhost:8000/health"
echo ""
echo "📚 API Documentation:"
echo "   • Agent API Docs: http://localhost:8000/docs"
echo ""
echo "⏳ Please wait 10-20 seconds for all services to fully start..."
echo ""
echo "💡 Tip: Check each terminal window to see the startup logs"
echo ""

