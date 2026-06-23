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
          {/* rest of the app content */}
        </div>
      )}
    </div>
  );
};

export default App;
