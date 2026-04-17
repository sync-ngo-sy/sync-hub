from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path

from cv_intelligence_worker.discovery import discover_documents
from cv_intelligence_worker.parsing import parse_document


class ParsingTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
