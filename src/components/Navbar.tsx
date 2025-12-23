import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

const Navbar = () => {
  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-3">
          <img 
            src={logo} 
            alt="Idea Verdict" 
            className="h-10 md:h-12 w-auto"
            style={{ filter: 'hue-rotate(-10deg)' }}
          />
        </Link>

        <nav className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          {isDashboard ? (
            <Link to="/evaluate">
              <Button variant="default" size="sm" className="shadow-md hover:shadow-lg transition-shadow">
                + New Evaluation
              </Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button variant="default" size="sm" className="shadow-md hover:shadow-lg transition-shadow">
                Sign In
              </Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
