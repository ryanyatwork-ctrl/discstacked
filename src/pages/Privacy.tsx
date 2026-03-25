import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppFooter } from "@/components/AppFooter";

export default function Privacy() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Privacy Policy</h1>
        </div>
      </header>
      <main className="flex-1 max-w-2xl mx-auto px-4 py-8 prose prose-sm prose-invert">
        <h2 className="text-foreground">Privacy Policy</h2>
        <p className="text-muted-foreground text-sm">Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>

        <h3 className="text-foreground text-base mt-6">1. Information We Collect</h3>
        <p className="text-muted-foreground text-sm">We collect your email address for account creation, and the media collection data you choose to enter into the service.</p>

        <h3 className="text-foreground text-base mt-6">2. How We Use Your Information</h3>
        <p className="text-muted-foreground text-sm">Your information is used solely to provide and improve the DiscStacked™ service, including storing your collection data and enabling sharing features you opt into.</p>

        <h3 className="text-foreground text-base mt-6">3. Data Storage</h3>
        <p className="text-muted-foreground text-sm">Your data is stored securely using industry-standard encryption and hosting practices. We do not sell your personal information to third parties.</p>

        <h3 className="text-foreground text-base mt-6">4. Third-Party Services</h3>
        <p className="text-muted-foreground text-sm">We use third-party APIs (TMDB, Discogs, IGDB, etc.) to fetch metadata for your collection items. These services have their own privacy policies.</p>

        <h3 className="text-foreground text-base mt-6">5. Cookies & Analytics</h3>
        <p className="text-muted-foreground text-sm">We use Google Analytics to understand usage patterns. No personally identifiable information is shared with analytics providers.</p>

        <h3 className="text-foreground text-base mt-6">6. Data Sharing</h3>
        <p className="text-muted-foreground text-sm">Your collection data is private by default. If you enable sharing, only the collections you explicitly choose will be visible via your unique share link.</p>

        <h3 className="text-foreground text-base mt-6">7. Data Deletion</h3>
        <p className="text-muted-foreground text-sm">You may delete your account and all associated data at any time by contacting <a href="mailto:support@discstacked.app" className="text-primary hover:underline">support@discstacked.app</a>.</p>

        <h3 className="text-foreground text-base mt-6">8. Changes to This Policy</h3>
        <p className="text-muted-foreground text-sm">We may update this policy from time to time. We will notify users of significant changes via the application.</p>

        <h3 className="text-foreground text-base mt-6">9. Contact</h3>
        <p className="text-muted-foreground text-sm">For privacy concerns, contact us at <a href="mailto:support@discstacked.app" className="text-primary hover:underline">support@discstacked.app</a>.</p>
      </main>
      <AppFooter />
    </div>
  );
}
