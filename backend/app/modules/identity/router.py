from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response

from app.core.config import settings
from app.core.errors import ApiError
from app.core.security import decode_access_token
from app.modules.identity.schemas import LoginRequest, MeResponse, ProfilePatch, RegisterRequest, RegisterResponse, TokenResponse
from app.modules.identity.service import identity_service
from app.modules.identity.store import UserRecord

REFRESH_COOKIE = "mynagari_refresh"
COOKIE_PATH = "/api/v1/auth"

auth_router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> UserRecord:
    if authorization is None or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "unauthenticated", "Sign in to continue.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise ApiError(401, "unauthenticated", "Sign in to continue.")
    user_id = decode_access_token(token)
    return identity_service.require_active(user_id)


CurrentUser = Annotated[UserRecord, Depends(get_current_user)]


def get_optional_user(authorization: Annotated[str | None, Header()] = None) -> UserRecord | None:
    if authorization is None or not authorization.lower().startswith("bearer "):
        return None
    try:
        return get_current_user(authorization)
    except ApiError:
        return None


OptionalUser = Annotated[UserRecord | None, Depends(get_optional_user)]


def require_admin(user: CurrentUser) -> UserRecord:
    if user.role != "admin":
        raise ApiError(403, "not_admin", "Sign in as a city admin to do this.")
    return user


AdminUser = Annotated[UserRecord, Depends(require_admin)]


def _client_ip(request: Request) -> str:
    if request.client is None:
        return "unknown"
    return request.client.host


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        path=COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE,
        path=COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


@auth_router.post("/register", response_model=RegisterResponse)
def register(body: RegisterRequest, request: Request, response: Response) -> RegisterResponse:
    issued = identity_service.register(
        email=body.email,
        password=body.password,
        display_name=body.display_name,
        ui_mode=body.ui_mode,
        ward_id=body.ward_id,
        ip=_client_ip(request),
    )
    _set_refresh_cookie(response, issued.refresh_token)
    if issued.register is None:
        raise ApiError(500, "register_failed", "The account could not be created.")
    return issued.register


@auth_router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, response: Response) -> TokenResponse:
    issued = identity_service.login(body.email, body.password, _client_ip(request))
    _set_refresh_cookie(response, issued.refresh_token)
    return issued.token


@auth_router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response) -> TokenResponse:
    issued = identity_service.refresh(request.cookies.get(REFRESH_COOKIE))
    _set_refresh_cookie(response, issued.refresh_token)
    return issued.token


@auth_router.post("/logout", status_code=204)
def logout(request: Request, response: Response) -> None:
    identity_service.logout(request.cookies.get(REFRESH_COOKIE))
    _clear_refresh_cookie(response)


@users_router.get("/me", response_model=MeResponse)
def me(user: CurrentUser) -> MeResponse:
    return identity_service.me(user)


@users_router.patch("/me", response_model=MeResponse)
def patch_me(body: ProfilePatch, user: CurrentUser) -> MeResponse:
    return identity_service.update_profile(user, body)
