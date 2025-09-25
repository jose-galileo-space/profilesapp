import React, { useState } from "react";
import Navbar from "./Navbar.jsx";
import "./LearnMore.css";

export default function OurTeamPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };
  return (
    <div className="learn-more-page">
      <Navbar
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        toggleMenu={toggleMenu}
      />
      <div className="content-section">
        <div className="content-card">
          <h2 className="section-title">Our Team</h2>
          <div className="grid-container">
            <div className="vision-section">
              <h3 className="sub-section-title">
                Proven at the Highest Levels
              </h3>
              <ul className="section-text">
                <li>
                  Our team has built and operated spacecraft and imaging systems
                  at leading institutions, universities, and space programs
                  around the world.
                </li>
              </ul>
            </div>
            <div className="vision-section">
              <h3 className="sub-section-title">Experience That Matters</h3>
              <ul className="section-text">
                <li>
                  <b>Government & Defense Programs</b>
                  <br />
                  Contributions to U.S. Department of Defense and intelligence
                  satellite programs, with work at Lockheed Martin, Northrop
                  Grumman, and Booz Allen Hamilton.
                </li>
                <li>
                  <b>Academic & Research Leadership</b>
                  <br />
                  Deep ties to the University of Southern California’s
                  Information Sciences Institute (USC ISI) and its space
                  initiatives, with experience in spacecraft design, cleanroom
                  integration, and academic-industry partnerships.
                </li>
                <li>
                  <b>Flagship Space Missions</b>
                  <br />
                  Optical and systems engineering contributions to NASA’s James
                  Webb Space Telescope and other space science observatories.
                </li>
                <li>
                  <b>Launch & Avionics</b>
                  <br />
                  Hardware and communications expertise from SpaceX’s Starship
                  program, enabling spacecraft resilience and rapid iteration.
                </li>
                <li>
                  <b>Commercial Earth Observation</b>
                  <br />
                  Operators and product leaders who have scaled Earth imaging
                  and geospatial analytics platforms globally, bridging the gap
                  between advanced space technology and customer demand.
                </li>
              </ul>
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
