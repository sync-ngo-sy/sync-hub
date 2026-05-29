#!/usr/bin/env python3
"""Evaluate search-result quality over representative recruiter queries.

The default mode runs locally against candidate_search_cache using the same
high-level filters/ranking constraints as the Edge Function. If
SEARCH_EVAL_AUTH_TOKEN is provided, --mode edge calls the deployed search
function and grades the real response. --mode intent calls the deployed
function with anon auth and grades only resolved intent metadata.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


TENANT_ID = "4f9827de-4784-4c11-88cd-bbf102900dec"
PAGE_SIZE = 1000
INSECURE_SSL_CONTEXT = ssl._create_unverified_context()


@dataclass(frozen=True)
class SearchCase:
    query: str
    role: str | None = None
    seniority: str | None = None
    min_years: float | None = None
    location: str | None = None
    skills: tuple[str, ...] = field(default_factory=tuple)


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def env_value(env: dict[str, str], key: str) -> str:
    value = os.environ.get(key) or env.get(key) or ""
    return value.strip()


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9+#.]+", " ", str(value or "").lower())).strip()


LOCATION_ALIASES = {
    "bahrain": "Bahrain",
    "canada": "Canada",
    "montreal": "Canada",
    "egypt": "Egypt",
    "cairo": "Egypt",
    "france": "France",
    "paris": "France",
    "germany": "Germany",
    "deutschland": "Germany",
    "berlin": "Germany",
    "india": "India",
    "iraq": "Iraq",
    "jordan": "Jordan",
    "amman": "Jordan",
    "kuwait": "Kuwait",
    "kuwait city": "Kuwait",
    "lebanon": "Lebanon",
    "beirut": "Lebanon",
    "oman": "Oman",
    "pakistan": "Pakistan",
    "palestine": "Palestine",
    "philippines": "Philippines",
    "qatar": "Qatar",
    "doha": "Qatar",
    "saudi arabia": "Saudi Arabia",
    "ksa": "Saudi Arabia",
    "riyadh": "Saudi Arabia",
    "jeddah": "Saudi Arabia",
    "spain": "Spain",
    "syria": "Syria",
    "damascus": "Syria",
    "damscus": "Syria",
    "aleppo": "Syria",
    "turkey": "Turkey",
    "turkiye": "Turkey",
    "istanbul": "Turkey",
    "united arab emirates": "United Arab Emirates",
    "uae": "United Arab Emirates",
    "u.a.e": "United Arab Emirates",
    "dubai": "United Arab Emirates",
    "abu dhabi": "United Arab Emirates",
    "united kingdom": "United Kingdom",
    "uk": "United Kingdom",
    "england": "United Kingdom",
    "united states": "United States",
    "usa": "United States",
    "u.s.a": "United States",
    "america": "United States",
}


def normalize_location(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    candidates = [parts[-1], raw] if len(parts) > 1 else [raw]
    for candidate in candidates:
        normalized = normalize_text(candidate)
        if normalized in LOCATION_ALIASES:
            return LOCATION_ALIASES[normalized]
    for alias, canonical in LOCATION_ALIASES.items():
        if re.search(rf"(^|[^a-z0-9+#.]){re.escape(alias)}([^a-z0-9+#.]|$)", normalize_text(raw)):
            return canonical
    return ""


def to_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


ROLE_TITLE_ALIASES = {
    "frontend": ["frontend", "front end", "front-end", "web developer", "web application engineer", "ui developer"],
    "backend": ["backend", "back end", "back-end", "api developer", "server developer", "server engineer"],
    "full-stack": ["full-stack", "full stack", "fullstack"],
    "mobile": ["mobile", "android", "ios", "flutter", "react native"],
    "devops": ["devops", "sre", "platform engineer", "cloud engineer", "site reliability"],
    "data": ["data engineer", "analytics engineer", "etl", "business intelligence"],
    "ml": ["ml engineer", "machine learning", "ai engineer", "llm engineer"],
    "qa": ["qa", "quality assurance", "test automation", "automation tester"],
    "security": ["security", "cybersecurity", "soc", "penetration"],
}


ROLE_SKILL_ALIASES = {
    "frontend": ["react", "angular", "vue", "next.js", "nextjs", "javascript", "typescript", "html", "css", "tailwind", "bootstrap"],
    "backend": ["node.js", "node", "django", "flask", ".net", "asp.net", "java", "php", "laravel", "api", "rest api", "postgresql", "mysql"],
    "full-stack": ["react", "angular", "vue", "node.js", "node", ".net", "django", "laravel", "javascript", "typescript"],
    "mobile": ["android", "ios", "flutter", "react native", "swift", "kotlin", "dart"],
    "devops": ["kubernetes", "terraform", "docker", "aws", "azure", "ci/cd", "linux", "jenkins"],
    "data": ["data analysis", "analytics", "etl", "bi", "sql", "python", "pandas", "power bi"],
    "ml": ["machine learning", "ml", "ai", "llm", "tensorflow", "pytorch"],
    "qa": ["qa", "quality assurance", "testing", "automation testing", "selenium"],
    "security": ["security", "cybersecurity", "soc", "penetration testing"],
}


def alias_hit_count(text: str, aliases: list[str]) -> int:
    hits = {normalize_text(alias) for alias in aliases if normalize_text(alias) and normalize_text(alias) in text}
    return len(hits)


def role_compatibility(row: dict[str, Any], role: str | None) -> float:
    if not role:
        return 0.0
    primary = normalize_text(row.get("primary_role"))
    expected = normalize_text(role)
    if primary == "full stack" and expected in {"frontend", "backend"}:
        return 0.78
    if expected == "full stack" and primary == "full stack":
        return 0.78
    return 0.0


def generic_title_score(row: dict[str, Any], role: str | None) -> float:
    title = normalize_text(row.get("current_title"))
    if not title or not role:
        return 0.0
    if role == "frontend" and re.search(r"\b(?:software|ui|front end|frontend)\b", title):
        return 0.66
    if role == "backend" and re.search(r"\b(?:software|backend|back end|api|server)\b", title):
        return 0.66
    if role == "devops" and re.search(r"\b(?:devops|sre|platform|cloud|site reliability)\b", title):
        return 0.8
    if role == "data" and re.search(r"\b(?:data|analytics|etl|bi)\b", title):
        return 0.8
    return 0.0


def role_match_score(row: dict[str, Any], role: str | None) -> float:
    if not role:
        return 0.0
    title = normalize_text(row.get("current_title"))
    aliases = [normalize_text(alias) for alias in ROLE_TITLE_ALIASES.get(role, [role])]
    if any(alias and alias in title for alias in aliases):
        return 1.0
    skills_text = normalize_text(" ".join(to_list(row.get("skills"))))
    skill_hits = alias_hit_count(skills_text, ROLE_SKILL_ALIASES.get(role, []))
    support = max(generic_title_score(row, role), role_compatibility(row, role) * 0.86)
    if skill_hits >= 2 and support > 0:
        return max(0.72, support)
    if skill_hits > 0 and support > 0:
        return max(0.58, support)
    return 0.0


def skill_match_score(row: dict[str, Any], skills: tuple[str, ...]) -> float:
    if not skills:
        return 0.0
    row_skills = {normalize_text(skill) for skill in to_list(row.get("skills"))}
    expected = [normalize_text(skill) for skill in skills]
    return sum(1 for skill in expected if skill in row_skills) / max(1, len(expected))


def passes_case(row: dict[str, Any], case: SearchCase) -> bool:
    if case.role and role_match_score(row, case.role) <= 0:
        return False
    if case.seniority and normalize_text(row.get("seniority")) != normalize_text(case.seniority):
        return False
    if case.min_years is not None and float(row.get("years_experience") or 0) < case.min_years:
        return False
    if case.location and normalize_location(row.get("location")) != normalize_location(case.location):
        return False
    if case.skills and skill_match_score(row, case.skills) <= 0:
        return False
    return True


def score_row(row: dict[str, Any], case: SearchCase) -> float:
    query_tokens = [token for token in normalize_text(case.query).split() if len(token) >= 2][:12]
    title = normalize_text(row.get("current_title"))
    skills = normalize_text(" ".join(to_list(row.get("skills"))))
    summary = normalize_text(f"{row.get('summary_short') or ''} {row.get('stored_short_summary') or ''}")
    haystack = normalize_text(f"{row.get('name') or ''} {title} {skills} {summary} {row.get('location') or ''}")
    token_score = sum(1 for token in query_tokens if token in haystack) / max(1, len(query_tokens))
    role_score = role_match_score(row, case.role)
    skill_score = skill_match_score(row, case.skills)
    years_score = min(1.0, float(row.get("years_experience") or 0) / max(1.0, float(case.min_years or 1)))
    seniority_score = 1.0 if case.seniority and normalize_text(row.get("seniority")) == normalize_text(case.seniority) else 0.0
    location_score = 1.0 if case.location and normalize_location(row.get("location")) == normalize_location(case.location) else 0.0
    score = max(token_score * 0.34, role_score * 0.76, skill_score * 0.62)
    score += years_score * (0.07 if case.min_years is not None else 0.02)
    score += seniority_score * 0.1
    score += location_score * 0.06
    return min(0.99, score)


def generate_cases(limit: int) -> list[SearchCase]:
    roles = [
        ("frontend", ["frontend engineer", "front end developer", "react frontend developer"]),
        ("backend", ["backend engineer", ".NET backend developer", "node api engineer"]),
        ("full-stack", ["full stack developer", "full-stack web engineer"]),
        ("devops", ["devops engineer", "sre engineer", "kubernetes platform engineer"]),
        ("data", ["data engineer", "analytics engineer", "etl developer"]),
        ("ml", ["machine learning engineer", "ai engineer", "llm engineer"]),
        ("mobile", ["mobile developer", "flutter developer", "react native engineer"]),
        ("qa", ["qa automation engineer", "software tester", "selenium tester"]),
        ("security", ["security engineer", "cybersecurity analyst", "soc analyst"]),
    ]
    skills = {
        "frontend": ["React", "Angular", "Vue", "TypeScript"],
        "backend": [".NET", "Node.js", "Java", "PostgreSQL"],
        "full-stack": ["React", "Node.js", ".NET"],
        "devops": ["Kubernetes", "Docker", "AWS", "Terraform"],
        "data": ["SQL", "Python", "Power BI"],
        "ml": ["TensorFlow", "PyTorch", "Python"],
        "mobile": ["Flutter", "React Native", "Kotlin"],
        "qa": ["Selenium", "Testing"],
        "security": ["Security", "SOC"],
    }
    locations = ["Syria", "Damascus Syria", "Dubai UAE", "Saudi Arabia", "United States"]
    seniorities = [None, "senior", "junior"]
    years = [None, 3, 5, 8]
    cases: list[SearchCase] = []

    for role, queries in roles:
        for query in queries:
            cases.append(SearchCase(query=query, role=role))
            for seniority in seniorities[1:]:
                cases.append(SearchCase(query=f"{seniority} {query}", role=role, seniority=seniority))
            for min_years in years[1:]:
                cases.append(SearchCase(query=f"{query} with {min_years} years experience", role=role, min_years=min_years))
            for skill in skills.get(role, [])[:3]:
                cases.append(SearchCase(query=f"{query} with {skill}", role=role, skills=(skill,)))
            for location in locations[:3]:
                cases.append(SearchCase(query=f"{query} in {location}", role=role, location=location))
            cases.append(SearchCase(query=f"senior {query} with 5 years in Syria", role=role, seniority="senior", min_years=5, location="Syria"))

    # A few explicit regression cases for common false-positive classes.
    cases.extend([
        SearchCase(query="devops", role="devops"),
        SearchCase(query="senior devops", role="devops", seniority="senior"),
        SearchCase(query="devops in syria", role="devops", location="Syria"),
        SearchCase(query="frontend in syria", role="frontend", location="Syria"),
        SearchCase(query="senior frontend in syria", role="frontend", seniority="senior", location="Syria"),
        SearchCase(query="backend developer web api", role="backend"),
        SearchCase(query="project manager", role=None),
    ])

    deduped: list[SearchCase] = []
    seen: set[str] = set()
    for case in cases:
        if case.query in seen:
            continue
        seen.add(case.query)
        deduped.append(case)
        if len(deduped) >= limit:
            break
    return deduped


def http_json(url: str, headers: dict[str, str], body: dict[str, Any] | None = None) -> Any:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode())
    except urllib.error.URLError as error:
        reason = getattr(error, "reason", None)
        if not isinstance(reason, ssl.SSLCertVerificationError):
            raise
        with urllib.request.urlopen(request, timeout=45, context=INSECURE_SSL_CONTEXT) as response:
            return json.loads(response.read().decode())


def fetch_rows(supabase_url: str, service_key: str, tenant_id: str) -> list[dict[str, Any]]:
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    rows: list[dict[str, Any]] = []
    columns = "tenant_id,candidate_id,name,current_title,headline,primary_role,role_tags,seniority,years_experience,location,skills,companies,summary_short,stored_short_summary"
    for offset in range(0, 10000, PAGE_SIZE):
        params = urllib.parse.urlencode({
            "tenant_id": f"eq.{tenant_id}",
            "select": columns,
            "offset": str(offset),
            "limit": str(PAGE_SIZE),
        })
        page = http_json(f"{supabase_url.rstrip('/')}/rest/v1/candidate_search_cache?{params}", headers)
        if not isinstance(page, list):
            raise RuntimeError(f"Unexpected REST response: {page!r}")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
    return rows


def evaluate_local(rows: list[dict[str, Any]], cases: list[SearchCase], top_k: int) -> dict[str, Any]:
    failures: list[dict[str, Any]] = []
    top1_hits = 0
    top3_has_hit = 0
    topk_fill = 0

    for case in cases:
        scored = [
            (score_row(row, case), row)
            for row in rows
            if passes_case(row, case)
        ]
        scored.sort(key=lambda item: (-item[0], -float(item[1].get("years_experience") or 0), str(item[1].get("name") or "")))
        top = [row for _, row in scored[:top_k]]
        if top:
            top1_hits += 1
            topk_fill += min(top_k, len(top))
        if len(top) >= 3:
            top3_has_hit += 1
        if not top:
            failures.append({
                "query": case.query,
                "expected": case.__dict__,
                "reason": "no candidates passed strict expected filters",
            })

    return {
        "mode": "local",
        "cases": len(cases),
        "rows": len(rows),
        "top1_found_rate": round(top1_hits / max(1, len(cases)), 3),
        "top3_fill_rate": round(top3_has_hit / max(1, len(cases)), 3),
        "topk_average_fill": round(topk_fill / max(1, len(cases)), 2),
        "failures": failures[:20],
    }


def grade_edge_row(row: dict[str, Any], case: SearchCase) -> list[str]:
    issues: list[str] = []
    mapped = {
        "current_title": row.get("current_title") or row.get("currentTitle"),
        "primary_role": row.get("primary_role") or row.get("primaryRole"),
        "seniority": row.get("seniority"),
        "years_experience": row.get("years_experience") or row.get("yearsExperience"),
        "location": row.get("location"),
        "skills": row.get("top_skills") or row.get("topSkills") or row.get("matched_filters", {}).get("matched_skills") or [],
    }
    if case.role and role_match_score(mapped, case.role) <= 0:
        issues.append("role")
    if case.seniority and normalize_text(mapped.get("seniority")) != normalize_text(case.seniority):
        issues.append("seniority")
    if case.min_years is not None and float(mapped.get("years_experience") or 0) < case.min_years:
        issues.append("years")
    if case.location and normalize_location(mapped.get("location")) != normalize_location(case.location):
        issues.append("location")
    if case.skills and skill_match_score(mapped, case.skills) <= 0:
        issues.append("skills")
    return issues


def intent_issues(intent: dict[str, Any], case: SearchCase) -> list[str]:
    issues: list[str] = []
    if case.role and normalize_text(intent.get("role")) != normalize_text(case.role):
        issues.append(f"role:{intent.get('role')}")
    if case.seniority and normalize_text(intent.get("seniority")) != normalize_text(case.seniority):
        issues.append(f"seniority:{intent.get('seniority')}")
    if case.min_years is not None and float(intent.get("min_years_experience") or 0) != float(case.min_years):
        issues.append(f"years:{intent.get('min_years_experience')}")
    if case.location and normalize_location(intent.get("location")) != normalize_location(case.location):
        issues.append(f"location:{intent.get('location')}")
    if case.skills:
        actual_skills = {normalize_text(skill) for skill in to_list(intent.get("skills"))}
        missing = [skill for skill in case.skills if normalize_text(skill) not in actual_skills]
        if missing:
            issues.append(f"skills:{','.join(missing)}")
    if not case.location and normalize_location(intent.get("location")):
        issues.append(f"unexpected_location:{intent.get('location')}")
    return issues


def evaluate_intent(supabase_url: str, anon_key: str, cases: list[SearchCase], top_k: int, tenant_id: str) -> dict[str, Any]:
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
        "x-client-info": "cv-intelligence-intent-eval",
    }
    failures: list[dict[str, Any]] = []
    clean = 0

    for index, case in enumerate(cases, start=1):
        payload = {
            "q": case.query,
            "tenant_ids": [tenant_id],
            "filters": {
                "role": None,
                "seniority": None,
                "min_years_experience": None,
                "location": None,
                "skills": [],
                "companies": [],
            },
            "limit": top_k,
            "offset": 0,
            "semantic": False,
        }
        data = http_json(f"{supabase_url.rstrip('/')}/functions/v1/search", headers, payload)
        intent = data.get("meta", {}).get("intent") if isinstance(data, dict) else {}
        intent = intent if isinstance(intent, dict) else {}
        issues = intent_issues(intent, case)
        if issues:
            failures.append({
                "query": case.query,
                "expected": case.__dict__,
                "intent": intent,
                "issues": issues,
            })
        else:
            clean += 1
        if index % 25 == 0:
            print(f"evaluated {index}/{len(cases)} intent cases...", file=sys.stderr)

    return {
        "mode": "intent",
        "cases": len(cases),
        "intent_clean_rate": round(clean / max(1, len(cases)), 3),
        "failures": failures[:30],
    }


def evaluate_edge(supabase_url: str, anon_key: str, auth_token: str, cases: list[SearchCase], top_k: int, tenant_id: str) -> dict[str, Any]:
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "x-client-info": "cv-intelligence-search-eval",
    }
    failures: list[dict[str, Any]] = []
    total_rows = 0
    clean_top1 = 0
    clean_topk_rows = 0

    for index, case in enumerate(cases, start=1):
        payload = {
            "q": case.query,
            "tenant_ids": [tenant_id],
            "filters": {
                "role": None,
                "seniority": None,
                "min_years_experience": None,
                "location": None,
                "skills": [],
                "companies": [],
            },
            "limit": top_k,
            "offset": 0,
        }
        data = http_json(f"{supabase_url.rstrip('/')}/functions/v1/search", headers, payload)
        rows = data.get("results") if isinstance(data, dict) else []
        rows = rows if isinstance(rows, list) else []
        total_rows += len(rows)
        row_issues = [grade_edge_row(row, case) for row in rows]
        if row_issues and not row_issues[0]:
            clean_top1 += 1
        clean_topk_rows += sum(1 for issues in row_issues if not issues)
        if not rows or any(row_issues[: min(3, len(row_issues))]):
            failures.append({
                "query": case.query,
                "expected": case.__dict__,
                "intent": data.get("meta", {}).get("intent") if isinstance(data, dict) else None,
                "top": [
                    {
                        "name": row.get("name"),
                        "title": row.get("current_title") or row.get("currentTitle"),
                        "role": row.get("primary_role") or row.get("primaryRole"),
                        "location": row.get("location"),
                        "issues": issues,
                    }
                    for row, issues in zip(rows[:3], row_issues[:3])
                ],
            })
        if index % 25 == 0:
            print(f"evaluated {index}/{len(cases)} edge cases...", file=sys.stderr)
        time.sleep(0.05)

    return {
        "mode": "edge",
        "cases": len(cases),
        "top1_clean_rate": round(clean_top1 / max(1, len(cases)), 3),
        "topk_clean_row_rate": round(clean_topk_rows / max(1, total_rows), 3),
        "average_rows": round(total_rows / max(1, len(cases)), 2),
        "failures": failures[:30],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["local", "intent", "edge"], default="local")
    parser.add_argument("--limit", type=int, default=150)
    parser.add_argument("--top-k", type=int, default=8)
    parser.add_argument("--tenant-id", default=TENANT_ID)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    env = load_env(root / ".env.local")
    supabase_url = env_value(env, "SUPABASE_URL")
    if not supabase_url:
        raise SystemExit("Missing SUPABASE_URL")

    cases = generate_cases(args.limit)
    if args.mode == "local":
        service_key = env_value(env, "SUPABASE_SERVICE_ROLE_KEY")
        if not service_key:
            raise SystemExit("Missing SUPABASE_SERVICE_ROLE_KEY")
        rows = fetch_rows(supabase_url, service_key, args.tenant_id)
        result = evaluate_local(rows, cases, args.top_k)
    elif args.mode == "intent":
        anon_key = env_value(env, "VITE_SUPABASE_ANON_KEY") or env_value(env, "SUPABASE_ANON_KEY")
        if not anon_key:
            raise SystemExit("Missing VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY")
        result = evaluate_intent(supabase_url, anon_key, cases, args.top_k, args.tenant_id)
    else:
        anon_key = env_value(env, "VITE_SUPABASE_ANON_KEY") or env_value(env, "SUPABASE_ANON_KEY")
        auth_token = env_value(env, "SEARCH_EVAL_AUTH_TOKEN")
        if not anon_key or not auth_token:
            raise SystemExit("Missing VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY or SEARCH_EVAL_AUTH_TOKEN")
        result = evaluate_edge(supabase_url, anon_key, auth_token, cases, args.top_k, args.tenant_id)

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
