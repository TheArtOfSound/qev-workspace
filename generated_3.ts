import React from "react";
import Onboarding from "./onboarding";

const App = () => {
  const [showOnboarding, setShowOnboarding] = React.useState(true);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  return (
    <div>
      {showOnboarding ? (
        <Onboarding onboardingComplete={handleOnboardingComplete} />
      ) : (
        <div>
          <h1>Welcome to QEV Workspace</h1>
          <p>This is a secure workspace for collaboration and communication.</p>
          <button onClick={handleOnboardingComplete}>Get Started</button>
        </div>
      )}
    </div>
  );
};

export default App;
