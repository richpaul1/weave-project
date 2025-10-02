import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageCircle, Plus, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { v4 as uuidv4 } from "uuid";

interface ChatSession {
  sessionId: string;
  title: string;
  preview: string;
  lastActivity: string;
  createdAt: string;
  messageCount: number;
  lastMessage: string;
  lastSender: string;
}

interface SessionsListProps {
  currentSessionId?: string;
}

export default function SessionsList({ currentSessionId }: SessionsListProps) {
  const [, navigate] = useLocation();
  const [deletingSession, setDeletingSession] = useState<string | null>(null);

  // Fetch recent sessions
  const { data: sessions = [], isLoading, refetch } = useQuery<ChatSession[]>({
    queryKey: ["/api/chat/sessions"],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/chat/sessions?limit=10');
        return response || [];
      } catch (error) {
        console.error('Error fetching sessions:', error);
        return [];
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const handleNewChat = () => {
    const newSessionId = uuidv4();
    localStorage.setItem("chatSessionId", newSessionId);
    navigate(`/chat/${newSessionId}`);
  };

  const handleSessionClick = (sessionId: string) => {
    localStorage.setItem("chatSessionId", sessionId);
    navigate(`/chat/${sessionId}`);
  };

  const handleDeleteSession = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent session click
    
    if (deletingSession) return; // Prevent multiple deletes
    
    setDeletingSession(sessionId);
    
    try {
      await apiRequest('DELETE', `/api/chat/messages/${sessionId}`);
      
      // If we deleted the current session, create a new one
      if (sessionId === currentSessionId) {
        handleNewChat();
      }
      
      // Refetch sessions to update the list
      refetch();
    } catch (error) {
      console.error('Error deleting session:', error);
    } finally {
      setDeletingSession(null);
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    // Parse the UTC timestamp correctly
    const date = new Date(timestamp);
    const now = new Date();

    // Ensure we're working with valid dates
    if (isNaN(date.getTime())) {
      return "Unknown";
    }

    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Handle negative differences (future timestamps)
    if (diffMs < 0) return "Just now";

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with New Chat button */}
      <div className="p-4 border-b border-border">
        <Button 
          onClick={handleNewChat}
          className="w-full justify-start"
          variant="outline"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>

      {/* Sessions List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              <Clock className="h-4 w-4 mx-auto mb-2 animate-spin" />
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No chat sessions yet</p>
              <p className="text-xs">Start a new conversation!</p>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.sessionId}
                onClick={() => handleSessionClick(session.sessionId)}
                className={cn(
                  "group relative p-3 rounded-lg cursor-pointer transition-colors",
                  "hover:bg-accent/50 border border-transparent",
                  currentSessionId === session.sessionId
                    ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800/30"
                    : "hover:border-border"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageCircle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(session.lastActivity)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({session.messageCount} msgs)
                      </span>
                    </div>
                    
                    <p className="text-sm font-medium text-foreground truncate mb-1">
                      {session.title}
                    </p>
                    
                    {session.preview && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {session.preview}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDeleteSession(session.sessionId, e)}
                    disabled={deletingSession === session.sessionId}
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 ml-2 flex-shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
