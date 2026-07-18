#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.llm import LLMClient, LLMResponseError
from cv_intelligence_worker.llm_models import SkillClassificationBatch


ROOT = Path(__file__).resolve().parents[1]
WORK_DIR = ROOT / "tmp" / "skill-cleanup"
SNAPSHOT_PATH = WORK_DIR / "candidate_skill_map.live.json"
CACHE_PATH = WORK_DIR / "skill_llm_map.json"
LOCAL_MAP_PATH = WORK_DIR / "skill_local_map.json"
REPORT_PATH = WORK_DIR / "candidate_skill_cleanup_report.json"

SELECT_COLUMNS = "id,tenant_id,candidate_id,skill_slug,canonical_skill,evidence,created_at"


CANONICAL_BY_KEY = {
    ".net": ".NET",
    ".net 4": ".NET",
    ".net 4.0": ".NET",
    ".net 4.8": ".NET",
    ".net 5": ".NET",
    ".net 6": ".NET",
    ".net 7": ".NET",
    ".net 8": ".NET",
    ".net core": ".NET",
    ".net core 3.1": ".NET",
    ".net ecosystem": ".NET",
    ".net framework": ".NET",
    ".net maui": ".NET MAUI",
    ".net api": ".NET",
    ".net playwright": ".NET",
    ".net zero framework": ".NET",
    "abp .net framework": "ABP Framework",
    "ado .net": "ADO.NET",
    "ado.net": "ADO.NET",
    "angular js": "Angular",
    "angular material": "Angular Material",
    "angularjs": "Angular",
    "api": "APIs",
    "api documentation": "API Documentation",
    "api gateway": "API Gateway",
    "api integration": "API Integration",
    "api integrations": "API Integration",
    "api security": "API Security",
    "api testing": "API Testing",
    "apis": "APIs",
    "asp net": "ASP.NET",
    "asp.net": "ASP.NET",
    "asp.net api": "ASP.NET",
    "asp.net core": "ASP.NET Core",
    "asp.net core api": "ASP.NET Core",
    "asp.net core c#": "ASP.NET Core",
    "asp.net core identity": "ASP.NET Core",
    "asp.net core mvc": "ASP.NET Core",
    "asp.net core web api": "ASP.NET Core",
    "asp.net core webapi": "ASP.NET Core",
    "asp.net framework": "ASP.NET",
    "asp.net identity": "ASP.NET",
    "asp.net mvc": "ASP.NET MVC",
    "asp.net web api": "ASP.NET",
    "asp.net web api2": "ASP.NET",
    "asp.net web forms": "ASP.NET",
    "asp.net webform": "ASP.NET",
    "asp.net webforms": "ASP.NET",
    "aspnet boilerplate": "ABP Framework",
    "and asp boilerplate framework": "ABP Framework",
    "asp boilerplate framework": "ABP Framework",
    "asp c#": "ASP.NET",
    "aws": "AWS",
    "amazon web services aws": "AWS",
    "aws cloud": "AWS",
    "aws cloud computing": "AWS",
    "aws web services": "AWS",
    "s3": "AWS S3",
    "aws s3": "AWS S3",
    "amazon s3": "AWS S3",
    "s3 bucket": "AWS S3",
    "s3 buckets": "AWS S3",
    "ec2": "AWS EC2",
    "aws ec2": "AWS EC2",
    "rds": "AWS RDS",
    "aws rds": "AWS RDS",
    "amazon rds": "AWS RDS",
    "lambda": "AWS Lambda",
    "aws lambda": "AWS Lambda",
    "dynamodb": "AWS DynamoDB",
    "aws dynamodb": "AWS DynamoDB",
    "cloudwatch": "AWS CloudWatch",
    "aws cloudwatch": "AWS CloudWatch",
    "amazon cloudwatch": "AWS CloudWatch",
    "cloudformation": "AWS CloudFormation",
    "aws cloudformation": "AWS CloudFormation",
    "route53": "AWS Route 53",
    "route 53": "AWS Route 53",
    "aws route 53": "AWS Route 53",
    "eks": "AWS EKS",
    "aws eks": "AWS EKS",
    "aws sqs": "AWS SQS",
    "aws iam": "IAM",
    "identity and access management iam": "IAM",
    "azure": "Azure",
    "microsoft azure": "Azure",
    "azure cloud": "Azure",
    "azure ad": "Microsoft Entra ID",
    "azure entra id": "Microsoft Entra ID",
    "entra id": "Microsoft Entra ID",
    "azure devops": "Azure DevOps",
    "azure devops ci cd": "Azure DevOps",
    "azure devops ci": "Azure DevOps",
    "azure vms": "Azure Virtual Machines",
    "azure virtual machines": "Azure Virtual Machines",
    "azure app service": "Azure App Service",
    "azure app services": "Azure App Service",
    "azure sql service": "Azure SQL",
    "bloc": "Bloc",
    "bloc cubit": "Bloc/Cubit",
    "bootstrap": "Bootstrap",
    "bootstrap vue": "BootstrapVue",
    "blazor.net": "Blazor",
    "blazor net": "Blazor",
    "blazor ui": "Blazor",
    "burp suite": "Burp Suite",
    "c": "C",
    "c#": "C#",
    "c# .net": ".NET",
    "c# asp.net": "ASP.NET",
    "c#.net": ".NET",
    "c++": "C++",
    "ci cd": "CI/CD",
    "css": "CSS",
    "css3": "CSS",
    "dart": "Dart",
    "django rest framework": "Django REST Framework",
    "docker": "Docker",
    "docker basic": "Docker",
    "docker fundamentals": "Docker",
    "docker engine": "Docker",
    "docker compose": "Docker Compose",
    "docker and docker compose": "Docker Compose",
    "containerization": "Containerization",
    "containers": "Containerization",
    "containerization docker": "Containerization",
    "dot net": ".NET",
    "dotnet": ".NET",
    "dotnet core": ".NET",
    "erp next": "ERPNext",
    "erpnext": "ERPNext",
    "excel": "Excel",
    "express": "Express",
    "express js": "Express",
    "express.js": "Express",
    "expressjs": "Express",
    "fast api": "FastAPI",
    "fastapi": "FastAPI",
    "figma": "Figma",
    "firebase": "Firebase",
    "firestore": "Firestore",
    "git": "Git",
    "git github": "Git/GitHub",
    "github": "GitHub",
    "github actions": "GitHub Actions",
    "gitlab": "GitLab",
    "gitlab ci cd": "GitLab CI/CD",
    "google cloud": "Google Cloud",
    "google cloud platform": "Google Cloud",
    "google cloud platform gcp": "Google Cloud",
    "gcp": "Google Cloud",
    "google vertex ai": "Vertex AI",
    "vertex ai": "Vertex AI",
    "cloud functions": "Cloud Functions",
    "cloud run": "Cloud Run",
    "graphql": "GraphQL",
    "html": "HTML",
    "html 5": "HTML",
    "html5": "HTML",
    "ios": "iOS",
    "java": "Java",
    "java 8": "Java",
    "javascript": "JavaScript",
    "javascript basics": "JavaScript",
    "javascript es6": "JavaScript",
    "javascript es6+": "JavaScript",
    "jquery": "jQuery",
    "js": "JavaScript",
    "json": "JSON",
    "jwt": "JWT",
    "k8s": "Kubernetes",
    "kubernetes": "Kubernetes",
    "kuberneties": "Kubernetes",
    "kubernetes k8s": "Kubernetes",
    "kubernetes fundamentals": "Kubernetes",
    "container orchestration": "Kubernetes",
    "container orchestration using kubernetes": "Kubernetes",
    "laravel": "Laravel",
    "laravel api": "Laravel",
    "linux": "Linux",
    "gnu linux": "Linux",
    "linux os": "Linux",
    "linux basics": "Linux",
    "linux basic": "Linux",
    "linux fundamentals": "Linux",
    "linux familiarity": "Linux",
    "linux command line": "Linux Command Line",
    "linux command-line": "Linux Command Line",
    "linux terminal": "Linux Command Line",
    "linux shell": "Linux Command Line",
    "linux administration": "Linux Administration",
    "linux system administration": "Linux Administration",
    "linux server administration": "Linux Administration",
    "ubuntu": "Ubuntu",
    "ubuntu os": "Ubuntu",
    "ubuntu server": "Ubuntu",
    "linux ubuntu": "Ubuntu",
    "fedora": "Fedora",
    "centos": "CentOS",
    "redhat": "Red Hat Linux",
    "rhel": "Red Hat Linux",
    "kali linux": "Kali Linux",
    "unix linux": "Unix/Linux",
    "material ui": "Material UI",
    "mongodb": "MongoDB",
    "ms excel": "Excel",
    "ms office": "Microsoft Office",
    "ms office package": "Microsoft Office",
    "ms office suite": "Microsoft Office",
    "ms powerpoint": "PowerPoint",
    "ms project": "Microsoft Project",
    "ms word": "Word",
    "mui": "MUI",
    "mysql": "MySQL",
    "nest js": "NestJS",
    "nest.js": "NestJS",
    "nestjs": "NestJS",
    "next js": "Next.js",
    "next.js": "Next.js",
    "nextjs": "Next.js",
    "nginx": "Nginx",
    "github ci cd": "GitHub Actions",
    "github actions ci cd": "GitHub Actions",
    "gitlab ci": "GitLab CI/CD",
    "gitlab ci cd pipelines": "GitLab CI/CD",
    "jenkins-ci": "Jenkins",
    "jenkins pipelines": "Jenkins",
    "ci cd pipeline": "CI/CD Pipelines",
    "ci cd pipelines": "CI/CD Pipelines",
    "continuous integration continuous deployment ci cd": "CI/CD Pipelines",
    "iac": "Infrastructure as Code",
    "infrastructure as code iac": "Infrastructure as Code",
    "infrastructure as code": "Infrastructure as Code",
    "node": "Node.js",
    "node js": "Node.js",
    "node.js": "Node.js",
    "node.js npm": "Node.js",
    "nodejs": "Node.js",
    "net api": ".NET",
    "net ecosystem": ".NET",
    "net maui": ".NET MAUI",
    "net playwright": ".NET",
    "net zero framework": ".NET",
    "nosql": "NoSQL",
    "numpy": "NumPy",
    "machine learning ml": "Machine Learning",
    "ml": "Machine Learning",
    "deep learning": "Deep Learning",
    "natural language processing": "NLP",
    "natural language processing nlp": "NLP",
    "nlp natural language processing": "NLP",
    "computer vision": "Computer Vision",
    "pytorch": "PyTorch",
    "large language models": "LLMs",
    "large language models llms": "LLMs",
    "llm": "LLMs",
    "llms": "LLMs",
    "openai api": "OpenAI API",
    "openai apis": "OpenAI API",
    "retrieval augmented generation rag": "RAG",
    "rag retrieval augmented generation": "RAG",
    "rag system": "RAG Systems",
    "rag systems": "RAG Systems",
    "rag pipelines": "RAG Pipelines",
    "llm fine tuning": "LLM Fine-Tuning",
    "fine tuning llms": "LLM Fine-Tuning",
    "prompt engineering": "Prompt Engineering",
    "ai tools": "AI Tools",
    "ai tools usage": "AI Tools",
    "ai tools utilization": "AI Tools",
    "ai assisted development": "AI-Assisted Development",
    "agentic ai": "Agentic AI",
    "agentic ais": "Agentic AI",
    "agenetic ai": "Agentic AI",
    "object oriented programming": "Object-Oriented Programming",
    "object oriented programming oop": "Object-Oriented Programming",
    "oop": "OOP",
    "prompt engineer": "Prompt Engineering",
    "reverse engineer": "Reverse Engineering",
    "ai project manager certification": "Project Management",
    "smarterasp.net": "ASP.NET",
    "auth": "Authentication",
    "oauth2": "OAuth 2.0",
    "oauth 2.0": "OAuth 2.0",
    "google oauth 2.0": "OAuth 2.0",
    "json web token jwt": "JWT",
    "jwt auth": "JWT Authentication",
    "jwt authentication": "JWT Authentication",
    "jwt auth system": "JWT Authentication",
    "rbac": "RBAC",
    "role based access control": "RBAC",
    "role based access control rbac": "RBAC",
    "authentication authorization": "Authentication & Authorization",
    "authentication and authorization": "Authentication & Authorization",
    "burpsuite": "Burp Suite",
    "burp suite pro": "Burp Suite",
    "owasp top 10": "OWASP Top 10",
    "owasp top 10 awareness": "OWASP Top 10",
    "owasp top 10 vulnerabilities": "OWASP Top 10",
    "owasp web top 10 mobile top 10": "OWASP Top 10",
    "vulnerability assessment": "Vulnerability Assessment",
    "siem monitoring": "SIEM",
    "siem operations": "SIEM",
    "siem tools": "SIEM",
    "soc": "SOC Operations",
    "soc operations": "SOC Operations",
    "incident response basics": "Incident Response",
    "security incident response": "Incident Response",
    "endpoint security": "Endpoint Security",
    "ssl tls": "SSL/TLS",
    "end to end encryption": "End-to-End Encryption",
    "end to end encryption e2ee": "End-to-End Encryption",
    "network security": "Network Security",
    "basic networking": "Networking",
    "computer networking": "Networking",
    "networking knowledge": "Networking",
    "lan wan": "LAN/WAN",
    "lan wan configuration": "LAN/WAN",
    "network troubleshooting": "Network Troubleshooting",
    "basic network troubleshooting": "Network Troubleshooting",
    "network configuration": "Network Configuration",
    "network design": "Network Design",
    "mikrotik": "MikroTik",
    "mikrotik networking": "MikroTik",
    "prtg": "PRTG Network Monitor",
    "prtg network monitor": "PRTG Network Monitor",
    "ufw firewall": "UFW",
    "firewall": "Firewall Configuration",
    "firewalls": "Firewall Configuration",
    "firewall configuration": "Firewall Configuration",
    "vpn": "VPN",
    "vpns": "VPN",
    "openvpn": "VPN",
    "openapi": "OpenAPI",
    "openapi swagger": "OpenAPI/Swagger",
    "postgres": "PostgreSQL",
    "postgre sql": "PostgreSQL",
    "postgress": "PostgreSQL",
    "pgsql": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "power bi": "Power BI",
    "powerbi": "Power BI",
    "microsoft power bi": "Power BI",
    "powerpoint": "PowerPoint",
    "php": "PHP",
    "php 5.6": "PHP",
    "php 7": "PHP",
    "php 8": "PHP",
    "php 8.3": "PHP",
    "python": "Python",
    "react": "React",
    "react js": "React",
    "react native": "React Native",
    "react query": "React Query",
    "react.js": "React",
    "reactjs": "React",
    "react-router": "React Router",
    "react router": "React Router",
    "react router dom": "React Router",
    "redis": "Redis",
    "rest": "REST APIs",
    "rest api": "REST APIs",
    "rest api design": "REST API Design",
    "rest api development": "REST API Development",
    "rest api integration": "REST API Integration",
    "rest apis": "REST APIs",
    "restapis": "REST APIs",
    "restful": "REST APIs",
    "restful api": "REST APIs",
    "restful api design": "REST API Design",
    "restful api development": "REST API Development",
    "restful api integration": "REST API Integration",
    "restful api testing": "REST API Testing",
    "restful apis": "REST APIs",
    "riverpod": "Riverpod",
    "sass": "Sass",
    "scss": "SCSS",
    "shadcn ui": "shadcn/ui",
    "socket io": "Socket.IO",
    "socket.io": "Socket.IO",
    "solid": "SOLID",
    "solid principles": "SOLID Principles",
    "sql": "SQL",
    "sql server": "SQL Server",
    "mssql": "SQL Server",
    "ms sql": "SQL Server",
    "ms sql server": "SQL Server",
    "sqlserver": "SQL Server",
    "plsql": "PL/SQL",
    "pl sql": "PL/SQL",
    "oracle pl sql": "PL/SQL",
    "tsql": "T-SQL",
    "t sql": "T-SQL",
    "sqlite": "SQLite",
    "sqlite3": "SQLite",
    "my sql": "MySQL",
    "mongo db": "MongoDB",
    "no sql": "NoSQL",
    "sql no sql": "NoSQL",
    "etl elt": "ETL/ELT",
    "etl elt pipelines": "ETL/ELT",
    "exploratory data analysis eda": "Exploratory Data Analysis",
    "swagger openapi": "OpenAPI/Swagger",
    "swagger": "Swagger",
    "tailwind": "Tailwind CSS",
    "tailwind css": "Tailwind CSS",
    "tailwindcss": "Tailwind CSS",
    "tensorflow": "TensorFlow",
    "typescript": "TypeScript",
    "ui ux": "UI/UX",
    "ui ux design": "UI/UX Design",
    "ux ui": "UI/UX",
    "vb .net": "VB.NET",
    "vba.net": "VB.NET",
    "vb.net": "VB.NET",
    "visual studio code": "VS Code",
    "microsoft visual studio .net": "Visual Studio",
    "vs code": "VS Code",
    "vue": "Vue",
    "vue 3": "Vue",
    "vue js": "Vue",
    "vue.js": "Vue",
    "vue.js 3": "Vue",
    "vuejs": "Vue",
    "web api": "Web APIs",
    "web apis": "Web APIs",
    "websocket": "WebSocket",
    "websockets": "WebSocket",
    "windows server": "Windows Server",
    "winforms": "WinForms",
    "wordpress": "WordPress",
    "word press": "WordPress",
    "erp": "ERP Systems",
    "erp system": "ERP Systems",
    "erp systems": "ERP Systems",
    "erps": "ERP Systems",
    "odoo": "Odoo",
    "odoo erp": "Odoo",
    "crm systems": "CRM Systems",
    "crm system": "CRM Systems",
    "crms": "CRM Systems",
    "customer relationship management": "CRM",
    "customer relationship management crm": "CRM",
    "crm aps hubspot": "HubSpot CRM",
    "sap erp": "SAP ERP",
    "oracle erp": "Oracle ERP",
    "ecommerce": "E-commerce",
    "e commerce": "E-commerce",
    "ecommerce development": "E-commerce",
    "e commerce solutions": "E-commerce",
    "payment gateway": "Payment Gateways",
    "payment gateways": "Payment Gateways",
    "payment getaways": "Payment Gateways",
    "stripe integration": "Stripe",
    "stripe payment integration": "Stripe",
    "stripe api": "Stripe",
    "pos": "POS Systems",
    "point of sale pos": "POS Systems",
    "pos systems": "POS Systems",
    "logistics coordination": "Logistics Coordination",
    "inventory": "Inventory Management",
    "inventory management systems": "Inventory Management",
}

