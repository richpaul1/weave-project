import { Link, useLocation } from "wouter";
import { FolderOpen, Network } from "lucide-react";
import { cn } from "@/lib/utils";

const navigationItems = [
  { path: "/admin", label: "Admin", icon: FolderOpen },
  { path: "/graph", label: "Graph", icon: Network },
];

export default function Navigation() {
  const [location] = useLocation();

  return (
    <nav className="w-64 bg-surface border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground">
          <Network className="inline mr-2 h-5 w-5 text-primary" />
          Weave RAG Demo
        </h1>
      </div>

      <div className="flex-1 px-4 py-6 space-y-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path || (item.path === "/chat" && location === "/");

          return (
            <Link key={item.path} href={item.path}>
              <div className={cn("nav-item", isActive && "active")}>
                <Icon className="mr-3 h-4 w-4" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground">
          <p className="font-medium mb-1">Weave RAG Demo</p>
          <p>Powered by Weights & Biases</p>
        </div>
      </div>
    </nav>
  );
}

