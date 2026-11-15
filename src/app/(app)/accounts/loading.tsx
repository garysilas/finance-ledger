import { LoadingState } from "@/components/states/loading-state";

export default function AccountsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10">
      <LoadingState label="Loading accounts" />
    </div>
  );
}