PHRASE_CANONICALS = [
    (re.compile(r"\basp\.?\s*net\s*core\b", re.I), "ASP.NET Core"),
    (re.compile(r"\basp\.?\s*net\b", re.I), "ASP.NET"),
    (re.compile(r"\bado\.?\s*net\b", re.I), "ADO.NET"),
    (re.compile(r"\bvb\.?\s*net\b", re.I), "VB.NET"),
    (re.compile(r"\b(?:\.net|dotnet|net)\s*(?:core|framework|[45678](?:\.0|\.8)?|\+[58])\b", re.I), ".NET"),
    (re.compile(r"\bc#\s*(?:\.net|&\s*\.net|\(\s*\.net)", re.I), ".NET"),
    (re.compile(r"\bangular\s*(?:js|[0-9]+(?:\+)?)\b", re.I), "Angular"),
    (re.compile(r"\breact\s*(?:js|\.js|[0-9]+)\b", re.I), "React"),
    (re.compile(r"\bvue\s*(?:js|\.js|[0-9]+)\b", re.I), "Vue"),
    (re.compile(r"\bnext\s*(?:js|\.js|[0-9]+)\b", re.I), "Next.js"),
    (re.compile(r"\bnode\s*(?:js|\.js)\b", re.I), "Node.js"),
    (re.compile(r"\bexpress\s*(?:js|\.js)\b", re.I), "Express"),
    (re.compile(r"\bhtml\s*5\b", re.I), "HTML"),
    (re.compile(r"\bcss\s*3\b", re.I), "CSS"),
    (re.compile(r"\bphp\s*[578](?:\.\d+)?\+?\b", re.I), "PHP"),
    (re.compile(r"\bjava\s*8\b", re.I), "Java"),
    (re.compile(r"\bwindows server\s*(?:20\d{2}(?:[/, -]+20\d{2})*)?\b", re.I), "Windows Server"),
    (re.compile(r"\bvisual studio\s*20\d{2}\b", re.I), "Visual Studio"),
    (re.compile(r"\bms\s*office\s*20\d{2}\b", re.I), "Microsoft Office"),
    (re.compile(r"\boffice\s*20\d{2}\b", re.I), "Microsoft Office"),
    (re.compile(r"\bmicrosoft office\b|\bms office\b", re.I), "Microsoft Office"),
    (re.compile(r"\bmicrosoft excel\b|\badvanced excel\b|\bexcel\b", re.I), "Excel"),
    (re.compile(r"\bmicrosoft word\b", re.I), "Word"),
    (re.compile(r"\bmicrosoft powerpoint\b", re.I), "PowerPoint"),
    (re.compile(r"\bmicrosoft sql server\b", re.I), "SQL Server"),
    (re.compile(r"\brestful?\s+apis?\b|\brest\s+apis?\b|\brestapis\b", re.I), "REST APIs"),
    (re.compile(r"\bswagger\s*/?\s*openapi\b|\bopenapi\s*/?\s*swagger\b", re.I), "OpenAPI/Swagger"),
    (re.compile(r"\bapi testing\b", re.I), "API Testing"),
    (re.compile(r"\bapi security\b", re.I), "API Security"),
    (re.compile(r"\bapi integration", re.I), "API Integration"),
    (re.compile(r"\bgit\s*(?:/|&|\band\b)\s*github\b", re.I), "Git/GitHub"),
    (re.compile(r"\bci\s*/?\s*cd\b", re.I), "CI/CD"),
    (re.compile(r"\bui\s*/?\s*ux\b", re.I), "UI/UX"),
    (re.compile(r"\bobject[-\s]?oriented programming\b", re.I), "Object-Oriented Programming"),
    (re.compile(r"\bproblem[-\s]?solving\b", re.I), "Problem Solving"),
    (re.compile(r"\btime management\b", re.I), "Time Management"),
    (re.compile(r"\bcommunication skills?\b", re.I), "Communication"),
    (re.compile(r"\bpresentation skills?\b|\bpresentations?\b", re.I), "Presentation Skills"),
    (re.compile(r"\bwork under pressure\b", re.I), "Working Under Pressure"),
    (re.compile(r"\blearn quickly\b|\bfast learner\b", re.I), "Fast Learning"),
    (re.compile(r"\bmultitask", re.I), "Multitasking"),
    (re.compile(r"\bexplain technical concepts\b", re.I), "Technical Communication"),
    (re.compile(r"\bgit\s*(?:/|&|\band\b)\s*github.*version control", re.I), "Git/GitHub"),
    (re.compile(r"\blocal storage solutions?\b|\blocal storage\b", re.I), "Local Storage"),
    (re.compile(r"\breal[-\s]?time communication\b", re.I), "Real-Time Communication"),
    (re.compile(r"\bapplying clean code\b|\bclean code principles\b", re.I), "Clean Code"),
    (re.compile(r"\bstate management expertise\b", re.I), "State Management"),
    (re.compile(r"\bcloud integration with firebase\b", re.I), "Firebase"),
    (re.compile(r"\basynchronous programming\b", re.I), "Asynchronous Programming"),
    (re.compile(r"\badvanced flutter development\b", re.I), "Flutter"),
    (re.compile(r"\bmicrosoft 365 ecosystem\b", re.I), "Microsoft 365"),
    (re.compile(r"\bend[-\s]?to[-\s]?end project management\b", re.I), "Project Management"),
    (re.compile(r"\banalyze and solve .*problems?\b|\bsolve problems?\b", re.I), "Problem Solving"),
    (re.compile(r"\bfriendly, cooperative\b", re.I), "Communication"),
    (re.compile(r"\bsense of ownership\b|\bresponsibility for delivered work\b", re.I), "Ownership"),
    (re.compile(r"\bcommunication and coordination\b", re.I), "Communication"),
    (re.compile(r"\bdata manipulation, cleaning, preprocessing\b", re.I), "Data Preprocessing"),
    (re.compile(r"\beditorial planning\b|\bcontent publishing\b", re.I), "Content Strategy"),
    (re.compile(r"\bnegotiation, communication\b", re.I), "Negotiation"),
    (re.compile(r"\bdemonstrated creativity\b|\bcreativity in design\b", re.I), "Creativity"),
    (re.compile(r"\bpersuasion skills?\b", re.I), "Persuasion"),
    (re.compile(r"\borganized thinking\b|\bsystem design principles\b", re.I), "Systems Thinking"),
    (re.compile(r"\bcustom themes\b|\bnavigation flows\b|\baccessibility-friendly design\b", re.I), "UI/UX Implementation"),
    (re.compile(r"\bexplain insights\b|\bnon-technical stakeholders\b", re.I), "Technical Communication"),
    (re.compile(r"\bemerging technologies.*telecom\b|\btelecom operations\b", re.I), "Telecom Operations"),
    (re.compile(r"\bcurious and motivated\b|\bcontinuous learning\b", re.I), "Continuous Learning"),
    (re.compile(r"\bnegotiating contracts\b", re.I), "Negotiation"),
    (re.compile(r"\badvanced animations\b|\bmotion design\b", re.I), "Motion Design"),
    (re.compile(r"\bbreak down requirements\b|\brequirements? gathering\b|\brequirements? analysis\b", re.I), "Requirements Analysis"),
    (re.compile(r"\bmulti-client connections\b|\bsession management\b", re.I), "Session Management"),
    (re.compile(r"\brelationship-building\b", re.I), "Communication"),
    (re.compile(r"\bc\+\+ and python.*robotics\b", re.I), "Robotics"),
    (re.compile(r"\bdocker orchestration\b", re.I), "Container Orchestration"),
    (re.compile(r"\badaptability and resilience\b", re.I), "Adaptability"),
    (re.compile(r"\bmotivate (?:staff|teams)\b", re.I), "Leadership"),
    (re.compile(r"\bbusiness communication\b", re.I), "Business Communication"),
    (re.compile(r"\breinforcement learning\b", re.I), "Reinforcement Learning"),
    (re.compile(r"\bwiring diagrams\b|\btechnical schematics\b", re.I), "Technical Schematics"),
    (re.compile(r"\btechnical client consulting\b", re.I), "Technical Consulting"),
    (re.compile(r"\battention to detail\b", re.I), "Attention to Detail"),
    (re.compile(r"\bstakeholder engagement\b", re.I), "Stakeholder Management"),
    (re.compile(r"\bclient-facing demos\b|\bworkshops\b", re.I), "Product Demos"),
    (re.compile(r"\bautomating routine maintenance\b|\bincident response\b", re.I), "Automation"),
    (re.compile(r"\btechnical ownership\b|\barchitectural decision-making\b", re.I), "Technical Leadership"),
    (re.compile(r"\bfeasibility studies\b", re.I), "Feasibility Studies"),
    (re.compile(r"\braspberry pi.*jetson nano\b", re.I), "Embedded ML"),
    (re.compile(r"\bapi security\b|\bsecure api\b", re.I), "API Security"),
    (re.compile(r"\bapi design\b|\bapi-first\b", re.I), "API Design"),
    (re.compile(r"\bapi documentation\b", re.I), "API Documentation"),
    (re.compile(r"\bcloud api", re.I), "Cloud APIs"),
    (re.compile(r"\bmachine learning\b", re.I), "Machine Learning"),
    (re.compile(r"\bdeep learning\b", re.I), "Deep Learning"),
    (re.compile(r"\bneural networks?\b", re.I), "Neural Networks"),
    (re.compile(r"\bnatural language processing\b|\bnlp\b", re.I), "NLP"),
    (re.compile(r"\bcomputer vision\b", re.I), "Computer Vision"),
    (re.compile(r"\bprompt engineering\b", re.I), "Prompt Engineering"),
    (re.compile(r"\brag\b|retrieval[-\s]?augmented generation", re.I), "RAG"),
    (re.compile(r"\bllm\b|large language model", re.I), "LLMs"),
    (re.compile(r"\bdata collection\b", re.I), "Data Collection"),
    (re.compile(r"\bdata cleaning\b", re.I), "Data Cleaning"),
    (re.compile(r"\bdata import\b", re.I), "Data Import"),
    (re.compile(r"\bdata visualization\b", re.I), "Data Visualization"),
    (re.compile(r"\bdata analysis\b", re.I), "Data Analysis"),
    (re.compile(r"\bproject management\b", re.I), "Project Management"),
    (re.compile(r"\bstakeholder management\b", re.I), "Stakeholder Management"),
    (re.compile(r"\bstakeholder communication\b", re.I), "Stakeholder Communication"),
    (re.compile(r"\bteam leadership\b", re.I), "Team Leadership"),
    (re.compile(r"\bleadership\b", re.I), "Leadership"),
    (re.compile(r"\bteam collaboration\b|\bcollaboration\b", re.I), "Collaboration"),
    (re.compile(r"\bclean code\b", re.I), "Clean Code"),
    (re.compile(r"\bdesign patterns?\b", re.I), "Design Patterns"),
    (re.compile(r"\bstate management\b", re.I), "State Management"),
    (re.compile(r"\bresponsive (?:ui|web )?design\b", re.I), "Responsive Design"),
    (re.compile(r"\bui/ux implementation\b|\bfigma to flutter\b", re.I), "UI/UX Implementation"),
    (re.compile(r"\bnetworking\b|\btcp/ip\b|\blan/wan\b", re.I), "Networking"),
    (re.compile(r"\bnetwork security\b", re.I), "Network Security"),
    (re.compile(r"\bcybersecurity\b|cyber security", re.I), "Cybersecurity"),
    (re.compile(r"\bpenetration testing\b", re.I), "Penetration Testing"),
    (re.compile(r"\bvulnerability assessment\b", re.I), "Vulnerability Assessment"),
    (re.compile(r"\bmanual testing\b", re.I), "Manual Testing"),
    (re.compile(r"\bautomated testing\b|\btest automation\b", re.I), "Test Automation"),
    (re.compile(r"\bunit testing\b", re.I), "Unit Testing"),
    (re.compile(r"\bintegration testing\b", re.I), "Integration Testing"),
    (re.compile(r"\btechnical documentation\b|\bsystems documentation\b", re.I), "Technical Documentation"),
    (re.compile(r"\breporting\b", re.I), "Reporting"),
    (re.compile(r"\bfield research\b|\bqualitative.*research\b", re.I), "Field Research"),
    (re.compile(r"\bresearch ethics\b", re.I), "Research Ethics"),
    (re.compile(r"\bmonitoring, evaluation\b|\bMEAL\b", re.I), "MEAL"),
    (re.compile(r"\bcash\s*&\s*voucher assistance\b|\bcva\b", re.I), "Cash & Voucher Assistance"),
    (re.compile(r"\bhumanitarian project implementation\b", re.I), "Humanitarian Project Management"),
    (re.compile(r"\bsales strategy\b", re.I), "Sales Strategy"),
    (re.compile(r"\bdigital communications\b", re.I), "Digital Communications"),
    (re.compile(r"\bsocial media\b", re.I), "Social Media Management"),
    (re.compile(r"\bseo\b", re.I), "SEO"),
    (re.compile(r"\bgoogle play\b|\bapp store\b", re.I), "App Store Deployment"),
    (re.compile(r"\brapid prototyping\b", re.I), "Rapid Prototyping"),
    (re.compile(r"\bai[-\s]?driven tools\b|\bai tools\b|\bgenerative ai\b", re.I), "AI Tools"),
    (re.compile(r"\bvirtualization\b|\bvmware\b", re.I), "Virtualization"),
    (re.compile(r"\btroubleshooting\b", re.I), "Troubleshooting"),
]

