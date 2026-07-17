#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import os
import ssl
import shutil
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional
from urllib import error, parse, request


def build_ssl_context() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore
    except Exception:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())


def slugify(value: str) -> str:
    normalized = "".join(char.lower() if char.isalnum() else "-" for char in value.strip())
    while "--" in normalized:
        normalized = normalized.replace("--", "-")
    return normalized.strip("-")[:48]


def compact_json(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True)

def format_error_message(exc: Exception) -> str:
    return f"{type(exc).__name__}: {exc}"


class SupabaseAdminError(RuntimeError):
    pass


@dataclass(frozen=True)
class BootstrapResult:
    user_id: str
    email: str
    tenant_id: str
    tenant_name: str
    tenant_slug: str
    tenant_icon: str
    role: str
    folder_name: str
    drive_root: str


@dataclass(frozen=True)
class WorkspaceFolderResult:
    tenant_id: str
    tenant_name: str
    tenant_slug: str
    local_folder: str
    drive_folder: str


@dataclass(frozen=True)
class WorkspaceSyncResult:
    tenant_id: str
    tenant_name: str
    tenant_slug: str
    source_folder: str
    drive_folder: str
    copied_files: int
    deleted_files: int
    dry_run: bool


@dataclass(frozen=True)
class PlatformAdminResult:
    user_id: str
    email: str
    created_user: bool
    password_updated: bool
    platform_admin_added: bool
    note: str


