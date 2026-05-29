from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import replace
from datetime import datetime, timezone

from .schema import CandidateProfile, ExperienceEntry
from .utils import compact_whitespace, dedupe_keep_order, skill_slugify, slugify


SKILL_ALIASES = {
    ".net-4": ".NET",
    ".net-4-0": ".NET",
    ".net-4-8": ".NET",
    ".net-5": ".NET",
    ".net-6": ".NET",
    ".net-7": ".NET",
    ".net-8": ".NET",
    ".net-core": ".NET",
    ".net-api": ".NET",
    ".net-ecosystem": ".NET",
    ".net-framework": ".NET",
    ".net-maui": ".NET MAUI",
    ".net-playwright": ".NET",
    ".net-zero-framework": ".NET",
    "abp-.net-framework": "ABP Framework",
    "ado-.net": "ADO.NET",
    "ado.net": "ADO.NET",
    "angularjs": "Angular",
    "api": "APIs",
    "apis": "APIs",
    "asp-net": "ASP.NET",
    "asp-net-api": "ASP.NET",
    "asp-net-core": "ASP.NET Core",
    "asp-net-core-api": "ASP.NET Core",
    "asp-net-core-c": "ASP.NET Core",
    "asp-net-core-identity": "ASP.NET Core",
    "asp-net-core-mvc": "ASP.NET Core",
    "asp-net-core-web-api": "ASP.NET Core",
    "asp-net-core-webapi": "ASP.NET Core",
    "asp-net-framework": "ASP.NET",
    "asp-net-mvc": "ASP.NET MVC",
    "asp-net-web-api": "ASP.NET",
    "asp-net-web-api2": "ASP.NET",
    "asp-net-web-forms": "ASP.NET",
    "aspnet-boilerplate": "ABP Framework",
    "aws": "AWS",
    "azure": "Azure",
    "azure-devops": "Azure DevOps",
    "bloc": "Bloc",
    "bloc-cubit": "Bloc/Cubit",
    "blazor.net": "Blazor",
    "blazor-net": "Blazor",
    "c#": "C#",
    "c-sharp": "C#",
    "c-sharp-.net": ".NET",
    "c-sharp-net": ".NET",
    "cpp": "C++",
    "css": "CSS",
    "css3": "CSS",
    "cyber-security": "Cybersecurity",
    "ci-cd": "CI/CD",
    "docker": "Docker",
    "docker-compose": "Docker Compose",
    "dotnet": ".NET",
    "dotnet-core": ".NET",
    "net-4": ".NET",
    "net-4-0": ".NET",
    "net-4-8": ".NET",
    "net-5": ".NET",
    "net-6": ".NET",
    "net-7": ".NET",
    "net-8": ".NET",
    "net-core": ".NET",
    "net-api": ".NET",
    "net-ecosystem": ".NET",
    "net-framework": ".NET",
    "net-maui": ".NET MAUI",
    "net-playwright": ".NET",
    "net-zero-framework": ".NET",
    "express-js": "Express",
    "express.js": "Express",
    "expressjs": "Express",
    "fast-api": "FastAPI",
    "firebase": "Firebase",
    "firestore": "Firestore",
    "flutter": "Flutter",
    "gcp": "Google Cloud",
    "gitlab": "GitLab",
    "git-github": "Git/GitHub",
    "golang": "Go",
    "graphql": "GraphQL",
    "html": "HTML",
    "html5": "HTML",
    "javascript": "JavaScript",
    "javascript-es6": "JavaScript",
    "javascript-es6+": "JavaScript",
    "jira": "Jira",
    "js": "JavaScript",
    "k8s": "Kubernetes",
    "mongodb": "MongoDB",
    "ms-office": "Microsoft Office",
    "mui": "MUI",
    "mysql": "MySQL",
    "nest-js": "NestJS",
    "nest.js": "NestJS",
    "nestjs": "NestJS",
    "next": "Next.js",
    "next-js": "Next.js",
    "next.js": "Next.js",
    "nextjs": "Next.js",
    "node": "Node.js",
    "node-js": "Node.js",
    "node.js": "Node.js",
    "nodejs": "Node.js",
    "openapi-swagger": "OpenAPI/Swagger",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "python": "Python",
    "react-js": "React",
    "react-native": "React Native",
    "react.js": "React",
    "reactjs": "React",
    "prompt-engineer": "Prompt Engineering",
    "reverse-engineer": "Reverse Engineering",
    "redux-toolkit": "Redux Toolkit",
    "rest": "REST APIs",
    "rest-api": "REST APIs",
    "rest-apis": "REST APIs",
    "restful": "REST APIs",
    "restful-api": "REST APIs",
    "restful-apis": "REST APIs",
    "rest-api": "REST APIs",
    "rest-apis": "REST APIs",
    "seo": "SEO",
    "sql": "SQL",
    "sql-server": "SQL Server",
    "swagger-openapi": "OpenAPI/Swagger",
    "tailwind": "Tailwind CSS",
    "tailwind-css": "Tailwind CSS",
    "tailwindcss": "Tailwind CSS",
    "ts": "TypeScript",
    "typescript": "TypeScript",
    "ui-ux": "UI/UX",
    "ux-ui": "UI/UX",
    "vb-.net": "VB.NET",
    "vba.net": "VB.NET",
    "vba-net": "VB.NET",
    "vb.net": "VB.NET",
    "microsoft-visual-studio-.net": "Visual Studio",
    "microsoft-visual-studio-net": "Visual Studio",
    "vue-js": "Vue",
    "vue.js": "Vue",
    "vuejs": "Vue",
    "websocket": "WebSocket",
    "websockets": "WebSocket",
    "windows-server-2012": "Windows Server",
    "windows-server-2016": "Windows Server",
    "windows-server-2019": "Windows Server",
    "windows-server-2022": "Windows Server",
    "wordpress": "WordPress",
}