DROP_EXACT_KEYS = {
    "https",
    "in",
    "and",
    "with",
    "work",
    "which are currently running",
    "and deliverables",
    "and monitoring",
    "and security",
    "souccar for electronic industries sei",
    "st company",
    "government employee",
    "abd alrahman karaja 6850bbb6",
    "syria",
    "linkedin",
    "www.linkedin.com",
    "designed",
    "in asp.net",
    "10",
    "damascus",
    "damascus syria",
    "damascus dwaila",
    "damascus governorate",
    "damascus university expected nov 2025",
    "damascus software developer",
    "damascus mobile application developer",
    "0934 650 619",
    "pul das a isiui ypu dla aus clylaol quis cls",
    "celaze ll ggill gle alll azallg ual poll tesla",
    "clygo 3 ssall elt jo ll glog",
    "blmlg ovstall jog olga slylge",
    "susleall slacly ilagall lalas",
    "alyal slo dtym sl ysall dyad",
    "phys jlo digo pudall poll",
    "boal b5l5y ayylicall bsfo",
    "ila py ye dyad dyardl",
    "dovall 410 jol slaw",
}

SECTION_OR_ROLE_KEYS = {
    "achievements",
    "achievements tasks",
    "responsibilities",
    "projects",
    "programming languages",
    "soft skills",
    "computer skills",
    "computer skill",
    "skills",
    "technical skills",
    "tools",
    "technologies",
    "developer",
    "engineer",
    "backend",
    "frontend",
    "back end",
    "front end",
    "full stack",
    "full-stack",
    "frontend developer",
    "backend developer",
    "web developer",
    "data analyst",
    "soc analyst",
    "sql developer",
    "accounting manager",
    "office manager",
    "full stack developer",
    "software engineer",
}

