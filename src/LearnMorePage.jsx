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
            About Us
          </h2>
          <p className="section-subtitle">
            We are passionate about creating solutions that make a difference.
          </p>

          <div className="grid-container">
            {/* Mission Section */}
            <div className="grid-item">
              <h3 className="sub-section-title">
                Our Mission
              </h3>
              <p className="section-text">
                Our mission is to empower individuals and businesses with innovative, reliable, and user-friendly technology. We believe in harnessing the power of code to solve real-world problems and make daily life more efficient and enjoyable.
              </p>
            </div>
            {/* Team Image */}
            <div className="team-image-container">
              <img 
                src="https://placehold.co/600x400/E5E7EB/6B7280?text=Team" 
                alt="Our Team" 
                className="team-image" 
              />
            </div>

            {/* Vision Section */}
            <div className="vision-section">
              <h3 className="sub-section-title">
                Our Vision
              </h3>
              <p className="section-text">
                We envision a future where technology is seamlessly integrated into every aspect of life, enhancing productivity and connectivity. We strive to be a leader in our industry, known for our commitment to quality, integrity, and customer satisfaction.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p className="footer-text">&copy; {new Date().getFullYear()} Your Company Name. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}