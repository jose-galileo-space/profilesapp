import React from "react";
import "./LearnMore.css";
import satelliteImage1 from "../assets/satellite_image_1.png";
import blueStars from "../assets/satellite_image_2.png";
import anzacSpace from "../assets/satellite_image_4.png";
import nightSkyBw from "../assets/satellite_image_5.png";

export default function LearnMore() {
  return (
    <div className="learn-more-page">
      <div className="content-section">
        <div className="content-card">
          <h2 className="section-title">
            High-resolution Earth imagery delivered with unmatched speed.
          </h2>
          <p className="section-subtitle">
            Next-generation Earth imaging constellation in Very Low Earth Orbit
            (VLEO).
          </p>

          <div className="section-container">
            <div className="section-card">
              <div className="section-image-container">
                <img
                  src={satelliteImage1}
                  alt="A diverse team of people collaborating"
                  className="section-image"
                />
              </div>
              <div className="section-content">
                <h3 className="sub-section-title">Who We Are</h3>
                <p className="section-text">
                  Galileo Space is a team of proven aerospace engineers and
                  innovators building the next generation of Earth imaging from
                  Very Low Earth Orbit (VLEO). We are united by one mission: to
                  push the boundaries of what’s possible in space imaging and
                  make it accessible in real time.
                </p>
              </div>
            </div>

            <div className="section-card section-card-portrait">
              <div className="section-image-container">
                <img
                  src={blueStars}
                  alt="A rocket launching into space"
                  className="section-image section-image-portrait"
                />
              </div>
              <div className="section-content">
                <h3 className="sub-section-title">What We Do</h3>
                <ul className="section-text">
                  <li>
                    <b>Design & Build:</b> Our optical experts design custom
                    high-resolution payloads, paired with tailored spacecraft
                    buses.
                  </li>
                  <li>
                    <b>Integration & Testing:</b> We manage full Space Vehicle
                    integration and rigorous testing on the ground and in orbit.
                  </li>
                  <li>
                    <b>Delivery:</b> From capture to downlink, we ensure images
                    reach end users in minutes, not days.
                  </li>
                </ul>
              </div>
            </div>

            <div className="section-card">
              <div className="section-image-container">
                <img
                  src={anzacSpace}
                  alt="A satellite orbiting the Earth"
                  className="section-image section-image-portrait"
                />
              </div>
              <div className="section-content">
                <h3 className="sub-section-title">Why Galileo</h3>
                <ul className="section-text">
                  <li>
                    <b>Sub-30 cm Resolution:</b> Sharper imagery than most
                    commercial providers.
                  </li>
                  <li>
                    <b>Speed:</b> Near real-time tasking and delivery.
                  </li>
                  <li>
                    <b>Affordability:</b> Lean, cost-efficient architecture
                    built on COTS technology.
                  </li>
                </ul>
              </div>
            </div>

            <div className="section-card">
              <div className="section-image-container">
                <img
                  src={nightSkyBw}
                  alt="Conceptual drawing of a futuristic city"
                  className="section-image"
                />
              </div>
              <div className="section-content">
                <h3 className="sub-section-title">The Future</h3>
                <p className="section-text">
                  We are shaping a world where ultra-high-resolution imagery is
                  delivered on demand. With every mission, we refine spacecraft
                  performance, partner closely with bus providers on advanced
                  attitude and orbit control, and bring our customers closer to
                  seeing Earth in real time.
                </p>
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