SKILL_PHRASE_ALIASES = (
    (re.compile(r"\basp\.?\s*net\s*core\b", re.IGNORECASE), "ASP.NET Core"),
    (re.compile(r"\basp\.?\s*net\b", re.IGNORECASE), "ASP.NET"),
    (re.compile(r"\b(?:\.net|dotnet|net)\s*(?:core|framework|[45678](?:\.0|\.8)?|\+[58])\b", re.IGNORECASE), ".NET"),
    (re.compile(r"\bangular\s*(?:js|[0-9]+(?:\+)?)\b", re.IGNORECASE), "Angular"),
    (re.compile(r"\breact\s*(?:js|\.js|[0-9]+)\b", re.IGNORECASE), "React"),
    (re.compile(r"\bvue\s*(?:js|\.js|[0-9]+)\b", re.IGNORECASE), "Vue"),
    (re.compile(r"\bnext\s*(?:js|\.js|[0-9]+)\b", re.IGNORECASE), "Next.js"),
    (re.compile(r"\bnode\s*(?:js|\.js)\b", re.IGNORECASE), "Node.js"),
    (re.compile(r"\bexpress\s*(?:js|\.js)\b", re.IGNORECASE), "Express"),
    (re.compile(r"\bhtml\s*5\b", re.IGNORECASE), "HTML"),
    (re.compile(r"\bcss\s*3\b", re.IGNORECASE), "CSS"),
    (re.compile(r"\bphp\s*[578](?:\.\d+)?\+?\b", re.IGNORECASE), "PHP"),
    (re.compile(r"\bjava\s*8\b", re.IGNORECASE), "Java"),
    (re.compile(r"\brestful?\s+apis?\b|\brest\s+apis?\b|\brestapis\b", re.IGNORECASE), "REST APIs"),
    (re.compile(r"\bms\s*office\s*20\d{2}\b|\bmicrosoft office\b|\bms office\b", re.IGNORECASE), "Microsoft Office"),
    (re.compile(r"\bwindows server\s*(?:20\d{2}(?:[/, -]+20\d{2})*)?\b", re.IGNORECASE), "Windows Server"),
    (re.compile(r"\bvisual studio\s*20\d{2}\b", re.IGNORECASE), "Visual Studio"),
)

SKILL_DROP_EXACT = {
    "0934-650-619",
    "10",
    "achievements",
    "achievements-tasks",
    "abd-alrahman-karaja-6850bbb6",
    "accounting-manager",
    "and",
    "and-deliverables",
    "and-monitoring",
    "and-security",
    "back-end",
    "backend",
    "backend-developer",
    "computer-skills",
    "damascus",
    "damascus-dwaila",
    "damascus-governorate",
    "damascus-software-developer",
    "damascus-syria",
    "damascus-university-expected-nov-2025",
    "data-analyst",
    "front-end",
    "frontend",
    "full-stack",
    "government-employee",
    "https",
    "in",
    "linkedin",
    "office-manager",
    "programming-languages",
    "projects",
    "responsibilities",
    "skills",
    "soc-analyst",
    "soft-skills",
    "souccar-for-electronic-industries-sei",
    "sql-developer",
    "st-company",
    "syria",
    "technical-skills",
    "technologies",
    "tools",
    "web-developer",
    "which-are-currently-running",
    "with",
    "work",
    "www-linkedin-com",
    "designed",
}

SKILL_ROLE_ONLY_RE = re.compile(
    r"^(?:(?:junior|senior|sr|lead|mid(?:dle)?|full[-\s]?time|freelance)\s+)?"
    r"(?:(?:flutter|laravel|web|front[-\s]?end|back[-\s]?end|full[-\s]?stack|software|sql|soc|data|accounting|office|mobile|android|ios|php|react|node(?:\.js)?|\.net|asp\.net|ai)\s+)?"
    r"(?:developer|engineer|analyst|manager|consultant|designer|administrator)"
    r"(?:\s*\([^)]*\))?$",
    re.IGNORECASE,
)

SKILL_DATE_RANGE_RE = re.compile(
    r"^\s*(?:[A-Za-z]+\s+)?(?:19|20)\d{2}\s*[-–]\s*(?:present|current|(?:[A-Za-z]+\s+)?(?:19|20)\d{2})\s*$",
    re.IGNORECASE,
)
SKILL_CONTACT_RE = re.compile(r"@|https?://|www\.|(?:linkedin|github|gitlab)\.com/", re.IGNORECASE)

