import { ClerkProvider } from "@clerk/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./api/auth";
import "./styles/global.css";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function Root({ children }) {
  if (!clerkPubKey) {
    return <AuthProvider>{children}</AuthProvider>;
  }
  return (
    <ClerkProvider publishableKey={clerkPubKey} afterSignOutUrl="/login">
      <AuthProvider>{children}</AuthProvider>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root>
        <App />
      </Root>
    </BrowserRouter>
  </React.StrictMode>
);
