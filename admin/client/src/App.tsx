import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Navigation from "@/components/navigation";
import AdminPage from "@/pages/AdminPage";
import GraphPage from "@/pages/GraphPage";

function Router() {
  const [, navigate] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      <Navigation />
      <main className="flex-1 overflow-auto">
        <Switch>
          <Route path="/">
            {() => {
              navigate("/admin", { replace: true });
              return null;
            }}
          </Route>
          <Route path="/admin" component={AdminPage} />
          <Route path="/graph" component={GraphPage} />
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
