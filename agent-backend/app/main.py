"""
FastAPI Agent Backend for RAG Chat Application
"""
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables from parent .env.local
env_path = Path(__file__).parent.parent.parent / ".env.local"
if env_path.exists():
    load_dotenv(env_path)
else:
    # Fallback to parent directory's .env.local
    parent_env = Path(__file__).parent.parent.parent.parent / ".env.local"
    if parent_env.exists():
        load_dotenv(parent_env)

# Initialize Weave
from app.weave.init import init_weave
init_weave()

# Create FastAPI app
app = FastAPI(
    title="Weave Agent Backend",
    description="RAG Chat Agent with Weave Instrumentation",
    version="0.1.0"
)

# Configure CORS for frontend (port 5174)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "agent-backend",
        "version": "0.1.0"
    }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Weave Agent Backend API",
        "docs": "/docs",
        "health": "/health"
    }

# Import and include routers
from app.routes import chat
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

