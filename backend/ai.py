import base64
import json
from os import getenv
from typing import Any

import google.generativeai as genai
from dotenv import load_dotenv
from google.api_core.exceptions import GoogleAPIError, InvalidArgument, ResourceExhausted

load_dotenv()


_model: genai.GenerativeModel | None = None

# Mensagem de erro da falta da chave da API.
_missing_key_message = (
    "Missing GEMINI_API_KEY (or GOOGLE_API_KEY) environment variable. Set it in your environment or .env file."
)  # Texto padrão enviado quando não tem uma chave configurada


# Erro para tratar da falta da chave de api
class _MissingAPIKeyError(RuntimeError):
    """Erro disparado quando a chave da API Gemini não está configurada."""


# Constrói uma resposta padronizada de erro para o cliente, preservando informações úteis.
def _error_payload(reason: str, code: str, extra: dict | None = None) -> dict:
    payload = {
        "reason": reason, #Retorna o erro descritivo, junto do código como "missing_api_key" ou algum erro da API
        "error": code,
    }
    if extra:
        payload.update(extra)
    return payload


# Lê as possíveis variáveis de ambiente que armazenam a chave e retorna a primeira válida, caso contrário, retorna o erro da falta da chave.
def _load_api_key() -> str:
    for env_name in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        value = getenv(env_name)
        if value and value.strip():
            return value.strip()
    raise _MissingAPIKeyError()


# Inicinado o modelo, já com a chave carregada, usando gemini 2.5 Flash.
def _get_model() -> genai.GenerativeModel:
    global _model
    if _model is None:  # Verifica se já existe modelo pronto
        genai.configure(api_key=_load_api_key())
        _model = genai.GenerativeModel(
            "models/gemini-2.5-flash", 
            generation_config={
                "temperature": 0.3, #Aleatoriedade controlada das respostas
                "max_output_tokens": 4096,
                "response_mime_type": "application/json",
            },
        )
    return _model


# Cria o prompt completo enviado ao modelo, descrevendo os parâmetros para análise e de linguagem.
def _build_prompt(email_text: str) -> str:
    return f"""
        You are a senior workplace productivity analyst. Your job is to decide whether an email is PRODUCTIVE (legitimate work-related communication) or NON-PRODUCTIVE (spam, marketing, irrelevant content) by interpreting the full context, not just isolated keywords.

        PREPARATION STEPS:
        - Normalize the email: lowercase, remove punctuation, filter stop words, and reduce words to their lemma/stem before evaluating relevance.
        - Extract key context such as sender role, subject, project or team references, requests, deadlines, attachments mentioned, and prior conversation hints.

        ANALYSIS PLAYBOOK:
        - Summarize the main intent of the email in one sentence before deciding.
        - Identify if the email requires follow-up action, coordination, or decision-making tied to ongoing work, projects, or colleagues.
        - Consider whether the email references verifiable internal context (specific projects, teams, meetings, deliverables, clients) versus generic marketing language.
        - Pay close attention to contradictory clues: an email can mention "meeting" yet still be an advertisement; always check if the surrounding context supports a genuine work scenario.
        - When unsure, reason about the consequences of treating the email as productive/non-productive for the recipient's workflow.

        CLASSIFICATION GUIDELINES:
        - PRODUCTIVE EMAIL: Concrete collaboration or execution scope such as "project updates", "deadline reminders", "client follow-up", "task assignment", "team planning", "technical clarification", or other actionable items that advance work. These often include specific dates, deliverables, stakeholders, or resources.
        - NON-PRODUCTIVE EMAIL: Promotional or unsolicited content ("limited-time offer", "winner", "discount", "sale", "promotion", "newsletter"), vague motivational messages with no work tie-in, phishing-like urgencies without context, or anything irrelevant to ongoing responsibilities.
        - Edge cases: networking invites, training opportunities, or HR announcements should be evaluated based on whether they provide direct value or required action for the recipient's role. If they lack clear work relevance, classify as NON-PRODUCTIVE.

        COMMUNICATION STYLE:
        - Always adapt your language to match the email language when explaining the reasoning or crafting a reply.
        - The explanation must cite the contextual clues (people, projects, deadlines, offers, URLs, etc.) that led to your decision.

        RESPOND ONLY WITH JSON in the following format:
        {{
            "productive": true/false,
            "confidence": 0.0-1.0,
            "reason": "contextual explanation of the classification",
            "keywords": ["salient", "terms"],
            "reply": "Polite follow-up if productive; otherwise empty string."
        }}

        EMAIL TO ANALYZE:
        {email_text}
    """


# Consolida o texto retornado pela API, tratando diferentes formatos de resposta do Gemini.
def _safe_json_dumps(data: Any) -> str:
    try:
        return json.dumps(data, ensure_ascii=False)
    except TypeError:
        return str(data)


