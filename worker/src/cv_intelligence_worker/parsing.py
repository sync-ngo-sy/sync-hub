from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import List
from xml.etree import ElementTree as ET


from .schema import DocumentSource, DocumentText
from .utils import format_error_message


PDF_TEXT_PATTERN = re.compile(r"\((.*?)\)\s*Tj", re.DOTALL)
PDF_ARRAY_PATTERN = re.compile(r"\[(.*?)\]\s*TJ", re.DOTALL)
XML_TEXT_NAMESPACE = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
DATE_PATTERN = re.compile(r"(?:\d{1,2}/\d{4}|\d{4}|[A-Za-z]{3,9}\s+\d{4})\s*[-–]\s*(?:present|current|\d{1,2}/\d{4}|\d{4}|[A-Za-z]{3,9}\s+\d{4})", re.IGNORECASE)
SECTION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bsummary\b",
        r"\babout\b",
        r"\bwork experience\b",
        r"\bexperience\b",
        r"\bskills\b",
        r"\bprojects\b",
        r"\beducation\b",
        r"\blanguages\b",
        r"\bcertifications?\b",
    )
]
LIGATURE_MAP = {
    "\ufb00": "ff",
    "\ufb01": "fi",
    "\ufb02": "fl",
    "\ufb03": "ffi",
    "\ufb04": "ffl",
    "\ufb05": "ft",
    "\ufb06": "st",
}
PARSER_VERSION = "2.0.0"
OCR_DPI = "150"
OCR_TIMEOUT_SECONDS = 120


def normalize_text(value: str) -> str:
    value = value.replace("\f", "\n")
    for src, dst in LIGATURE_MAP.items():
        value = value.replace(src, dst)
    value = (
        value.replace("\u00a0", " ")
        .replace("\u200b", "")
        .replace("\u200c", "")
        .replace("\u200d", "")
        .replace("\ufeff", "")
        .replace("\t", " ")
    )
    lines = []
    for raw_line in value.replace("\r", "\n").split("\n"):
        line = " ".join(raw_line.split()).strip(" |")
        if line:
            lines.append(line)
    return "\n".join(lines).strip()


def unescape_pdf_text(value: str) -> str:
    value = value.replace(r"\(", "(").replace(r"\)", ")").replace(r"\\", "\\")
    value = value.replace(r"\n", "\n").replace(r"\r", "\r").replace(r"\t", "\t")
    return value


def extract_pdf_text_from_bytes(data: bytes) -> str:
    text = data.decode("latin1", errors="ignore")
    parts: List[str] = []
    for match in PDF_TEXT_PATTERN.finditer(text):
        parts.append(unescape_pdf_text(match.group(1)))
    for match in PDF_ARRAY_PATTERN.finditer(text):
        chunk = match.group(1)
        for string_match in re.finditer(r"\((.*?)\)", chunk, re.DOTALL):
            parts.append(unescape_pdf_text(string_match.group(1)))
    return normalize_text("\n".join(parts))


def _is_probably_text(value: str) -> bool:
    normalized = normalize_text(value)
    if not normalized:
        return False
    if "\ufffd" in normalized:
        return False
    characters = [char for char in normalized if not char.isspace()]
    if not characters:
        return False
    printable = sum(1 for char in characters if char.isprintable())
    controls = sum(1 for char in normalized if ord(char) < 32 and char not in "\n\r\t")
    return printable / len(characters) >= 0.98 and controls == 0


def _run_pdftotext(path: Path, mode: str) -> str:
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "output.txt"
        command = ["pdftotext", "-nopgbrk", "-eol", "unix"]
        if mode == "raw":
            command.append("-raw")
        elif mode == "layout":
            command.append("-layout")
        else:
            raise ValueError(f"Unsupported pdftotext mode: {mode}")
        command.extend([str(path), str(output_path)])
        subprocess.run(command, check=True, capture_output=True)
        return output_path.read_text(encoding="utf-8", errors="ignore") if output_path.exists() else ""


def _run_pdf_ocr(path: Path) -> str:
    if not shutil.which("pdftoppm") or not shutil.which("tesseract"):
        raise FileNotFoundError("pdftoppm and tesseract are required for OCR fallback")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        prefix = tmp_path / "page"
        subprocess.run(
            ["pdftoppm", "-r", OCR_DPI, "-png", str(path), str(prefix)],
            check=True,
            capture_output=True,
            timeout=OCR_TIMEOUT_SECONDS,
        )
        page_paths = sorted(tmp_path.glob("page-*.png"))
        if not page_paths:
            return ""
        pages: List[str] = []
        for page_path in page_paths:
            completed = subprocess.run(
                ["tesseract", str(page_path), "stdout", "--psm", "6"],
                check=True,
                capture_output=True,
                timeout=OCR_TIMEOUT_SECONDS,
            )
            page_text = completed.stdout.decode("utf-8", errors="replace")
            if page_text.strip():
                pages.append(page_text)
        return normalize_text("\n\n".join(pages))


