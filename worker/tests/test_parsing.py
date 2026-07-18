from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from cv_intelligence_worker.discovery import discover_documents
from cv_intelligence_worker.parsing import normalize_text, parse_document


class ParsingTests(unittest.TestCase):
    def test_normalize_text_strips_zero_width_pdf_separators(self) -> None:
        text = normalize_text("Ahmad\u200b Alaydi\nBackend\u200c Developer\ufeff")
        self.assertEqual(text, "Ahmad Alaydi\nBackend Developer")

    def test_parse_txt_document(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "resume.txt"
            path.write_text("Jane Doe\nSenior Backend Engineer\nPython, PostgreSQL\n", encoding="utf-8")
            source = discover_documents([str(path)], "tenant-1", "run-1")[0]
            document = parse_document(source)
            self.assertIn("Jane Doe", document.raw_text)
            self.assertEqual(document.parser_name, "plain-text")

    def test_parse_docx_document(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "resume.docx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr(
                    "[Content_Types].xml",
                    """<?xml version="1.0" encoding="UTF-8"?>
                    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
                    </Types>""",
                )
                archive.writestr(
                    "word/document.xml",
                    """<?xml version="1.0" encoding="UTF-8"?>
                    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                      <w:body>
                        <w:p><w:r><w:t>John Smith</w:t></w:r></w:p>
                        <w:p><w:r><w:t>Backend Engineer</w:t></w:r></w:p>
                      </w:body>
                    </w:document>""",
                )
            source = discover_documents([str(path)], "tenant-1", "run-1")[0]
            document = parse_document(source)
            self.assertIn("John Smith", document.raw_text)
            self.assertEqual(document.parser_name, "docx-xml")

    def test_pdf_uses_ocr_when_text_layer_is_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "resume.pdf"
            path.write_bytes(b"%PDF-1.7\n% image-only fixture\n")
            source = discover_documents([str(path)], "tenant-1", "run-1")[0]

            with (
                patch("cv_intelligence_worker.parsing._run_pdftotext", return_value=""),
                patch(
                    "cv_intelligence_worker.parsing._run_pdf_ocr",
                    return_value="Family name: Attar\nFirst names: Ayman\nEmail: candidate@example.com",
                ),
            ):
                document = parse_document(source)

            self.assertEqual(document.parser_name, "tesseract-ocr")
            self.assertIn("Ayman", document.raw_text)
            self.assertIn("PDF text layer was empty; used OCR fallback", document.warnings)

    def test_pdf_discards_binary_embedded_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "resume.pdf"
            path.write_bytes(b"%PDF-1.7\ncompressed fixture\n")
            source = discover_documents([str(path)], "tenant-1", "run-1")[0]

            with (
                patch("cv_intelligence_worker.parsing._run_pdftotext", return_value=""),
                patch("cv_intelligence_worker.parsing._run_pdf_ocr", side_effect=FileNotFoundError("OCR unavailable")),
                patch("cv_intelligence_worker.parsing.extract_pdf_text_from_bytes", return_value="2Ê»t½\\Rû\x07\x01binary"),
            ):
                document = parse_document(source)

            self.assertEqual(document.raw_text, "")
            self.assertTrue(any("OCR unavailable" in warning for warning in document.warnings))
            self.assertIn("Embedded PDF parser produced non-text bytes and was discarded", document.warnings)
            self.assertIn("No extractable text found in PDF", document.warnings)


if __name__ == "__main__":
    unittest.main()
