import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import "./Dashboard.css";

// -----------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------
// 1. Your Lambda Function URL (from your recent cdk deploy outputs)
const API_URL =
  "https://x5hgt7lrfhm4pwss7kjaga25su0cxcnx.lambda-url.us-west-1.on.aws/";

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
        // Sort images: newest first (optional)
        const sorted = data.sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );
        setImages(sorted);
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
          <p>Status: {loading ? "Scanning Satellite Feeds..." : "Online"}</p>
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
// COMPONENT: ImageCard
// -----------------------------------------------------------
const ImageCard = ({ data }) => {
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [imgError, setImgError] = useState(false);

  // 1. STATUS CHECK: Look for 'COMPLETED' in either field
  const processingStatus = data.object_detect_status || data.status;

  // If it's not completed, don't render anything (prevents "UPLOADING" clutter)
  if (processingStatus !== "COMPLETED") {
    return null;
  }

  // 2. PARSE DETECTIONS (Safe Logic)
  // We define 'detections' here so it is available for the return statement below
  let detections = [];
  try {
    if (!data.vehicle_data) {
      detections = [];
    } else if (typeof data.vehicle_data === "string") {
      detections = JSON.parse(data.vehicle_data);
    } else {
      detections = data.vehicle_data;
    }
  } catch (e) {
    console.warn("Error parsing vehicle_data", e);
    detections = [];
  }
  // Double check it's an array
  if (!Array.isArray(detections)) detections = [];

  // 3. CONSTRUCT S3 URL
  // The ID in DB might be "abc-123", but file in S3 is "abc-123.jpg"
  let filename = data.imageId;
  if (
    !filename.toLowerCase().endsWith(".jpg") &&
    !filename.toLowerCase().endsWith(".png")
  ) {
    filename += ".jpg";
  }

  // Path: processed / ownerId / filename
  const fileKey = `processed/${data.ownerId}/${filename}`;
  const imageUrl = `https://${BUCKET_NAME}.s3.us-west-1.amazonaws.com/${fileKey}`;

  // If the image failed to load previously, hide the card
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
          onError={() => {
            console.warn("Failed to load image:", imageUrl);
            setImgError(true);
          }}
          crossOrigin="anonymous"
        />

        {/* Draw Boxes */}
        {naturalSize.w > 0 &&
          detections.map((det, i) => {
            const [cx, cy, w, h] = det.box;
            // Convert YOLO Center-XY to CSS Top-Left %
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
                }}
              >
                <div className="label">
                  {det.label} {Math.round(det.confidence * 100)}%
                </div>
              </div>
            );
          })}
      </div>

      <div className="meta">
        <h3>ID: {filename.split(".")[0].split("-")[0]}...</h3>
        <p>
          <strong>Objects:</strong> {detections.length}
        </p>
        <div className="status-badge">● ANALYSIS COMPLETE</div>
      </div>
    </div>
  );
};
