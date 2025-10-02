"""
Weave configuration API routes
"""
import os
from fastapi import APIRouter

router = APIRouter(prefix="/api/weave")

@router.get("/config")
async def get_weave_config():
    """
    Get Weave configuration for frontend debugging
    """
    entity = os.getenv("WANDB_ENTITY", "")
    project = os.getenv("WANDB_PROJECT", "support-app")
    api_key = os.getenv("WANDB_API_KEY")
    
    # Only return config if API key is set (Weave is enabled)
    if not api_key:
        return {
            "enabled": False,
            "message": "Weave tracking is disabled. Set WANDB_API_KEY to enable."
        }
    
    return {
        "enabled": True,
        "entity": entity,
        "project": project,
        "baseUrl": "https://wandb.ai"
    }
