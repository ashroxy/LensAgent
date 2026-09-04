"""
LensAgent Browser Automation FastAPI Backend.
Privacy-Preserving VLM Controller powered by Qwen2.5-VL on Groq Cloud (primary)
with local llama.cpp fallback.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
import logging

import uvicorn
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.actions.action_formatter import ActionFormatter
from app.api.routes import init_dependencies, router
from app.config.settings import settings
from app.prompts.prompt_builder import PromptBuilder
from app.session.session_manager import SessionManager
from app.storage.base import BaseSessionStore
from app.storage.memory_store import MemorySessionStore
from app.storage.supabase_store import SupabaseSessionStore
from app.utils.logging import setup_logging
from app.validation.action_validator import ActionValidator
from app.vlm.base import BaseVLMEngine
from app.vlm.groq_engine import GroqEngine
from app.vlm.hf_engine import HFEngine
from app.vlm.llamacpp_engine import LlamaCppEngine
from app.vlm.openrouter_engine import OpenRouterEngine
from app.vlm.routed_engine import RoutedEngine
from app.workflow.workflow_manager import WorkflowManager

logger = setup_logging(settings.LOG_LEVEL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing LensAgent FastAPI Backend...")

    # Storage Backend Initialization
    store: BaseSessionStore
    if settings.STORAGE_BACKEND == "supabase" and settings.SUPABASE_URL and settings.SUPABASE_KEY:
        logger.info("Using Supabase session store at %s", settings.SUPABASE_URL)
        store = SupabaseSessionStore(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    else:
        logger.info("Using Thread-Safe In-Memory Session Store")
        store = MemorySessionStore(ttl_seconds=settings.SESSION_TTL_SECONDS)

    session_manager = SessionManager(store)
    workflow_manager = WorkflowManager()
    prompt_builder = PromptBuilder()
    action_formatter = ActionFormatter()
    action_validator = ActionValidator()

    # VLM Engine Selection:
    #   "routed"    -> Groq primary, HF router fallback on Groq rate-limit/failure
    #   "hf"        -> HF router only
    #   "groq"      -> Groq only
    #   "openrouter" -> OpenRouter only (billed, reliable)
    #   "llamacpp"  -> local
    vlm_engine: BaseVLMEngine
    if settings.VLM_BACKEND in ("auto", "routed"):
        logger.info("Using AutoEngine: Groq primary, Hugging Face fallback")
        vlm_engine = RoutedEngine()
    elif settings.VLM_BACKEND == "openrouter" and settings.OPENROUTER_API_KEY:
        logger.info("Using OpenRouter VLM (model=%s)", settings.OPENROUTER_MODEL)
        vlm_engine = OpenRouterEngine()
    elif settings.VLM_BACKEND == "hf" and settings.HF_TOKEN:
        logger.info("Using Hugging Face router VLM (model=%s)", settings.HF_MODEL)
        vlm_engine = HFEngine()
    elif settings.VLM_BACKEND == "groq" and settings.GROQ_API_KEY:
        logger.info("Using Groq Cloud VLM (model=%s)", settings.GROQ_MODEL)
        vlm_engine = GroqEngine()
    else:
        logger.info("Using local LlamaCpp VLM at %s", settings.LLAMACPP_URL)
        vlm_engine = LlamaCppEngine()

    try:
        await vlm_engine.load()
    except Exception as e:
        logger.warning("VLM Engine load warning: %s", e)

    init_dependencies(
        session_manager=session_manager,
        workflow_manager=workflow_manager,
        prompt_builder=prompt_builder,
        action_formatter=action_formatter,
        action_validator=action_validator,
        vlm_engine=vlm_engine,
    )

    logger.info("LensAgent Backend initialized on http://%s:%d", settings.HOST, settings.PORT)
    yield

    await vlm_engine.close()
    if isinstance(store, SupabaseSessionStore):
        await store.close()
    logger.info("LensAgent Backend shutdown complete")


app = FastAPI(
    title="LensAgent Backend",
    description=(
        "Privacy-preserving browser automation backend for the LensAgent Chrome Extension.\n\n"
        "Receives sanitized visual frames and Tri-Stream accessibility/DOM trees, reasons "
        "using Qwen2.5-VL via Groq Cloud (or local llama.cpp), and returns structured CDP action plans."
    ),
    version="1.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Enable CORS for Chrome Extension origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

app.include_router(router)

_static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
if os.path.isdir(_static_dir):
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")
else:
    logger.warning("Static dir not found at %s; not mounting /static", _static_dir)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    logger.error("422 Request Validation Error on %s: %s", request.url, exc.errors())
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(exc.body)[:500]},
    )


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        log_level=settings.LOG_LEVEL.lower(),
    )


if __name__ == "__main__":
    main()
