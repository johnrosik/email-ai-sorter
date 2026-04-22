from __future__ import annotations

import base64
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, request, session
from flask_cors import CORS
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from pypdf import PdfReader

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.ai import analisar_email

load_dotenv()

GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
MAX_GMAIL_ANALYZE = 20

# In-memory only, per session_id. No database persistence.
_GMAIL_SESSION_STORE: dict[str, dict[str, Any]] = {}


def _parse_port(raw_value: str | None, fallback: int = 8000) -> int:
    try:
        return int(raw_value) if raw_value is not None else fallback
    except ValueError:
        return fallback


def _parse_allowed_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS")
    if raw and raw.strip():
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]


def _strip_html(value: str) -> str:
    no_tags = re.sub(r"<[^>]+>", " ", value)
    compact = re.sub(r"\s+", " ", no_tags)
    return compact.strip()


def _parse_gmail_headers(payload: dict[str, Any]) -> dict[str, str]:
    headers = payload.get("headers", []) if isinstance(payload, dict) else []
    result = {"subject": "", "from": "", "date": ""}

    for header in headers:
        name = str(header.get("name", "")).lower()
        value = str(header.get("value", "")).strip()
        if name == "subject":
            result["subject"] = value
        elif name == "from":
            result["from"] = value
        elif name == "date":
            result["date"] = value

    return result


def _decode_base64_url(data: str | None) -> str:
    if not data:
        return ""
    try:
        decoded = base64.urlsafe_b64decode(data + "==")
        return decoded.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _extract_text_from_payload(payload: dict[str, Any]) -> str:
    if not isinstance(payload, dict):
        return ""

    mime_type = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data") if isinstance(payload.get("body"), dict) else None

    if mime_type == "text/plain":
        return _decode_base64_url(body_data)

    if mime_type == "text/html":
        return _strip_html(_decode_base64_url(body_data))

    parts = payload.get("parts", [])
    if isinstance(parts, list):
        text_segments: list[str] = []
        for part in parts:
            text = _extract_text_from_payload(part)
            if text:
                text_segments.append(text)
        return "\n".join(text_segments).strip()

    return ""


def _ensure_session_id() -> str:
    session_id = session.get("session_id")
    if not session_id:
        session_id = str(uuid.uuid4())
        session["session_id"] = session_id
    return session_id


def _gmail_client_config() -> dict[str, Any]:
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "").strip()

    if not client_id or not client_secret or not redirect_uri:
        raise ValueError(
            "Missing Google OAuth config. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI"
        )

    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }


def _get_credentials_from_session() -> Credentials:
    session_id = _ensure_session_id()
    raw_credentials = _GMAIL_SESSION_STORE.get(session_id)
    if not raw_credentials:
        raise ValueError("Gmail is not connected for this session")

    creds = Credentials.from_authorized_user_info(raw_credentials, GMAIL_SCOPES)

    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleAuthRequest())
        _GMAIL_SESSION_STORE[session_id] = {
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes or GMAIL_SCOPES),
        }

    return creds


def _build_gmail_service():
    creds = _get_credentials_from_session()
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _get_email_text() -> str:
    file_storage = request.files.get("file")
    if file_storage:
        return _extract_email_text_from_upload(file_storage)

    if request.is_json:
        payload = request.get_json(silent=True) or {}
        email_text = payload.get("email_text", "")
    else:
        email_text = request.form.get("email_text", "")

    email_text = (email_text or "").strip()
    if not email_text:
        raise ValueError("Email text is required")

    return email_text


def _extract_text_from_pdf(file_stream) -> str:
    try:
        reader = PdfReader(file_stream)
        text = "\n".join((page.extract_text() or "") for page in reader.pages).strip()
        if not text:
            raise ValueError("PDF contains no extractable text")
        return text
    except Exception as exc:
        raise ValueError(f"Error extracting text from PDF: {exc}") from exc


def _extract_text_from_txt(file_stream) -> str:
    try:
        content = file_stream.read()
    except Exception as exc:
        raise ValueError(f"Error reading TXT file: {exc}") from exc

    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            text = content.decode(encoding).strip()
            if text:
                return text
        except UnicodeDecodeError:
            continue
    raise ValueError("Unable to decode text file")