def _score_pdf_text_candidate(text: str) -> float:
    lines = [line for line in normalize_text(text).splitlines() if line.strip()]
    if not lines:
        return -1_000.0

    score = 0.0
    for line in lines:
        section_hits = sum(1 for pattern in SECTION_PATTERNS if pattern.search(line))
        if section_hits:
            score += section_hits * 6.0
            if len(line.split()) <= 4:
                score += 2.0
            if section_hits > 1:
                score -= (section_hits - 1) * 5.0
        if EMAIL_PATTERN.search(line):
            score += 3.0
        if DATE_PATTERN.search(line):
            score += 1.0
        if len(line) > 180:
            score -= 0.5

    average_line_length = sum(len(line) for line in lines) / max(len(lines), 1)
    if 20 <= average_line_length <= 120:
        score += 2.0
    return score


def extract_pdf_text(path: Path) -> DocumentText:
    warnings: List[str] = []
    parser_name = "pdf-fallback"
    raw_text = ""
    pdf_bytes = path.read_bytes()
    candidates: List[tuple[float, str, str]] = []
    try:
        for mode in ("raw", "layout"):
            candidate_text = _run_pdftotext(path, mode)
            if candidate_text.strip():
                normalized = normalize_text(candidate_text)
                if _is_probably_text(normalized):
                    candidates.append((_score_pdf_text_candidate(normalized), f"pdftotext-{mode}", normalized))
                else:
                    warnings.append(f"pdftotext-{mode} output looked like non-text bytes and was discarded")
    except FileNotFoundError:
        warnings.append("pdftotext not available, using embedded text parser")
    except subprocess.CalledProcessError as exc:
        warnings.append(f"pdftotext failed: {exc}")

    if candidates:
        candidates.sort(key=lambda item: (item[0], len(item[2])), reverse=True)
        _, parser_name, raw_text = candidates[0]

    if not raw_text.strip():
        try:
            raw_text = _run_pdf_ocr(path)
            if raw_text.strip():
                parser_name = "tesseract-ocr"
                warnings.append("PDF text layer was empty; used OCR fallback")
        except FileNotFoundError as exc:
            warnings.append(format_error_message(exc))
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            warnings.append(f"OCR fallback failed: {format_error_message(exc)}")

    if not raw_text.strip():
        fallback_text = extract_pdf_text_from_bytes(pdf_bytes)
        if _is_probably_text(fallback_text):
            raw_text = fallback_text
            parser_name = "pdf-embedded"
        elif fallback_text.strip():
            warnings.append("Embedded PDF parser produced non-text bytes and was discarded")
    if not raw_text.strip():
        warnings.append("No extractable text found in PDF")
    return DocumentText(
        source=None,  # populated by caller
        raw_text=normalize_text(raw_text),
        parser_name=parser_name,
        parser_version=PARSER_VERSION,
        page_texts=[],
        warnings=warnings,
    )


def docx_paragraph_text(xml_bytes: bytes) -> List[str]:
    root = ET.fromstring(xml_bytes)
    paragraphs: List[str] = []
    for paragraph in root.findall(".//w:p", XML_TEXT_NAMESPACE):
        fragments = [node.text or "" for node in paragraph.findall(".//w:t", XML_TEXT_NAMESPACE)]
        line = normalize_text("".join(fragments))
        if line:
            paragraphs.append(line)
    return paragraphs


def extract_docx_text(path: Path) -> DocumentText:
    paragraphs: List[str] = []
    warnings: List[str] = []
    with zipfile.ZipFile(path) as archive:
        names = [
            name
            for name in archive.namelist()
            if name.startswith("word/") and name.endswith(".xml")
        ]
        names.sort()
        for name in names:
            try:
                paragraphs.extend(docx_paragraph_text(archive.read(name)))
            except ET.ParseError as exc:
                warnings.append(f"Could not parse {name}: {exc}")
    raw_text = normalize_text("\n".join(paragraphs))
    if not raw_text:
        warnings.append("No extractable text found in DOCX")
    return DocumentText(
        source=None,  # populated by caller
        raw_text=raw_text,
        parser_name="docx-xml",
        parser_version=PARSER_VERSION,
        page_texts=[],
        warnings=warnings,
    )


def extract_txt_text(path: Path) -> DocumentText:
    raw_text = path.read_text(encoding="utf-8", errors="ignore")
    return DocumentText(
        source=None,  # populated by caller
        raw_text=normalize_text(raw_text),
        parser_name="plain-text",
        parser_version=PARSER_VERSION,
        page_texts=[],
        warnings=[],
    )


def parse_document(source: DocumentSource) -> DocumentText:
    path = Path(source.source_path)
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        document_text = extract_pdf_text(path)
    elif suffix == ".docx":
        document_text = extract_docx_text(path)
    elif suffix == ".txt":
        document_text = extract_txt_text(path)
    else:
        raise ValueError(f"Unsupported document type: {suffix}")
    return DocumentText(
        source=source,
        raw_text=document_text.raw_text,
        parser_name=document_text.parser_name,
        parser_version=document_text.parser_version,
        page_texts=document_text.page_texts,
        warnings=document_text.warnings,
    )