class SupabaseAdminClient:
    def __init__(self, base_url: str, service_role_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.service_role_key = service_role_key.strip()
        self.ssl_context = build_ssl_context()
        if not self.base_url:
            raise ValueError("SUPABASE_URL is required")
        if not self.service_role_key:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY is required")

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: Optional[dict[str, Any]] = None,
        query: Optional[dict[str, str]] = None,
        extra_headers: Optional[dict[str, str]] = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{parse.urlencode(query)}"

        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
        }
        if payload is not None:
            headers["Content-Type"] = "application/json"
        if extra_headers:
            headers.update(extra_headers)

        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = request.Request(url, data=body, headers=headers, method=method.upper())

        try:
            with request.urlopen(req, context=self.ssl_context) as response:
                raw = response.read().decode("utf-8")
                if not raw:
                    return None
                return json.loads(raw)
        except error.HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise SupabaseAdminError(f"{method.upper()} {path} failed: {message or exc.reason}") from exc
        except error.URLError as exc:
            raise SupabaseAdminError(f"Could not reach Supabase at {self.base_url}: {exc.reason}") from exc

    def create_user(self, email: str, password: str, full_name: str = "") -> dict[str, Any]:
        payload: dict[str, Any] = {
            "email": email.strip(),
            "password": password,
            "email_confirm": True,
        }
        if full_name.strip():
            payload["user_metadata"] = {"full_name": full_name.strip()}
        return self._request("POST", "/auth/v1/admin/users", payload=payload)

    def update_user_password(self, user_id: str, password: str, full_name: str = "") -> dict[str, Any]:
        payload: dict[str, Any] = {
            "password": password,
            "email_confirm": True,
        }
        if full_name.strip():
            payload["user_metadata"] = {"full_name": full_name.strip()}
        return self._request(
            "PUT",
            f"/auth/v1/admin/users/{parse.quote(user_id, safe='')}",
            payload=payload,
        )

    def list_auth_users(self, *, page: int = 1, per_page: int = 1000) -> list[dict[str, Any]]:
        result = self._request(
            "GET",
            "/auth/v1/admin/users",
            query={"page": str(page), "per_page": str(per_page)},
        )
        if isinstance(result, dict) and isinstance(result.get("users"), list):
            return result["users"]
        if isinstance(result, list):
            return result
        raise SupabaseAdminError("Auth user list returned an unexpected response.")

    def get_auth_user_by_email(self, email: str) -> Optional[dict[str, Any]]:
        target = email.strip().lower()
        page = 1
        per_page = 1000
        while True:
            users = self.list_auth_users(page=page, per_page=per_page)
            for user in users:
                if str(user.get("email") or "").strip().lower() == target:
                    return user
            if len(users) < per_page:
                return None
            page += 1

    def create_tenant(self, *, name: str, slug: str, created_by: str, icon_url: str = "") -> dict[str, Any]:
        result = self._request(
            "POST",
            "/rest/v1/tenants",
            payload={
                "name": name.strip(),
                "slug": slug.strip(),
                "created_by": created_by,
                "icon_url": icon_url.strip() or None,
            },
            extra_headers={"Prefer": "return=representation"},
        )
        if not isinstance(result, list) or not result:
            raise SupabaseAdminError("Tenant insert returned no rows.")
        return result[0]

    def get_tenant_by_slug(self, tenant_slug: str) -> Optional[dict[str, Any]]:
        result = self._request(
            "GET",
            "/rest/v1/tenants",
            query={"slug": f"eq.{tenant_slug.strip()}", "select": "id,name,slug,icon_url", "limit": "1"},
        )
        if not isinstance(result, list):
            raise SupabaseAdminError("Tenant lookup returned an unexpected response.")
        if not result:
            return None
        return result[0]

    def add_membership(self, *, tenant_id: str, user_id: str, role: str) -> dict[str, Any]:
        result = self._request(
            "POST",
            "/rest/v1/tenant_memberships",
            payload={"tenant_id": tenant_id, "user_id": user_id, "role": role, "status": "active"},
            extra_headers={"Prefer": "return=representation"},
        )
        if not isinstance(result, list) or not result:
            raise SupabaseAdminError("Membership insert returned no rows.")
        return result[0]

    def rename_tenant(self, *, tenant_slug: str, new_name: str, new_slug: str) -> dict[str, Any]:
        result = self._request(
            "PATCH",
            "/rest/v1/tenants",
            payload={"name": new_name.strip(), "slug": new_slug.strip()},
            query={"slug": f"eq.{tenant_slug.strip()}", "select": "id,name,slug,icon_url"},
            extra_headers={"Prefer": "return=representation"},
        )
        if not isinstance(result, list) or not result:
            raise SupabaseAdminError(f"Could not find tenant with slug '{tenant_slug}'.")
        return result[0]

    def list_tenants(self) -> list[dict[str, Any]]:
        tenants = self._request(
            "GET",
            "/rest/v1/tenants",
            query={"select": "id,slug,name,icon_url,created_at,created_by", "order": "created_at.desc", "limit": "10000"},
        )
        memberships = self._request(
            "GET",
            "/rest/v1/tenant_memberships",
            query={"select": "tenant_id,user_id,role,status", "limit": "10000"},
        )
        candidates = self._request(
            "GET",
            "/rest/v1/candidates",
            query={"select": "tenant_id", "limit": "10000"},
        )
        documents = self._request(
            "GET",
            "/rest/v1/source_documents",
            query={"select": "tenant_id", "limit": "10000"},
        )

        membership_counts = Counter(row["tenant_id"] for row in memberships or [])
        candidate_counts = Counter(row["tenant_id"] for row in candidates or [])
        document_counts = Counter(row["tenant_id"] for row in documents or [])

        output: list[dict[str, Any]] = []
        for tenant in tenants or []:
            tenant_id = tenant["id"]
            output.append(
                {
                    "tenant_id": tenant_id,
                    "slug": tenant["slug"],
                    "name": tenant["name"],
                    "icon_url": tenant.get("icon_url") or "",
                    "created_at": tenant.get("created_at"),
                    "membership_count": membership_counts.get(tenant_id, 0),
                    "candidate_count": candidate_counts.get(tenant_id, 0),
                    "document_count": document_counts.get(tenant_id, 0),
                    "folder_name": tenant["slug"],
                }
            )
        return output

    def get_platform_admin(self, user_id: str) -> Optional[dict[str, Any]]:
        result = self._request(
            "GET",
            "/rest/v1/platform_admins",
            query={"user_id": f"eq.{user_id}", "select": "user_id,note,created_at", "limit": "1"},
        )
        if not isinstance(result, list):
            raise SupabaseAdminError("Platform admin lookup returned an unexpected response.")
        if not result:
            return None
        return result[0]

    def upsert_platform_admin(self, *, user_id: str, note: str) -> dict[str, Any]:
        result = self._request(
            "POST",
            "/rest/v1/platform_admins",
            payload={"user_id": user_id, "note": note.strip()},
            query={"on_conflict": "user_id"},
            extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
        )
        if not isinstance(result, list) or not result:
            raise SupabaseAdminError("Platform admin upsert returned no rows.")
        return result[0]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Tenant and account admin utility for CV Intelligence.")
    parser.add_argument("--supabase-url", default=os.getenv("SUPABASE_URL", ""), help="Supabase project URL")
    parser.add_argument(
        "--service-role-key",
        default=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        help="Supabase service role key",
    )
    parser.add_argument(
        "--drive-root",
        default=os.getenv("CV_DRIVE_ROOT", "CV Intelligence"),
        help="Logical Google Drive root folder name",
    )
    parser.add_argument(
        "--workspace-root-path",
        default=os.getenv("CV_WORKSPACE_ROOT_PATH", "./workspaces"),
        help="Local root used to create one folder per tenant slug",
    )
    parser.add_argument(
        "--drive-sync-path",
        default=os.getenv("CV_DRIVE_SYNC_PATH", ""),
        help="Optional local Google Drive Desktop root; folders will be created under <drive-sync-path>/<drive-root>/<tenant-slug>",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list-tenants", help="List tenants with candidate and document counts")
    list_parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable table")

    folder_parser = subparsers.add_parser(
        "ensure-workspace-folders",
        help="Create local tenant folders under the configured workspace root and optional Drive sync path",
    )
    folder_parser.add_argument(
        "--tenant-slug",
        action="append",
        default=[],
        help="Optional slug filter; pass multiple times to limit which tenants get folders",
    )
    folder_parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable summary")

    sync_parser = subparsers.add_parser(
        "sync-workspaces-to-drive",
        help="Copy local workspace folder contents into a Google Drive Desktop synced root",
    )
    sync_parser.add_argument(
        "--tenant-slug",
        action="append",
        default=[],
        help="Optional slug filter; pass multiple times to sync only selected tenants",
    )
    sync_parser.add_argument(
        "--delete",
        action="store_true",
        help="Delete files from the Drive destination that no longer exist in the local workspace folder",
    )
    sync_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview the copy/delete plan without changing any files",
    )
    sync_parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable summary")

    rename_parser = subparsers.add_parser(
        "rename-tenant",
        help="Rename a tenant/workspace and optionally move its local and synced Drive folders",
    )
    rename_parser.add_argument("--tenant-slug", required=True, help="Current tenant slug")
    rename_parser.add_argument("--new-name", required=True, help="New workspace display name")
    rename_parser.add_argument("--new-slug", required=True, help="New workspace slug")
    rename_parser.add_argument(
        "--move-folders",
        action="store_true",
        help="Also rename the local workspace folder and optional synced Drive folder if they exist",
    )
    rename_parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable summary")

    create_parser = subparsers.add_parser("create-tenant-account", help="Create an auth user, tenant, and owner membership")
    create_parser.add_argument("--email", required=True, help="Login email for the workspace owner")
    create_parser.add_argument("--password", required=True, help="Login password for the workspace owner")
    create_parser.add_argument("--tenant-name", required=True, help="Workspace/company display name")
    create_parser.add_argument("--tenant-slug", default="", help="Optional explicit workspace slug")
    create_parser.add_argument("--tenant-icon", default="", help="Optional tenant icon URL or asset path")
    create_parser.add_argument("--full-name", default="", help="Optional owner full name")
    create_parser.add_argument("--role", default="owner", choices=["owner", "admin", "recruiter", "viewer"])
    create_parser.add_argument(
        "--create-folders",
        action="store_true",
        help="Also create the tenant folder under --workspace-root-path and optional --drive-sync-path",
    )
    create_parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable summary")

    bulk_parser = subparsers.add_parser("bulk-create-from-csv", help="Create users and tenants from a CSV file")
    bulk_parser.add_argument("csv_path", help="CSV file with at least email,password,tenant_name,tenant_icon columns")
    bulk_parser.add_argument(
        "--create-folders",
        action="store_true",
        help="Also create tenant folders under --workspace-root-path and optional --drive-sync-path",
    )
    bulk_parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable summary")

    add_users_parser = subparsers.add_parser(
        "bulk-add-users-to-tenant-from-csv",
        help="Create auth users and memberships for one existing tenant from a CSV file",
    )
    add_users_parser.add_argument("csv_path", help="CSV file with at least email,password columns")
    add_users_parser.add_argument("--tenant-slug", required=True, help="Existing tenant slug to add users to")
    add_users_parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable summary")

    platform_admin_parser = subparsers.add_parser(
        "ensure-platform-admin",
        help="Create or update an auth user and grant platform-wide admin access",
    )
    platform_admin_parser.add_argument("--email", required=True, help="Login email for the platform admin")
    platform_admin_parser.add_argument("--password", required=True, help="Login password for the platform admin")
    platform_admin_parser.add_argument("--full-name", default="", help="Optional display name")
    platform_admin_parser.add_argument(
        "--note",
        default="Platform admin",
        help="Audit note stored on public.platform_admins",
    )
    platform_admin_parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable summary")

    return parser