ROLE_PATTERNS = {
    "full-stack": ["full stack", "full-stack"],
    "mobile": ["mobile", "flutter", "android", "ios", "react native", "swift", "kotlin"],
    "frontend": ["frontend", "front-end", "front end", "react", "next.js", "angular", "vue", "html", "css", "ui/ux", "webflow"],
    "backend": ["backend", "back-end", "back end", "api", "microservice", "node.js", "nestjs", ".net", "asp.net", "django", "flask", "fastapi", "laravel"],
    "devops": ["devops", "sre", "terraform", "kubernetes", "docker", "ci/cd", "cloud infrastructure"],
    "data": ["data engineer", "analytics", "etl", "pandas", "numpy", "bi", "data analysis"],
    "ml": ["machine learning", "ml", "ai engineer", "llm", "tensorflow", "pytorch", "scikit-learn"],
    "qa": ["qa", "quality assurance", "automation testing", "test automation", "selenium"],
    "security": ["security", "cybersecurity", "siem", "soc", "threat detection", "penetration testing", "vulnerability"],
}

JOB_FAMILY_TAXONOMY_VERSION = "production-corpus-v1"

JOB_FAMILY_RULES = (
    (
        "Full-Stack Engineering",
        ("full-stack",),
        (
            "full stack",
            "full-stack",
        ),
        ("react", "node.js", "apis", "sql", "postgresql", "mongodb"),
    ),
    (
        "Backend Engineering",
        ("backend",),
        ("backend", "back-end", "api", "server", "platform"),
        ("node.js", "nestjs", "express", "java", "spring", "python", "django", "fastapi", "laravel", "php", "asp.net", ".net", "c#", "postgresql", "mysql", "mongodb", "redis", "rest apis", "graphql"),
    ),
    (
        "Frontend Engineering",
        ("frontend",),
        ("frontend", "front-end", "ui engineer", "web developer"),
        ("react", "next.js", "angular", "vue", "javascript", "typescript", "html", "css", "tailwind css", "bootstrap", "redux"),
    ),
    (
        "Mobile Engineering",
        ("mobile",),
        ("mobile", "android", "ios", "flutter", "react native"),
        ("flutter", "dart", "android", "ios", "swift", "kotlin", "react native", "firebase"),
    ),
    (
        "AI & Machine Learning",
        ("ml",),
        ("machine learning", "ml engineer", "ai engineer", "data scientist", "llm"),
        ("machine learning", "deep learning", "tensorflow", "pytorch", "scikit", "keras", "opencv", "nlp", "llm", "computer vision"),
    ),
    (
        "Data & Analytics",
        ("data",),
        ("data analyst", "data engineer", "business intelligence", "bi developer", "analytics"),
        ("sql", "power bi", "tableau", "excel", "pandas", "numpy", "etl", "data analysis", "data visualization"),
    ),
    (
        "Cloud, DevOps & SRE",
        ("devops",),
        ("devops", "sre", "site reliability", "cloud", "infrastructure"),
        ("docker", "kubernetes", "terraform", "aws", "azure", "google cloud", "gcp", "ci/cd", "linux", "jenkins", "ansible", "helm"),
    ),
    (
        "Cybersecurity",
        ("security",),
        ("security", "cyber", "soc", "penetration", "threat", "siem"),
        ("cybersecurity", "security", "soc operations", "siem", "penetration testing", "vulnerability", "threat detection", "incident response"),
    ),
    (
        "QA & Test Automation",
        ("qa",),
        ("qa", "quality assurance", "test automation", "tester"),
        ("selenium", "playwright", "cypress", "jest", "testing", "test automation", "quality assurance"),
    ),
    (
        "Product & Design",
        (),
        ("product designer", "ui/ux", "ux designer", "product manager"),
        ("figma", "ui/ux", "wireframing", "prototyping", "user research", "product management"),
    ),
    (
        "Software Engineering",
        ("generalist",),
        ("software", "developer", "engineer", "programmer"),
        ("git", "github", "apis", "problem solving", "javascript", "python", "sql"),
    ),
)

JOB_FAMILY_LABELS = tuple(rule[0] for rule in JOB_FAMILY_RULES) + ("Unclassified",)

ROLE_TAG_ALIASES = {
    "fullstack": "full-stack",
    "full-stack": "full-stack",
    "frontend": "frontend",
    "front-end": "frontend",
    "backend": "backend",
    "back-end": "backend",
    "mobile": "mobile",
    "devops": "devops",
    "sre": "devops",
    "data": "data",
    "ml": "ml",
    "ai": "ml",
    "qa": "qa",
    "security": "security",
    "cybersecurity": "security",
}

SENIORITY_ALIASES = {
    "entry-level": "junior",
    "entry-levels": "junior",
    "intern": "junior",
    "junior": "junior",
    "jr": "junior",
    "junior-level": "junior",
    "mid": "mid",
    "middle": "mid",
    "mid-level": "mid",
    "midlevel": "mid",
    "mid-senior": "senior",
    "senior": "senior",
    "sr": "senior",
    "sr.": "senior",
    "lead": "staff-plus",
    "principal": "staff-plus",
    "staff": "staff-plus",
    "architect": "staff-plus",
    "head": "staff-plus",
    "staff-plus": "staff-plus",
    "unclassified": "unclassified",
    "unknown": "unclassified",
}

