import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const OnboardingScreen = () => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prevStep) => prevStep + 1);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleNextStep = () => {
    if (step === 2) {
      navigate('/dashboard');
    } else {
      setStep((prevStep) => prevStep + 1);
    }
  };

  return (
    <div className="onboarding-screen">
      <h1>Onboarding Screen</h1>
      {step === 0 && (
        <div>
          <h2>Welcome!</h2>
          <p>Please enter your name:</p>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      {step === 1 && (
        <div>
          <h2>Next step!</h2>
          <p>Please enter your email:</p>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      )}
      {step === 2 && (
        <div>
          <h2>Final step!</h2>
          <p>Thank you for completing the onboarding process!</p>
          <button onClick={handleNextStep}>Continue</button>
        </div>
      )}
    </div>
  );
};

export default OnboardingScreen;