def print_tenant_table(rows: Iterable[dict[str, Any]], drive_root: str) -> None:
    rows = list(rows)
    if not rows:
        print("No tenants found.")
        return

    headers = ("slug", "name", "members", "candidates", "documents", "icon", "drive_folder")
    table_rows = [
        (
            row["slug"],
            row["name"],
            str(row["membership_count"]),
            str(row["candidate_count"]),
            str(row["document_count"]),
            row.get("icon_url", ""),
            f"{drive_root}/{row['folder_name']}",
        )
        for row in rows
    ]
    widths = [len(header) for header in headers]
    for row in table_rows:
        widths = [max(current, len(cell)) for current, cell in zip(widths, row)]

    def emit(values: Iterable[str]) -> None:
        print("  ".join(value.ljust(width) for value, width in zip(values, widths)))

    emit(headers)
    emit("-" * width for width in widths)
    for row in table_rows:
        emit(row)


def create_tenant_account(client: SupabaseAdminClient, args: argparse.Namespace) -> BootstrapResult:
    tenant_slug = args.tenant_slug.strip() or slugify(args.tenant_name)
    if not tenant_slug:
        raise SupabaseAdminError("Could not derive a tenant slug. Pass --tenant-slug explicitly.")

    user = client.create_user(args.email, args.password, full_name=args.full_name)
    user_id = user.get("id")
    if not user_id:
        raise SupabaseAdminError("Supabase did not return a user id.")

    tenant_icon = args.tenant_icon.strip()
    tenant = client.create_tenant(name=args.tenant_name, slug=tenant_slug, created_by=user_id, icon_url=tenant_icon)
    tenant_id = tenant.get("id")
    if not tenant_id:
        raise SupabaseAdminError("Supabase did not return a tenant id.")

    client.add_membership(tenant_id=tenant_id, user_id=user_id, role=args.role)

    folder_name = tenant_slug
    return BootstrapResult(
        user_id=user_id,
        email=args.email.strip(),
        tenant_id=tenant_id,
        tenant_name=args.tenant_name.strip(),
        tenant_slug=tenant_slug,
        tenant_icon=tenant_icon,
        role=args.role,
        folder_name=folder_name,
        drive_root=args.drive_root,
    )


