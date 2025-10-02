import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2, Brain, Bug, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/types/schema";
import { apiRequest } from "@/lib/queryClient";
import { streamingClient } from "@/lib/streaming";
import MarkdownRenderer from "@/components/markdown-renderer";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { openWeaveUI, getWeaveConfig, type WeaveConfig } from "@/lib/weave";

interface StreamingMessage extends ChatMessage {
  isStreaming?: boolean;
  isThinkingComplete?: boolean;
}

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.sessionId || "";
  const [message, setMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});
  const [weaveConfig, setWeaveConfig] = useState<WeaveConfig | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Refs to track current streaming content for saving
  const currentResponseRef = useRef<string>("");
  const currentThinkingRef = useRef<string>("");

  // Fetch chat history
  const { data: chatHistory = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/messages/${sessionId}`],
    queryFn: async () => {
      try {
        console.log('🔍 Fetching chat history for session:', sessionId);
        const response = await apiRequest('GET', `/api/chat/messages/${sessionId}`);
        console.log('📨 Chat history fetched:', response);
        return response || [];
      } catch (error) {
        console.error('❌ Error fetching chat history:', error);
        return [];
      }
    },
    enabled: !!sessionId,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
  });

  // Load Weave configuration on mount
  useEffect(() => {
    getWeaveConfig().then(setWeaveConfig);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [chatHistory, streamingMessages]);

  // Combine chat history and streaming messages
  const allMessages = [
    ...chatHistory.map(msg => ({
      id: msg.id,
      role: (msg as any).sender === 'user' ? 'user' : 'ai', // Convert sender to role
      content: (msg as any).message || msg.content, // Handle both message and content fields
      thinking: msg.thinking,
      createdAt: (msg as any).timestamp ? new Date((msg as any).timestamp).getTime() : msg.createdAt, // Convert timestamp to number
      sessionId: msg.sessionId,
      isStreaming: false,
      isThinkingComplete: true,
    })),
    ...streamingMessages,
  ].sort((a, b) => a.createdAt - b.createdAt);

  // Log streaming messages state changes
  useEffect(() => {
    console.log('📊 Streaming messages state:', streamingMessages);
  }, [streamingMessages]);

  // Log chat history changes
  useEffect(() => {
    console.log('📚 Chat history loaded:', chatHistory);
  }, [chatHistory]);

  // Log all messages combination
  useEffect(() => {
    console.log('📋 All messages (history + streaming):', allMessages);
  }, [allMessages]);

  const handleSendMessage = async () => {
    if (!message.trim() || isStreaming || !sessionId) return;

    const timestamp = Date.now();
    const userMessage = message.trim();
    setMessage("");
    setIsStreaming(true);

    // Add user message to UI immediately (will be replaced with server-confirmed version)
    const tempUserMessageId = uuidv4();
    const userMessageObj: StreamingMessage = {
      id: tempUserMessageId,
      role: "user",
      content: userMessage,
      thinking: "",
      isStreaming: false,
      isThinkingComplete: true,
      createdAt: timestamp,
      sessionId: sessionId,
    };

    setStreamingMessages((prev) => [...prev, userMessageObj]);

    const assistantId = uuidv4();
    const initialAssistantMessage: StreamingMessage = {
      id: assistantId,
      role: "ai",
      content: "",
      thinking: "",
      isStreaming: true,
      isThinkingComplete: false,
      createdAt: timestamp + 1000, // Show after user message
      sessionId: sessionId,
    };

    // Reset refs for new streaming session
    currentResponseRef.current = "";
    currentThinkingRef.current = "";

    setStreamingMessages((prev) => [...prev, initialAssistantMessage]);

    // Start streaming with new server-side storage flow
    try {
      await streamingClient.startStream(
        "/api/chat/stream",
        { query: userMessage, session_id: sessionId },
        (newThinking) => {
          console.log('🧠 Thinking received:', newThinking);
          currentThinkingRef.current = newThinking;
          setStreamingMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, thinking: newThinking } : msg
            )
          );
        },
        (newResponse) => {
          console.log('💬 Response chunk received:', newResponse);
          currentResponseRef.current += newResponse;
          setStreamingMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? {
                ...msg,
                content: currentResponseRef.current,
                isThinkingComplete: true // Stop thinking spinner when response starts
              } : msg
            )
          );
        },
        (completionData?: any) => {
          console.log('✅ Streaming completed with server-side storage');
          console.log('💾 Server saved messages:', completionData);

          // Update user message with server-confirmed ID if provided
          if (completionData?.user_message_id) {
            setStreamingMessages((prev) =>
              prev.map((msg) =>
                msg.id === tempUserMessageId ? { ...msg, id: completionData.user_message_id } : msg
              )
            );
          }

          // Update AI message with server-confirmed ID if provided
          if (completionData?.ai_message_id) {
            setStreamingMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId ? { ...msg, id: completionData.ai_message_id } : msg
              )
            );
          }

          console.log('🧹 Clearing streaming state');
          setIsStreaming(false);

          // Keep messages in UI - no need to refresh from server since we have the data
          // Only invalidate sessions list to update "last message" info
          console.log('🔄 Invalidating sessions query only');
          queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });

          // Move streaming messages to permanent state
          setStreamingMessages([]);
        },
        (error) => {
          console.error('Streaming error:', error);
          toast.error("Failed to get response");
          setIsStreaming(false);
          setStreamingMessages([]);
        }
      );
    } catch (error) {
      console.error('Error starting stream:', error);
      toast.error("Failed to start chat");
      setIsStreaming(false);
      setStreamingMessages([]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleOpenWeaveUI = () => {
    openWeaveUI(sessionId);
  };

  // Clear history mutation with requesting session ID
  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      console.log('🗑️ Clearing chat history for session:', sessionId);
      console.log('🔍 Requesting session ID:', sessionId);

      return apiRequest("DELETE", `/api/chat/messages/${sessionId}`, {
        requesting_session_id: sessionId,
        reason: "user_requested_clear_history"
      });
    },
    onSuccess: (response) => {
      console.log('✅ Chat history cleared successfully:', response);

      // Clear local state
      setStreamingMessages([]);
      setMessage("");

      // Invalidate and refetch chat history
      queryClient.invalidateQueries({ queryKey: [`/api/chat/messages/${sessionId}`] });

      toast.success("Chat history cleared successfully");
    },
    onError: (error) => {
      console.error('❌ Error clearing chat history:', error);
      toast.error("Failed to clear chat history");
    },
  });

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear all chat history for this session? This action cannot be undone.")) {
      clearHistoryMutation.mutate();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="bg-surface border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">RAG Chat Interface</h2>
            <p className="text-sm text-muted-foreground">Ask questions about the crawled content</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearHistory}
              disabled={clearHistoryMutation.isPending || isStreaming}
              className="flex items-center gap-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              title="Clear chat history for this session"
            >
              <Trash2 className="h-4 w-4" />
              Clear History
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenWeaveUI}
              className={`flex items-center gap-2 ${
                weaveConfig?.enabled
                  ? 'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={
                weaveConfig?.enabled
                  ? "Open Weave UI for debugging and observability"
                : weaveConfig?.message || "Weave tracking is disabled"
            }
          >
            <Bug className="h-4 w-4" />
            <span className="hidden sm:inline">Debug In Weave</span>
            {weaveConfig?.enabled && (
              <div className="w-2 h-2 bg-green-500 rounded-full" />
            )}
          </Button>
          </div>
        </div>
      </header>

      <ScrollArea ref={scrollAreaRef} className="flex-1 p-6">
        <div className="flex flex-col space-y-8 max-w-4xl mx-auto">
          {allMessages.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <Bot className="h-16 w-16 mx-auto mb-4 text-primary" />
              <p className="text-lg mb-2">Welcome to Weave RAG Demo</p>
              <p className="text-muted-foreground">Ask me anything about the crawled content</p>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 mx-auto mb-4 text-primary animate-spin" />
              <p className="text-muted-foreground">Loading messages...</p>
            </div>
          )}

          {allMessages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "ai" && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}

              <div className="flex flex-col gap-2 max-w-2xl">
                {msg.role === "ai" && (
                  <Collapsible open={thinkingOpen[msg.id] ?? false} onOpenChange={(open) => setThinkingOpen(prev => ({ ...prev, [msg.id]: open }))}>
                    <Card className="bg-surface">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start p-3 hover:bg-transparent">
                          <Brain className={`h-4 w-4 mr-2 ${
                            msg.thinking && msg.thinking.trim()
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`} />
                          <span className="text-xs text-muted-foreground">Thinking Process</span>
                          {msg.isStreaming && !msg.isThinkingComplete && (
                            <Loader2 className="h-3 w-3 ml-2 text-primary animate-spin" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-3 pb-3">
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {msg.thinking || (msg.isStreaming && !msg.isThinkingComplete ? "Thinking..." : "No thinking process available")}
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                )}

                <Card className={`p-4 ${msg.role === "user" ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" : "bg-surface"}`}>
                  {msg.content ? (
                    <div className="markdown-content">
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  ) : null}
                </Card>
              </div>

              {msg.role === "user" && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-accent text-accent-foreground">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t p-6 bg-surface">
        <div className="flex space-x-4 items-end max-w-4xl mx-auto">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask me anything about the content..."
            className="flex-1 min-h-[80px] max-h-[200px] resize-none bg-background"
            disabled={isStreaming}
          />
          <Button onClick={handleSendMessage} disabled={!message.trim() || isStreaming} size="lg" className="px-6 py-3 h-[80px] flex-shrink-0">
            <Send className="h-4 w-4 mr-2" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
