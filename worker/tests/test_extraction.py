from __future__ import annotations

import unittest
from unittest.mock import patch

from cv_intelligence_worker.candidate_extraction import build_candidate_prompt, build_candidate_system_prompt, profile_from_extraction
from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.extraction import classify_job_family_with_llm, extract_candidate_profile, heuristic_extract_profile
from cv_intelligence_worker.llm import LLMResponseError
from cv_intelligence_worker.llm_models import CandidateExtraction, JobFamily, JobFamilyExtraction
from cv_intelligence_worker.schema import DocumentSource, DocumentText


class ExtractionTests(unittest.TestCase):
    def _source(self, document_id: str = "doc-test") -> DocumentSource:
        return DocumentSource(
            tenant_id="tenant-1",
            source_path="/tmp/resume.txt",
            source_type="file",
            original_filename="resume.txt",
            mime_type="text/plain",
            document_id=document_id,
            document_sha256=f"{document_id}-sha",
            ingestion_run_id="run-test",
        )

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

    def test_email_identity_is_normalized_for_candidate_id(self) -> None:
        first_source = DocumentSource(
            tenant_id="tenant-1",
            source_path="/tmp/resume-a.txt",
            source_type="file",
            original_filename="resume-a.txt",
            mime_type="text/plain",
            document_id="doc-email-a",
            document_sha256="email-a",
            ingestion_run_id="run-email-a",
        )
        second_source = DocumentSource(
            tenant_id="tenant-1",
            source_path="/tmp/resume-b.txt",
            source_type="file",
            original_filename="resume-b.txt",
            mime_type="text/plain",
            document_id="doc-email-b",
            document_sha256="email-b",
            ingestion_run_id="run-email-b",
        )
        first = heuristic_extract_profile(
            first_source,
            DocumentText(
                source=first_source,
                raw_text="Jane Doe\nBackend Engineer\nJane.Doe@Example.COM\nPython",
                parser_name="plain-text",
                parser_version="1.0.0",
            ),
        )
        second = heuristic_extract_profile(
            second_source,
            DocumentText(
                source=second_source,
                raw_text="Jane Doe\nBackend Engineer\njane.doe@example.com\nPython",
                parser_name="plain-text",
                parser_version="1.0.0",
            ),
        )
        self.assertEqual(first.email, "jane.doe@example.com")
        self.assertEqual(first.candidate_id, second.candidate_id)

    def test_llm_extraction_uses_validated_output(self) -> None:
        source = self._source("doc-retry")
        document = DocumentText(
            source=source,
            raw_text="Jane Doe\nSenior Backend Engineer\njane@example.com\nPython",
            parser_name="plain-text",
            parser_version="2.0.0",
        )
        config = WorkerConfig(
            extraction_model="test-model",
            extraction_provider="openai-compatible",
            extraction_max_attempts=2,
            job_family_provider="rules",
        )

        with patch("cv_intelligence_worker.extraction.LLMClient.parse") as parse_mock:
            parse_mock.return_value = CandidateExtraction(
                name="Jane Doe",
                current_title="Senior Backend Engineer",
                headline="Senior Backend Engineer",
                location=None,
                email="jane@example.com",
                phone=None,
                links=[],
                years_experience=None,
                seniority="senior",
                role_tags=["backend"],
                skills=["Python"],
                languages=[],
                certifications=[],
                experience=[],
                education=[],
                projects=[],
                summary="Senior backend engineer.",
            )
            profile = extract_candidate_profile(source, document, config)

        self.assertEqual(profile.name, "Jane Doe")
        self.assertEqual(profile.email, "jane@example.com")
        self.assertIs(parse_mock.call_args.kwargs["response_model"], CandidateExtraction)

    def test_llm_extraction_does_not_use_heuristic_fallback_on_client_error(self) -> None:
        source = self._source("doc-no-fallback")
        document = DocumentText(
            source=source,
            raw_text="Jane Doe\nSenior Backend Engineer\njane@example.com\nPython",
            parser_name="plain-text",
            parser_version="2.0.0",
        )
        config = WorkerConfig(
            extraction_model="test-model",
            extraction_provider="openai-compatible",
            extraction_max_attempts=2,
            allow_heuristic_fallback=True,
            job_family_provider="rules",
        )

        with (
            patch("cv_intelligence_worker.extraction.LLMClient.parse") as parse_mock,
            patch("cv_intelligence_worker.extraction.heuristic_extract_profile") as heuristic_mock,
        ):
            parse_mock.side_effect = LLMResponseError("model stayed down")
            with self.assertRaises(LLMResponseError):
                extract_candidate_profile(source, document, config)

        self.assertEqual(parse_mock.call_count, 1)
        heuristic_mock.assert_not_called()

    def test_job_family_classification_uses_taxonomy_validated_output(self) -> None:
        source = self._source("doc-job-family")
        document = DocumentText(
            source=source,
            raw_text="Jane Doe\nSenior Backend Engineer\njane@example.com\nPython PostgreSQL APIs",
            parser_name="plain-text",
            parser_version="2.0.0",
        )
        profile = heuristic_extract_profile(source, document)
        config = WorkerConfig(extraction_model="test-model", job_family_model="test-model")

        with patch("cv_intelligence_worker.extraction.LLMClient.parse") as parse_mock:
            parse_mock.return_value = JobFamilyExtraction(
                job_family=JobFamily("Backend Engineering"),
                confidence=0.95,
                rationale="Backend title and API skills.",
                matched_role_tags=["backend"],
                matched_skills=["Python", "PostgreSQL"],
                alternate_job_family=None,
            )
            classified = classify_job_family_with_llm(profile, config)

        self.assertEqual(classified.metadata["job_family"], "Backend Engineering")
        self.assertEqual(classified.metadata["job_family_source"], "llm")
        self.assertIs(parse_mock.call_args.kwargs["response_model"], JobFamilyExtraction)

    def test_job_family_classification_rejects_unsupported_evidence(self) -> None:
        source = self._source("doc-job-family-evidence")
        document = DocumentText(
            source=source,
            raw_text="Jane Doe\nSenior Backend Engineer\njane@example.com\nPython PostgreSQL APIs",
            parser_name="plain-text",
            parser_version="2.0.0",
        )
        profile = heuristic_extract_profile(source, document)
        config = WorkerConfig(extraction_model="test-model", job_family_model="test-model")

        with patch("cv_intelligence_worker.extraction.LLMClient.parse") as parse_mock:
            parse_mock.return_value = JobFamilyExtraction(
                job_family=JobFamily("Backend Engineering"),
                confidence=0.95,
                rationale="Backend title and invented skill.",
                matched_role_tags=["backend"],
                matched_skills=["Invented Framework"],
                alternate_job_family=None,
            )
            classified = classify_job_family_with_llm(profile, config)

        self.assertEqual(classified.metadata["job_family_llm_status"], "rejected")
        self.assertEqual(classified.metadata["job_family_review_status"], "needs_review")

    def test_missing_extraction_model_raises_instead_of_using_heuristics(self) -> None:
        source = self._source("doc-model-required")
        document = DocumentText(
            source=source,
            raw_text="Jane Doe\nSenior Backend Engineer\njane@example.com\nPython",
            parser_name="plain-text",
            parser_version="2.0.0",
        )
        config = WorkerConfig(extraction_model="", allow_heuristic_fallback=True)

        with patch("cv_intelligence_worker.extraction.heuristic_extract_profile") as heuristic_mock:
            with self.assertRaisesRegex(RuntimeError, "extraction model is not configured"):
                extract_candidate_profile(source, document, config)

        heuristic_mock.assert_not_called()

    def test_llm_profile_can_be_accepted_without_contact_details(self) -> None:
        source = self._source("doc-no-contact")
        document = DocumentText(
            source=source,
            raw_text="Jane Doe\nSenior Backend Engineer\nBuilt Python APIs and PostgreSQL systems.",
            parser_name="plain-text",
            parser_version="2.0.0",
        )
        profile = profile_from_extraction(
            source,
            document,
            CandidateExtraction.model_validate({
                "name": "Jane Doe",
                "current_title": "Senior Backend Engineer",
                "headline": "Senior Backend Engineer",
                "location": None,
                "email": None,
                "phone": None,
                "links": [],
                "years_experience": 8,
                "seniority": "senior",
                "role_tags": ["backend"],
                "skills": ["Python", "PostgreSQL", "APIs"],
                "experience": [],
                "education": [],
                "projects": [],
                "languages": [],
                "certifications": [],
                "summary": "Senior backend engineer building Python APIs and PostgreSQL systems.",
            }),
        )

        self.assertEqual(profile.name, "Jane Doe")
        self.assertIn("contact", profile.missing_fields)

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

    def test_structured_prompt_uses_labeled_sections_for_llm_extraction(self) -> None:
        source = DocumentSource(
            tenant_id="tenant-1",
            source_path="/tmp/resume.pdf",
            source_type="file",
            original_filename="resume.pdf",
            mime_type="application/pdf",
            document_id="doc-3",
            document_sha256="ghi",
            ingestion_run_id="run-3",
        )
        document = DocumentText(
            source=source,
            raw_text="""Jane Doe
Frontend Developer

Summary
Frontend developer building product experiences.
08/2024 - Present
Montreal, Canada

Work Experience
Frontend Developer, Example Agency
Built responsive product pages and campaign experiences.

Education
Digital Banking Training, Example Bank
09/2021 - 09/2021
Damascus, Syria
""",
            parser_name="pdftotext-raw",
            parser_version="2.0.0",
        )

        prompt = build_candidate_prompt(document)
        system_prompt = build_candidate_system_prompt()

        self.assertIn("<EXPERIENCE>", prompt["sectioned_cv_text"])
        self.assertIn("</EXPERIENCE>", prompt["sectioned_cv_text"])
        self.assertIn("<EDUCATION>", prompt["sectioned_cv_text"])
        self.assertIn("</EDUCATION>", prompt["sectioned_cv_text"])
        self.assertIn("<PRE_EXPERIENCE_DATE_HINTS>", prompt["sectioned_cv_text"])
        self.assertIn("</PRE_EXPERIENCE_DATE_HINTS>", prompt["sectioned_cv_text"])
        self.assertIn(
            "Do not use education, certifications, training, or course dates as work experience dates.",
            system_prompt,
        )
        self.assertIn("location must be a real geographic city, state, or country explicitly stated in the CV.", system_prompt)
        self.assertIn("Normalize location to a canonical City, Country form when the place is clear from the CV.", system_prompt)
        self.assertIn("Output schema:", system_prompt)

    def test_merge_extracted_profile_rejects_non_geographic_location(self) -> None:
        source = DocumentSource(
            tenant_id="tenant-1",
            source_path="/tmp/resume.pdf",
            source_type="file",
            original_filename="resume.pdf",
            mime_type="application/pdf",
            document_id="doc-4",
            document_sha256="jkl",
            ingestion_run_id="run-4",
        )
        document = DocumentText(
            source=source,
            raw_text="""Jane Doe
Frontend Developer
jane@example.com +1 555 0100 Damascus, Syria

Summary
Frontend developer with product and campaign experience.
""",
            parser_name="pdftotext-raw",
            parser_version="2.0.0",
        )

        with patch("cv_intelligence_worker.extraction.heuristic_extract_profile") as heuristic_mock:
            merged = profile_from_extraction(
                source,
                document,
                CandidateExtraction.model_validate({
                    "name": "Jane Doe",
                    "current_title": "Frontend Developer",
                    "headline": "Frontend Developer",
                    "location": "ERP, CRM",
                    "email": "jane@example.com",
                    "phone": "+1 555 0100",
                    "links": [],
                    "years_experience": 0,
                    "seniority": "mid",
                    "role_tags": ["frontend"],
                    "skills": ["React"],
                    "languages": [],
                    "certifications": [],
                    "experience": [],
                    "education": [],
                    "projects": [],
                    "summary": "Frontend developer with product and campaign experience.",
                }),
            )

        heuristic_mock.assert_not_called()
        self.assertEqual(merged.location, "")

    def test_project_based_profile_is_not_missing_experience(self) -> None:
        source = self._source("doc-project-profile")
        document = DocumentText(
            source=source,
            raw_text=(
                "Daniel Alzelaa Backend Developer SpringBoot Node.js projects "
                "Freelancing Platform Job Seekers Platform E-commerce Online Store "
            )
            * 80,
            parser_name="pdftotext-raw",
            parser_version="2.0.0",
        )

        profile = profile_from_extraction(
            source,
            document,
            CandidateExtraction.model_validate({
                "name": "Daniel Alzelaa",
                "current_title": "Backend Developer",
                "headline": "Information Technology Engineering | Software Engineering",
                "location": "",
                "email": "daniel@example.com",
                "phone": "+963935276853",
                "links": [],
                "years_experience": 0,
                "seniority": "junior",
                "role_tags": ["backend"],
                "skills": ["Java", "SpringBoot", "Node.js", "MongoDB", "Git", "SQL"],
                "languages": [],
                "certifications": [],
                "experience": [],
                "education": [
                    {
                        "institution": "Arabic International University Syria",
                        "degree": "Bachelor's degree",
                        "field": "Information Technology Engineering major in Software Engineering",
                        "start_date": "2019-07",
                        "end_date": "2024-09",
                        "description": "",
                    }
                ],
                "projects": [
                    {"name": "Freelancing Platform", "description": "SpringBoot microservices platform.", "technologies": ["SpringBoot"]},
                    {"name": "Job Seekers Platform", "description": "Node.js backend platform.", "technologies": ["Node.js"]},
                    {"name": "E-commerce Online Store", "description": "Online store backend.", "technologies": ["Node.js"]},
                ],
                "summary": "Motivated backend developer specializing in SpringBoot and Node.js.",
            }),
        )

        self.assertNotIn("experience", profile.missing_fields)
        self.assertGreaterEqual(profile.confidence, 0.85)

    def test_active_student_profile_gets_student_title(self) -> None:
        source = self._source("doc-student-profile")
        document = DocumentText(
            source=source,
            raw_text=(
                "Bader Ghabra Java Python C# ASP.NET Core Damascus "
                "Bachelor's Degree in Software Engineering Syrian Private University 2019 Present 5th year "
            )
            * 45,
            parser_name="pdftotext-raw",
            parser_version="2.0.0",
        )

        profile = profile_from_extraction(
            source,
            document,
            CandidateExtraction.model_validate({
                "name": "Bader Ghabra",
                "current_title": "",
                "headline": "",
                "location": "Damascus, Syria",
                "email": "bader@example.com",
                "phone": "(+963) 958906510",
                "links": [],
                "years_experience": 0,
                "seniority": "unclassified",
                "role_tags": ["backend", "frontend"],
                "skills": ["Java", "Python", "C#", "ASP.NET Core", "HTML", "CSS", "JavaScript"],
                "languages": [],
                "certifications": [],
                "experience": [],
                "education": [
                    {
                        "institution": "Directorate of Damascus Countryside Governorate",
                        "degree": "",
                        "field": "",
                        "start_date": None,
                        "end_date": None,
                        "description": "Final grade: 76%",
                    }
                ],
                "projects": [],
                "summary": "",
            }),
        )

        self.assertEqual(profile.current_title, "Software Engineering Student")
        self.assertNotIn("current_title", profile.missing_fields)
        self.assertNotIn("experience", profile.missing_fields)
        self.assertGreaterEqual(profile.confidence, 0.8)

    def test_heuristic_extractor_recovers_embedded_layout_sections(self) -> None:
        source = DocumentSource(
            tenant_id="tenant-1",
            source_path="/tmp/layout-resume.pdf",
            source_type="file",
            original_filename="layout-resume.pdf",
            mime_type="application/pdf",
            document_id="doc-layout",
            document_sha256="layout",
            ingestion_run_id="run-layout",
        )
        document = DocumentText(
            source=source,
            raw_text="""ABD ALRHMAN ABOUKALAM
+963968084262 Backend & DevOps Engineer with over 3 years of experience in Laravel and Docker.
candidate@example.com architecture principles and clean APIs.
Portfolio data processing and microservices. Seeking a Backend or DevOps role.
Damascus-Syria
www.linkedin.com/in/abd-alrhman-ak WORK EXPERIENCE
R-link
Backend & DevOps Engineer
September 2023 - Present
Engineered scalable Laravel services and CI/CD pipelines.
SKILLS
Laravel, Docker, Kubernetes, AWS, SQL, REST APIs
EDUCATION
Damascus University
Bachelor in Software Engineering
2018 - 2022
""",
            parser_name="pdftotext-layout",
            parser_version="2.0.0",
        )

        profile = heuristic_extract_profile(source, document)

        expected = {
            "name": profile.name == "Abd Alrhman Aboukalam",
            "title": profile.current_title == "Backend & DevOps Engineer",
            "email": profile.email == "candidate@example.com",
            "phone": profile.phone == "+963968084262",
            "location": profile.location == "Damascus, Syria",
            "experience": len(profile.experience) == 1 and profile.experience[0].company == "R-link",
            "skills": {"Laravel", "Docker", "Kubernetes", "AWS", "SQL", "REST APIs"}.issubset(set(profile.skills)),
            "education": len(profile.education) == 1 and profile.education[0].institution == "Damascus University",
        }
        accuracy = sum(expected.values()) / len(expected)
        self.assertGreaterEqual(accuracy, 0.99)
        self.assertGreaterEqual(profile.confidence, 0.8)
        self.assertEqual(profile.missing_fields, [])

    def test_complete_profile_scores_99_percent_confidence(self) -> None:
        source = DocumentSource(
            tenant_id="tenant-1",
            source_path="/tmp/complete-resume.txt",
            source_type="file",
            original_filename="complete-resume.txt",
            mime_type="text/plain",
            document_id="doc-complete",
            document_sha256="complete",
            ingestion_run_id="run-complete",
        )
        long_scope = (
            "Designed production-grade machine learning systems, owned model monitoring, improved retrieval quality, "
            "partnered with product teams, mentored engineers, and documented reliable deployment practices. "
        )
        document = DocumentText(
            source=source,
            raw_text=f"""Alex Morgan
Senior Machine Learning Engineer
alex.morgan@example.com | +1 555 111 2222 | San Francisco, United States | linkedin.com/in/alexmorgan

Summary
Senior machine learning engineer with eight years of experience building ranking, retrieval, and parsing systems for hiring platforms. {long_scope}

Experience
Senior Machine Learning Engineer - Acme AI | Jan 2021 - Present, San Francisco, United States
{long_scope * 3}
Machine Learning Engineer - Data Labs | Jan 2018 - Dec 2020, San Francisco, United States
{long_scope * 3}

Education
Stanford University
M.S. Computer Science
2015 - 2017

Skills
Python, SQL, AWS, Docker, Kubernetes, PostgreSQL, Pandas, NumPy

Projects
CV Parser Evaluation Harness
Built labeled regression tests for resume extraction quality.

Certifications
AWS Certified Machine Learning Specialty

Languages
English
""",
            parser_name="plain-text",
            parser_version="2.0.0",
        )

        profile = heuristic_extract_profile(source, document)

        checks = [
            profile.name == "Alex Morgan",
            profile.current_title == "Senior Machine Learning Engineer",
            profile.email == "alex.morgan@example.com",
            profile.phone == "+1 555 111 2222",
            profile.location == "San Francisco, United States",
            len(profile.experience) == 2,
            len(profile.education) == 1,
            len(profile.skills) >= 6,
            profile.years_experience >= 7,
            profile.role_tags and profile.seniority in {"senior", "staff-plus"},
        ]
        self.assertGreaterEqual(sum(checks) / len(checks), 0.99)
        self.assertGreaterEqual(profile.confidence, 0.99)


if __name__ == "__main__":
    unittest.main()
