import type { Metadata } from 'next';
import Hero from '@/components/common/Hero';
import Footer from '@/components/common/Footer';
import BalanceGame from '@/components/landing/BalanceGame';
import {
  CoreApproach,
  FinalSignupCta,
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
    <div className="flex min-h-screen flex-col bg-[#FFFDF8]">
      <main className="flex-grow">
        <Hero />
        <CoreApproach />
        <MatchTestPromo />
        <BalanceGame />
        <ServiceJourney />
        <TrustSafety />
        <FinalSignupCta />
      </main>
      <Footer />
    </div>
  );
}
