import React from "react";
import { Link, useLocation } from "react-router-dom";

import "./Navbar.css";

const ASSET_URL = "https://d3nqo9yfgbco5y.cloudfront.net";
const galileoLogo = `${ASSET_URL}/galileo-logo.svg`;
const navLinks = [
  { path: "/", name: "Home" },
  { path: "/dashboard", name: "Dashboard" },
  { path: "/traction", name: "Traction" },
  { path: "/our-team", name: "Our Team" },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-logo-container">
          <Link to="/">
            <img src={galileoLogo} alt="Company Logo" className="logo-img" />
          </Link>
          <h1 className="company-name">Galileo Space</h1>
        </div>
        <div className="nav-links">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`nav-link ${location.pathname === link.path ? "active-link" : ""}`}
            >
              {link.name}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
