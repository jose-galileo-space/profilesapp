import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Authenticator } from "@aws-amplify/ui-react";

import App from "./App";
import LearnMorePage from "./LearnMorePage"; // Import the new page
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
      <BrowserRouter>
        <Routes>
          {/* The main route '/' will show the App component inside the Authenticator */}
          <Route
            path="/"
            element={
                <App />
            }
          />
          {/* The '/learn-more' route will show the new page */}
          <Route path="/learn-more" element={<LearnMorePage />} />
        </Routes>
      </BrowserRouter>
  </React.StrictMode>
);
