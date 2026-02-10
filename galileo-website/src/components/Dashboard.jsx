import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import "./Dashboard.css";

// CONFIGURATION
const API_URL = "https://l2jl5bxtrdlcqk6tgdmqx7ixte0wqcww.lambda-url.us-west-1.on.aws/";
const BUCKET_NAME = "orbitalstack-alpha-processedbucketde59930c-muvr8tmns0fa";

export default function Dashboard() {
  const [images, setImages] = useState([]);
  const [missionSummary, setMissionSummary] = useState(""); 
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    fetch(API_URL)
      .then((res) => res.json())
      .then((data) => {
        setMissionSummary(data.mission_summary || "No intel available.");
        setImages(data.images || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching images:", err);
        setLoading(false);
      });
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
          <h1>🛰️ Mission Dashboard</h1>
          <div className="mission-briefing-container">
            <div className="briefing-label">⚡ INTEL UPDATE</div>
            <p className="briefing-text">
              {loading ? "Creating summary report..." : missionSummary}
            </p>
          </div>
        </header>

        <div className="image-grid">
          {images.map((img) => (
            // FIX: Removed Math.random(). Now it uses imageId.
            // If you still see duplicates, the Backend fix above handles it.
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

  // 1. DATA IS ALREADY CLEAN (Thanks to Python)
  const detections = data.vehicle_data || [];
  
  // 2. PARSE ANALYSIS
  // The backend now guarantees data.gemini_analysis is either an object or a string.
  let analysisText = "Analysis pending...";
  if (data.gemini_analysis) {
    if (typeof data.gemini_analysis === 'object') {
        analysisText = data.gemini_analysis.overall_assessment || "Detailed assessment missing.";
    } else {
        analysisText = String(data.gemini_analysis);
    }
  }

  // 3. CONSTRUCT URL
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
            const left = ((cx - w / 2) / naturalSize.w) * 100;
            const top = ((cy - h / 2) / naturalSize.h) * 100;
            const width = (w / naturalSize.w) * 100;
            const height = (h / naturalSize.h) * 100;

            return (
              <div
                key={i}
                className="bounding-box"
                style={{
                  left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`,
                  border: '2px solid #00ff00', position: 'absolute'
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