def create_account_for_existing_tenant(client: SupabaseAdminClient, args: argparse.Namespace) -> BootstrapResult:
    tenant_slug = args.tenant_slug.strip()
    if not tenant_slug:
        raise SupabaseAdminError("Existing tenant membership import requires --tenant-slug.")

    tenant = client.get_tenant_by_slug(tenant_slug)
    if tenant is None:
        raise SupabaseAdminError(f"Could not find tenant with slug '{tenant_slug}'.")

    user = client.create_user(args.email, args.password, full_name=args.full_name)
    user_id = user.get("id")
    if not user_id:
        raise SupabaseAdminError("Supabase did not return a user id.")

    tenant_id = str(tenant.get("id") or "")
    if not tenant_id:
        raise SupabaseAdminError("Supabase did not return a tenant id.")

    resolved_slug = str(tenant.get("slug") or tenant_slug)
    resolved_name = str(tenant.get("name") or "").strip()
    tenant_icon = str(tenant.get("icon_url") or "")

    client.add_membership(tenant_id=tenant_id, user_id=user_id, role=args.role)

    return BootstrapResult(
        user_id=user_id,
        email=args.email.strip(),
        tenant_id=tenant_id,
        tenant_name=resolved_name,
        tenant_slug=resolved_slug,
        tenant_icon=tenant_icon,
        role=args.role,
        folder_name=resolved_slug,
        drive_root=args.drive_root,
    )


def ensure_platform_admin(client: SupabaseAdminClient, args: argparse.Namespace) -> PlatformAdminResult:
    email = args.email.strip()
    if not email:
        raise SupabaseAdminError("Platform admin email is required.")
    if not args.password:
        raise SupabaseAdminError("Platform admin password is required.")

    existing_user = client.get_auth_user_by_email(email)
    created_user = existing_user is None
    password_updated = False
    if created_user:
        user = client.create_user(email, args.password, full_name=args.full_name)
    else:
        user_id = str(existing_user.get("id") or "")
        if not user_id:
            raise SupabaseAdminError(f"Existing auth user for {email} has no id.")
        user = client.update_user_password(user_id, args.password, full_name=args.full_name)
        password_updated = True

    user_id = str(user.get("id") or (existing_user or {}).get("id") or "")
    if not user_id:
        raise SupabaseAdminError("Supabase did not return a user id.")

    existing_admin = client.get_platform_admin(user_id)
    client.upsert_platform_admin(user_id=user_id, note=args.note)

    return PlatformAdminResult(
        user_id=user_id,
        email=email,
        created_user=created_user,
        password_updated=password_updated,
        platform_admin_added=existing_admin is None,
        note=args.note.strip(),
    )


def normalize_slug_filters(values: Iterable[str]) -> set[str]:
    return {value.strip() for value in values if value.strip()}


def create_workspace_folder(path: Path) -> str:
    path.mkdir(parents=True, exist_ok=True)
    gitkeep = path / ".gitkeep"
    if not gitkeep.exists():
        gitkeep.touch()
    return str(path.resolve())


def should_skip_sync_path(path: Path) -> bool:
    return path.name in {".gitkeep", ".DS_Store"}


def ensure_workspace_folders(
    rows: Iterable[dict[str, Any]],
    *,
    workspace_root_path: str,
    drive_sync_path: str,
    drive_root: str,
    slug_filters: Optional[set[str]] = None,
) -> list[WorkspaceFolderResult]:
    workspace_root = Path(workspace_root_path).expanduser().resolve()
    workspace_root.mkdir(parents=True, exist_ok=True)

    drive_root_path: Optional[Path] = None
    if drive_sync_path.strip():
        drive_root_path = Path(drive_sync_path).expanduser().resolve() / drive_root
        drive_root_path.mkdir(parents=True, exist_ok=True)

    results: list[WorkspaceFolderResult] = []
    for row in rows:
        tenant_slug = str(row["slug"]).strip()
        if slug_filters and tenant_slug not in slug_filters:
            continue

        local_folder = create_workspace_folder(workspace_root / tenant_slug)
        drive_folder = ""
        if drive_root_path is not None:
            drive_folder = create_workspace_folder(drive_root_path / tenant_slug)

        results.append(
            WorkspaceFolderResult(
                tenant_id=str(row["tenant_id"]),
                tenant_name=str(row["name"]),
                tenant_slug=tenant_slug,
                local_folder=local_folder,
                drive_folder=drive_folder,
            )
        )
    return results


