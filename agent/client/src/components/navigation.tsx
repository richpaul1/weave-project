import { Link, useLocation } from "wouter";
import { MessageCircle, FolderOpen, Network, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import SessionsList from "@/components/SessionsList";

const navigationItems = [
  { path: "/chat", label: "Chat", icon: MessageCircle },
];

export default function Navigation() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  // Extract current session ID from location
  const currentSessionId = location.startsWith('/chat/') ? location.split('/chat/')[1] : undefined;

  return (
    <nav className="w-64 bg-surface border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground">
          <Network className="inline mr-2 h-5 w-5 text-primary" />
          IzzyDocs
        </h1>
      </div>

      {/* Chat Sessions List */}
      <div className="flex-1 flex flex-col min-h-0">
        <SessionsList currentSessionId={currentSessionId} />
      </div>

      <div className="p-4 border-border space-y-3">
        {/* Navigation Items */}
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
          <p className="font-medium mb-1">IzzyDocs</p>
          <p>Monitored by Weights & Biases</p>
        </div>
      </div>
    </nav>
  );
}