ROLE_HINT_RE = re.compile(
    r"\b(front[\s-]?end|back[\s-]?end|full[\s-]?stack|mobile|flutter|android|ios|developer|engineer|architect|designer|manager|analyst|specialist|consultant|administrator|seo|security|devops|sre|qa)\b",
    re.IGNORECASE,
)
LOCATION_PATTERN = re.compile(r"^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$")
CONTACT_PATTERN = re.compile(r"@|https?://|linkedin|github|portfolio|\+\d")
DATE_FRAGMENT_RE = re.compile(r"\b(?:19|20)\d{2}\b")
YEARS_PATTERN = re.compile(
    r"\b(?P<count>\d+|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s+years?\b",
    re.IGNORECASE,
)
TITLE_VERB_RE = re.compile(r"\b(collaborated|implemented|developed|built|worked|improved|led|designed|optimized|conducted)\b", re.IGNORECASE)
DATE_RANGE_PATTERN = re.compile(
    r"(?P<start>(?:\d{1,2}/)?\d{4}|present|current)\s*[-–]\s*(?P<end>(?:\d{1,2}/)?\d{4}|present|current)",
    re.IGNORECASE,
)
SENIOR_SIGNAL_RE = re.compile(r"\b(senior|principal|staff|lead|architect|head of)\b", re.IGNORECASE)
JUNIOR_SIGNAL_RE = re.compile(r"\b(junior|intern|entry(?:\s|-)?level)\b", re.IGNORECASE)
MAX_REASONABLE_YEARS_EXPERIENCE = 80.0
GENERIC_EXPERIENCE_TITLE_RE = re.compile(
    r"\b(project leadership|client engagement|key achievements?|responsibilities|achievements?)\b",
    re.IGNORECASE,
)
WORK_EXPERIENCE_TITLE_RE = re.compile(
    r"\b(developer|engineer|specialist|manager|analyst|designer|consultant|administrator|architect|seo|security|devops|sre|qa|growth[\s-]?hacker)\b",
    re.IGNORECASE,
)
ACADEMIC_HINTS = (
    "information technology",
    "computer engineering",
    "software engineering",
    "artificial intelligence",
    "informatics",
    "bachelor",
    "degree",
    "student",
)
LOCATION_SEGMENT_PATTERN = re.compile(r"^[A-Za-z .'-]+$")
LOCATION_WORD_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
GEO_ACRONYMS = {"uae", "uk", "usa", "ksa"}
LOCATION_CONNECTOR_TOKENS = {"and", "of", "the", "al", "de", "la", "st", "saint"}
COUNTRY_ALIASES = {
    "bahrain": "Bahrain",
    "canada": "Canada",
    "egypt": "Egypt",
    "france": "France",
    "germany": "Germany",
    "iraq": "Iraq",
    "jordan": "Jordan",
    "ksa": "Saudi Arabia",
    "kuwait": "Kuwait",
    "lebanon": "Lebanon",
    "oman": "Oman",
    "qatar": "Qatar",
    "saudi-arabia": "Saudi Arabia",
    "syria": "Syria",
    "syrian-arab-republic": "Syria",
    "turkey": "Turkey",
    "uae": "United Arab Emirates",
    "uk": "United Kingdom",
    "united-arab-emirates": "United Arab Emirates",
    "united-kingdom": "United Kingdom",
    "united-states": "United States",
    "usa": "United States",
}
CITY_ALIASES = {
    "aleppo": "Aleppo",
    "cairo": "Cairo",
    "damascus": "Damascus",
    "damscus": "Damascus",
    "montreal": "Montreal",
}
IMPLICIT_COUNTRY_BY_CITY = {
    "aleppo": "Syria",
    "cairo": "Egypt",
    "damascus": "Syria",
    "montreal": "Canada",
}
BLOCKED_LOCATION_TOKENS = {
    "agency",
    "adobe",
    "ai",
    "api",
    "apis",
    "app",
    "application",
    "applications",
    "amos",
    "aws",
    "backend",
    "bank",
    "company",
    "consultant",
    "crm",
    "cms",
    "css",
    "dashboard",
    "data",
    "department",
    "developer",
    "devops",
    "docker",
    "engineer",
    "erp",
    "figma",
    "first",
    "foundation",
    "frontend",
    "full",
    "github",
    "groups",
    "growth",
    "hacker",
    "html",
    "hybrid",
    "javascript",
    "kubernetes",
    "lab",
    "labs",
    "laravel",
    "lead",
    "linkedin",
    "manager",
    "marketing",
    "nationality",
    "node",
    "onsite",
    "on",
    "php",
    "platform",
    "pressure",
    "project",
    "projects",
    "evacuation",
    "python",
    "qa",
    "aid",
    "react",
    "remote",
    "sales",
    "seo",
    "software",
    "spss",
    "specialist",
    "sql",
    "stack",
    "suite",
    "sketch",
    "system",
    "systems",
    "team",
    "technical",
    "technology",
    "technologies",
    "tools",
    "university",
    "ux",
    "ui",
    "web",
    "wordpress",
    "work",
}
BLOCKED_LOCATION_PHRASES = {
    "full-time",
    "part-time",
    "on-site",
    "work from home",
}


