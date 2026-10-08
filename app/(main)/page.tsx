import type { Metadata } from 'next';
import Hero from '@/components/common/Hero';
import Footer from '@/components/common/Footer';
import {
  FinalMatchCta,
  LandingBenefits,
  LandingHowToUse,
  MatchingComparison,
  MatchTestPromo,
  ServiceJourney,
  TrustSafety,
} from '@/components/landing/LandingSections';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
};

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="flex-grow">
        <Hero />
        <section id="about" className="bg-white">
          <LandingBenefits />
        </section>
        <MatchTestPromo />
        <ServiceJourney />
        <MatchingComparison />
        <TrustSafety />
        <LandingHowToUse />
        <FinalMatchCta />
      </main>
      <Footer />
    </div>
  );
}
