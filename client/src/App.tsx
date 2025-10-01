import { Route, Link, useLocation } from 'wouter';
import { AdminPage } from './pages/AdminPage';
import { ChatPage } from './pages/ChatPage';

function App() {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-foreground">Weave RAG Demo</h1>
            <div className="flex gap-4">
              <Link href="/">
                <a className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location === '/'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}>
                  Admin
                </a>
              </Link>
              <Link href="/chat">
                <a className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location === '/chat'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}>
                  Chat
                </a>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Route path="/">
          <AdminPage />
        </Route>
        <Route path="/chat">
          <ChatPage />
        </Route>
      </main>
    </div>
  );
}

export default App;
