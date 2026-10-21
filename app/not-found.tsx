import Link from "next/link";

import { Button, Card } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <Card className="max-w-md text-center">
        <p className="text-5xl font-bold tabular-nums text-accent">404</p>
        <h1 className="mt-3 text-lg font-semibold">That page does not exist</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The link may be out of date. The catalog and your dashboard are both a click away.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/dashboard">
            <Button size="sm">Dashboard</Button>
          </Link>
          <Link href="/catalog">
            <Button size="sm" variant="outline">
              Catalog
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
