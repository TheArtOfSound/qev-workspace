import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import OnboardingScreen from './onboarding';

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<OnboardingScreen />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
