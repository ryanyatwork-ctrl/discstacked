import { Link } from "react-router-dom";

export function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="w-full border-t border-border bg-background/80 backdrop-blur-sm py-4 px-4">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>© {year} DiscStacked™. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <a href="mailto:support@discstacked.app" className="hover:text-foreground transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  );
}
