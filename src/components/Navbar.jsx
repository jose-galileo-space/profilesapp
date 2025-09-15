import React from "react";
import { Link } from "react-router-dom";
import galileoLogo from "../assets/galileo-logo.svg";
import "./Navbar.css";
export default function Navbar({ isMenuOpen, setIsMenuOpen, toggleMenu }) {
  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-logo-container">
          <Link to="/" onClick={() => setIsMenuOpen(false)}>
            <img src={galileoLogo} alt="Company Logo" className="logo-img" />
          </Link>
          <h1 className="company-name">Galileo Space</h1>
        </div>
        <div className="hamburger-menu">
          <button
            className={`hamburger-button ${isMenuOpen ? "open" : ""}`}
            onClick={toggleMenu}
            aria-label="Toggle menu"
          >
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
          </button>

          <ul className={`menu-items ${isMenuOpen ? "open" : ""}`}>
            <li>
              <Link to="/timeline" onClick={() => setIsMenuOpen(false)}>
                Timeline
              </Link>
            </li>
            <li>
              <Link to="/traction" onClick={() => setIsMenuOpen(false)}>
                Traction
              </Link>
            </li>
            <li>
              <Link to="/our-team" onClick={() => setIsMenuOpen(false)}>
                Our Team
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