ROLE_KEEP_KEYS = {
    "prompt engineer",
    "reverse engineer",
}

ROLE_ONLY_RE = re.compile(
    r"^(?:(?:junior|senior|sr|lead|mid(?:dle)?|full[-\s]?time|freelance)\s+)?"
    r"(?:(?:flutter|laravel|web|front[-\s]?end|back[-\s]?end|full[-\s]?stack|software|sql|soc|data|accounting|office|mobile|android|ios|php|react|node(?:\.js)?|\.net|asp\.net|ai)\s+)?"
    r"(?:developer|engineer|analyst|manager|consultant|designer|administrator)"
    r"(?:\s*\([^)]*\))?$",
    re.I,
)

MONTH_RE = re.compile(r"\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b", re.I)
YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
CONTACT_RE = re.compile(r"@|https?://|www\.|(?:linkedin|github|gitlab)\.com/", re.I)
DATE_RANGE_ONLY_RE = re.compile(
    r"^\s*(?:[A-Za-z]+\s+)?(?:19|20)\d{2}\s*[-–]\s*(?:present|current|(?:[A-Za-z]+\s+)?(?:19|20)\d{2})\s*$",
    re.I,
)


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ[key] = value


def compact_whitespace(value: str) -> str:
    return " ".join(value.split()).strip()


