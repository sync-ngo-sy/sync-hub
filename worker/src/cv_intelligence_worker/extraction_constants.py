from __future__ import annotations

import re


EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(\+\d[\d\s().-]{7,}\d|(?<!\d)0\d[\d\s().-]{7,}\d(?!\d))")
URL_RE = re.compile(r"(?:https?://|www\.)\S+|(?:linkedin|github|gitlab)\.com/\S+", re.IGNORECASE)
DATE_RANGE_RE = re.compile(
    r"(?P<start>[A-Za-z]{3,9}\s+\d{4}|\d{1,2}/\d{4}|\d{1,2}-\d{1,2}-\d{4}|\d{4})\s*[-–]\s*(?P<end>Present|Current|Now|Until\s+now|Till\s+now|[A-Za-z]{3,9}\s+\d{4}|\d{1,2}/\d{4}|\d{1,2}-\d{1,2}-\d{4}|\d{4})",
    re.IGNORECASE,
)
YEAR_RANGE_RE = re.compile(r"\b(?:19|20)\d{2}\b")
COMPANY_HINT_RE = re.compile(
    r"\b(inc|llc|ltd|corp|company|bank|agency|group|systems|solutions|suite|university|college|hospital|labs|studio|technologies|technology|soft|health)\b",
    re.IGNORECASE,
)
LOCATION_HINT_RE = re.compile(r"^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$")
NOISE_LINE_RE = re.compile(r"^(achievements/?tasks|responsibilities|contact\s*:?\s*-?)$", re.IGNORECASE)
JOB_TITLE_HINT_RE = re.compile(
    r"\b(developer|engineer|designer|manager|analyst|consultant|administrator|architect|specialist|devops|qa|tester|lead|frontend|front-end|backend|back-end|full[\s-]?stack|ui/ux)\b",
    re.IGNORECASE,
)
SOCIAL_NOISE_RE = re.compile(r"\b(?:linkedin|github|gitlab|portfolio|behance|dribbble)\b", re.IGNORECASE)
PAGE_NOISE_RE = re.compile(r"^page\s+\d+\s+of\s+\d+$", re.IGNORECASE)

NON_NAME_TOKENS = {
    "adaptability",
    "adobe",
    "agile",
    "communication",
    "contact",
    "figma",
    "general",
    "management",
    "multitasking",
    "organization",
    "problem",
    "project",
    "skills",
    "software",
    "solving",
    "team",
    "teamwork",
    "time",
}

KNOWN_CITY_LOCATIONS = {
    "aleppo": "Aleppo, Syria",
    "cairo": "Cairo, Egypt",
    "damascus": "Damascus, Syria",
    "damscus": "Damascus, Syria",
    "dubai": "Dubai, United Arab Emirates",
    "montreal": "Montreal, Canada",
}

TECH_KEYWORDS = [
    "ABP Framework",
    "Adobe Illustrator",
    "Adobe Photoshop",
    "Adobe XD",
    "AI",
    "APIs",
    "Python",
    "JavaScript",
    "TypeScript",
    "Node.js",
    "NestJS",
    "GraphQL",
    "React",
    "Angular",
    "Vue",
    "PostgreSQL",
    "MongoDB",
    "Redis",
    "Kafka",
    "Docker",
    "Kubernetes",
    "AWS",
    "Azure",
    "GCP",
    ".NET",
    "C#",
    "ASP.NET Core",
    "Laravel",
    "PHP",
    "REST APIs",
    "MySQL",
    "HTML",
    "CSS",
    "Tailwind",
    "Bootstrap",
    "Figma",
    "UI/UX",
    "SQL",
    "WordPress",
    "Webflow",
    "Shopify",
    "SEO",
    "Pandas",
    "NumPy",
    "Matplotlib",
]

SECTION_ALIASES = {
    "summary": {"summary", "about", "profile", "about me", "objective", "career objective", "professional summary", "contact profile"},
    "experience": {"experience", "experiences", "work experience", "working experience", "employment", "employment history", "work history", "professional experience", "professional background"},
    "education": {"education", "education and training", "educational background", "academic background", "academic qualification", "academic qualifications", "qualifications"},
    "skills": {"skills", "technical skills", "digital skills", "tech stack", "core competencies", "technical expertise", "technologies", "tools"},
    "projects": {"projects", "selected projects", "personal projects"},
    "certifications": {"certifications", "certificates", "courses", "training", "honors and awards", "awards"},
    "languages": {"languages", "language skills"},
    "leadership": {"leadership"},
    "interests": {"interests"},
}

SECTION_STOPPERS = {"summary", "experience", "education", "skills", "projects", "certifications", "languages", "leadership", "interests"}
SECTION_RENDER_ORDER = (
    "header",
    "summary",
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "languages",
    "leadership",
    "interests",
)

EXTRACTION_OUTPUT_SCHEMA = {
    "name": "string|null",
    "current_title": "string|null",
    "headline": "string|null",
    "location": "string|null",
    "email": "string|null",
    "phone": "string|null",
    "links": ["string"],
    "years_experience": "number|null",
    "seniority": "string|null",
    "role_tags": ["string"],
    "skills": ["string"],
    "languages": ["string"],
    "certifications": ["string"],
    "experience": [
        {
            "company": "string|null",
            "title": "string|null",
            "start_date": "string|null",
            "end_date": "string|null",
            "location": "string|null",
            "description": "string|null",
        }
    ],
    "education": [
        {
            "institution": "string|null",
            "degree": "string|null",
            "field": "string|null",
            "start_date": "string|null",
            "end_date": "string|null",
            "description": "string|null",
        }
    ],
    "projects": [
        {
            "name": "string|null",
            "description": "string|null",
            "technologies": ["string"],
        }
    ],
    "summary": "string|null",
}

SECTION_ALIAS_PATTERNS: list[tuple[str, str, re.Pattern[str]]] = [
    (
        section_name,
        alias,
        re.compile(rf"(?<![A-Za-z0-9]){re.escape(alias)}(?![A-Za-z0-9])", re.IGNORECASE),
    )
    for section_name, aliases in SECTION_ALIASES.items()
    for alias in sorted(aliases, key=len, reverse=True)
]
