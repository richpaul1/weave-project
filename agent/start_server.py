#!/usr/bin/env python3
"""
Agent Backend Server Startup Script

Starts the FastAPI agent backend server using environment configuration.
Properly reads AGENT_BACKEND_PORT from .env.local file.
"""
import uvicorn
from app.config import AGENT_BACKEND_PORT

if __name__ == "__main__":
    print(f"🚀 Starting Agent Backend Server on port {AGENT_BACKEND_PORT}")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=AGENT_BACKEND_PORT,
        reload=True
    )
