export interface StreamingResponse {
  type: 'thinking' | 'response' | 'done' | 'related_content';
  content: string | any; // Allow any type for related_content
}

export class StreamingClient {
  private controller: AbortController | null = null;

  async startStream(
    endpoint: string,
    data: any,
    onThinking: (content: string) => void,
    onResponse: (content: string) => void,
    onComplete: () => void,
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

              switch (data.type) {
                case 'thinking':
                  onThinking(data.content as string);
                  break;
                case 'response':
                  onResponse(data.content as string);
                  break;
                case 'related_content':
                  if (onRelatedContent) {
                    onRelatedContent(data.content);
                  }
                  break;
                case 'done':
                  completeCalled = true;
                  onComplete();
                  return;
              }
            } catch (e) {
              // Skip invalid JSON
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
