import asyncio
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.errors import ApiError
from app.modules.media.objects import object_store
from app.modules.admin.router import admin_router, features_router
from app.modules.business.router import router as business_router
from app.modules.civic.router import router as city_router
from app.modules.civic.schemas import Health
from app.modules.identity.router import auth_router, users_router
from app.modules.market.router import router as market_router
from app.modules.media.router import router as media_router
from app.modules.property.router import router as property_router
from app.modules.shorts.router import router as shorts_router
from app.modules.transit.router import router as transit_router
from app.modules.ordering.router import admin_orders_router, router as orders_router
from app.modules.services.router import router as services_router

@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.minio_endpoint.strip():
        last: Exception | None = None
        for _ in range(20):
            try:
                object_store().ensure()
                last = None
                break
            except Exception as exc:
                last = exc
                await asyncio.sleep(0.5)
        if last is not None:
            raise last
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id(request: Request, call_next):
    request_id_value = request.headers.get("x-request-id", str(uuid4()))
    response = await call_next(request)
    response.headers["x-request-id"] = request_id_value
    return response


@app.exception_handler(ApiError)
async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    details: list[dict[str, str]] = []
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", []) if part not in ("body", "query", "path")]
        message = str(err.get("msg", "Invalid value"))
        prefix = "Value error, "
        if message.startswith(prefix):
            message = message[len(prefix) :]
        details.append({"field": ".".join(loc), "message": message})
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "validation_error", "message": "Check the highlighted fields.", "details": details}},
    )


@app.get("/api/v1/health", response_model=Health, tags=["health"])
def health() -> Health:
    return Health(status="ok", service=settings.app_name)


app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(city_router, prefix="/api/v1")
app.include_router(business_router, prefix="/api/v1")
app.include_router(market_router, prefix="/api/v1")
app.include_router(media_router, prefix="/api/v1")
app.include_router(transit_router, prefix="/api/v1")
app.include_router(property_router, prefix="/api/v1")
app.include_router(shorts_router, prefix="/api/v1")
app.include_router(orders_router, prefix="/api/v1")
app.include_router(services_router, prefix="/api/v1")
app.include_router(features_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(admin_orders_router, prefix="/api/v1")
