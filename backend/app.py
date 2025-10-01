from pathlib import Path
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from pypdf import PdfReader
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.ai import analisar_email

# Carrega variáveis do arquivo .env
load_dotenv()


# Função auxiliar que interpreta a porta desejada via variável de ambiente e usa um valor padrão seguro.
def _parse_port(raw_value: str | None, fallback: int = 8000) -> int:
    try:
        return int(raw_value) if raw_value is not None else fallback
    except ValueError:
        return fallback


# Flags de configuração básica carregadas das variáveis de ambiente.
DEBUG_MODE = os.getenv("FLASK_DEBUG", "false").lower() == "true"
HOST = os.getenv("FLASK_HOST", "0.0.0.0")
PORT = _parse_port(os.getenv("PORT") or os.getenv("FLASK_PORT"), 8000)

# Instancia a aplicação Flask e habilita CORS para permitir chamadas do frontend.
app = Flask(__name__)
CORS(app)

# Limita o tamanho máximo de uploads aceitos e define extensões permitidas.
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB Max File Size
ALLOWED_EXTENSIONS = {'txt', 'pdf'}


# Extrai texto de PDFs, garantindo que haja conteúdo útil e propagando erros como ValueError.
def _extract_text_from_pdf(file_stream) -> str:
    try:
        reader = PdfReader(file_stream)
        text = "\n".join((page.extract_text() or "") for page in reader.pages).strip()
        if not text:
            raise ValueError("PDF contains no extractable text")
        return text
    except Exception as exc:
        raise ValueError(f"Error extracting text from PDF: {exc}") from exc


# Extrai texto de arquivos .txt tentando diferentes codificações para acomodar textos diversos.
def _extract_text_from_txt(file_stream) -> str:
    try:
        content = file_stream.read()
    except Exception as exc:
        raise ValueError(f"Error reading TXT file: {exc}") from exc

    for encoding in ('utf-8', 'latin-1', 'cp1252'):
        try:
            text = content.decode(encoding).strip()
            if text:
                return text
        except UnicodeDecodeError:
            continue
    raise ValueError("Unable to decode text file")


# Valida o upload recebido, checa extensão e delega para o extrator correto.
def _extract_email_text_from_upload(file_storage) -> str:
    filename = (file_storage.filename or '').strip()
    if not filename:
        raise ValueError("No selected file")

    if '.' not in filename:
        raise ValueError("Unsupported file type")

    extension = filename.rsplit('.', 1)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Unsupported file type")

    if extension == 'pdf':
        return _extract_text_from_pdf(file_storage.stream)

    return _extract_text_from_txt(file_storage.stream)


# Recupera o texto do email a partir de upload, JSON ou formulário, normalizando o conteúdo.
def _get_email_text() -> str:
    file_storage = request.files.get('file')
    if file_storage:
        return _extract_email_text_from_upload(file_storage)

    if request.is_json:
        payload = request.get_json(silent=True) or {}
        email_text = payload.get('email_text', '')
    else:
        email_text = request.form.get('email_text', '')

    email_text = (email_text or '').strip()
    if not email_text:
        raise ValueError("Email text is required")

    return email_text


# Endpoint principal que recebe o email, chama o classificador Gemini e retorna o resultado em JSON.
@app.route('/classify-email', methods=['POST'])
def classify_email():
    try:
        email_text = _get_email_text()
        result = analisar_email(email_text)
        return jsonify(
            {
                'productive': result.get('productive'),
                'confidence': result.get('confidence'),
                'reason': result.get('reason'),
                'keywords': result.get('keywords'),
                'reply': result.get('reply'),
                'error': result.get('error', None),
            }
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Unexpected error while classifying email", exc_info=exc)
        return jsonify({"error": "Internal server error"}), 500


# Endpoint de metadados expõe detalhes de uso e limites da API.
@app.route('/info', methods=['GET'])
def info():
    return jsonify(
        {
            "service": "Email Analyzer and Classifier",
            "version": "1.0",
            "description": "Classifies emails as productive or non-productive using AI.",
            "endpoints": {
                '/': 'API information',
                '/classify-email': 'POST - Classifies email. Accepts JSON with "email_text" field or file upload (.txt or .pdf)',
                '/info': 'GET - Service information',
            },
            'accepted_file_types_for_upload': sorted(ALLOWED_EXTENSIONS),
            'max_file_size_for_upload': app.config['MAX_CONTENT_LENGTH'],
        }
    )


# Endpoint raiz simples para verificação de funcionalidade do serviço.
@app.route('/', methods=['GET'])
def home():
    return jsonify(
        {
            "message": "Email classifier API is running.",
            "status": "OK",
            "use": "See /info for more details.",
        }
    )


# Executa o servidor localmente utilizando as configurações definidas acima.
if __name__ == '__main__':
    app.run(debug=DEBUG_MODE, host=HOST, port=PORT)
