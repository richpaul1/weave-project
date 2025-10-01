#!/bin/bash

# Simple wrapper script to start all services using npm run dev
# This uses concurrently to run all services in one terminal

set -e

echo "🚀 Starting Weave Project..."
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Change to project directory
cd "$PROJECT_DIR"

# Check if concurrently is installed
if ! npm list concurrently > /dev/null 2>&1; then
    echo "📦 Installing concurrently..."
    npm install
    echo ""
fi

# Run the dev script
echo "🎯 Starting all services with concurrently..."
echo ""
echo "Services will run in this terminal window:"
echo "  • Admin Backend (blue)"
echo "  • Agent Backend (green)"
echo "  • Client (yellow)"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

npm run dev