def sync_workspace_to_drive(
    rows: Iterable[dict[str, Any]],
    *,
    workspace_root_path: str,
    drive_sync_path: str,
    drive_root: str,
    slug_filters: Optional[set[str]] = None,
    delete: bool = False,
    dry_run: bool = False,
) -> list[WorkspaceSyncResult]:
    if not drive_sync_path.strip():
        raise SupabaseAdminError("--drive-sync-path is required for sync-workspaces-to-drive.")

    workspace_root = Path(workspace_root_path).expanduser().resolve()
    drive_root_path = Path(drive_sync_path).expanduser().resolve() / drive_root
    drive_root_path.mkdir(parents=True, exist_ok=True)

    results: list[WorkspaceSyncResult] = []
    for row in rows:
        tenant_slug = str(row["slug"]).strip()
        if slug_filters and tenant_slug not in slug_filters:
            continue

        source_folder = workspace_root / tenant_slug
        if not source_folder.exists():
            raise SupabaseAdminError(f"Local workspace folder does not exist: {source_folder}")

        drive_folder = drive_root_path / tenant_slug
        if not dry_run:
            drive_folder.mkdir(parents=True, exist_ok=True)

        copied_files = 0
        deleted_files = 0

        source_rel_files: set[Path] = set()
        for source_path in source_folder.rglob("*"):
            if source_path.is_dir() or should_skip_sync_path(source_path):
                continue

            relative_path = source_path.relative_to(source_folder)
            source_rel_files.add(relative_path)
            destination_path = drive_folder / relative_path
            destination_parent = destination_path.parent
            if not dry_run:
                destination_parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_path, destination_path)
            copied_files += 1

        if delete and drive_folder.exists():
            for destination_path in sorted(drive_folder.rglob("*"), reverse=True):
                if destination_path.is_dir():
                    if not dry_run and destination_path != drive_folder:
                        try:
                            destination_path.rmdir()
                        except OSError:
                            pass
                    continue
                if should_skip_sync_path(destination_path):
                    continue

                relative_path = destination_path.relative_to(drive_folder)
                if relative_path not in source_rel_files:
                    if not dry_run:
                        destination_path.unlink()
                    deleted_files += 1

        results.append(
            WorkspaceSyncResult(
                tenant_id=str(row["tenant_id"]),
                tenant_name=str(row["name"]),
                tenant_slug=tenant_slug,
                source_folder=str(source_folder),
                drive_folder=str(drive_folder),
                copied_files=copied_files,
                deleted_files=deleted_files,
                dry_run=dry_run,
            )
        )

    return results


def move_workspace_folder(source: Path, destination: Path) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() == destination.resolve():
        return str(destination.resolve())
    if source.exists():
        if destination.exists():
            raise SupabaseAdminError(f"Destination folder already exists: {destination}")
        source.rename(destination)
    else:
        destination.mkdir(parents=True, exist_ok=True)
        gitkeep = destination / ".gitkeep"
        if not gitkeep.exists():
            gitkeep.touch()
    return str(destination.resolve())


def load_csv_rows(csv_path: str, *, required_headers: Iterable[str]) -> list[dict[str, str]]:
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise SupabaseAdminError("CSV file is missing a header row.")

        normalized_headers = {header.strip() for header in reader.fieldnames if header}
        missing = sorted({header.strip() for header in required_headers if header.strip()} - normalized_headers)
        if missing:
            raise SupabaseAdminError(
                "CSV is missing required headers: " + ", ".join(missing)
            )

        rows: list[dict[str, str]] = []
        for row in reader:
            normalized = {str(key).strip(): str(value or "").strip() for key, value in row.items() if key}
            if not any(normalized.values()):
                continue
            rows.append(normalized)
        return rows


def build_namespace(row: dict[str, str], drive_root: str) -> argparse.Namespace:
    return argparse.Namespace(
        email=row.get("email", ""),
        password=row.get("password", ""),
        tenant_name=row.get("tenant_name", ""),
        tenant_slug=row.get("tenant_slug", ""),
        tenant_icon=row.get("tenant_icon", ""),
        full_name=row.get("full_name", ""),
        role=row.get("role", "owner") or "owner",
        drive_root=drive_root,
        workspace_root_path=row.get("workspace_root_path", ""),
        drive_sync_path=row.get("drive_sync_path", ""),
        create_folders=(row.get("create_folders", "") or "").strip().lower() in {"1", "true", "yes"},
    )


