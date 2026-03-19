import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { MapContainer, TileLayer, Polygon, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./MissionPlanner.css";

const cornerIcon = new L.DivIcon({
  className: "tactical-handle",
  html: `<div style="width: 14px; height: 14px; background: white; border: 2px solid #05b8e0; border-radius: 50%;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const centerIcon = new L.DivIcon({
  className: "tactical-center",
  html: `<div style="width: 16px; height: 16px; background: rgba(5, 184, 224, 0.4); border: 2px solid #05b8e0; border-radius: 50%;"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

function TacticalOverlay({ box, setBox, corners, commitHistory, isEditing, setIsEditing }) {
  const map = useMap();
  const [dragState, setDragState] = useState(null);
  const dragStartRef = useRef(null);
  const latestBoxRef = useRef(box);
  const hasInitialized = useRef(false);

  useEffect(() => {
    latestBoxRef.current = box;
  }, [box]);

  useEffect(() => {
    if (hasInitialized.current) return;

    const timer = setTimeout(() => {
      if (hasInitialized.current) return;
      hasInitialized.current = true;

      const mapBounds = map.getBounds();
      const latDiff = mapBounds.getNorth() - mapBounds.getSouth();
      const lngDiff = mapBounds.getEast() - mapBounds.getWest();

      const initialBox = {
        center: map.getCenter(),
        size: { lat: latDiff * 0.2, lng: lngDiff * 0.2 },
        angle: 0
      };
      
      setBox(initialBox);
      commitHistory(initialBox);
    }, 200);

    return () => clearTimeout(timer);
  }, [map, setBox, commitHistory]);

  useEffect(() => {
    const handleMouseUp = () => {
      setDragState((currentDragState) => {
        if (currentDragState) {
          map.dragging.enable();
          commitHistory(latestBoxRef.current);
          return null;
        }
        return currentDragState;
      });
    };
    
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [map, commitHistory]);

  useMapEvents({
    click: () => setIsEditing(false),
    mousemove: (e) => {
      if (!dragState || !dragStartRef.current) return;

      if (dragState.type === "center") {
        setBox({ ...dragStartRef.current, center: e.latlng });
      } 
      else if (dragState.type === "corner") {
        const startBox = dragStartRef.current;
        const dLat = e.latlng.lat - startBox.center.lat;
        const dLng = e.latlng.lng - startBox.center.lng;

        const baseOffsets = [
          { lat: 1, lng: 1 },
          { lat: 1, lng: -1 },
          { lat: -1, lng: -1 },
          { lat: -1, lng: 1 }
        ];
        const idx = dragState.index;

        const baseLat = (startBox.size.lat / 2) * baseOffsets[idx].lat;
        const baseLng = (startBox.size.lng / 2) * baseOffsets[idx].lng;

        const baseA = Math.atan2(baseLat, baseLng);
        const dragA = Math.atan2(dLat, dLng);
        const baseD = Math.sqrt(baseLat ** 2 + baseLng ** 2);
        const dragD = Math.sqrt(dLat ** 2 + dLng ** 2);

        let scale = dragD / baseD;
        if (scale < 0.05) scale = 0.05;

        setBox({
          center: startBox.center,
          size: { lat: startBox.size.lat * scale, lng: startBox.size.lng * scale },
          angle: dragA - baseA // <--- The math fix that stops the spinning
        });
      }
    }
  });

  const handleDragStart = (e, type, index = null) => {
    L.DomEvent.stop(e);
    map.dragging.disable();
    dragStartRef.current = latestBoxRef.current;
    setDragState({ type, index });
  };

  return (
    <>
      <Polygon
        positions={corners}
        color={isEditing ? "#05b8e0" : "#ffffff"}
        weight={isEditing ? 2 : 1}
        dashArray={isEditing ? null : "4 4"}
        fillOpacity={isEditing ? 0.2 : 0.05}
        eventHandlers={{
          click: (e) => {
            L.DomEvent.stop(e);
            setIsEditing(true);
          }
        }}
      />

      {isEditing && corners.map((corner, i) => (
        <Marker
          key={i}
          position={corner}
          draggable={false}
          icon={cornerIcon}
          eventHandlers={{ mousedown: (e) => handleDragStart(e, "corner", i) }}
        />
      ))}

      {isEditing && (
        <Marker
          position={box.center}
          draggable={false}
          icon={centerIcon}
          eventHandlers={{ mousedown: (e) => handleDragStart(e, "center") }}
        />
      )}
    </>
  );
}

export default function MissionPlanner() {
  const navigate = useNavigate();

  const [targetName, setTargetName] = useState("");
  const [focusArea, setFocusArea] = useState("all");
  const [isTasking, setIsTasking] = useState(false);
  const [isEditing, setIsEditing] = useState(true);

  const [box, setBox] = useState({
    center: { lat: 34.0195, lng: -118.4912 },
    size: { lat: 0, lng: 0 },
    angle: 0
  });

  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const commitHistory = useCallback((newBox) => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newBox);
      return newHistory;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        setHistoryIndex((prev) => {
          if (prev > 0) {
            setBox(history[prev - 1]);
            return prev - 1;
          }
          return prev;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history]);

  const corners = useMemo(() => {
    const { center, size, angle } = box;
    const offsets = [
      { lat: size.lat / 2, lng: size.lng / 2 },
      { lat: size.lat / 2, lng: -size.lng / 2 },
      { lat: -size.lat / 2, lng: -size.lng / 2 },
      { lat: -size.lat / 2, lng: size.lng / 2 }
    ];

    return offsets.map((off) => {
      const rotLng = off.lng * Math.cos(angle) - off.lat * Math.sin(angle);
      const rotLat = off.lng * Math.sin(angle) + off.lat * Math.cos(angle);
      return { lat: center.lat + rotLat, lng: center.lng + rotLng };
    });
  }, [box]);

const handleLaunchMission = async (e) => {
    e.preventDefault();
    setIsTasking(true);

    // 1. Format the payload for the backend
    const payload = { 
      targetName, 
      polygon: corners.map(c => [Number(c.lat.toFixed(4)), Number(c.lng.toFixed(4))]), 
      focusArea 
    };

    try {
      // 2. Send the POST request to your AWS endpoint
      // NOTE: Replace this URL with your actual ingestion endpoint if different
      const API_URL = "https://api.galileo-space.com/task";
      
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`AWS API Error: ${response.status}`);
      }

      console.log("Mission Tasked Successfully:", payload);
      
      // 3. Clear the tasking state and redirect
      setIsTasking(false);
      navigate("/dashboard");

    } catch (error) {
      console.error("Tasking failed:", error);
      setIsTasking(false);
      alert("Failed to upload commands to satellite. Check console for details.");
    }
  };

  return (
    <div className="mission-planner-page">
      <Navbar />

      <div className="planner-container">
        <header className="planner-header">
          <h1>🌍 Target Acquisition & Tasking</h1>
          <p>Define your Area of Interest (AOI) for the next VLEO satellite pass.</p>
        </header>

        <div className="planner-grid">
          <div className="map-section">
            <MapContainer
              center={[34.0195, -118.4912]}
              zoom={13}
              style={{ height: "100%", width: "100%", zIndex: 1 }}
              zoomControl={false}
              doubleClickZoom={false}
            >
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri"
              />
              
              <TacticalOverlay 
                box={box} 
                setBox={setBox} 
                corners={corners}
                commitHistory={commitHistory}
                isEditing={isEditing}
                setIsEditing={setIsEditing}
              />
            </MapContainer>

            <div className="live-coords" style={{ zIndex: 1000, display: "flex", gap: "10px" }}>
              <span>VERTICES: {corners.length}</span>
              <span>ANGLE: {(box.angle * (180 / Math.PI)).toFixed(1)}°</span>
            </div>
          </div>

          <div className="form-section">
            <div className="tasking-card">
              <h3>📝 Mission Parameters</h3>

              <form onSubmit={handleLaunchMission}>
                <div className="form-group">
                  <label>Report / Mission Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Santa Monica Pier"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>AOI Polygon Coordinates</label>
                  <textarea 
                    readOnly 
                    value={JSON.stringify(
                      corners.map(c => [Number(c.lat.toFixed(4)), Number(c.lng.toFixed(4))]), 
                      null, 2
                    )}
                    style={{
                      width: "100%", height: "140px", background: "#050505", 
                      color: "var(--accent-blue)", border: "1px solid #333", 
                      fontFamily: "monospace", padding: "10px", boxSizing: "border-box"
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Intelligence Focus (AI Prompt)</label>
                  <select
                    value={focusArea}
                    onChange={(e) => setFocusArea(e.target.value)}
                  >
                    <option value="all">General Reconnaissance (All Assets)</option>
                    <option value="logistics">Logistics & Supply Chain</option>
                    <option value="aviation">Aviation & Airfields</option>
                    <option value="maritime">Maritime Operations</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className={`launch-btn ${isTasking ? "tasking" : ""}`}
                  disabled={isTasking || !targetName}
                >
                  {isTasking ? "UPLOADING COMMANDS..." : "INITIALIZE SURVEILLANCE"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}