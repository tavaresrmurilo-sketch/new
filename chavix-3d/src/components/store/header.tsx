import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { getStoreSettings } from "@/lib/settings";
import { DesktopNav, HeaderActions } from "./header-actions";

export async function Header() {
  const settings = await getStoreSettings();
  return (
    <>
      {settings.announcement && (
        <div className="layers bg-graphite text-center">
          <p className="container-page spec truncate py-2 text-graphite-muted">{settings.announcement}</p>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur-md backdrop-saturate-150">
        <div className="container-page flex h-16 items-center gap-6">
          <Link href="/" className="-ml-1 rounded-md p-1" aria-label="CHAVIX 3D — página inicial">
            <Logo id="header" />
          </Link>
          <DesktopNav />
          <div className="ml-auto">
            <HeaderActions />
          </div>
        </div>
      </header>
    </>
  );
}
