'use client';

import HeroSection from './HeroSection';
import InfoButtons from './InfoButtons';
import NutritionEvaluation from './NutritionEvaluation';
import Functionalities from './Functionalities';
import ContactSection from './ContactSection';

export default function HomePage() {
  return (
    <div className="index-main">
      <HeroSection />
      <InfoButtons />
      <NutritionEvaluation />
      <Functionalities />
      <ContactSection />
    </div>
  );
}