def canonical_skill(value: object) -> str:
    if not isinstance(value, str):
        return ""
    normalized = compact_whitespace(value)
    if not normalized:
        return ""
    normalized = re.sub(r"^[▪•●◦\-*]+\s*", "", normalized).strip(" ;:,")
    normalized = re.sub(
        r"^(?:good at|basic knowledge of|basic knowledge in|knowledge of|familiarity with|proficiency in|experience in)\s*:?\s+",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(r"^(?:backend|frontend)\s*:\s+", "", normalized, flags=re.IGNORECASE)
    slug = skill_slugify(normalized)
    if slug in SKILL_DROP_EXACT:
        return ""
    if SKILL_CONTACT_RE.search(normalized) and slug not in {"github", "gitlab"}:
        return ""
    if re.fullmatch(r"[\d\W_]+", normalized):
        return ""
    if re.fullmatch(r"(?:19|20)\d{2}(?:\s*[-/.]\s*\d{1,2})?\.?", normalized):
        return ""
    if SKILL_DATE_RANGE_RE.match(normalized):
        return ""
    if normalized.count("!") >= 2:
        return ""
    if slug in SKILL_ALIASES:
        return SKILL_ALIASES[slug]
    for pattern, canonical in SKILL_PHRASE_ALIASES:
        if pattern.search(normalized):
            return canonical
    if SKILL_ROLE_ONLY_RE.match(normalized):
        return ""
    if len(normalized) > 90:
        return ""
    if normalized.isupper() and len(normalized) <= 5:
        return normalized
    return normalized


def _normalize_role_tag(value: object) -> str:
    if not isinstance(value, str):
        return ""
    token = slugify(value)
    return ROLE_TAG_ALIASES.get(token, "")


def _normalize_seniority_label(value: object) -> str:
    if not isinstance(value, str):
        return "unclassified"
    lowered = compact_whitespace(value).lower()
    if not lowered:
        return "unclassified"
    token = slugify(lowered)
    if token in SENIORITY_ALIASES:
        return SENIORITY_ALIASES[token]
    if any(term in lowered for term in ("principal", "staff", "lead", "architect", "head of")):
        return "staff-plus"
    if "senior" in lowered or lowered.startswith("sr"):
        return "senior"
    if "mid" in lowered:
        return "mid"
    if "junior" in lowered or "intern" in lowered or "entry" in lowered:
        return "junior"
    return "unclassified"


def _year_from_fragment(value: str) -> int | None:
    match = re.search(r"(\d{4})", value)
    if not match:
        return None
    year = int(match.group(1))
    if 1980 <= year <= datetime.now(timezone.utc).year + 1:
        return year
    return None


MONTH_NAME_TO_NUMBER = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

NUMBER_WORDS = {
    "one": 1.0,
    "two": 2.0,
    "three": 3.0,
    "four": 4.0,
    "five": 5.0,
    "six": 6.0,
    "seven": 7.0,
    "eight": 8.0,
    "nine": 9.0,
    "ten": 10.0,
}


def _month_index(year: int, month: int) -> int:
    return year * 12 + (month - 1)


def _month_index_from_fragment(value: str, *, default_month: int = 1) -> int | None:
    normalized = compact_whitespace(value).lower()
    if not normalized:
        return None
    current = datetime.now(timezone.utc)
    if normalized in {"present", "current"}:
        return _month_index(current.year, current.month)

    full_date_match = re.search(r"\b\d{1,2}/(\d{1,2})/(\d{4})\b", normalized)
    if full_date_match:
        month = int(full_date_match.group(1))
        year = int(full_date_match.group(2))
        if 1 <= month <= 12 and 1980 <= year <= current.year + 1:
            return _month_index(year, month)

    month_year_match = re.search(r"\b(\d{1,2})/(\d{4})\b", normalized)
    if month_year_match:
        month = int(month_year_match.group(1))
        year = int(month_year_match.group(2))
        if 1 <= month <= 12 and 1980 <= year <= current.year + 1:
            return _month_index(year, month)

    year_month_match = re.search(r"\b(\d{4})-(\d{1,2})\b", normalized)
    if year_month_match:
        year = int(year_month_match.group(1))
        month = int(year_month_match.group(2))
        if 1 <= month <= 12 and 1980 <= year <= current.year + 1:
            return _month_index(year, month)

    month_name_match = re.search(r"\b([a-z]{3,9})\s+(\d{4})\b", normalized)
    if month_name_match:
        month = MONTH_NAME_TO_NUMBER.get(month_name_match.group(1))
        year = int(month_name_match.group(2))
        if month and 1980 <= year <= current.year + 1:
            return _month_index(year, month)

    year = _year_from_fragment(normalized)
    if year:
        return _month_index(year, default_month)
    return None


def _is_title_like(value: str, *, allow_long: bool = False) -> bool:
    text = compact_whitespace(value)
    if not text:
        return False
    if "years of experience" in text.lower():
        return False
    if TITLE_VERB_RE.search(text):
        return False
    if CONTACT_PATTERN.search(text):
        return False
    if LOCATION_PATTERN.match(text):
        return False
    if text.lower().startswith("generated by "):
        return False
    if DATE_FRAGMENT_RE.search(text):
        return False
    if any(term in text.lower() for term in ACADEMIC_HINTS) and not ROLE_HINT_RE.search(text):
        return False
    max_words = 14 if allow_long else 10
    if len(text.split()) > max_words and not ROLE_HINT_RE.search(text):
        return False
    return bool(ROLE_HINT_RE.search(text))


def _is_countable_experience_entry(entry: ExperienceEntry) -> bool:
    title = compact_whitespace(entry.title)
    if not title:
        return False
    if GENERIC_EXPERIENCE_TITLE_RE.search(title):
        return False
    if WORK_EXPERIENCE_TITLE_RE.search(title):
        return True
    return _is_title_like(title, allow_long=True)


def count_work_like_experience_entries(entries: list[ExperienceEntry]) -> int:
    return sum(1 for entry in entries if _is_countable_experience_entry(entry))


def has_dated_education_entries(profile: CandidateProfile) -> bool:
    return any(
        _year_from_fragment(entry.start_date or "") or _year_from_fragment(entry.end_date or "")
        for entry in profile.education
    )


def _titlecase_location_token(token: str) -> str:
    lowered = token.lower()
    if lowered in LOCATION_CONNECTOR_TOKENS:
        if lowered == "st":
            return "St"
        return lowered
    parts = re.split(r"([-'’])", token)
    rebuilt: list[str] = []
    for part in parts:
        if not part:
            continue
        if part in {"-", "'", "’"}:
            rebuilt.append(part)
            continue
        rebuilt.append(part[:1].upper() + part[1:].lower())
    return "".join(rebuilt)


def _split_location_segments(cleaned: str) -> list[str]:
    segments = [compact_whitespace(segment) for segment in cleaned.split(",") if compact_whitespace(segment)]
    if len(segments) != 1:
        return segments
    words = segments[0].split()
    for size in range(min(3, len(words) - 1), 0, -1):
        country_candidate = " ".join(words[-size:])
        if slugify(country_candidate) in COUNTRY_ALIASES:
            city_candidate = compact_whitespace(" ".join(words[:-size]))
            if city_candidate:
                return [city_candidate, country_candidate]
    return segments


def _canonical_location_segment(segment: str) -> str:
    cleaned = compact_whitespace(segment.strip(" -"))
    if not cleaned:
        return ""
    slug = slugify(cleaned)
    if slug in COUNTRY_ALIASES:
        return COUNTRY_ALIASES[slug]
    if slug in CITY_ALIASES:
        return CITY_ALIASES[slug]
    return " ".join(_titlecase_location_token(token) for token in cleaned.split())


def _is_location_segment(segment: str) -> bool:
    cleaned = compact_whitespace(segment.strip(" -"))
    if not cleaned:
        return False
    if not LOCATION_SEGMENT_PATTERN.match(cleaned):
        return False
    lowered = cleaned.lower()
    if any(phrase in lowered for phrase in BLOCKED_LOCATION_PHRASES):
        return False
    if ROLE_HINT_RE.search(cleaned) or WORK_EXPERIENCE_TITLE_RE.search(cleaned):
        return False
    words = LOCATION_WORD_RE.findall(cleaned)
    if not words or len(words) > 5:
        return False
    acronym = re.sub(r"[^A-Za-z]", "", cleaned).lower()
    if cleaned.isupper():
        return acronym in GEO_ACRONYMS
    for word in words:
        token = word.lower()
        if token in LOCATION_CONNECTOR_TOKENS:
            continue
        if token in BLOCKED_LOCATION_TOKENS:
            return False
    return True


def normalize_location(value: object) -> str:
    if not isinstance(value, str):
        return ""
    cleaned = compact_whitespace(value).strip(" |,-")
    if not cleaned:
        return ""
    if CONTACT_PATTERN.search(cleaned):
        return ""
    if DATE_FRAGMENT_RE.search(cleaned):
        return ""
    if len(cleaned) > 60:
        return ""
    if any(character in cleaned for character in ("/", "|", ";", ":")):
        return ""
    segments = _split_location_segments(cleaned)
    if not segments or len(segments) > 3:
        return ""
    canonical_segments: list[str] = []
    seen: set[str] = set()
    for segment in segments:
        canonical = _canonical_location_segment(segment)
        if not canonical or not _is_location_segment(canonical):
            return ""
        key = slugify(canonical)
        if key in seen:
            continue
        seen.add(key)
        canonical_segments.append(canonical)
    if not canonical_segments:
        return ""
    if len(canonical_segments) == 1:
        inferred_country = IMPLICIT_COUNTRY_BY_CITY.get(slugify(canonical_segments[0]))
        if inferred_country:
            canonical_segments.append(inferred_country)
    return ", ".join(canonical_segments)


def experience_years_from_entries(entries: list[ExperienceEntry]) -> float:
    ranges: list[tuple[int, int]] = []
    work_like_entries = [entry for entry in entries if _is_countable_experience_entry(entry)]
    for entry in work_like_entries or entries:
        start_month = _month_index_from_fragment(entry.start_date or "", default_month=1)
        end_text = (entry.end_date or "").lower()
        end_month = _month_index_from_fragment(end_text, default_month=12)
        if start_month is not None and end_month is not None and end_month >= start_month:
            ranges.append((start_month, end_month))
            continue
        merged = f"{entry.start_date or ''} - {entry.end_date or ''} {entry.description}"
        match = DATE_RANGE_PATTERN.search(merged)
        if not match:
            continue
        start_month = _month_index_from_fragment(match.group("start"), default_month=1)
        end_month = _month_index_from_fragment(match.group("end"), default_month=12)
        if start_month is not None and end_month is not None and end_month >= start_month:
            ranges.append((start_month, end_month))
    if not ranges:
        return 0.0
    ranges.sort()
    merged_ranges: list[tuple[int, int]] = []
    for start_month, end_month in ranges:
        if not merged_ranges or start_month > merged_ranges[-1][1] + 1:
            merged_ranges.append((start_month, end_month))
        else:
            previous_start, previous_end = merged_ranges[-1]
            merged_ranges[-1] = (previous_start, max(previous_end, end_month))
    total_months = sum((end_month - start_month + 1) for start_month, end_month in merged_ranges)
    return round(total_months / 12.0, 2)


def infer_years_experience(profile: CandidateProfile) -> float:
    explicit_years = profile.years_experience if profile.years_experience > 0 else 0.0
    range_years = experience_years_from_entries(profile.experience)
    haystack = f"{profile.summary}\n{profile.headline}\n{profile.raw_text}"
    regex_match = YEARS_PATTERN.search(haystack.lower())
    regex_years = 0.0
    if regex_match:
        count_text = regex_match.group("count").lower()
        if count_text.isdigit():
            regex_years = float(count_text)
        else:
            regex_years = NUMBER_WORDS.get(count_text, 0.0)
    valid_experience_count = count_work_like_experience_entries(profile.experience)
    has_dated_education = has_dated_education_entries(profile)

    candidates = [value for value in (range_years, regex_years) if value > 0]
    if explicit_years > 0:
        reference = max(candidates) if candidates else 0.0
        tolerance = 1.0 if valid_experience_count >= 2 else 5.0
        if has_dated_education:
            tolerance = min(tolerance, 1.0)
        if reference == 0.0 or explicit_years <= reference + tolerance:
            candidates.append(explicit_years)
    return min(MAX_REASONABLE_YEARS_EXPERIENCE, max(candidates, default=0.0))


def infer_seniority(profile: CandidateProfile, years_experience: float) -> str:
    explicit = _normalize_seniority_label(profile.seniority)
    haystack = f"{profile.current_title} {profile.headline} {' '.join(skill.lower() for skill in profile.skills)} {profile.summary}".lower()
    has_senior_signal = bool(SENIOR_SIGNAL_RE.search(haystack))
    has_junior_signal = bool(JUNIOR_SIGNAL_RE.search(haystack))
    experience_entry_count = len(profile.experience)

    if explicit != "unclassified":
        if explicit in {"senior", "staff-plus"} and years_experience <= 0 and not has_senior_signal:
            explicit = "mid" if experience_entry_count >= 2 else "unclassified"
        elif explicit in {"senior", "staff-plus"} and 0 < years_experience < 6:
            if not has_senior_signal:
                explicit = "mid"
        if explicit == "junior" and years_experience >= 4:
            if not has_junior_signal:
                explicit = "mid"
        return explicit

    if re.search(r"\b(principal|staff|lead|architect|head of)\b", haystack):
        return "staff-plus"
    if re.search(r"\bsenior\b", haystack) or years_experience >= 6:
        return "senior"
    if has_junior_signal or (0 < years_experience < 2):
        return "junior"
    if "mid" in haystack or years_experience >= 3:
        return "mid"
    return "unclassified"


def _role_signal_score(text: str, patterns: list[str], weight: float) -> float:
    normalized = text.lower()
    score = 0.0
    for pattern in patterns:
        expression = re.compile(rf"(^|[^a-z0-9+#.]){re.escape(pattern.lower())}([^a-z0-9+#.]|$)")
        if expression.search(normalized):
            score += weight
    return score


def infer_role_tags(profile: CandidateProfile) -> list[str]:
    scores: dict[str, float] = defaultdict(float)
    title = compact_whitespace(profile.current_title).lower()
    headline = compact_whitespace(profile.headline).lower()
    summary = compact_whitespace(profile.summary).lower()
    skills = " ".join(profile.skills).lower()
    experience = " ".join(f"{entry.title} {entry.company} {entry.description}" for entry in profile.experience).lower()

    for role, patterns in ROLE_PATTERNS.items():
        scores[role] += _role_signal_score(title, patterns, 6.0)
        scores[role] += _role_signal_score(headline, patterns, 4.0)
        scores[role] += _role_signal_score(skills, patterns, 2.5)
        scores[role] += _role_signal_score(experience, patterns, 1.75)
        scores[role] += _role_signal_score(summary, patterns, 1.25)

    for raw_tag in profile.role_tags:
        normalized = _normalize_role_tag(raw_tag)
        if normalized:
            scores[normalized] += 1.5

    if "engineer" in title and not scores:
        scores["backend"] += 1.0

    if not scores:
        return ["generalist"]

    top_score = max(scores.values())
    threshold = max(2.0, top_score * 0.45)
    ranked = [
        role
        for role, score in sorted(scores.items(), key=lambda item: (-item[1], item[0]))
        if score >= threshold
    ]
    return ranked or ["generalist"]


def infer_additional_skills(profile: CandidateProfile) -> list[str]:
    corpus = "\n".join(
        compact_whitespace(part)
        for part in (
            profile.current_title,
            profile.headline,
            profile.summary,
            profile.raw_text,
            " ".join(entry.title for entry in profile.experience),
            " ".join(project.name for project in profile.projects),
        )
        if isinstance(part, str) and part.strip()
    ).lower()
    inferred: list[str] = []
    for alias, canonical in sorted(SKILL_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        expression = re.compile(rf"(^|[^a-z0-9+#.]){re.escape(alias.lower())}([^a-z0-9+#.]|$)")
        if expression.search(corpus):
            inferred.append(canonical)
    return dedupe_keep_order(inferred)


def _contains_any(haystack: str, needles: tuple[str, ...]) -> bool:
    return any(needle and needle in haystack for needle in needles)


def infer_job_family(profile: CandidateProfile) -> tuple[str, float]:
    role_text = " ".join([*profile.role_tags, profile.current_title, profile.headline]).lower()
    title_text = " ".join([profile.current_title, profile.headline]).lower()
    skill_text = " ".join(profile.skills).lower()
    scores: dict[str, float] = {}

    for family, role_tags, title_signals, skill_signals in JOB_FAMILY_RULES:
        score = 0.0
        if _contains_any(role_text, role_tags):
            score += 90.0
        if _contains_any(title_text, title_signals):
            score += 55.0
        matched_skill_count = sum(1 for skill in skill_signals if skill in skill_text)
        score += min(60.0, matched_skill_count * 12.0)
        scores[family] = score

    if "backend" in profile.role_tags and "frontend" in profile.role_tags:
        scores["Full-Stack Engineering"] = max(scores.get("Full-Stack Engineering", 0.0), 120.0)

    family, score = max(scores.items(), key=lambda item: (item[1], item[0]))
    if score < 40.0:
        return "Unclassified", 0.0
    confidence = min(0.98, 0.55 + (score / 240.0))
    return family, round(confidence, 3)


def choose_current_title(profile: CandidateProfile) -> str:
    current_title = compact_whitespace(profile.current_title)
    headline = compact_whitespace(profile.headline)
    experience_titles = [
        compact_whitespace(entry.title)
        for entry in profile.experience
        if _is_title_like(entry.title)
    ]

    if _is_title_like(current_title):
        return current_title
    if _is_title_like(headline, allow_long=True) and len(headline.split()) <= 10:
        return headline
    if experience_titles:
        return experience_titles[0]
    if _is_title_like(headline, allow_long=True):
        return headline
    student_title = _student_title_from_education(profile)
    return current_title or student_title or (experience_titles[0] if experience_titles else "")


def _student_title_from_education(profile: CandidateProfile) -> str:
    for education in profile.education:
        end_date = compact_whitespace(education.end_date or "").lower()
        description = compact_whitespace(education.description).lower()
        text = " ".join(
            compact_whitespace(part)
            for part in (education.degree, education.field, education.institution, education.description)
            if compact_whitespace(part)
        ).lower()
        is_active = end_date in {"present", "current", "now"} or "5th year" in description or "final year" in description
        if not is_active:
            continue
        if "software engineering" in text:
            return "Software Engineering Student"
        if "computer engineering" in text:
            return "Computer Engineering Student"
        if "information technology" in text:
            return "Information Technology Student"
    raw_text = compact_whitespace(profile.raw_text).lower()
    if ("present" in raw_text or "5th year" in raw_text or "final year" in raw_text) and "bachelor" in raw_text:
        if "software engineering" in raw_text:
            return "Software Engineering Student"
        if "computer engineering" in raw_text:
            return "Computer Engineering Student"
        if "information technology" in raw_text:
            return "Information Technology Student"
    return ""


def normalize_profile(profile: CandidateProfile) -> CandidateProfile:
    years_experience = infer_years_experience(profile)
    current_title = choose_current_title(profile)
    headline = compact_whitespace(profile.headline) or current_title
    normalized_experience = [
        replace(entry, location=normalize_location(entry.location) or None)
        for entry in profile.experience
    ]
    location = normalize_location(profile.location)
    if not location:
        for entry in normalized_experience:
            if entry.location:
                location = entry.location
                break
    skills = dedupe_keep_order(
        canonical_skill(skill)
        for skill in [
            *profile.skills,
            *infer_additional_skills(
                replace(
                    profile,
                    current_title=current_title,
                    headline=headline,
                    experience=normalized_experience,
                    location=location,
                )
            ),
        ]
    )
    role_tags = dedupe_keep_order(
        infer_role_tags(
            replace(
                profile,
                current_title=current_title,
                headline=headline,
                skills=skills,
                experience=normalized_experience,
                location=location,
            )
        )
    )
    seniority = infer_seniority(
        replace(
            profile,
            current_title=current_title,
            headline=headline,
            skills=skills,
            experience=normalized_experience,
            location=location,
        ),
        years_experience,
    )
    job_family, job_family_confidence = infer_job_family(
        replace(
            profile,
            current_title=current_title,
            headline=headline,
            skills=skills,
            experience=normalized_experience,
            location=location,
            role_tags=role_tags,
        )
    )
    metadata = {
        **profile.metadata,
        "job_family": job_family,
        "job_family_confidence": job_family_confidence,
        "job_family_taxonomy_version": JOB_FAMILY_TAXONOMY_VERSION,
        "job_family_source": "production_role_tags_skills",
        "job_family_inferred_at": datetime.now(timezone.utc).isoformat(),
    }
    aliases = {
        canonical: [raw for raw in profile.skills if canonical_skill(raw).lower() == canonical.lower()]
        for canonical in skills
    }
    aliases = {key: dedupe_keep_order(values) for key, values in aliases.items()}
    return replace(
        profile,
        current_title=current_title,
        headline=headline or current_title,
        location=location,
        skills=skills,
        skill_aliases=aliases,
        experience=normalized_experience,
        role_tags=role_tags,
        years_experience=years_experience,
        seniority=seniority,
        metadata=metadata,
    )
