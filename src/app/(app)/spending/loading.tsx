import { LoadingState } from "@/components/states/loading-state";

export default function SpendingLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-6 px-6 py-10">
      <LoadingState label="Loading spending" rows={6} />
    </div>
  );
}
