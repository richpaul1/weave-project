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

# Startup event handler
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    port = int(os.getenv("AGENT_BACKEND_PORT", "3001"))
    print("=" * 50)
    print("🚀 Agent Backend Server Started")
    print("=" * 50)
    print(f"Port: {port}")
    print(f"Mode: Development")
    print(f"Health Check: http://localhost:{port}/health")
    print(f"API Documentation: http://localhost:{port}/docs")
    print(f"OpenAPI Schema: http://localhost:{port}/openapi.json")
    print("=" * 50)
    print("API Endpoints:")
    print("  GET    /")
    print("  GET    /health")
    print("  POST   /api/chat/message")
    print("  POST   /api/chat/stream")
    print("  GET    /api/chat/health")
    print("  GET    /api/chat/sessions")
    print("  GET    /api/chat/messages/{session_id}")
    print("  POST   /api/chat/messages")
    print("  DELETE /api/chat/messages/{session_id}")
    print("  GET    /api/weave/config")
    print("=" * 50)
    client_port = int(os.getenv("AGENT_CLIENT_PORT", "3000"))
    print(f"Agent Backend URL: http://localhost:{port}/")
    print(f"Agent Client URL: http://localhost:{client_port}/")
    yield
    # Shutdown (if needed)
    pass

# Create FastAPI app
app = FastAPI(
    title="Weave Agent Backend",
    description="RAG Chat Agent with Weave Instrumentation",
    version="0.1.0",
    lifespan=lifespan
)

# Configure CORS for frontend
client_port = int(os.getenv("AGENT_CLIENT_PORT", "3000"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"http://localhost:{client_port}",
        f"http://127.0.0.1:{client_port}",
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
from app.routes import chat, weave
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(weave.router, tags=["weave"])

print("✅ Registered routes:")
for route in app.routes:
    if hasattr(route, 'path') and hasattr(route, 'methods'):
        print(f"  {list(route.methods)[0] if route.methods else 'GET':<6} {route.path}")

# Graph endpoints
@app.get("/api/graph/nodes")
async def get_graph_nodes():
    """Get all graph nodes for visualization"""
    # For now, return empty array - can be enhanced later
    return []



if __name__ == "__main__":
    import uvicorn

    # Get port from environment variable, default to 3001
    port = int(os.getenv("AGENT_BACKEND_PORT", "3001"))

    print(f"🚀 Starting server on port {port}")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )

