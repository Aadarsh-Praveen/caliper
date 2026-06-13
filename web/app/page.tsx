import TopNav from "./components/TopNav";
import Hero from "./components/Hero";
import FeatureRow from "./components/FeatureRow";
import SoundSection from "./components/SoundSection";
import StorySection from "./components/StorySection";
import SpecsTable from "./components/SpecsTable";
import Testimonials from "./components/Testimonials";
import FinalCTA from "./components/FinalCTA";
import Footer from "./components/Footer";
import PageIntro from "./components/PageIntro";
import CaliperDevPanel from "@/lib/caliper/CaliperDevPanel";
import ScrollDepthTracker from "./components/ScrollDepthTracker";

export default function Home() {
  return (
    <main>
      <PageIntro />
      <TopNav />
      <Hero />
      <FeatureRow />
      <SoundSection />
      <StorySection />
      <SpecsTable />
      <Testimonials />
      <FinalCTA />
      <Footer />
      <ScrollDepthTracker />
      <CaliperDevPanel />
    </main>
  );
}
