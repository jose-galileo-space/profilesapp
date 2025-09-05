import { Link } from "react-router-dom"; // Import Link for navigation
import { Heading, Flex, Text, View } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import "@aws-amplify/ui-react/styles.css";
import "./App.css"; 
import outputs from "../amplify_outputs.json";

Amplify.configure(outputs);

export default function App() {

  return (
    <View className="hero-container">
      <Flex
        direction="column"
        justifyContent="center"
        alignItems="center"
        textAlign="center"
        height="100%"
      >
        <Heading level={1} className="fade-in-text hero-title">
          Galileo Space
        </Heading>
        <Link to="/learn-more" className="learn-more-link">
          <Text>learn more</Text>
        </Link>
      </Flex>
    </View>
  );
}