def validate_csv_row(row: dict[str, str], row_number: int) -> None:
    missing_fields = [field for field in ("email", "password", "tenant_name") if not row.get(field, "").strip()]
    if missing_fields:
        raise SupabaseAdminError(f"Row {row_number} is missing values for: {', '.join(missing_fields)}")


def validate_existing_tenant_csv_row(row: dict[str, str], row_number: int) -> None:
    missing_fields = [field for field in ("email", "password") if not row.get(field, "").strip()]
    if missing_fields:
        raise SupabaseAdminError(f"Row {row_number} is missing values for: {', '.join(missing_fields)}")


def bulk_create_from_csv(client: SupabaseAdminClient, csv_path: str, drive_root: str) -> dict[str, Any]:
    return bulk_create_from_csv_with_paths(
        client,
        csv_path,
        drive_root=drive_root,
        workspace_root_path="",
        drive_sync_path="",
        create_folders=False,
    )


def bulk_create_from_csv_with_paths(
    client: SupabaseAdminClient,
    csv_path: str,
    *,
    drive_root: str,
    workspace_root_path: str,
    drive_sync_path: str,
    create_folders: bool,
) -> dict[str, Any]:
    rows = load_csv_rows(csv_path, required_headers=("email", "password", "tenant_name", "tenant_icon"))
    successes: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    for index, row in enumerate(rows, start=2):
        try:
            validate_csv_row(row, index)
            namespace = build_namespace(row, drive_root)
            namespace.workspace_root_path = workspace_root_path
            namespace.drive_sync_path = drive_sync_path
            namespace.create_folders = create_folders
            result = create_tenant_account(client, namespace)
            payload: dict[str, Any] = {
                "row": index,
                "email": result.email,
                "tenant_id": result.tenant_id,
                "tenant_name": result.tenant_name,
                "tenant_slug": result.tenant_slug,
                "tenant_icon": result.tenant_icon,
                "folder_name": result.folder_name,
                "google_drive_folder": f"{result.drive_root}/{result.folder_name}",
            }
            if create_folders:
                folders = ensure_workspace_folders(
                    [
                        {
                            "tenant_id": result.tenant_id,
                            "name": result.tenant_name,
                            "slug": result.tenant_slug,
                        }
                    ],
                    workspace_root_path=workspace_root_path,
                    drive_sync_path=drive_sync_path,
                    drive_root=drive_root,
                )
                if folders:
                    payload["local_workspace_folder"] = folders[0].local_folder
                    if folders[0].drive_folder:
                        payload["drive_workspace_folder"] = folders[0].drive_folder
            successes.append(payload)
        except Exception as exc:  # noqa: BLE001
            failures.append(
                {
                    "row": index,
                    "email": row.get("email", ""),
                    "tenant_name": row.get("tenant_name", ""),
                    "error": format_error_message(exc),
                }
            )

    return {
        "csv_path": csv_path,
        "processed": len(rows),
        "created": len(successes),
        "failed": len(failures),
        "results": successes,
        "failures": failures,
    }