def skill_slug(value: str) -> str:
    token = compact_whitespace(value).lower()
    special = {
        ".net": "dotnet",
        "c#": "c-sharp",
        "c++": "cpp",
        "ci/cd": "ci-cd",
        "ui/ux": "ui-ux",
        "tcp/ip": "tcp-ip",
        "r&d": "r-and-d",
    }
    if token in special:
        return special[token]
    token = token.replace("c#", "c sharp")
    token = token.replace("c++", "c plus plus")
    token = token.replace("#", " sharp ")
    token = token.replace("&", " and ")
    token = token.replace("+", " plus ")
    token = re.sub(r"[^a-z0-9]+", "-", token)
    token = re.sub(r"-+", "-", token).strip("-")
    return special.get(token, token)


def lookup_key(value: str) -> str:
    token = compact_whitespace(value)
    token = token.replace("&", " and ")
    token = token.replace("/", " ")
    token = token.replace("_", " ")
    token = re.sub(r"(?i)\bapisix\b", "APISIX", token)
    token = re.sub(r"[^a-zA-Z0-9+#.]+", " ", token)
    token = re.sub(r"\s+", " ", token).strip().lower()
    return token


def title_skill(value: str) -> str:
    acronyms = {
        "api": "API",
        "apis": "APIs",
        "aws": "AWS",
        "cicd": "CI/CD",
        "css": "CSS",
        "dhcp": "DHCP",
        "dns": "DNS",
        "gcp": "Google Cloud",
        "html": "HTML",
        "http": "HTTP",
        "ios": "iOS",
        "json": "JSON",
        "jwt": "JWT",
        "lan": "LAN",
        "llm": "LLM",
        "ml": "ML",
        "mvc": "MVC",
        "mvvm": "MVVM",
        "nlp": "NLP",
        "oop": "OOP",
        "qa": "QA",
        "rag": "RAG",
        "sdlc": "SDLC",
        "seo": "SEO",
        "sql": "SQL",
        "tcp": "TCP",
        "tdd": "TDD",
        "ui": "UI",
        "uml": "UML",
        "ux": "UX",
        "vpn": "VPN",
        "xml": "XML",
    }
    parts = re.split(r"(\s+|[-/])", compact_whitespace(value))
    rendered: list[str] = []
    for part in parts:
        key = part.lower().replace(".", "")
        if not part or part.isspace() or part in "-/":
            rendered.append(part)
        elif key in acronyms:
            rendered.append(acronyms[key])
        elif part.isupper() and len(part) <= 5:
            rendered.append(part)
        else:
            rendered.append(part[:1].upper() + part[1:].lower())
    return "".join(rendered)


