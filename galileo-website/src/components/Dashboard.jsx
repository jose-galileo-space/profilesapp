import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { getImages } from "../api/client";
import "./Dashboard.css";

// Processed-imagery bucket for rendering scene thumbnails. Intel now comes from
// the authenticated GET /v1/images endpoint via api/client (E13), replacing the
// removed public GetImages Function URL.
const BUCKET_NAME = "orbitalstack-alpha-processedbucketde59930c-muvr8tmns0fa";

export default function Dashboard() {
  const [images, setImages] = useState([]);
  const [missionSummary, setMissionSummary] = useState(""); 
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // 1. Extract the fetching logic into a reusable function
  const fetchIntel = (forceRefresh = false) => {
    setLoading(true);

    // If we aren't forcing a refresh, try to use the cache for instant loading
    if (!forceRefresh) {
      const cachedData = sessionStorage.getItem("galileo_dashboard_cache");
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        setMissionSummary(parsed.mission_summary || "No intel available.");
        setImages(parsed.images || []);
        setLoading(false);
      }
    }

    // 2. Fetch fresh data from the authenticated API (GET /v1/images).
    getImages()
      .then((data) => {
        setMissionSummary(data.mission_summary || "No intel available.");
        setImages(data.images || []);
        setLoading(false);
        // Overwrite the cache with the newest data
        sessionStorage.setItem("galileo_dashboard_cache", JSON.stringify(data));
      })
      .catch((err) => {
        console.error("Error fetching images:", err);
        setLoading(false);
      });
  };

  // 3. Run it once when the component mounts
  useEffect(() => {
    fetchIntel(false);
  }, []);

  return (
    <div className="dashboard-page">
      <Navbar
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        toggleMenu={() => setIsMenuOpen(!isMenuOpen)}
      />

      <div className="dashboard-content">
        <header className="dashboard-header">
          {/* 4. Group the Title and Button together */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "15px" }}>
            <h1 style={{ margin: 0 }}>🛰️ Mission Dashboard</h1>
            
            <button 
              onClick={() => fetchIntel(true)}
              disabled={loading}
              style={{
                background: loading ? "#333" : "transparent",
                color: loading ? "#888" : "#05b8e0",
                border: `1px solid ${loading ? "#333" : "#05b8e0"}`,
                padding: "8px 16px",
                borderRadius: "4px",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: "bold",
                fontFamily: "monospace",
                transition: "all 0.2s ease-in-out"
              }}
            >
              {loading ? "📡 SYNCING..." : "↻ REFRESH INTEL"}
            </button>
          </div>

          <div className="mission-briefing-container">
            <div className="briefing-label">⚡ INTEL UPDATE</div>
            <p className="briefing-text">
              {loading && !images.length ? "Connecting to satellite downlink..." : missionSummary}
            </p>
          </div>
        </header>

        <div className="image-grid">
          {images.map((img) => (
            <ImageCard key={img.imageId} data={img} />
          ))}
        </div>
      </div>
    </div>
  );
}

// COMPONENT: ImageCard
const ImageCard = ({ data }) => {
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [imgError, setImgError] = useState(false);

  const detections = data.vehicle_data || [];
  
  let analysisText = "Analysis pending...";
  if (data.gemini_analysis) {
    if (typeof data.gemini_analysis === 'object') {
        analysisText = data.gemini_analysis.overall_assessment || "Detailed assessment missing.";
    } else {
        analysisText = String(data.gemini_analysis);
    }
  }

  let filename = data.imageId;
  if (!filename.match(/\.(jpg|jpeg|png)$/i)) filename += ".jpg";
  const imageUrl = `https://${BUCKET_NAME}.s3.us-west-1.amazonaws.com/processed/${data.ownerId}/${filename}`;

  if (imgError) return null;

  return (
    <div className="card">
      <div className="image-container">
        <img
          src={imageUrl}
          alt="Satellite Scan"
          onLoad={({ target: img }) =>
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
          }
          onError={() => setImgError(true)}
          crossOrigin="anonymous"
        />

        {naturalSize.w > 0 &&
          detections.map((det, i) => {
            const [cx, cy, w, h] = det.box;
            
            // Mathematical positions must stay inline
            const left = ((cx - w / 2) / naturalSize.w) * 100;
            const top = ((cy - h / 2) / naturalSize.h) * 100;
            const width = (w / naturalSize.w) * 100;
            const height = (h / naturalSize.h) * 100;

            return (
              <div
                key={i}
                className="bounding-box"
                style={{
                  left: `${left}%`, 
                  top: `${top}%`, 
                  width: `${width}%`, 
                  height: `${height}%`
                }}
              />
            );
          })}
      </div>

      <div className="meta">
        <div className="meta-header">
          <h3>ID: {filename.slice(0, 8)}...</h3> 
          <div className="status-badge">● COMPLETE</div>
        </div>

        <div className="analysis-report">
            <h4>🤖 Tactical Analysis:</h4>
            <p className="report-text">{analysisText}</p>
        </div>
      </div>
    </div>
  );
};