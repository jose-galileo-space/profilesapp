import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import "./MissionPlanner.css";

export default function MissionPlanner() {
    const navigate = useNavigate();

    const [targetName, setTargetName] = useState("");
    const [coordinates, setCoordinates] = useState({ lat: "0.0000", lng: "0.0000" });
    const [focusArea, setFocusArea] = useState("all");
    const [isTasking, setIsTasking] = useState(false);

    // Simulated Map Click Handler
    const handleMapClick = (e) => {
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Fake coordinate generation based on click position
        const lat = ((y / rect.height) * 180 - 90).toFixed(4);
        const lng = ((x / rect.width) * 360 - 180).toFixed(4);

        setCoordinates({ lat: (lat * -1).toString(), lng });
    };

    const handleLaunchMission = (e) => {
        e.preventDefault();
        setIsTasking(true);

        // Simulate API call to create the report/task the satellite
        setTimeout(() => {
            navigate('/dashboard');
            console.log("Mission Tasked:", { targetName, coordinates, focusArea });
            setIsTasking(false);
            alert("Satellite Tasked! Redirecting to Dashboard...");
        }, 1500);
    };

    return (
        <div className="mission-planner-page">
            <Navbar /> {/* Assuming you have this from the Dashboard */}

            <div className="planner-container">
                <header className="planner-header">
                    <h1>🌍 Target Acquisition & Tasking</h1>
                    <p>Define your Area of Interest (AOI) for the next VLEO satellite pass.</p>
                </header>

                <div className="planner-grid">
                    {/* LEFT: THE MAP SIMULATOR */}
                    <div className="map-section">
                        <div className="map-interface" onClick={handleMapClick}>
                            <div className="crosshair center-crosshair"></div>
                            <p className="map-instructions">CLICK TO SET TARGET COORDINATES</p>
                            <div className="live-coords">
                                LAT: {coordinates.lat} | LNG: {coordinates.lng}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: THE TASKING FORM */}
                    <div className="form-section">
                        <div className="tasking-card">
                            <h3>📝 Mission Parameters</h3>

                            <form onSubmit={handleLaunchMission}>
                                <div className="form-group">
                                    <label>Report / Mission Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., Port of Long Beach Logistics"
                                        value={targetName}
                                        onChange={(e) => setTargetName(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Latitude</label>
                                        <input type="text" value={coordinates.lat} readOnly />
                                    </div>
                                    <div className="form-group">
                                        <label>Longitude</label>
                                        <input type="text" value={coordinates.lng} readOnly />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Intelligence Focus (AI Prompt)</label>
                                    <select
                                        value={focusArea}
                                        onChange={(e) => setFocusArea(e.target.value)}
                                    >
                                        <option value="all">General Reconnaissance (All Assets)</option>
                                        <option value="logistics">Logistics & Supply Chain (Trucks, Cargo)</option>
                                        <option value="aviation">Aviation & Airfields (Planes, Hangars)</option>
                                        <option value="maritime">Maritime Operations (Ships, Ports)</option>
                                    </select>
                                </div>

                                <button
                                    type="submit"
                                    className={`launch-btn ${isTasking ? 'tasking' : ''}`}
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