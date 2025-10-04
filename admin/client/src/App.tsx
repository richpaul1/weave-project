import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Navigation from "@/components/navigation";
import AdminPage from "@/pages/AdminPage";
import CoursesPage from "@/pages/CoursesPage";
import GraphPage from "@/pages/GraphPage";
import SettingsPage from "@/pages/SettingsPage";

function Router() {
  const [, navigate] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      <Navigation />
      <main className="flex-1 overflow-auto">
        <Switch>
          <Route path="/">
            {() => {
              navigate("/content", { replace: true });
              return null;
            }}
          </Route>
          <Route path="/content" component={AdminPage} />
          <Route path="/courses" component={CoursesPage} />
          <Route path="/graph" component={GraphPage} />
          <Route path="/settings" component={SettingsPage} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
