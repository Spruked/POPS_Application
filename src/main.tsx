import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import StartupSplash from "./components/StartupSplash";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StartupApp />
  </React.StrictMode>
);

function StartupApp() {
  const [splashComplete, setSplashComplete] = useState(false);

  return (
    <>
      <App />
      {!splashComplete && <StartupSplash onComplete={() => setSplashComplete(true)} />}
    </>
  );
}
