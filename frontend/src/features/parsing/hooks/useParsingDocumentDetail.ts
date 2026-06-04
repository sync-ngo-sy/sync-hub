import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { ParsingDocumentDetail } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { canOpenOriginalDocument } from "@/features/parsing/utils/parsingDocument";

export function useParsingDocumentDetail(documentId: string | undefined) {
  const { adminMemberships, enabled, isAdmin, loading } = useAuth();
  const [detail, setDetail] = useState<ParsingDocumentDetail | null>(null);
  const [fetching, setFetching] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminTenantIds = useMemo(() => adminMemberships.map((membership) => membership.id), [adminMemberships]);
  const workspaceNameById = useMemo(
    () => new Map(adminMemberships.map((membership) => [membership.id, membership.name])),
    [adminMemberships],
  );

  useEffect(() => {
    if (!documentId) {
      return;
    }
    if (enabled && loading) {
      return;
    }
    if (enabled && !isAdmin) {
      return;
    }

    let active = true;
    setDetail(null);
    setFetching(true);
    setHasLoaded(false);
    setError(null);

    platformApi
      .getParsingDocument(documentId, adminTenantIds)
      .then((nextDetail) => {
        if (active) {
          setDetail(nextDetail);
        }
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load document diagnostics.");
        }
      })
      .finally(() => {
        if (active) {
          setHasLoaded(true);
          setFetching(false);
        }
      });

    return () => {
      active = false;
    };
  }, [adminTenantIds, documentId, enabled, isAdmin, loading]);

  async function handleOpenOriginalCv() {
    if (!detail || openingOriginal) {
      return;
    }

    setOpeningOriginal(true);
    setError(null);

    try {
      const documentUrl = await platformApi.getOriginalDocumentUrl(detail.storagePath, detail.sourceUri, {
        documentId: detail.documentId,
      });
      if (!documentUrl) {
        throw new Error("The original CV is not available from browser-accessible storage yet.");
      }

      window.open(documentUrl, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Unable to open the original CV.");
    } finally {
      setOpeningOriginal(false);
    }
  }

  const workspaceName = detail ? workspaceNameById.get(detail.tenantId) ?? "Unknown workspace" : "Unknown workspace";
  const canOpenOriginal = detail ? canOpenOriginalDocument(detail) : false;

  return {
    canOpenOriginal,
    detail,
    enabled,
    error,
    fetching,
    handleOpenOriginalCv,
    hasLoaded,
    isAdmin,
    loading,
    openingOriginal,
    workspaceName,
  };
}