def strip_qualifiers(value: str) -> str:
    text = compact_whitespace(value)
    text = re.sub(r"^[▪•●◦*\-]+\s*", "", text)
    text = re.sub(r"^(?:good at|basic knowledge of|basic knowledge in|knowledge of|familiarity with|proficiency in|experience in)\s*:?\s+", "", text, flags=re.I)
    text = re.sub(r"^(?:backend|frontend)\s*:\s+", "", text, flags=re.I)
    text = re.sub(r"\s*\((?:basic knowledge|in progress|beginner|advanced|certified|basic)\)\s*$", "", text, flags=re.I)
    text = text.strip(" ;:,")
    return compact_whitespace(text)


def is_noise_label(raw: str, key: str) -> bool:
    if not raw or key in DROP_EXACT_KEYS or key in SECTION_OR_ROLE_KEYS:
        return True
    if CONTACT_RE.search(raw) and key not in {"github", "gitlab"}:
        return True
    if re.fullmatch(r"[\d\W_]+", raw):
        return True
    if re.fullmatch(r"(?:19|20)\d{2}(?:\s*[-/.]\s*\d{1,2})?\.?", raw):
        return True
    if DATE_RANGE_ONLY_RE.match(raw):
        return True
    if MONTH_RE.search(raw) and YEAR_RE.search(raw) and len(raw.split()) <= 6:
        return True
    if raw.count("!") >= 2 or (len(raw) > 20 and sum(ch in "!@#$%^*_~=|" for ch in raw) >= 3):
        return True
    if len(raw) > 35:
        letters = sum(ch.isalpha() for ch in raw)
        vowels = sum(ch.lower() in "aeiou" for ch in raw)
        if letters > 20 and vowels / max(letters, 1) < 0.18:
            return True
    return False


def is_role_only_label(raw: str, key: str) -> bool:
    if key in ROLE_KEEP_KEYS:
        return False
    return bool(ROLE_ONLY_RE.match(raw))


def canonical_skill_local(value: str) -> dict[str, Any]:
    raw = strip_qualifiers(value)
    key = lookup_key(raw)
    if is_noise_label(raw, key):
        return {"action": "drop", "canonical": None}

    if key in CANONICAL_BY_KEY:
        return {"action": "keep", "canonical": CANONICAL_BY_KEY[key]}

    slug_key = skill_slug(raw).replace("-", " ")
    if slug_key in CANONICAL_BY_KEY:
        return {"action": "keep", "canonical": CANONICAL_BY_KEY[slug_key]}

    for pattern, canonical in PHRASE_CANONICALS:
        if pattern.search(raw):
            return {"action": "keep", "canonical": canonical}

    if is_role_only_label(raw, key):
        return {"action": "drop", "canonical": None}

    prefix = raw.split("(", 1)[0].strip(" -–")
    if prefix and prefix != raw and len(prefix.split()) <= 6:
        prefix_decision = canonical_skill_local(prefix)
        if prefix_decision.get("action") == "keep":
            return prefix_decision

    if len(raw) > 70:
        known_hits: list[str] = []
        short_aliases = {"api", "apis", "aws", "css", "git", "html", "ios", "jwt", "php", "rag", "sql", "ui", "ux"}
        for alias, canonical in CANONICAL_BY_KEY.items():
            if len(alias) < 4 and alias not in short_aliases:
                continue
            alias_pattern = re.escape(alias).replace("\\ ", r"[-\s]+")
            pattern = re.compile(rf"(^|[^a-z0-9+#.]){alias_pattern}([^a-z0-9+#.]|$)", re.I)
            if pattern.search(raw):
                known_hits.append(canonical)
        if known_hits:
            return {"action": "keep", "canonical": known_hits[0]}

    if len(raw) > 140:
        return {"action": "drop", "canonical": None}

    # Full prose is usually extraction noise. Keep it only when a phrase rule above
    # captured a reusable skill.
    if len(raw.split()) > 14 and re.search(r"\b(?:ability|using|with|and|for|across|between|toward|clearly|smooth|scalable)\b", raw, re.I):
        return {"action": "drop", "canonical": None}

    if raw.isupper() and len(raw) <= 6:
        return {"action": "keep", "canonical": raw}
    if re.fullmatch(r"[A-Za-z][A-Za-z0-9+#.]*", raw):
        return {"action": "keep", "canonical": CANONICAL_BY_KEY.get(key, title_skill(raw))}
    return {"action": "keep", "canonical": title_skill(raw)}


