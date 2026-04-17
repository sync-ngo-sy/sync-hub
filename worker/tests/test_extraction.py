from __future__ import annotations

import unittest

from cv_intelligence_worker.extraction import heuristic_extract_profile
from cv_intelligence_worker.schema import DocumentSource, DocumentText


class ExtractionTests(unittest.TestCase):
    def test_heuristic_extractor_pulls_key_fields(self) -> None:
        source = DocumentSource(
            tenant_id="tenant-1",
            source_path="/tmp/resume.txt",
            source_type="file",
            original_filename="resume.txt",
            mime_type="text/plain",
            document_id="doc-1",
            document_sha256="abc",
            ingestion_run_id="run-1",
        )
        document = DocumentText(
            source=source,
            raw_text="""Jane Doe
Senior Backend Engineer
jane@example.com
+1 555 000 0000
linkedin.com/in/janedoe

Summary
Senior backend engineer with 8 years of experience building APIs.

Experience
Senior Backend Engineer - Example Inc | 2020 - Present
Built GraphQL and Node.js APIs for logistics products.

Skills
Python, Node.js, GraphQL, PostgreSQL, Docker
""",
            parser_name="plain-text",
            parser_version="1.0.0",
        )
        profile = heuristic_extract_profile(source, document)
        self.assertEqual(profile.name, "Jane Doe")
        self.assertEqual(profile.email, "jane@example.com")
        self.assertIn("Node.js", profile.skills)
        self.assertGreaterEqual(profile.years_experience, 8.0)
        self.assertIn("backend", profile.role_tags)

    def test_heuristic_extractor_handles_two_column_pdf_style_text(self) -> None:
        source = DocumentSource(
            tenant_id="tenant-1",
            source_path="/tmp/resume.pdf",
            source_type="file",
            original_filename="resume.pdf",
            mime_type="application/pdf",
            document_id="doc-2",
            document_sha256="def",
            ingestion_run_id="run-2",
        )
        document = DocumentText(
            source=source,
            raw_text="""Alhassan HOKAN
Software Engineer
I am able to handle multiple tasks on a daily basis, and I use a creative approach to problem solve.
candidate@example.com +1 555 0100 Damascus, Syria
WORK EXPERIENCE
Full stack developer
E-Bridge company
09/2021 - 04/2023, Damascus, Syria
Involved in Bill Registry Project for the General Commission for Taxes and Fees.
Involved in Export APIs for Transaction between Banque Bemo Saudi Fransi and SEP.
Full stack Developer
Nano Health Suite
04/2023 - Present, Damascus, Syria
Nano is an Emirati software company that provides healthcare solutions.
PBM (Pharmacy benefits management): Work with the concepts of providers and insurance companies.
SKILLS
Asp.net Core
Microservices
ABP Framework
Angular
SQL Server database support
Docker containers
PERSONAL PROJECTS
Master Of Algos (08/2020 - 09/2020)
Visualization tool for sorting and path finding algorithms using react library.
EDUCATION
Software Engineering
HIAST (Higher institute for applied sciences and technology)
10/2016 - 09/2021
LANGUAGES
Arabic
English
""",
            parser_name="pdftotext-raw",
            parser_version="2.0.0",
        )
        profile = heuristic_extract_profile(source, document)
        self.assertEqual(profile.name, "Alhassan HOKAN")
        self.assertEqual(profile.location, "Damascus, Syria")
        self.assertGreaterEqual(len(profile.experience), 2)
        self.assertIn("Angular", profile.skills)
        self.assertIn("Docker", profile.skills)
        self.assertGreater(profile.years_experience, 0.0)
        self.assertEqual(profile.education[0].degree, "Software Engineering")


if __name__ == "__main__":
    unittest.main()
