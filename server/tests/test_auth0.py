from unittest.mock import MagicMock, patch, PropertyMock
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
import jwt

from server.auth.auth0 import (
    Auth0Validator,
    User,
    get_current_user,
    get_optional_current_user,
)


def test_user_dataclass():
    u = User(sub="auth0|123", email="user@example.com", name="Test User", permissions=["read:all"])
    assert u.sub == "auth0|123"
    assert u.email == "user@example.com"
    assert u.name == "Test User"
    assert u.permissions == ["read:all"]


def test_auth0_validator_disabled_mode():
    v = Auth0Validator(domain="", audience="")
    assert not v.is_enabled
    payload = v.decode_token("invalid.jwt.token")
    assert payload["sub"] == "dev_user"
    user = v.user_from_payload(payload)
    assert user.sub == "dev_user"
    assert user.email == "dev@statikor.local"


def test_auth0_validator_decode_unverified_fallback():
    v = Auth0Validator(domain="", audience="")
    # Valid unverified JWT token with 32+ byte key to avoid deprecation warnings
    secret = "a_very_secure_secret_key_at_least_32_bytes_long"
    token = jwt.encode({"sub": "custom|456", "email": "custom@example.com"}, secret, algorithm="HS256")
    payload = v.decode_token(token)
    assert payload["sub"] == "custom|456"
    assert payload["email"] == "custom@example.com"


def test_auth0_validator_enabled_flow():
    with patch("jwt.PyJWKClient"):
        v = Auth0Validator(domain="test.auth0.com", audience="https://api.statikor.com")
        assert v.is_enabled
        
        mock_client = MagicMock()
        mock_key = MagicMock()
        mock_key.key = "fake-public-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_key
        v._jwks_client = mock_client

        with patch("jwt.decode") as mock_decode:
            mock_decode.return_value = {
                "sub": "auth0|abc",
                "https://statikor.com/email": "test@example.com",
                "https://statikor.com/name": "Alice",
                "permissions": ["admin"],
                "org_id": "org_123",
            }
            payload = v.decode_token("mock.token.here")
            assert payload["sub"] == "auth0|abc"
            user = v.user_from_payload(payload)
            assert user.sub == "auth0|abc"
            assert user.email == "test@example.com"
            assert user.name == "Alice"
            assert user.org_id == "org_123"


def test_auth0_validator_invalid_token_raises():
    with patch("jwt.PyJWKClient"):
        v = Auth0Validator(domain="test.auth0.com", audience="https://api.statikor.com")
        mock_client = MagicMock()
        mock_client.get_signing_key_from_jwt.side_effect = jwt.PyJWTError("Key not found")
        v._jwks_client = mock_client

        with pytest.raises(HTTPException) as exc:
            v.decode_token("bad.token")
        assert exc.value.status_code == 401


def test_auth0_validator_missing_jwks_client_raises():
    v = Auth0Validator(domain="test.auth0.com")
    v._jwks_client = None
    with patch.object(Auth0Validator, "is_enabled", new_callable=PropertyMock, return_value=True):
        with pytest.raises(HTTPException) as exc:
            v.decode_token("some.token")
        assert exc.value.status_code == 500


@pytest.mark.asyncio
async def test_get_current_user_disabled_mode():
    request = MagicMock()
    user = await get_current_user(request=request, credentials=None)
    assert user.sub == "dev_user"


@pytest.mark.asyncio
async def test_get_current_user_disabled_mode_with_credentials():
    request = MagicMock()
    secret = "a_very_secure_secret_key_at_least_32_bytes_long"
    token = jwt.encode({"sub": "dev|999", "email": "dev999@test.local"}, secret, algorithm="HS256")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    user = await get_current_user(request=request, credentials=creds)
    assert user.sub == "dev|999"


@pytest.mark.asyncio
async def test_get_current_user_enabled_missing_credentials():
    with patch.object(Auth0Validator, "is_enabled", new_callable=PropertyMock, return_value=True):
        request = MagicMock()
        request.query_params = {}
        with pytest.raises(HTTPException) as exc:
            await get_current_user(request=request, credentials=None)
        assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_enabled_with_query_param_token():
    with patch.object(Auth0Validator, "is_enabled", new_callable=PropertyMock, return_value=True):
        with patch("server.auth.auth0.auth0_validator.decode_token") as mock_decode:
            mock_decode.return_value = {"sub": "query|user", "email": "query@test.com"}
            request = MagicMock()
            request.query_params = {"token": "query.token.value"}
            user = await get_current_user(request=request, credentials=None)
            assert user.sub == "query|user"


@pytest.mark.asyncio
async def test_get_current_user_enabled_with_valid_bearer():
    with patch.object(Auth0Validator, "is_enabled", new_callable=PropertyMock, return_value=True):
        with patch("server.auth.auth0.auth0_validator.decode_token") as mock_decode:
            mock_decode.return_value = {"sub": "bearer|user", "email": "bearer@test.com"}
            request = MagicMock()
            creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bearer.token.value")
            user = await get_current_user(request=request, credentials=creds)
            assert user.sub == "bearer|user"


@pytest.mark.asyncio
async def test_get_optional_current_user():
    request = MagicMock()
    user = await get_optional_current_user(request=request, credentials=None)
    assert user is not None
    assert user.sub == "dev_user"

    # Test error handling returns None
    with patch.object(Auth0Validator, "is_enabled", new_callable=PropertyMock, return_value=True):
        request.query_params = {}
        user = await get_optional_current_user(request=request, credentials=None)
        assert user is None
