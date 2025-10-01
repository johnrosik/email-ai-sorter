import importlib
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def test_missing_api_key(monkeypatch):
    """analisar_email should warn clearly when Gemini credentials are absent."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    import backend.ai as ai

    ai_module = importlib.reload(ai)
    ai_module.reset_model_cache()

    monkeypatch.setenv("GEMINI_API_KEY", "", prepend=None)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    result = ai_module.analisar_email("Meeting about quarterly roadmap tomorrow.")

    assert result["error"] == "missing_api_key"
    assert result["reason"] == ai_module._missing_key_message
    assert set(result.keys()) == {"error", "reason"}
