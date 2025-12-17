import { useState } from "react";
import { Heading, Flex, Text, View } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import "@aws-amplify/ui-react/styles.css";
import "./App.css";
import outputs from "../amplify_outputs.json";
import LearnMore from "./components/LearnMore";
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
        <Navbar
          isMenuOpen={isMenuOpen}
          setIsMenuOpen={setIsMenuOpen}
          toggleMenu={toggleMenu}
        />
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
          <div className="scroll-down-arrow"></div>
        </Flex>
      </View>
      <LearnMore />
    </>
  );
}
