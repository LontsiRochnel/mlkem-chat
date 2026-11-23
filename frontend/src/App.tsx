import { useState } from 'react';
import { AuthPage } from './components/AuthPage';
import { Home } from './components/Home';
import { clearSession, getSession } from './lib/api';

export function App() {
  const [username, setUsername] = useState<string | null>(() => getSession()?.username ?? null);

  if (!username) {
    return <AuthPage onAuthenticated={setUsername} />;
  }
  return (
    <Home
      username={username}
      onLogout={() => {
        clearSession();
        setUsername(null);
      }}
    />
  );
}
