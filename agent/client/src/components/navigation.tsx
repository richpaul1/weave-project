import { Link, useLocation } from "wouter";
import { MessageCircle, FolderOpen, Network, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";

const navigationItems = [
  { path: "/chat", label: "Chat", icon: MessageCircle },
];

export default function Navigation() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

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

      <div className="p-4 border-t border-border space-y-3">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start"
        >
          {theme === "dark" ? (
            <>
              <Sun className="mr-2 h-4 w-4" />
              Light Mode
            </>
          ) : (
            <>
              <Moon className="mr-2 h-4 w-4" />
              Dark Mode
            </>
          )}
        </Button>

        <div className="text-xs text-muted-foreground">
          <p className="font-medium mb-1">Weave RAG Demo</p>
          <p>Powered by Weights & Biases</p>
        </div>
      </div>
    </nav>
  );
}