def bulk_add_users_to_tenant_from_csv(
    client: SupabaseAdminClient,
    csv_path: str,
    *,
    tenant_slug: str,
    drive_root: str,
) -> dict[str, Any]:
    rows = load_csv_rows(csv_path, required_headers=("email", "password"))
    successes: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    for index, row in enumerate(rows, start=2):
        try:
            validate_existing_tenant_csv_row(row, index)
            namespace = build_namespace(row, drive_root)
            namespace.tenant_slug = tenant_slug
            result = create_account_for_existing_tenant(client, namespace)
            successes.append(
                {
                    "row": index,
                    "user_id": result.user_id,
                    "email": result.email,
                    "tenant_id": result.tenant_id,
                    "tenant_name": result.tenant_name,
                    "tenant_slug": result.tenant_slug,
                    "role": result.role,
                    "google_drive_folder": f"{result.drive_root}/{result.folder_name}",
                }
            )
        except Exception as exc:  # noqa: BLE001
            failures.append(
                {
                    "row": index,
                    "email": row.get("email", ""),
                    "error": format_error_message(exc),
                }
            )

    return {
        "csv_path": csv_path,
        "tenant_slug": tenant_slug,
        "processed": len(rows),
        "created": len(successes),
        "failed": len(failures),
        "results": successes,
        "failures": failures,
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    client = SupabaseAdminClient(args.supabase_url, args.service_role_key)

    if args.command == "list-tenants":
        rows = client.list_tenants()
        if args.json:
            print(compact_json({"drive_root": args.drive_root, "tenants": rows}))
        else:
            print(f"Google Drive root: {args.drive_root}")
            print_tenant_table(rows, args.drive_root)
        return 0

    if args.command == "ensure-workspace-folders":
        rows = client.list_tenants()
        results = ensure_workspace_folders(
            rows,
            workspace_root_path=args.workspace_root_path,
            drive_sync_path=args.drive_sync_path,
            drive_root=args.drive_root,
            slug_filters=normalize_slug_filters(args.tenant_slug),
        )
        payload = {
            "workspace_root_path": str(Path(args.workspace_root_path).expanduser().resolve()),
            "drive_root": args.drive_root,
            "drive_sync_path": str(Path(args.drive_sync_path).expanduser().resolve()) if args.drive_sync_path else "",
            "created": [
                {
                    "tenant_id": result.tenant_id,
                    "tenant_name": result.tenant_name,
                    "tenant_slug": result.tenant_slug,
                    "local_workspace_folder": result.local_folder,
                    "drive_workspace_folder": result.drive_folder,
                }
                for result in results
            ],
        }
        if args.json:
            print(compact_json(payload))
        else:
            print(f"Workspace root: {payload['workspace_root_path']}")
            if payload["drive_sync_path"]:
                print(f"Drive sync root: {payload['drive_sync_path']}/{args.drive_root}")
            print(f"Tenants prepared: {len(payload['created'])}")
            for result in payload["created"]:
                print(f"  {result['tenant_slug']} -> {result['local_workspace_folder']}")
                if result["drive_workspace_folder"]:
                    print(f"    drive -> {result['drive_workspace_folder']}")
        return 0

    if args.command == "sync-workspaces-to-drive":
        rows = client.list_tenants()
        results = sync_workspace_to_drive(
            rows,
            workspace_root_path=args.workspace_root_path,
            drive_sync_path=args.drive_sync_path,
            drive_root=args.drive_root,
            slug_filters=normalize_slug_filters(args.tenant_slug),
            delete=args.delete,
            dry_run=args.dry_run,
        )
        payload = {
            "workspace_root_path": str(Path(args.workspace_root_path).expanduser().resolve()),
            "drive_root": args.drive_root,
            "drive_sync_path": str(Path(args.drive_sync_path).expanduser().resolve()),
            "delete": args.delete,
            "dry_run": args.dry_run,
            "results": [
                {
                    "tenant_id": result.tenant_id,
                    "tenant_name": result.tenant_name,
                    "tenant_slug": result.tenant_slug,
                    "source_folder": result.source_folder,
                    "drive_folder": result.drive_folder,
                    "copied_files": result.copied_files,
                    "deleted_files": result.deleted_files,
                    "dry_run": result.dry_run,
                }
                for result in results
            ],
        }
        if args.json:
            print(compact_json(payload))
        else:
            print(f"Workspace root: {payload['workspace_root_path']}")
            print(f"Drive sync root: {payload['drive_sync_path']}/{args.drive_root}")
            print(f"Mode: {'dry-run' if args.dry_run else 'live sync'}")
            for result in payload["results"]:
                print(
                    f"  {result['tenant_slug']}: copied {result['copied_files']} file(s)"
                    + (f", deleted {result['deleted_files']} file(s)" if args.delete else "")
                )
                print(f"    from {result['source_folder']}")
                print(f"    to   {result['drive_folder']}")
        return 0

    if args.command == "rename-tenant":
        old_slug = args.tenant_slug.strip()
        new_slug = args.new_slug.strip()
        renamed = client.rename_tenant(tenant_slug=old_slug, new_name=args.new_name, new_slug=new_slug)
        payload = {
            "tenant_id": renamed["id"],
            "old_slug": old_slug,
            "new_slug": renamed["slug"],
            "new_name": renamed["name"],
            "local_workspace_folder": "",
            "drive_workspace_folder": "",
        }
        if args.move_folders:
            workspace_root = Path(args.workspace_root_path).expanduser().resolve()
            payload["local_workspace_folder"] = move_workspace_folder(
                workspace_root / old_slug,
                workspace_root / new_slug,
            )
            if args.drive_sync_path.strip():
                drive_root = Path(args.drive_sync_path).expanduser().resolve() / args.drive_root
                payload["drive_workspace_folder"] = move_workspace_folder(
                    drive_root / old_slug,
                    drive_root / new_slug,
                )
        if args.json:
            print(compact_json(payload))
        else:
            print(f"Renamed tenant '{old_slug}' -> '{payload['new_slug']}'")
            print(f"Display name: {payload['new_name']}")
            if payload["local_workspace_folder"]:
                print(f"Local workspace folder: {payload['local_workspace_folder']}")
            if payload["drive_workspace_folder"]:
                print(f"Drive workspace folder: {payload['drive_workspace_folder']}")
        return 0

    if args.command == "ensure-platform-admin":
        result = ensure_platform_admin(client, args)
        payload = {
            "user_id": result.user_id,
            "email": result.email,
            "created_user": result.created_user,
            "password_updated": result.password_updated,
            "platform_admin_added": result.platform_admin_added,
            "note": result.note,
        }
        if args.json:
            print(compact_json(payload))
        else:
            print("Platform admin ready.")
            print(f"Email: {result.email}")
            print(f"User id: {result.user_id}")
            print(f"Auth user: {'created' if result.created_user else 'already existed'}")
            print(f"Password: {'updated' if result.password_updated else 'set'}")
            print(f"Platform admin grant: {'added' if result.platform_admin_added else 'already existed'}")
        return 0

    if args.command == "create-tenant-account":
        result = create_tenant_account(client, args)
        payload = {
            "user_id": result.user_id,
            "email": result.email,
            "tenant_id": result.tenant_id,
            "tenant_name": result.tenant_name,
            "tenant_slug": result.tenant_slug,
            "tenant_icon": result.tenant_icon,
            "role": result.role,
            "folder_name": result.folder_name,
            "google_drive_folder": f"{result.drive_root}/{result.folder_name}",
        }
        if args.create_folders:
            folders = ensure_workspace_folders(
                [
                    {
                        "tenant_id": result.tenant_id,
                        "name": result.tenant_name,
                        "slug": result.tenant_slug,
                    }
                ],
                workspace_root_path=args.workspace_root_path,
                drive_sync_path=args.drive_sync_path,
                drive_root=args.drive_root,
            )
            if folders:
                payload["local_workspace_folder"] = folders[0].local_folder
                if folders[0].drive_folder:
                    payload["drive_workspace_folder"] = folders[0].drive_folder
        if args.json:
            print(compact_json(payload))
        else:
            print("Workspace created successfully.")
            print(f"Tenant: {result.tenant_name} ({result.tenant_id})")
            print(f"Slug: {result.tenant_slug}")
            if result.tenant_icon:
                print(f"Icon: {result.tenant_icon}")
            print(f"Owner email: {result.email}")
            print(f"Folder name: {result.folder_name}")
            print(f"Google Drive folder: {result.drive_root}/{result.folder_name}")
            if args.create_folders:
                print(f"Local workspace folder: {payload['local_workspace_folder']}")
                if payload.get("drive_workspace_folder"):
                    print(f"Drive workspace folder: {payload['drive_workspace_folder']}")
            print("")
            print("Recommended worker input:")
            if payload.get("drive_workspace_folder"):
                print(f"  {payload['drive_workspace_folder']}")
            else:
                print(f"  {Path(args.workspace_root_path).expanduser().resolve() / result.folder_name}")
        return 0

    if args.command == "bulk-create-from-csv":
        payload = bulk_create_from_csv_with_paths(
            client,
            args.csv_path,
            drive_root=args.drive_root,
            workspace_root_path=args.workspace_root_path,
            drive_sync_path=args.drive_sync_path,
            create_folders=args.create_folders,
        )
        if args.json:
            print(compact_json(payload))
        else:
            print(f"Processed: {payload['processed']}")
            print(f"Created:   {payload['created']}")
            print(f"Failed:    {payload['failed']}")
            if payload["results"]:
                print("")
                print("Created workspaces:")
                for result in payload["results"]:
                    print(
                        f"  row {result['row']}: {result['tenant_name']} "
                        f"({result['tenant_slug']}) -> {result['google_drive_folder']}"
                    )
                    if result.get("local_workspace_folder"):
                        print(f"    local -> {result['local_workspace_folder']}")
                    if result.get("drive_workspace_folder"):
                        print(f"    drive -> {result['drive_workspace_folder']}")
            if payload["failures"]:
                print("")
                print("Failures:")
                for failure in payload["failures"]:
                    print(
                        f"  row {failure['row']}: {failure['tenant_name'] or failure['email'] or 'unknown'} "
                        f"- {failure['error']}"
                    )
        return 0 if payload["failed"] == 0 else 2

    if args.command == "bulk-add-users-to-tenant-from-csv":
        payload = bulk_add_users_to_tenant_from_csv(
            client,
            args.csv_path,
            tenant_slug=args.tenant_slug,
            drive_root=args.drive_root,
        )
        if args.json:
            print(compact_json(payload))
        else:
            print(f"Tenant slug: {payload['tenant_slug']}")
            print(f"Processed:   {payload['processed']}")
            print(f"Created:     {payload['created']}")
            print(f"Failed:      {payload['failed']}")
            if payload["results"]:
                print("")
                print("Added users:")
                for result in payload["results"]:
                    print(
                        f"  row {result['row']}: {result['email']} "
                        f"-> {result['tenant_name']} ({result['tenant_slug']}) as {result['role']}"
                    )
            if payload["failures"]:
                print("")
                print("Failures:")
                for failure in payload["failures"]:
                    print(
                        f"  row {failure['row']}: {failure['email'] or 'unknown'} "
                        f"- {failure['error']}"
                    )
        return 0 if payload["failed"] == 0 else 2

    parser.error(f"Unsupported command: {args.command}")
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SupabaseAdminError as exc:
        print(format_error_message(exc), file=sys.stderr)
        raise SystemExit(2) from exc
