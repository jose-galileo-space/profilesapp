import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import "./Dashboard.css";

// -----------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------
// 1. Your Lambda Function URL (from your recent cdk deploy outputs)
const API_URL =
  "https://l2jl5bxtrdlcqk6tgdmqx7ixte0wqcww.lambda-url.us-west-1.on.aws/";

// 2. Your S3 Bucket Name (Where the processed images live)
const BUCKET_NAME = "orbitalstack-alpha-processedbucketde59930c-muvr8tmns0fa";

export default function Dashboard() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);

  // Navbar state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  useEffect(() => {
    fetch(API_URL)
      .then((res) => res.json())
      .then((data) => {
        setImages(data);
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
        toggleMenu={toggleMenu}
      />

      <div className="dashboard-content">
        <header className="dashboard-header">
          <h1>🛰️ Mission Dashboard</h1>
          <p>Status: {loading ? "Acquiring Signal..." : "Live Feed Online"}</p>
        </header>

        <div className="image-grid">
          {images.map((img) => (
            <ImageCard key={img.imageId || Math.random()} data={img} />
          ))}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// COMPONENT: ImageCard (Optimized)
// -----------------------------------------------------------
const ImageCard = ({ data }) => {
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [imgError, setImgError] = useState(false);

  // 1. PARSE DETECTIONS (Fail-safe)
  let detections = [];
  try {
    // Handle both stringified JSON (from DynamoDB) or raw objects
    if (typeof data.vehicle_data === "string") {
      detections = JSON.parse(data.vehicle_data);
    } else if (Array.isArray(data.vehicle_data)) {
      detections = data.vehicle_data;
    }
  } catch (e) {
    console.warn("Failed to parse vehicle data", e);
    detections = [];
  }
  
  // Keep Top 3 logic for UI cleanliness
  if (Array.isArray(detections)) {
    detections = detections
      .sort((a, b) => b.confidence - a.confidence) 
      .slice(0, 3);
  }

  // 2. CONSTRUCT URL
  let filename = data.imageId;
  // Safety check for extension
  if (!filename.toLowerCase().endsWith(".jpg") && !filename.toLowerCase().endsWith(".png")) {
    filename += ".jpg";
  }
  
  const fileKey = `processed/${data.ownerId}/${filename}`;
  const imageUrl = `https://${BUCKET_NAME}.s3.us-west-1.amazonaws.com/${fileKey}`;

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

        {/* RENDER BOUNDING BOXES */}
        {naturalSize.w > 0 &&
          detections.map((det, i) => {
            // YOLO format: [center_x, center_y, width, height]
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
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  border: '2px solid #00ff00', 
                  position: 'absolute' // Ensure CSS class has this
                }}
              />
            );
          })}
      </div>

      <div className="meta">
        <div className="meta-header">
          {/* Display simplified ID */}
          <h3>ID: {filename.slice(0, 8)}...</h3> 
          <div className="status-badge" style={{background: '#4CAF50'}}>
             ● COMPLETE
          </div>
        </div>

        <div className="meta-stats">
          <span>🎯 Detections: {detections.length}</span>
        </div>

        {data.gemini_analysis && (
          <div className="analysis-report">
            <h4>🤖 Tactical Analysis:</h4>
            <p className="report-text">{data.gemini_analysis}</p>
          </div>
        )}
      </div>
    </div>
  );
};