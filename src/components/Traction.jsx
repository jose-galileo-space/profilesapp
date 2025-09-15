import React, { useState } from "react";
import Navbar from "./Navbar.jsx";
export default function TractionPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };
  return (
    <div>
      <Navbar
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        toggleMenu={toggleMenu}
      />
      <h1>Traction Page</h1>
    </div>
  );
}
