FROM ghcr.io/astral-sh/uv:debian-slim

WORKDIR /app

# Enable bytecode compilation and specify Python 3.14
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV PYTHONUNBUFFERED=1
ENV UV_PYTHON=3.14

# Install Python 3.14 via uv standalone toolchain
RUN uv python install 3.14

# Copy dependency and python version specifications to leverage Docker layer caching
COPY .python-version pyproject.toml uv.lock ./

# Install production dependencies
RUN uv sync --frozen --no-dev --no-install-project

# Copy source code
COPY src/ ./src/
COPY README.md ./

# Install project package
RUN uv sync --frozen --no-dev

# Expose internal port
EXPOSE 8000

# Run uvicorn on 0.0.0.0:8000 (required for Fly.io container networking)
CMD ["uv", "run", "uvicorn", "server.server:app", "--host", "0.0.0.0", "--port", "8000"]