import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2, Brain } from "lucide-react";
import type { ChatMessage } from "../../../shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { streamingClient } from "@/lib/streaming";
import MarkdownRenderer from "@/components/markdown-renderer";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch chat history
  const { data: chatHistory = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/messages/${sessionId}`],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', `/api/chat/messages/${sessionId}`);
        return response || [];
      } catch (error) {
        console.error('Error fetching chat history:', error);
        return [];
      }
    },
    enabled: !!sessionId,
  });

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
      role: msg.role,
      content: msg.content,
      thinking: msg.thinking,
      createdAt: msg.createdAt,
      sessionId: msg.sessionId,
      isStreaming: false,
      isThinkingComplete: true,
    })),
    ...streamingMessages,
  ].sort((a, b) => a.createdAt - b.createdAt);

  const handleSendMessage = async () => {
    if (!message.trim() || isStreaming || !sessionId) return;

    const timestamp = Date.now();
    setMessage("");
    setIsStreaming(true);

    const assistantId = uuidv4();
    const initialAssistantMessage: StreamingMessage = {
      id: assistantId,
      role: "ai",
      content: "",
      thinking: "",
      isStreaming: true,
      isThinkingComplete: false,
      createdAt: timestamp + 500,
      sessionId: sessionId,
    };

    setStreamingMessages((prev) => [...prev, initialAssistantMessage]);
    setThinkingOpen(prev => ({ ...prev, [assistantId]: true }));

    // Start streaming
    try {
      await streamingClient.startStream(
        "/api/chat/stream",
        { message: message.trim(), sessionId: sessionId },
        (newThinking) => {
          setStreamingMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, thinking: newThinking } : msg
            )
          );
        },
        (newResponse) => {
          setStreamingMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, content: newResponse, isThinkingComplete: true } : msg
            )
          );
        },
        async () => {
          setIsStreaming(false);
          setStreamingMessages([]);
          queryClient.invalidateQueries({ queryKey: [`/api/chat/messages/${sessionId}`] });
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

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="bg-surface border-b px-6 py-4">
        <h2 className="text-xl font-semibold text-foreground">RAG Chat Interface</h2>
        <p className="text-sm text-muted-foreground">Ask questions about the crawled content</p>
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
                {msg.role === "ai" && msg.thinking && (
                  <Collapsible open={thinkingOpen[msg.id] ?? false} onOpenChange={(open) => setThinkingOpen(prev => ({ ...prev, [msg.id]: open }))}>
                    <Card className="bg-surface">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start p-3 hover:bg-transparent">
                          <Brain className="h-4 w-4 text-muted-foreground mr-2" />
                          <span className="text-xs text-muted-foreground">Thinking Process</span>
                          {msg.isStreaming && !msg.isThinkingComplete && (
                            <Loader2 className="h-3 w-3 ml-2 text-primary animate-spin" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-3 pb-3">
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap">{msg.thinking}</div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                )}

                <Card className={`p-4 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface"}`}>
                  {msg.content ? (
                    <div className="markdown-content">
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  ) : msg.isStreaming ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Generating response...</span>
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
            onKeyPress={handleKeyPress}
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
