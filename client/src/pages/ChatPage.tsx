import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export function ChatPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">RAG Chat Interface</h1>
        <p className="text-muted-foreground mt-2">
          Query the knowledge base using natural language
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>
            This chat interface will be powered by the Python Agent Backend
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">
            <p className="mb-4">
              The chat interface will allow you to:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>Ask questions about the crawled content</li>
              <li>Get AI-powered responses with source citations</li>
              <li>View context used for each response</li>
              <li>See quality metrics and hallucination scores</li>
            </ul>
            <p className="mt-4 text-sm">
              This will be implemented by Agent 2 as part of the Python Agent Backend (Phase 5).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

