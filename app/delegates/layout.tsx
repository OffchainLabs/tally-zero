import { DelegatesSideMenu } from "@components/navigation/DelegatesSideMenu";

interface DelegatesLayoutProps {
  children: React.ReactNode;
}

export default function DelegatesLayout({ children }: DelegatesLayoutProps) {
  return (
    <div className="pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col md:flex-row gap-6">
        <aside className="md:w-56 md:shrink-0">
          <div className="md:sticky md:top-24">
            <DelegatesSideMenu />
          </div>
        </aside>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
