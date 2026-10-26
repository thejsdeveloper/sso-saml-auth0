import { LoginPage } from "@/pages/LoginPage";
import { ProfilePage } from "@/pages/ProfilePage";

// Two pages don't justify a router dependency. The backend redirects to
// /profile after a successful login and to /?error=... after a failed one.
export function App() {
  return window.location.pathname === "/profile" ? <ProfilePage /> : <LoginPage />;
}