def _string_segment(value: Any) -> list[str]:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            return [stripped]
    return []


def _json_segment(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return _string_segment(value)
    try:
        return _string_segment(_safe_json_dumps(value))
    except Exception:
        return _string_segment(str(value))


def _function_call_segments(function_call) -> list[str]:
    if not function_call:
        return []

    payload = getattr(function_call, "args", None) or getattr(function_call, "arguments", None)
    segments = _json_segment(payload)
    if segments:
        return segments

    name = getattr(function_call, "name", None)
    return _json_segment({"function_call": name}) if name else []


def _function_response_segments(function_response) -> list[str]:
    if not function_response:
        return []

    response_payload = getattr(function_response, "response", None)
    segments = _json_segment(response_payload)
    if segments:
        return segments

    name = getattr(function_response, "name", None)
    return _json_segment({"function_response": name}) if name else []


def _inline_data_segments(inline_data) -> list[str]:
    if not inline_data:
        return []

    raw_data = getattr(inline_data, "data", None)
    if not raw_data:
        return []

    try:
        decoded = base64.b64decode(raw_data).decode("utf-8", errors="replace")
    except Exception:
        decoded = str(raw_data)
    return _string_segment(decoded)


def _fallback_part_segments(part) -> list[str]:
    to_dict = getattr(part, "to_dict", None)
    if callable(to_dict):
        try:
            return _json_segment(to_dict())
        except Exception:
            return _string_segment(str(part))
    return _string_segment(str(part))


def _extract_text_segments_from_part(part) -> list[str]:
    segments: list[str] = []
    segments.extend(_string_segment(getattr(part, "text", None)))
    segments.extend(_function_call_segments(getattr(part, "function_call", None)))
    segments.extend(_function_response_segments(getattr(part, "function_response", None)))
    segments.extend(_inline_data_segments(getattr(part, "inline_data", None)))

    return segments if segments else _fallback_part_segments(part)


def _candidate_text_segments(candidate) -> list[str]:
    content = getattr(candidate, "content", None)
    content_parts = getattr(content, "parts", None) if content else None
    if not content_parts:
        return []

    segments: list[str] = []
    for part in content_parts:
        segments.extend(_extract_text_segments_from_part(part))
    return segments


def _collect_response_text(response) -> str:
    quick_text = ""
    try:
        quick_text = getattr(response, "text", "")
    except Exception:
        quick_text = ""

    text = (quick_text or "").strip()
    if text:  # Se houver texto pronto
        return text  # Retorna imediatamente a string

    candidates = getattr(response, "candidates", None) or []
    segments = [segment for candidate in candidates for segment in _candidate_text_segments(candidate)]
    return "\n".join(segments).strip()


def _format_enum_value(value) -> str:
    if hasattr(value, "name"):
        return str(value.name)
    return str(value)


def _candidate_block_reason(response) -> str | None:
    candidates = getattr(response, "candidates", None) or []
    reasons: list[str] = []

    for candidate in candidates:
        finish_reason = getattr(candidate, "finish_reason", None)
        if finish_reason:
            finish_reason_str = _format_enum_value(finish_reason).upper()
            if "SAFETY" in finish_reason_str and finish_reason_str not in reasons:
                reasons.append(finish_reason_str)

        for rating in getattr(candidate, "safety_ratings", None) or []:
            blocked = getattr(rating, "blocked", False)
            probability = _format_enum_value(getattr(rating, "probability", ""))
            category = _format_enum_value(getattr(rating, "category", ""))
            probability_clean = probability.split(".")[-1].replace("_", " ").title()
            category_clean = category.split(".")[-1].replace("_", " ").title()

            if blocked or probability_clean.upper() in {"VERY LIKELY", "HIGH", "LIKELY"}:
                reasons.append(f"{category_clean} ({probability_clean})")

    if reasons:
        seen: set[str] = set()
        ordered_unique: list[str] = []
        for reason in reasons:
            if reason not in seen:
                seen.add(reason)
                ordered_unique.append(reason)
        return ", ".join(ordered_unique)

    return None


def _describe_part(part) -> dict[str, Any]:
    descriptor: dict[str, Any] = {"repr": str(part)}

    text_value = getattr(part, "text", None)
    if isinstance(text_value, str) and text_value.strip():
        descriptor["text_preview"] = text_value.strip()[:160]

    function_call = getattr(part, "function_call", None)
    if function_call:
        descriptor["function_call"] = {
            "name": getattr(function_call, "name", None),
            "has_args": bool(getattr(function_call, "args", None) or getattr(function_call, "arguments", None)),
        }

    inline_data = getattr(part, "inline_data", None)
    if inline_data:
        data = getattr(inline_data, "data", None)
        descriptor["inline_data"] = {
            "mime_type": getattr(inline_data, "mime_type", None),
            "data_length": len(data) if data else 0,
        }

    function_response = getattr(part, "function_response", None)
    if function_response:
        descriptor["function_response"] = {
            "name": getattr(function_response, "name", None),
            "has_response": bool(getattr(function_response, "response", None)),
        }

    return descriptor


def _candidate_debug_snapshot(response) -> list[dict[str, Any]]:
    snapshot: list[dict[str, Any]] = []

    for candidate in getattr(response, "candidates", None) or []:
        candidate_info: dict[str, Any] = {}

        finish_reason = getattr(candidate, "finish_reason", None)
        if finish_reason:
            candidate_info["finish_reason"] = _format_enum_value(finish_reason)

        safety_ratings = getattr(candidate, "safety_ratings", None) or []
        if safety_ratings:
            candidate_info["safety_ratings"] = [
                {
                    "category": _format_enum_value(getattr(rating, "category", "")),
                    "blocked": getattr(rating, "blocked", False),
                    "probability": _format_enum_value(getattr(rating, "probability", "")),
                }
                for rating in safety_ratings
            ]

        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) if content else None
        if parts:
            candidate_info["parts"] = [_describe_part(part) for part in parts]

        snapshot.append(candidate_info)

    return snapshot