def _extract_email_text_from_upload(file_storage) -> str:
    filename = (file_storage.filename or "").strip()
    if not filename:
        raise ValueError("No selected file")

    if "." not in filename:
        raise ValueError("Unsupported file type")

    extension = filename.rsplit(".", 1)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Unsupported file type")

    if extension == "pdf":
        return _extract_text_from_pdf(file_storage.stream)

    return _extract_text_from_txt(file_storage.stream)


def _format_message_for_classification(full_message: dict[str, Any]) -> str:
    payload = full_message.get("payload", {})
    headers = _parse_gmail_headers(payload)
    snippet = str(full_message.get("snippet", "")).strip()
    body_text = _extract_text_from_payload(payload)

    composed = (
        f"From: {headers['from']}\n"
        f"Subject: {headers['subject']}\n"
        f"Date: {headers['date']}\n"
        f"Snippet: {snippet}\n\n"
        f"Body:\n{body_text}"
    ).strip()

    return composed[:12000]


DEBUG_MODE = os.getenv("FLASK_DEBUG", "false").lower() == "true"
HOST = os.getenv("FLASK_HOST", "0.0.0.0")
PORT = _parse_port(os.getenv("PORT") or os.getenv("FLASK_PORT"), 8000)

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-only-secret-change-me")
app.config["SESSION_COOKIE_SAMESITE"] = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
app.config["SESSION_COOKIE_SECURE"] = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
app.config["SESSION_COOKIE_HTTPONLY"] = True

CORS(
    app,
    supports_credentials=True,
    origins=_parse_allowed_origins(),
)

app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
ALLOWED_EXTENSIONS = {"txt", "pdf"}


@app.route("/classify-email", methods=["POST"])
def classify_email():
    try:
        email_text = _get_email_text()
        result = analisar_email(email_text)
        return jsonify(
            {
                "productive": result.get("productive"),
                "confidence": result.get("confidence"),
                "reason": result.get("reason"),
                "keywords": result.get("keywords"),
                "reply": result.get("reply"),
                "error": result.get("error", None),
            }
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Unexpected error while classifying email", exc_info=exc)
        return jsonify({"error": "Internal server error"}), 500


@app.route("/gmail/auth-url", methods=["GET"])
def gmail_auth_url():
    try:
        session_id = _ensure_session_id()
        flow = Flow.from_client_config(_gmail_client_config(), scopes=GMAIL_SCOPES)
        flow.redirect_uri = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "").strip()

        authorization_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )

        session["gmail_oauth_state"] = state
        session["gmail_oauth_session"] = session_id

        return jsonify({"auth_url": authorization_url})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Failed to build Gmail auth url", exc_info=exc)
        return jsonify({"error": "Failed to start Gmail OAuth"}), 500


@app.route("/gmail/callback", methods=["GET"])
def gmail_callback():
    state = request.args.get("state", "")
    code = request.args.get("code", "")

    expected_state = session.get("gmail_oauth_state")
    if not expected_state or state != expected_state:
        return "Invalid OAuth state", 400

    if not code:
        return "Missing OAuth code", 400

    try:
        flow = Flow.from_client_config(_gmail_client_config(), scopes=GMAIL_SCOPES, state=state)
        flow.redirect_uri = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "").strip()
        flow.fetch_token(code=code)

        creds = flow.credentials
        session_id = _ensure_session_id()
        _GMAIL_SESSION_STORE[session_id] = {
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes or GMAIL_SCOPES),
        }

        return """
        <html><body style="font-family:sans-serif;background:#0d422d;color:#e6fff2;display:flex;align-items:center;justify-content:center;height:100vh;">
          <div style="text-align:center;max-width:420px;">
            <h2>Gmail conectado</h2>
            <p>Você pode voltar para o Imu Email Classifier.</p>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'gmail_connected' }, '*');
                }
              } catch (e) {}
              setTimeout(() => window.close(), 900);
            </script>
          </div>
        </body></html>
        """
    except Exception as exc:
        app.logger.exception("Failed in Gmail OAuth callback", exc_info=exc)
        return "Failed to connect Gmail", 500


