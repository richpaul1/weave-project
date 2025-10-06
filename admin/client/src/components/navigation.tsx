import { Link, useLocation } from "wouter";
import { Network, Settings, Sun, Moon, BookOpen, Book, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";

const navigationItems = [
  { path: "/content", label: "Content", icon: Book },
  { path: "/courses", label: "Courses", icon: BookOpen },
  { path: "/graph", label: "Graph", icon: Network },
  { path: "/prompt-optimization", label: "Prompt Optimization", icon: Brain },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function Navigation() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="w-64 bg-surface border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground">
          <Network className="inline mr-2 h-5 w-5 text-primary" />
          IzzyDocs
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
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start"
        >
          {theme === "dark" ? (
            <Sun className="mr-2 h-4 w-4" />
          ) : (
            <Moon className="mr-2 h-4 w-4" />
          )}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </Button>

        <div className="text-xs text-muted-foreground">
          <p className="font-medium mb-1">IzzyDocs</p>
          <p>Monitored by Weights & Biases</p>
        </div>
      </div>
    </nav>
  );
}

