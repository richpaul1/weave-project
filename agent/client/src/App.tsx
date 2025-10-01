import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Navigation from "@/components/navigation";
import ChatPage from "@/pages/ChatPage";
import { v4 as uuidv4 } from "uuid";

function Router() {
  const [, navigate] = useLocation();

  // Check for existing session ID in local storage
  const getSessionId = () => {
    let sessionId = localStorage.getItem("chatSessionId");
    if (!sessionId) {
      sessionId = uuidv4();
      localStorage.setItem("chatSessionId", sessionId);
    }
    return sessionId;
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Navigation />
      <main className="flex-1 overflow-auto">
        <Switch>
          <Route path="/">
            {() => {
              const sessionId = getSessionId();
              navigate(`/chat/${sessionId}`, { replace: true });
              return null;
            }}
          </Route>
          <Route path="/chat">
            {() => {
              const sessionId = getSessionId();
              navigate(`/chat/${sessionId}`, { replace: true });
              return null;
            }}
          </Route>
          <Route path="/chat/:sessionId" component={ChatPage} />
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
