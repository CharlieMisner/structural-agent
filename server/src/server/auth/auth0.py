"""Auth0 JWT Authentication and Validation Module for Statikor Server.

Validates RS256 JSON Web Tokens (JWT) against Auth0's JSON Web Key Set (JWKS).
Provides FastAPI dependencies for route authorization with dev-mode fallback.
"""

from dataclasses import dataclass, field
import os
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

# Optional HTTPBearer scheme that does not auto-error if header is missing
security = HTTPBearer(auto_error=False)


@dataclass
class User:
    """Authenticated user context extracted from validated Auth0 JWT claims."""
    sub: str
    email: Optional[str] = None
    name: Optional[str] = None
    permissions: list[str] = field(default_factory=list)
    org_id: Optional[str] = None
    raw_payload: dict = field(default_factory=dict)


class Auth0Validator:
    """Validates Auth0 JWTs using JWKS and validates claims."""

    def __init__(
        self,
        domain: Optional[str] = None,
        audience: Optional[str] = None,
        algorithms: Optional[list[str]] = None,
    ):
        self.domain = domain if domain is not None else os.getenv("AUTH0_DOMAIN", "")
        self.audience = audience if audience is not None else os.getenv("AUTH0_AUDIENCE", "")
        self.algorithms = algorithms or ["RS256"]
        self._jwks_client: Optional[jwt.PyJWKClient] = None

        if self.domain:
            jwks_url = f"https://{self.domain}/.well-known/jwks.json"
            self._jwks_client = jwt.PyJWKClient(jwks_url)

    @property
    def is_enabled(self) -> bool:
        """Returns True if Auth0 domain is configured and not explicitly disabled."""
        disabled = os.getenv("AUTH0_DISABLED", "false").lower() in ("true", "1", "yes")
        return bool(self.domain and not disabled)

    def decode_token(self, token: str) -> dict:
        """Decodes and verifies an Auth0 JWT token."""
        if not self.is_enabled:
            # When Auth0 is not configured, decode without verification for dev/testing
            try:
                return jwt.decode(token, options={"verify_signature": False})
            except Exception:
                return {"sub": "dev_user", "email": "dev@statikor.local", "name": "Dev User"}

        if not self._jwks_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Auth0 JWKS client is not initialized",
            )

        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(token)
            issuer = f"https://{self.domain}/"
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=self.algorithms,
                issuer=issuer,
                options={"verify_aud": False},
            )
            return payload
        except jwt.PyJWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid or expired token: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )

    def user_from_payload(self, payload: dict) -> User:
        """Extracts a User instance from a validated token payload."""
        return User(
            sub=payload.get("sub", "anonymous"),
            email=payload.get("email") or payload.get("https://statikor.com/email"),
            name=payload.get("name") or payload.get("https://statikor.com/name"),
            permissions=payload.get("permissions", []),
            org_id=payload.get("org_id"),
            raw_payload=payload,
        )


auth0_validator = Auth0Validator()


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> User:
    """FastAPI dependency requiring a valid Auth0 JWT token (or dev fallback when disabled)."""
    # If Auth0 is not configured in this environment, provide a local dev user
    if not auth0_validator.is_enabled:
        if credentials and credentials.credentials:
            payload = auth0_validator.decode_token(credentials.credentials)
            return auth0_validator.user_from_payload(payload)
        return User(sub="dev_user", email="dev@statikor.local", name="Dev User")

    # If Auth0 is enabled, bearer token is required
    if not credentials or not credentials.credentials:
        # Check query param for WebSocket connections (?token=...)
        token = request.query_params.get("token")
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required (missing Bearer token)",
                headers={"WWW-Authenticate": "Bearer"},
            )
    else:
        token = credentials.credentials

    payload = auth0_validator.decode_token(token)
    return auth0_validator.user_from_payload(payload)


async def get_optional_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[User]:
    """FastAPI dependency that returns User if a valid token is present, else None."""
    try:
        return await get_current_user(request, credentials)
    except HTTPException:
        return None