@app.route("/gmail/session-status", methods=["GET"])
def gmail_session_status():
    try:
        service = _build_gmail_service()
        profile = service.users().getProfile(userId="me").execute()
        return jsonify(
            {
                "connected": True,
                "email": profile.get("emailAddress"),
                "messages_total": profile.get("messagesTotal"),
            }
        )
    except Exception:
        return jsonify({"connected": False, "email": None, "messages_total": None})


@app.route("/gmail/disconnect", methods=["POST"])
def gmail_disconnect():
    session_id = _ensure_session_id()
    _GMAIL_SESSION_STORE.pop(session_id, None)
    session.pop("gmail_oauth_state", None)
    session.pop("gmail_oauth_session", None)
    return jsonify({"connected": False})


@app.route("/gmail/analyze-inbox", methods=["POST"])
def gmail_analyze_inbox():
    try:
        payload = request.get_json(silent=True) or {}
        max_results = int(payload.get("max_results", 5))
        query = str(payload.get("query", "in:inbox newer_than:7d")).strip() or "in:inbox newer_than:7d"

        max_results = max(1, min(max_results, MAX_GMAIL_ANALYZE))

        service = _build_gmail_service()
        list_response = (
            service.users()
            .messages()
            .list(userId="me", maxResults=max_results, q=query)
            .execute()
        )

        message_refs = list_response.get("messages", []) or []
        analyzed_items: list[dict[str, Any]] = []

        for ref in message_refs:
            message_id = ref.get("id")
            if not message_id:
                continue

            full_message = (
                service.users()
                .messages()
                .get(userId="me", id=message_id, format="full")
                .execute()
            )

            payload_data = full_message.get("payload", {})
            headers = _parse_gmail_headers(payload_data)
            snippet = str(full_message.get("snippet", "")).strip()
            body_text = _extract_text_from_payload(payload_data).strip()

            classification_input = _format_message_for_classification(full_message)
            classification = analisar_email(classification_input)

            analyzed_items.append(
                {
                    "id": message_id,
                    "thread_id": full_message.get("threadId"),
                    "subject": headers.get("subject", ""),
                    "from": headers.get("from", ""),
                    "date": headers.get("date", ""),
                    "snippet": snippet,
                    "body_text": body_text[:8000],
                    "classification": {
                        "productive": classification.get("productive"),
                        "confidence": classification.get("confidence"),
                        "reason": classification.get("reason"),
                        "keywords": classification.get("keywords"),
                        "reply": classification.get("reply"),
                        "error": classification.get("error"),
                    },
                }
            )

        return jsonify(
            {
                "count": len(analyzed_items),
                "query": query,
                "max_results": max_results,
                "items": analyzed_items,
            }
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Failed to analyze Gmail inbox", exc_info=exc)
        return jsonify({"error": "Failed to analyze Gmail inbox"}), 500


@app.route("/info", methods=["GET"])
def info():
    return jsonify(
        {
            "service": "Email Analyzer and Classifier",
            "version": "1.1",
            "description": "Classifies emails as productive or non-productive using AI.",
            "endpoints": {
                "/": "API information",
                "/classify-email": 'POST - Classifies email. Accepts JSON with "email_text" field or file upload (.txt or .pdf)',
                "/gmail/auth-url": "GET - Starts Gmail OAuth flow",
                "/gmail/callback": "GET - Google OAuth callback",
                "/gmail/session-status": "GET - Gmail connection state for current session",
                "/gmail/disconnect": "POST - Disconnects Gmail for current session",
                "/gmail/analyze-inbox": "POST - Reads inbox and classifies recent emails for current session",
                "/info": "GET - Service information",
            },
            "accepted_file_types_for_upload": sorted(ALLOWED_EXTENSIONS),
            "max_file_size_for_upload": app.config["MAX_CONTENT_LENGTH"],
            "gmail_mode": "Session-only in-memory credentials, no database storage",
        }
    )


@app.route("/", methods=["GET"])
def home():
    return jsonify(
        {
            "message": "Email classifier API is running.",
            "status": "OK",
            "use": "See /info for more details.",
        }
    )


if __name__ == "__main__":
    app.run(debug=DEBUG_MODE, host=HOST, port=PORT)
