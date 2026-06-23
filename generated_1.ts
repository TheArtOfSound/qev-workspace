import { useState } from "react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  nextStep: () => void;
  previousStep: () => void;
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: "step-1",
    title: "Welcome to QEV Workspace",
    description: "This is a secure workspace for collaboration and communication.",
    nextStep: () => console.log("Next step"),
    previousStep: () => console.log("Previous step"),
  },
  {
    id: "step-2",
    title: "Getting Started",
    description: "To get started, please create a new workspace or join an existing one.",
    nextStep: () => console.log("Next step"),
    previousStep: () => console.log("Previous step"),
  },
  {
    id: "step-3",
    title: "Security",
    description: "Your workspace is secure and encrypted. Only authorized users can access it.",
    nextStep: () => console.log("Next step"),
    previousStep: () => console.log("Previous step"),
  },
];

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(onboardingSteps[0]);

  const handleNextStep = () => {
    const nextStepIndex = onboardingSteps.indexOf(currentStep) + 1;
    if (nextStepIndex < onboardingSteps.length) {
      setCurrentStep(onboardingSteps[nextStepIndex]);
    }
  };

  const handlePreviousStep = () => {
    const previousStepIndex = onboardingSteps.indexOf(currentStep) - 1;
    if (previousStepIndex >= 0) {
      setCurrentStep(onboardingSteps[previousStepIndex]);
    }
  };

  return (
    <div>
      <h2>{currentStep.title}</h2>
      <p>{currentStep.description}</p>
      <button onClick={handlePreviousStep}>Previous</button>
      <button onClick={handleNextStep}>Next</button>
    </div>
  );
};

export default Onboarding;
