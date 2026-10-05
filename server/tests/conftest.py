import os
import pytest
from unittest.mock import MagicMock, patch

# Ensure test environment variables
os.environ["GEMINI_API_KEY"] = "test-fake-key"
os.environ["GOOGLE_API_KEY"] = "test-fake-key"
os.environ["STATIKOR_SERVER_URL"] = "http://127.0.0.1:8000"
