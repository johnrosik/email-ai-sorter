import json
from os import getenv 

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
                "max_output_tokens": 512,
                "response_mime_type": "application/json",
            },
        )
    return _model


# Cria o prompt completo enviado ao modelo, descrevendo os parâmetros para análise e de linguagem.
def _build_prompt(email_text: str) -> str:
    return f"""
        You're an AI assistant that analyzes emails to identify if they're an productive or non-productive email.
        Filter the lemmatization and the stemming, 
        Lowercase the email text before analysis.
        Filter stop words and punctuation.
        Ignore very common words that don't add meaning to the text.
        Use only the words that are relevant to determine if the email is productive or non-productive
        CRITERIA:
        - PRODUCTIVE EMAIL: contains words like "meeting", "project", "deadline", "report", "collaboration", "team", "update", "feedback", "strategy", "planning", "work", "task", "agenda", "schedule", "business", "conference", "proposal", "contract", and other words that can be correlated to professional and work-related topics.
        - NON-PRODUCTIVE EMAIL: contains words like "sale", "discount", "offer", "buy now", "limited time", "winner", "free", "click here", "urgent", "act now", "promotion", "spam", "lottery", "prize", and other words that can't be correlated to professional and work-related topics.
        Adapt your answer to the language of the email.
        RESPOND ONLY WITH JSON in the following format:
        {{
            "productive": true/false,
            "confidence": 0.0-1.0,
            "reason": "explanation of the classification",
            "keywords": ["found", "words"],
            "reply": "A polite reply to the email, if it's productive. If non-productive, leave empty."
        }}

        EMAIL TO ANALYZE:
        {email_text}
    """


# Consolida o texto retornado pela API, tratando diferentes formatos de resposta do Gemini.
def _collect_response_text(response) -> str:
    text = (getattr(response, "text", "") or "").strip()
    if text:  # Se houver texto pronto
        return text  # Retorna imediatamente a string

    candidates = getattr(response, "candidates", None) or []  # Caso contrário, examina os candidatos alternativos
    parts: list[str] = []
    for candidate in candidates: 
        content = getattr(candidate, "content", None) 
        content_parts = getattr(content, "parts", None) if content else None 
        if not content_parts: 
            continue  
        for part in content_parts: 
            part_text = getattr(part, "text", None) 
            if part_text: 
                parts.append(part_text)
    return "\n".join(part.strip() for part in parts if part).strip()  # Junta e limpa todas as partes em uma única string


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
        parsed_payload, error_payload = _parse_response_payload(response_text)
        return parsed_payload if parsed_payload is not None else error_payload

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
