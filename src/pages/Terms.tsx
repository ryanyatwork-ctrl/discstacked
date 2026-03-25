import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppFooter } from "@/components/AppFooter";

export default function Terms() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Terms of Service</h1>
        </div>
      </header>
      <main className="flex-1 max-w-2xl mx-auto px-4 py-8 prose prose-sm prose-invert">
        <h2 className="text-foreground">Terms of Service</h2>
        <p className="text-muted-foreground text-sm">Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>

        <h3 className="text-foreground text-base mt-6">1. Acceptance of Terms</h3>
        <p className="text-muted-foreground text-sm">By accessing or using DiscStacked™, you agree to be bound by these Terms of Service. If you do not agree, please do not use the service.</p>

        <h3 className="text-foreground text-base mt-6">2. Description of Service</h3>
        <p className="text-muted-foreground text-sm">DiscStacked™ is a web-based application for cataloging and managing personal physical media collections including movies, music, books, and games.</p>

        <h3 className="text-foreground text-base mt-6">3. User Accounts</h3>
        <p className="text-muted-foreground text-sm">You are responsible for maintaining the confidentiality of your account credentials. You agree to accept responsibility for all activities that occur under your account.</p>

        <h3 className="text-foreground text-base mt-6">4. User Content</h3>
        <p className="text-muted-foreground text-sm">You retain ownership of your collection data. By using the service, you grant DiscStacked™ a limited license to store and display your data for the purpose of providing the service.</p>

        <h3 className="text-foreground text-base mt-6">5. Prohibited Uses</h3>
        <p className="text-muted-foreground text-sm">You may not use the service for any unlawful purpose, to transmit harmful content, or to attempt to gain unauthorized access to any part of the service.</p>

        <h3 className="text-foreground text-base mt-6">6. Intellectual Property</h3>
        <p className="text-muted-foreground text-sm">DiscStacked™ and its logo are trademarks. All content, features, and functionality are owned by DiscStacked and are protected by copyright and trademark laws.</p>

        <h3 className="text-foreground text-base mt-6">7. Disclaimer</h3>
        <p className="text-muted-foreground text-sm">The service is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free operation.</p>

        <h3 className="text-foreground text-base mt-6">8. Limitation of Liability</h3>
        <p className="text-muted-foreground text-sm">DiscStacked™ shall not be liable for any indirect, incidental, or consequential damages arising from the use of the service.</p>

        <h3 className="text-foreground text-base mt-6">9. Changes to Terms</h3>
        <p className="text-muted-foreground text-sm">We reserve the right to modify these terms at any time. Continued use of the service constitutes acceptance of updated terms.</p>

        <h3 className="text-foreground text-base mt-6">10. Contact</h3>
        <p className="text-muted-foreground text-sm">For questions about these Terms, contact us at <a href="mailto:support@discstacked.app" className="text-primary hover:underline">support@discstacked.app</a>.</p>
      </main>
      <AppFooter />
    </div>
  );
}
