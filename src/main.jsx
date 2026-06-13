import "./storage.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import SnakeRunner from "./snake-runner.jsx";
import LegendPreview from "./legend-preview.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/snake" element={<SnakeRunner />} />
        <Route path="/snake/legend" element={<LegendPreview />} />
        <Route path="/" element={<div style={{color:"#fff",padding:40,fontFamily:"Georgia,serif"}}>MG Games</div>} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);