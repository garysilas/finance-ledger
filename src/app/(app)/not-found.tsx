import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-10">
      <EmptyState
        icon={SearchXIcon}
        title="Page not found"
        description="Ledger has no page at this address."
        action={
          <Button asChild variant="outline">
            <Link href="/status">Go to system status</Link>
          </Button>
        }
      />
    </div>
  );
}
