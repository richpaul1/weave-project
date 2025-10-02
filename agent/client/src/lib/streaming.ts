export interface StreamingResponse {
  type: 'thinking' | 'response' | 'done' | 'related_content' | 'user_saved' | 'complete' | 'error';
  content?: string | any; // Allow any type for related_content
  message_id?: string;
  user_message_id?: string;
  ai_message_id?: string;
  session_id?: string;
  data?: any;
}

export class StreamingClient {
  private controller: AbortController | null = null;

  async startStream(
    endpoint: string,
    data: any,
    onThinking: (content: string) => void,
    onResponse: (content: string) => void,
    onComplete: (completionData?: any) => void,
    onError: (error: Error) => void,
    onRelatedContent?: (content: any) => void
  ): Promise<void> {
    this.controller = new AbortController();

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal: this.controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let completeCalled = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as StreamingResponse;
              console.log('📡 Streaming data received:', data);

              switch (data.type) {
                case 'user_saved':
                  console.log('💾 User message saved with ID:', data.message_id);
                  break;
                case 'thinking':
                  // Backend sends data.data.text
                  const thinkingText = (data as any).data?.text || data.content as string;
                  console.log('🧠 Processing thinking:', thinkingText);
                  onThinking(thinkingText);
                  break;
                case 'response':
                  // Backend sends data.data.text
                  const responseText = (data as any).data?.text || data.content as string;
                  console.log('💬 Processing response chunk:', responseText);
                  onResponse(responseText);
                  break;
                case 'related_content':
                  console.log('🔗 Processing related content:', data.content);
                  if (onRelatedContent) {
                    onRelatedContent(data.content);
                  }
                  break;
                case 'complete':
                  console.log('✅ Streaming complete with server-side storage:', data);
                  completeCalled = true;
                  onComplete({
                    user_message_id: data.user_message_id,
                    ai_message_id: data.ai_message_id,
                    session_id: data.session_id
                  });
                  return;
                case 'done':
                  console.log('✅ Streaming done event received (legacy)');
                  completeCalled = true;
                  onComplete();
                  return;
                case 'error':
                  console.error('❌ Server error:', data.data);
                  onError(new Error(data.data?.error || 'Server error'));
                  return;
              }
            } catch (e) {
              console.warn('⚠️ Failed to parse streaming data:', line, e);
            }
          }
        }
      }

      // Ensure onComplete is called even if no 'done' message was received
      if (!completeCalled) {
        onComplete();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Stream was cancelled
        return;
      }
      onError(error as Error);
      // Ensure onComplete is called even on error to reset UI state
      onComplete();
    }
  }

  stop(): void {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }
}

export const streamingClient = new StreamingClient();
