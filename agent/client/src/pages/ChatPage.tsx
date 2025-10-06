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
  thinkingBlocks?: { [blockNumber: number]: string };
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

  // Log component mount and session changes
  useEffect(() => {
    console.log('🏗️ [COMPONENT] ChatPage mounted/session changed');
    console.log('🆔 [COMPONENT] Session ID:', sessionId);
    console.log('📊 [COMPONENT] Initial state - streaming:', isStreaming, 'messages:', streamingMessages.length);

    return () => {
      console.log('🏗️ [COMPONENT] ChatPage unmounting or session changing');
    };
  }, [sessionId]);

  // Log streaming state changes
  useEffect(() => {
    console.log('🌊 [STREAMING STATE] isStreaming changed to:', isStreaming);
  }, [isStreaming]);

  // Track if we've loaded initial chat history
  const [hasLoadedInitialHistory, setHasLoadedInitialHistory] = useState(false);

  // Fetch chat history ONLY on initial page load/refresh
  const { data: chatHistory = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/messages/${sessionId}`],
    queryFn: async () => {
      try {
        console.log('🔍 [CHAT HISTORY] Fetching initial chat history for session:', sessionId);
        const response = await apiRequest('GET', `/api/chat/messages/${sessionId}`);
        console.log('📨 [CHAT HISTORY] Initial chat history fetched:', response?.length, 'messages');
        console.log('📊 [CHAT HISTORY] Full response:', response);

        setHasLoadedInitialHistory(true);
        return response || [];
      } catch (error) {
        console.error('❌ [CHAT HISTORY] Error fetching initial chat history:', error);
        setHasLoadedInitialHistory(true);
        return [];
      }
    },
    enabled: !!sessionId && !hasLoadedInitialHistory,
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Only fetch once
    refetchOnReconnect: false,
    refetchInterval: false, // Never automatically refetch
    staleTime: Infinity, // Consider data always fresh
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
    console.log('📚 [CHAT HISTORY] Chat history loaded:', chatHistory.length, 'messages');
    console.log('📚 [CHAT HISTORY] Full history:', chatHistory);
  }, [chatHistory]);

  // Log streaming messages changes
  useEffect(() => {
    console.log('🌊 [STREAMING] Streaming messages changed:', streamingMessages.length, 'messages');
    console.log('🌊 [STREAMING] Full streaming:', streamingMessages);
  }, [streamingMessages]);

  // Log all messages combination
  useEffect(() => {
    console.log('📋 [ALL MESSAGES] Combined messages (history + streaming):', allMessages.length, 'total');
    console.log('📋 [ALL MESSAGES] History:', chatHistory.length, 'Streaming:', streamingMessages.length);
    console.log('📋 [ALL MESSAGES] Full combined:', allMessages);
  }, [allMessages]);

  const handleSendMessage = async () => {
    if (!message.trim() || isStreaming || !sessionId) return;

    const timestamp = Date.now();
    const userMessage = message.trim();
    console.log('🚀 [SEND MESSAGE] Starting message send process');
    console.log('📝 [SEND MESSAGE] User message:', userMessage);
    console.log('🆔 [SEND MESSAGE] Session ID:', sessionId);
    console.log('📊 [SEND MESSAGE] Current streaming messages count:', streamingMessages.length);
    console.log('📊 [SEND MESSAGE] Current chat history count:', chatHistory.length);

    setMessage("");
    setIsStreaming(true);

    // Add user message to UI immediately (will be replaced with server-confirmed version)
    const tempUserMessageId = uuidv4();
    console.log('🆔 [SEND MESSAGE] Generated temp user message ID:', tempUserMessageId);

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

    console.log('➕ [SEND MESSAGE] Adding user message to streaming state');
    setStreamingMessages((prev) => {
      console.log('📊 [SEND MESSAGE] Previous streaming messages:', prev.length);
      const newMessages = [...prev, userMessageObj];
      console.log('📊 [SEND MESSAGE] New streaming messages count:', newMessages.length);
      return newMessages;
    });

    const assistantId = uuidv4();
    const initialAssistantMessage: StreamingMessage = {
      id: assistantId,
      role: "ai",
      content: "",
      thinking: "",
      thinkingBlocks: {},
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
      console.log('🌊 [STREAMING] Starting stream to /api/chat/stream-with-tools');
      await streamingClient.startStream(
        "/api/chat/stream-with-tools",
        { query: userMessage, session_id: sessionId },
        (newThinking, blockNumber = 1) => {
          console.log('🧠 [STREAMING] Thinking received:', newThinking, 'Block:', blockNumber);
          currentThinkingRef.current += newThinking;
          setStreamingMessages((prev) => {
            console.log('🔄 [STREAMING] Updating thinking for assistant ID:', assistantId, 'Block:', blockNumber);
            return prev.map((msg) => {
              if (msg.id === assistantId) {
                const updatedBlocks = { ...msg.thinkingBlocks };
                updatedBlocks[blockNumber] = (updatedBlocks[blockNumber] || '') + newThinking;

                // Combine all thinking blocks for the legacy thinking field
                const combinedThinking = Object.entries(updatedBlocks)
                  .sort(([a], [b]) => parseInt(a) - parseInt(b))
                  .map(([blockNum, content]) => `--- Thinking Block ${blockNum} ---\n${content}`)
                  .join('\n\n');

                return {
                  ...msg,
                  thinking: combinedThinking,
                  thinkingBlocks: updatedBlocks
                };
              }
              return msg;
            });
          });
        },
        (newResponse) => {
          console.log('💬 [STREAMING] Response chunk received:', newResponse);
          currentResponseRef.current += newResponse;
          console.log('📝 [STREAMING] Total response so far:', currentResponseRef.current.length, 'chars');
          setStreamingMessages((prev) => {
            console.log('🔄 [STREAMING] Updating response for assistant ID:', assistantId);
            return prev.map((msg) =>
              msg.id === assistantId ? {
                ...msg,
                content: currentResponseRef.current,
                isThinkingComplete: true // Stop thinking spinner when response starts
              } : msg
            );
          });
        },
        (completionData?: any) => {
          console.log('✅ [COMPLETION] Streaming completed with server-side storage');
          console.log('💾 [COMPLETION] Server saved messages:', completionData);
          console.log('📊 [COMPLETION] Current streaming messages before cleanup:', streamingMessages.length);

          // Update user message with server-confirmed ID if provided
          if (completionData?.user_message_id) {
            console.log('🔄 [COMPLETION] Updating user message ID from', tempUserMessageId, 'to', completionData.user_message_id);
            setStreamingMessages((prev) =>
              prev.map((msg) =>
                msg.id === tempUserMessageId ? { ...msg, id: completionData.user_message_id } : msg
              )
            );
          }

          // Update AI message with server-confirmed ID if provided
          if (completionData?.ai_message_id) {
            console.log('🔄 [COMPLETION] Updating AI message ID from', assistantId, 'to', completionData.ai_message_id);
            setStreamingMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId ? { ...msg, id: completionData.ai_message_id } : msg
              )
            );
          }

          console.log('🧹 [COMPLETION] Clearing streaming state');
          setIsStreaming(false);

          // Since we don't refetch chat history, just keep the streaming messages as permanent
          // Only invalidate sessions list to update "last message" info
          console.log('🔄 [COMPLETION] Invalidating sessions query only');
          queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });

          // Mark streaming messages as complete (no longer streaming)
          console.log('✅ [COMPLETION] Marking streaming messages as complete');
          setStreamingMessages(prev => prev.map(msg => ({ ...msg, isStreaming: false })));
          console.log('✅ [COMPLETION] Completion handler finished');
        },
        (error) => {
          console.error('❌ [STREAMING ERROR] Streaming error:', error);
          console.log('🧹 [STREAMING ERROR] Clearing streaming state due to error');
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
      console.log('✅ [CLEAR HISTORY] Chat history cleared successfully:', response);

      // Clear local state
      console.log('🧹 [CLEAR HISTORY] Clearing local streaming messages and input');
      setStreamingMessages([]);
      setMessage("");

      // Reset the initial history flag so we can refetch empty history
      console.log('🔄 [CLEAR HISTORY] Resetting initial history flag');
      setHasLoadedInitialHistory(false);

      // Invalidate queries
      console.log('🔄 [CLEAR HISTORY] Invalidating queries');
      queryClient.invalidateQueries({ queryKey: [`/api/chat/messages/${sessionId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });

      toast.success("Chat history cleared successfully");
    },
    onError: (error) => {
      console.error('❌ Error clearing chat history:', error);
      toast.error("Failed to clear chat history");
    },
  });

  // Clear all history mutation (all sessions and orphaned messages)
  const clearAllHistoryMutation = useMutation({
    mutationFn: async () => {
      console.log('🧹 Clearing ALL chat history from all sessions');

      // Clear all sessions and messages from the database
      return apiRequest("DELETE", `/api/chat/cleanup/all-sessions`);
    },
    onSuccess: (response) => {
      console.log('✅ [CLEAR ALL HISTORY] All chat history cleared successfully:', response);

      // Clear local state
      console.log('🧹 [CLEAR ALL HISTORY] Clearing local streaming messages and input');
      setStreamingMessages([]);
      setMessage("");

      // Reset the initial history flag so we can refetch empty history
      console.log('🔄 [CLEAR ALL HISTORY] Resetting initial history flag');
      setHasLoadedInitialHistory(false);

      // Invalidate queries
      console.log('🔄 [CLEAR ALL HISTORY] Invalidating queries');
      queryClient.invalidateQueries({ queryKey: [`/api/chat/messages/${sessionId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });

      toast.success("All chat history cleared successfully");
    },
    onError: (error) => {
      console.error('❌ Error clearing all chat history:', error);
      toast.error("Failed to clear all chat history");
    },
  });

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear chat history for this session? This action cannot be undone.")) {
      clearHistoryMutation.mutate();
    }
  };

  const handleClearAllHistory = () => {
    if (window.confirm("Are you sure you want to clear ALL chat history from ALL sessions? This will delete everything and cannot be undone.")) {
      clearAllHistoryMutation.mutate();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="bg-surface border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Chat Session:</h2>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearHistory}
              disabled={clearHistoryMutation.isPending || clearAllHistoryMutation.isPending || isStreaming}
              className="flex items-center gap-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              title="Clear chat history for this session"
            >
              <Trash2 className="h-4 w-4" />
              Clear Session
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAllHistory}
              disabled={clearHistoryMutation.isPending || clearAllHistoryMutation.isPending || isStreaming}
              className="flex items-center gap-2 text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
              title="Clear ALL chat history from ALL sessions (complete database wipe)"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
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
        <div data-testid="chat-messages" className="flex flex-col space-y-8 max-w-4xl mx-auto">
          {allMessages.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <Bot className="h-16 w-16 mx-auto mb-4 text-primary" />
              <p>Hello!</p>
              <p className="text-muted-foreground">Ask me about our online documentation ....</p>
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