def local_mapping_for_labels(labels: list[tuple[str, int]]) -> dict[str, Any]:
    mapping: dict[str, Any] = {}
    for label, _count in labels:
        mapping[label] = canonical_skill_local(label)
    json_dump(LOCAL_MAP_PATH, mapping)
    return mapping


def now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def json_dump(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=True, indent=2, sort_keys=True))


class SupabaseRest:
    def __init__(self) -> None:
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        self.key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_ANON_KEY"]
        self.ssl_context = ssl._create_unverified_context()

    def request(self, method: str, path: str, *, data: object | None = None, headers: dict[str, str] | None = None) -> Any:
        body = None if data is None else json.dumps(data).encode()
        req = urllib.request.Request(f"{self.url}{path}", data=body, method=method)
        req.add_header("apikey", self.key)
        req.add_header("Authorization", f"Bearer {self.key}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        try:
            with urllib.request.urlopen(req, timeout=90, context=self.ssl_context) as response:
                text = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase REST {method} {path} failed ({exc.code}): {detail}") from exc
        return json.loads(text) if text else None

    def fetch_skill_rows(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        page_size = 1000
        for start in range(0, 100000, page_size):
            end = start + page_size - 1
            path = f"/rest/v1/candidate_skill_map?select={SELECT_COLUMNS}&order=created_at.asc"
            batch = self.request("GET", path, headers={"Range": f"{start}-{end}"})
            if not batch:
                break
            rows.extend(batch)
            if len(batch) < page_size:
                break
        return rows

    def delete_ids(self, ids: list[str], *, batch_size: int = 150) -> int:
        deleted = 0
        for index in range(0, len(ids), batch_size):
            batch = ids[index : index + batch_size]
            encoded = urllib.parse.quote(",".join(batch), safe=",")
            self.request(
                "DELETE",
                f"/rest/v1/candidate_skill_map?id=in.({encoded})",
                headers={"Prefer": "return=minimal"},
            )
            deleted += len(batch)
        return deleted

    def upsert_rows(self, rows: list[dict[str, Any]], *, batch_size: int = 500) -> int:
        written = 0
        for index in range(0, len(rows), batch_size):
            batch = rows[index : index + batch_size]
            self.request(
                "POST",
                "/rest/v1/candidate_skill_map?on_conflict=id",
                data=batch,
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )
            written += len(batch)
        return written

    def refresh_cache(self) -> int:
        result = self.request("POST", "/rest/v1/rpc/refresh_candidate_search_cache_v1", data={})
        try:
            return int(result)
        except (TypeError, ValueError):
            return 0


class SkillClassifier:
    def __init__(
        self,
        *,
        batch_size: int,
        max_workers: int,
        config: WorkerConfig | None = None,
        client: LLMClient | None = None,
    ) -> None:
        if batch_size < 1 or max_workers < 1:
            raise ValueError("batch size and max workers must be positive")
        config = config or WorkerConfig.from_env()
        if not config.extraction_model:
            raise RuntimeError("Missing CV_EXTRACTION_MODEL for LLM skill cleanup")
        self.batch_size = batch_size
        self.max_workers = max_workers
        self.model = config.extraction_model
        self.client = client or LLMClient(config)

    @staticmethod
    def system_prompt() -> str:
        return (
            "You are cleaning a recruiter CV skill taxonomy.\n"
            "Classify every supplied item exactly once and preserve each input ID.\n"
            "Rules:\n"
            "- Keep real technical skills, tools, frameworks, methods, domain skills, languages, and soft/professional skills.\n"
            "- Drop dates, phone numbers, emails, URLs, locations, person names, company-only labels, job titles, CV section headings, random OCR text, and full sentences that are not reusable skills.\n"
            "- Kept items require a concise canonical value; dropped items require a null canonical value.\n"
            "- Canonicalize aliases to concise recruiter-friendly names.\n"
            "- Examples: React.js -> React, Vue.js -> Vue, Express.js -> Express, NodeJS -> Node.js, Next Js -> Next.js.\n"
            "- Examples: RESTful API/RESTful APIs -> REST APIs, HTML5 -> HTML, CSS3 -> CSS, .Net/.NET Core/.NET 8 -> .NET.\n"
            "- Examples: Javascript/JS -> JavaScript, Typescript/TS -> TypeScript, Git/GIT -> Git, Github -> GitHub.\n"
            "- Prefer the broad searchable skill over version noise unless the version is the important skill name.\n"
            "- Do not invent new skills not supported by the label."
        )

    def request_batch(self, items: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
        parsed = self.client.parse(
            model=self.model,
            system_prompt=self.system_prompt(),
            prompt={"items": items},
            response_model=SkillClassificationBatch,
        )
        expected = {int(item["id"]) for item in items}
        received = {item.id for item in parsed.items}
        if received != expected:
            raise LLMResponseError("skill classification response IDs do not match request")
        return {
            item.id: {"action": item.action, "canonical": item.canonical}
            for item in parsed.items
        }

    def classify(self, labels: list[tuple[str, int]], cache: dict[str, Any]) -> dict[str, Any]:
        missing = [
            {"id": index, "label": label, "count": count}
            for index, (label, count) in enumerate(labels)
            if label not in cache
        ]
        if not missing:
            return cache

        batches = [missing[index : index + self.batch_size] for index in range(0, len(missing), self.batch_size)]
        by_id = {int(item["id"]): item["label"] for item in missing}
        completed = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_batch = {executor.submit(self.request_batch, batch): batch for batch in batches}
            for future in concurrent.futures.as_completed(future_to_batch):
                results = future.result()
                for item_id, value in results.items():
                    cache[by_id[item_id]] = value
                completed += len(results)
                if completed % max(self.batch_size, 100) == 0 or completed == len(missing):
                    json_dump(CACHE_PATH, cache)
                    print(f"classified {completed}/{len(missing)} missing labels")
        json_dump(CACHE_PATH, cache)
        return cache


def load_cache() -> dict[str, Any]:
    if not CACHE_PATH.exists():
        return {}
    value = json.loads(CACHE_PATH.read_text())
    return value if isinstance(value, dict) else {}


def normalize_evidence(group: list[dict[str, Any]], canonical: str) -> dict[str, Any]:
    aliases: list[str] = []
    for row in group:
        evidence = row.get("evidence")
        if isinstance(evidence, dict):
            raw_aliases = evidence.get("aliases")
            if isinstance(raw_aliases, list):
                aliases.extend(str(alias) for alias in raw_aliases if str(alias).strip())
        aliases.append(str(row.get("canonical_skill") or ""))
    deduped = []
    seen = set()
    for alias in aliases:
        alias = compact_whitespace(alias)
        if not alias or alias.casefold() == canonical.casefold():
            continue
        key = alias.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(alias)
    return {"aliases": deduped[:25]}


def build_plan(rows: list[dict[str, Any]], mapping: dict[str, Any]) -> dict[str, Any]:
    drops: list[dict[str, Any]] = []
    keep_groups: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    row_targets: dict[str, tuple[str, str]] = {}
    for row in rows:
        raw_label = compact_whitespace(str(row.get("canonical_skill") or ""))
        decision = mapping.get(raw_label)
        if decision is None:
            raise ValueError("skill mapping is incomplete")
        canonical = compact_whitespace(str(decision.get("canonical") or ""))
        action = decision.get("action")
        target_slug = skill_slug(canonical) if canonical else ""
        if action == "drop" or not canonical or not target_slug:
            drops.append(row)
            continue
        row_targets[row["id"]] = (canonical, target_slug)
        keep_groups[(row["tenant_id"], row["candidate_id"], target_slug)].append(row)

    delete_ids = [row["id"] for row in drops]
    upserts: list[dict[str, Any]] = []
    duplicate_rows: list[dict[str, Any]] = []

    for (_tenant_id, _candidate_id, target_slug), group in keep_groups.items():
        def rank(row: dict[str, Any]) -> tuple[int, int, str]:
            canonical, slug = row_targets[row["id"]]
            current_label = compact_whitespace(str(row.get("canonical_skill") or ""))
            current_slug = compact_whitespace(str(row.get("skill_slug") or ""))
            return (
                0 if current_slug == slug else 1,
                0 if current_label.casefold() == canonical.casefold() else 1,
                str(row.get("created_at") or row["id"]),
            )

        keeper = sorted(group, key=rank)[0]
        duplicate_rows.extend(row for row in group if row["id"] != keeper["id"])
        canonical, slug = row_targets[keeper["id"]]
        evidence = normalize_evidence(group, canonical)
        upsert = {
            "id": keeper["id"],
            "tenant_id": keeper["tenant_id"],
            "candidate_id": keeper["candidate_id"],
            "skill_slug": slug,
            "canonical_skill": canonical,
            "evidence": evidence,
        }
        if (
            compact_whitespace(str(keeper.get("skill_slug") or "")) != slug
            or compact_whitespace(str(keeper.get("canonical_skill") or "")).casefold() != canonical.casefold()
            or keeper.get("evidence") != evidence
        ):
            upserts.append(upsert)

    delete_ids.extend(row["id"] for row in duplicate_rows)
    final_rows = len(rows) - len(delete_ids)
    return {
        "delete_ids": delete_ids,
        "drop_rows": drops,
        "duplicate_rows": duplicate_rows,
        "upserts": upserts,
        "final_rows": final_rows,
    }


def summarize(rows: list[dict[str, Any]], plan: dict[str, Any], mapping: dict[str, Any]) -> dict[str, Any]:
    raw_labels = [compact_whitespace(str(row.get("canonical_skill") or "")) for row in rows]
    canonical_counts = Counter()
    drop_examples = []
    alias_examples = []
    for label, count in Counter(raw_labels).most_common():
        decision = mapping.get(label)
        if not decision:
            continue
        if decision.get("action") == "drop":
            if len(drop_examples) < 40:
                drop_examples.append({"label": label, "count": count})
            continue
        canonical = compact_whitespace(str(decision.get("canonical") or label))
        canonical_counts[canonical] += count
        if canonical.casefold() != label.casefold() and len(alias_examples) < 60:
            alias_examples.append({"from": label, "to": canonical, "count": count})

    return {
        "before": {
            "rows": len(rows),
            "unique_exact_labels": len(set(raw_labels)),
            "unique_slug_labels": len({skill_slug(label) for label in raw_labels if skill_slug(label)}),
        },
        "planned": {
            "delete_rows": len(plan["delete_ids"]),
            "drop_noise_rows": len(plan["drop_rows"]),
            "dedupe_rows": len(plan["duplicate_rows"]),
            "upsert_rows": len(plan["upserts"]),
            "final_rows": plan["final_rows"],
            "unique_canonical_labels_by_llm": len(canonical_counts),
        },
        "alias_examples": alias_examples,
        "drop_examples": drop_examples,
        "top_canonical_after": canonical_counts.most_common(50),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean candidate_skill_map labels and slugs.")
    parser.add_argument("--apply", action="store_true", help="Apply deletes/upserts to Supabase.")
    parser.add_argument("--reuse-snapshot", action="store_true", help="Use the last local snapshot instead of fetching live rows.")
    parser.add_argument("--batch-size", type=int, default=80, help="Unique labels per LLM call.")
    parser.add_argument("--max-workers", type=int, default=4, help="Concurrent LLM calls.")
    parser.add_argument("--mode", choices=("local", "llm"), default="local", help="Use the Codex-authored local taxonomy or an external LLM.")
    parser.add_argument("--skip-llm", action="store_true", help="Use existing LLM cache only when --mode llm.")
    args = parser.parse_args()

    load_env(ROOT / ".env")
    load_env(ROOT / ".env.local")
    load_env(ROOT / "frontend" / ".env.local")

    WORK_DIR.mkdir(parents=True, exist_ok=True)
    rest = SupabaseRest()
    legacy_snapshot = WORK_DIR / "candidate_skill_map.json"
    if args.reuse_snapshot and (SNAPSHOT_PATH.exists() or legacy_snapshot.exists()):
        rows = json.loads((SNAPSHOT_PATH if SNAPSHOT_PATH.exists() else legacy_snapshot).read_text())
    else:
        rows = rest.fetch_skill_rows()
        json_dump(SNAPSHOT_PATH, rows)
        json_dump(WORK_DIR / f"candidate_skill_map.before.{now_stamp()}.json", rows)

    labels = Counter(compact_whitespace(str(row.get("canonical_skill") or "")) for row in rows)
    ordered_labels = sorted(labels.items(), key=lambda item: (-item[1], item[0].casefold()))
    if args.mode == "local":
        cache = local_mapping_for_labels(ordered_labels)
    else:
        cache = load_cache()
    if args.mode == "llm" and not args.skip_llm:
        classifier = SkillClassifier(batch_size=args.batch_size, max_workers=args.max_workers)
        cache = classifier.classify(ordered_labels, cache)

    plan = build_plan(rows, cache)
    report = summarize(rows, plan, cache)
    report["applied"] = False
    json_dump(REPORT_PATH, report)
    print(json.dumps(report["before"], indent=2, sort_keys=True))
    print(json.dumps(report["planned"], indent=2, sort_keys=True))
    print("report", REPORT_PATH)

    if not args.apply:
        print("dry_run true")
        return

    if plan["delete_ids"]:
        deleted = rest.delete_ids(plan["delete_ids"])
    else:
        deleted = 0
    if plan["upserts"]:
        upserted = rest.upsert_rows(plan["upserts"])
    else:
        upserted = 0
    refreshed = rest.refresh_cache()
    report["applied"] = True
    report["applied_counts"] = {"deleted": deleted, "upserted": upserted, "refreshed_cache_rows": refreshed}
    json_dump(REPORT_PATH, report)
    print(json.dumps(report["applied_counts"], indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
