import React, { useState } from "react";
import Navbar from "./Navbar.jsx";
import "./LearnMore.css";
import "./Traction.css";

const TimelineItem = ({ date, title, description, icon }) => (
  <div className="timeline-item-horizontal">
    <div className="timeline-icon-horizontal">
      <span role="img" aria-label="milestone-icon">
        {icon}
      </span>
    </div>
    <div className="timeline-content-horizontal">
      <h4>{date}</h4>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  </div>
);

export default function TractionPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };
  const timelineEvents = [
    {
      date: "Q4 2025",
      title: "Ground Demo",
      description: "Ground demo payload tested and successfully completed.",
      icon: "🔭",
    },
    {
      date: "Q1 2026",
      title: "Integrate payload",
      description:
        "Integrate payload (camera, telescope and sensor) on Viridian bus and complete environmental testing.",
      icon: "🛰️",
    },
    {
      date: "Q2 2026",
      title: "Launch Demo Satellite",
      description:
        "This mission will be to prove air breathing propulsion directly in VLEO orbit.",
      icon: "🚀",
    },
    {
      date: "Q3 2026 - Q3 2027",
      title: "Pathfinder Satellite",
      description:
        "This mission will be to demonstrate imaging and data services in VLEO (and improve on propulsion).",
      icon: "🛰️",
    },
    {
      date: "Q4 2027 -",
      title: "Full Constellation",
      description:
        "Finalize the full constellation deployment for enhanced data and imagery services.",
      icon: "🌐",
    },
  ];

  return (
    <div className="learn-more-page">
      <Navbar
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        toggleMenu={toggleMenu}
      />
      <div className="content-section">
        <div className="content-card">
          <h2 className="section-title">Traction So Far</h2>
          <div className="grid-container">
            <div className="vision-section">
              <h3 className="sub-section-title">Early Customers</h3>
              <ul className="section-text">
                <li>
                  <b>San Diego Research Institute:</b> Flying their VLEO
                  environmental sensor on the Pathfinder demo.
                </li>
                <li>
                  <b>SkyFi:</b> Early customer validating demand for sub-30 cm
                  imagery.
                </li>
                <li>
                  <b>GlobalGeo (Brazil):</b> Early customer expanding reach in
                  Latin America.
                </li>
              </ul>
            </div>
            <div className="vision-section">
              <h3 className="sub-section-title">Partnership</h3>
              <ul className="section-text">
                <li>
                  <b>Active:</b> Samara Aerospace (bus), Viridian Space
                  (propulsion), PhaseOne (imaging), Launch Accelerator
                  (commercialization).
                </li>
                <li>
                  <b>Active Conversations:</b> Sparkgeo, SkyWatch, Nearmap,
                  InteliAir, UP42.
                </li>
                <li>
                  <b>Pipeline:</b> Signed 12+ LOIs with customers from different
                  sectors (mining, weather, military, etc.).
                </li>
              </ul>
            </div>
            <div className="vision-section">
              <h3 className="sub-section-title">Progress</h3>
              <div className="timeline-container-horizontal">
                {timelineEvents.map((event, index) => (
                  <TimelineItem
                    key={index}
                    date={event.date}
                    title={event.title}
                    description={event.description}
                    icon={event.icon}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="footer">
        <div className="container">
          <p className="footer-text">
            &copy; {new Date().getFullYear()} Galileo Space. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