# Valida e converte o JSON retornado pelo modelo, diferenciando sucesso de respostas inválidas.
def _parse_response_payload(response_text: str) -> tuple[dict | None, dict | None]:
    if not response_text:
        return None, _error_payload("Empty response from Gemini model", "empty_response") #Retorna o erro de payload se tiver resposta nula.

    try:
        payload = json.loads(response_text)  # Converte o JSON em dicionário Python
    except json.JSONDecodeError:
        return None, _error_payload(
            "Could not parse Gemini response as JSON",
            "json_parse_error",
            {"original_response": response_text},
        )

    if "productive" not in payload:  # Garante que o campo essencial esteja presente
        return None, _error_payload(
            "Gemini response does not contain 'productive' field",
            "invalid_response_format",
            {"original_response": response_text},
        )

    payload.setdefault("keywords", [])
    payload.setdefault("reply", "")

    return payload, None  # Retorna payload válido e indica ausência de erros


# Erro de quando o prompt é bloqueado pelas políticas da plataforma, seja por conteúdo impróprio ou outros motivos.
def _prompt_blocked_response(block_reason: str) -> dict:
    return _error_payload(f"Prompt blocked: {block_reason}", "prompt_blocked")


# Função principal que envia o texto do email ao Gemini e retorna a decisão estruturada.
def analisar_email(texto_email: str) -> dict:
    try:
        model = _get_model()  # Recupera a instância configurada do Gemini
    except _MissingAPIKeyError:
        return _error_payload(_missing_key_message, "missing_api_key")

    try:
        response = model.generate_content(
            [
                {
                    "role": "user",  # Informa ao modelo que o prompt vem do usuário
                    "parts": [
                        "You are a specialized email classifier. Always respond with valid JSON following the provided schema.",  # Reforça o formato esperado
                        _build_prompt(texto_email),  # Inclui as instruções completas e o email original
                    ],
                }
            ]
        )

        feedback = getattr(response, "prompt_feedback", None)
        if feedback and getattr(feedback, "block_reason", None):
            return _prompt_blocked_response(feedback.block_reason)

        response_text = _collect_response_text(response)
        if not response_text:
            block_reason = _candidate_block_reason(response)
            if block_reason:
                return _prompt_blocked_response(block_reason)

            debug_snapshot = _candidate_debug_snapshot(response)
            extra = {"candidate_debug": debug_snapshot} if debug_snapshot else None
            return _error_payload("Empty response from Gemini model", "empty_response", extra)

        parsed_payload, error_payload = _parse_response_payload(response_text)
        if parsed_payload is not None:
            return parsed_payload

        return error_payload or _error_payload("Empty response from Gemini model", "empty_response")

    except ResourceExhausted as e:
        return _error_payload(f"Gemini quota exceeded: {str(e)}", "quota_exceeded")

    except InvalidArgument as e:
        return _error_payload(f"Invalid request to Gemini API: {str(e)}", "invalid_request")

    except GoogleAPIError as e:
        return _error_payload(f"Gemini API error: {str(e)}", "gemini_api_error")

    except Exception as e:
        return _error_payload(f"Unexpected error: {str(e)}", "unexpected_error")


# Utilitário para limpar o cache do modelo durante testes ou reconfigurações.
def reset_model_cache() -> None:
    """Clear the cached Gemini model. Useful for tests."""
    global _model
    _model = None
