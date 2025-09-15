import React, { useState } from "react";
import { Heading, Flex, Text, View } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import "@aws-amplify/ui-react/styles.css";
import "./App.css";
import outputs from "../amplify_outputs.json";
import Navbar from "./components/Navbar.jsx";

Amplify.configure(outputs);

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };
  return (
    <>
      <View className="hero-container">
        <Flex
          direction="column"
          justifyContent="center"
          alignItems="center"
          textAlign="center"
          height="100%"
          width="100%"
        >
          <Heading level={1} className="fade-in-text hero-title">
            Galileo Space
          </Heading>
          <Text className="learn-more-link">learn more</Text>
        </Flex>
      </View>

      <div className="learn-more-page">
        <Navbar
          isMenuOpen={isMenuOpen}
          setIsMenuOpen={setIsMenuOpen}
          toggleMenu={toggleMenu}
        />

        <div className="content-section">
          <div className="content-card">
            <h2 className="section-title">
              High-resolution Earth imagery delivered with unmatched speed.
            </h2>
            <p className="section-subtitle">
              Next-generation Earth imaging constellation in Very Low Earth
              Orbit (VLEO).
            </p>
            <div className="grid-container">
              <div className="grid-item">
                <h3 className="sub-section-title">Who We Are</h3>
                <p className="section-text">
                  Galileo Space is a team of proven aerospace engineers and
                  innovators building the next generation of Earth imaging from
                  Very Low Earth Orbit (VLEO). We are united by one mission: to
                  push the boundaries of what’s possible in space imaging and
                  make it accessible in real time.
                </p>
              </div>
              <div className="grid-item">
                <h3 className="sub-section-title">What We Do</h3>
                <ul className="section-text">
                  <li>
                    <b>Design & Build:</b> Our optical experts design custom
                    high-resolution payloads, paired with tailored spacecraft
                    buses.
                  </li>
                  <li>
                    <b>Integration & Testing:</b> We manage full spacecraft
                    integration and rigorous testing on the ground and in orbit.
                  </li>
                  <li>
                    <b>Delivery:</b> From capture to downlink, we ensure images
                    reach end users in minutes, not days.
                  </li>
                </ul>
              </div>
              <div className="vision-section">
                <h3 className="sub-section-title">Why Galileo</h3>
                <ul className="section-text">
                  <li>
                    <b>Sub-30 cm Resolution:</b>Sharper imagery than most
                    commercial providers.
                  </li>
                  <li>
                    <b>Speed:</b> Near real-time tasking and delivery.
                  </li>
                  <li>
                    <b>Affordability:</b>Lean, cost-efficient architecture built
                    on COTS technology.
                  </li>
                </ul>
              </div>
              <div className="vision-section">
                <h3 className="sub-section-title">The Future</h3>
                <ul className="section-text">
                  We are shaping a world where ultra-high-resolution imagery is
                  delivered on demand. With every mission, we refine spacecraft
                  performance, partner closely with bus providers on advanced
                  attitude and orbit control, and bring our customers closer to
                  seeing Earth in real time.
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
    </>
  );
}
