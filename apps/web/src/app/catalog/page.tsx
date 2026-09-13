import { CatalogView } from "@/components/catalog/catalog-view";

export default function CatalogPage() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-semibold">Module catalog</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Pick the modules you&apos;re enrolled in. Your selection is saved to your account and drives your calendar.
      </p>
      <CatalogView />
    </div>
  );
}
