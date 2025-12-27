import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar"; // Reusing your existing Navbar
import "./Dashboard.css";

// REPLACE THIS with the URL from your 'cdk deploy' output
const API_URL = "https://c0gob4nxe7.execute-api.us-west-1.amazonaws.com/alpha/";

export default function Dashboard() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);

  // Navbar state (to match your App.js logic)
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  useEffect(() => {
    fetch(API_URL)
      .then((res) => res.json())
      .then((data) => {
        setImages(data);
        setLoading(false);
      })
      .catch((err) => console.error("Error fetching images:", err));
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
            <ImageCard key={img.imageId} data={img} />
          ))}
        </div>
      </div>
    </div>
  );
}

const ImageCard = ({ data }) => {
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  const onImgLoad = ({ target: img }) => {
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  let detections = [];
  try {
    detections =
      typeof data.vehicle_data === "string"
        ? JSON.parse(data.vehicle_data)
        : data.vehicle_data;
  } catch (e) {
    detections = [];
  }

  const imageUrl = `https://${data.bucket}.s3.us-west-1.amazonaws.com/${data.key}`;

  return (
    <div className="card">
      <div className="image-container">
        <img
          src={imageUrl}
          alt="Satellite Scan"
          onLoad={onImgLoad}
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
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                }}
              >
                <div className="label">
                  {det.label} {det.confidence}
                </div>
              </div>
            );
          })}
      </div>
      <div className="meta">
        <h3>ID: {data.imageId.split("-")[0]}</h3>
        <p>{detections.length} objects detected</p>
      </div>
    </div>
  );
};
