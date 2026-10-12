"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
export type AcademicSummary = {
  name?: string; grade: number; academicYear: string | null; program: string | null;
  programConfirmed: boolean; hasEnrollment: boolean; textbookCount: number;
};
export async function sessionAuthorization(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}
export function useAcademicContext(childId: string | null, legacyGrade: number) {
  const [summary, setSummary] = useState<{ childId: string; data: AcademicSummary } | null>(null);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    if (childId) {
      void (async () => {
        try {
          const response = await fetch(`/api/learning-context?childId=${encodeURIComponent(childId)}`, {
            headers: await sessionAuthorization(), signal: controller.signal,
          });
          if (response.ok && current) setSummary({ childId, data: await response.json() });
        } catch { /* Legacy child context remains usable when enrollment is unavailable. */ }
      })();
    }
    return () => { current = false; controller.abort(); };
  }, [childId]);
  return (summary?.childId === childId ? summary.data : null) || { grade: legacyGrade, academicYear: null, program: null, programConfirmed: false, hasEnrollment: false, textbookCount: 0 };
}
