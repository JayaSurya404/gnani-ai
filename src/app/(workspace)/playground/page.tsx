"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PlaygroundRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/calls");
  }, [router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center space-y-2">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#7065E8] border-t-transparent" />
        <p className="text-xs text-[#778198]">Redirecting to LeadNexus Calls...</p>
      </div>
    </div>
  );
}
