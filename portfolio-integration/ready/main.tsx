import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Portfolio from "./pages/Portfolio";
import CloseAgentCaseStudy from "./pages/CloseAgentCaseStudy";
import DealRecordPage from "./pages/DealRecordPage";
import FinDataGraphCaseStudy from "./pages/FinDataGraphCaseStudy";
import "./styles/portfolio.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Portfolio />} />
        <Route path="/projects/close-agent" element={<CloseAgentCaseStudy />} />
        <Route path="/projects/deal-record" element={<DealRecordPage />} />
        <Route path="/projects/findatagraph" element={<FinDataGraphCaseStudy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  </StrictMode>
);
