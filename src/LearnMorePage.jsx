import "./LearnMorePage.css";
import galileoLogo from "./assets/galileo-logo.svg";

export default function LearnMorePage() {
  return (
    <div className="learn-more-page">
      {/* Navbar Section */}
      <nav className="navbar">
        <div className="container">
          <div className="navbar-logo-container">
            <img src={galileoLogo} alt="Company Logo" className="logo-img" />
            <h1 className="company-name">Galileo Space</h1>
          </div>
          {/* You can add navigation links here if needed */}
        </div>
      </nav>

      {/* Main Content Section */}
      <div className="content-section">
        <div className="content-card">
          <h2 className="section-title">
            High-resolution Earth imagery, delivered with unmatched speed and
            affordability.
          </h2>
          <p className="section-subtitle">
            Next-generation Earth imaging constellation in Very Low Earth Orbit
            (VLEO).
          </p>
          <div className="grid-container">
            {/* Mission Section */}
            <div className="grid-item">
              <h3 className="sub-section-title">Our Mission</h3>
              <p className="section-text">
                Our mission is to provide high-resolution Earth imagery with
                unprecedented speed and affordability. We aim to revolutionize
                the way geospatial data is collected and utilized, empowering
                businesses, governments, and researchers with timely and
                accurate information.
              </p>
            </div>
            {/* Vision Section */}
            <div className="vision-section">
              <h3 className="sub-section-title">Our Vision</h3>
              <p className="section-text">
                We envision ourselves as being a VLEO-first company, leading the
                way in deploying and operating satellites in Very Low Earth
                Orbit. By harnessing the unique advantages of VLEO, we strive to
                deliver imagery and data solutions that set new standards for
                clarity, speed, and accessibility across the globe.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
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
