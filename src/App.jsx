import { Link } from "react-router-dom"; // Import Link for navigation
import { Button, Heading, Flex, Text, View } from "@aws-amplify/ui-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import "@aws-amplify/ui-react/styles.css";
import "./App.css"; // We'll create this file for our custom styles
import outputs from "../amplify_outputs.json";

Amplify.configure(outputs);

export default function App() {
  const { signOut, user } = useAuthenticator((context) => [context.user]);

  return (
    <View className="hero-container">
      {user && (
        <Flex position="absolute" top="20px" right="20px">
          <Button onClick={signOut} variation="primary">
            Sign Out
          </Button>
        </Flex>
      )}

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

        {/* The clickable "learn more" text */}
        <Link to="/learn-more" className="learn-more-link">
          <Text fontSize="1.2rem">learn more</Text>
        </Link>
      </Flex>
    </View>
  );
}
