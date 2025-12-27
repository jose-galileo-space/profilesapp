import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./components/Dashboard.jsx";
import Timeline from "./components/Timeline.jsx";
import Traction from "./components/Traction.jsx";
import OurTeam from "./components/OurTeam.jsx";

import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* The main route '/' will show the App component inside the Authenticator */}
        <Route path="/" element={<App />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/traction" element={<Traction />} />
        <Route path="/our-team" element={<OurTeam />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
