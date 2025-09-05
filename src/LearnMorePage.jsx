// src/LearnMorePage.js

import { Heading, Flex, Text, Button } from '@aws-amplify/ui-react';
import { Link } from 'react-router-dom';
import '@aws-amplify/ui-react/styles.css';

export default function LearnMorePage() {
  return (
    <Flex
      direction="column"
      justifyContent="center"
      alignItems="center"
      height="100vh"
      gap="2rem"
      padding="2rem"
    >
      <Heading level={1}>About Galileo Space</Heading>
      <Text>
        This is the page where you can learn more about our mission to explore the cosmos.
      </Text>
      <Link to="/">
        <Button variation="primary">Go Back Home</Button>
      </Link>
    </Flex>
  );
}