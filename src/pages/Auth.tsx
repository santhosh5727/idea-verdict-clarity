import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";

const Auth = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Get the intended destination or default to /evaluate
  const from = (location.state as { from?: string })?.from || "/evaluate";

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Missing fields",
        description: "Please enter both email and password.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes("already registered")) {
            toast({
              title: "Account exists",
              description: "This email is already registered. Please sign in instead.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Sign up failed",
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Account created",
            description: "You have been signed in successfully.",
          });
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast({
              title: "Invalid credentials",
              description: "Please check your email and password.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Sign in failed",
              description: error.message,
              variant: "destructive",
            });
          }
        }
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left Panel - Form */}
      <div className="flex flex-col justify-center px-6 py-12 lg:px-12 xl:px-20 bg-gradient-to-br from-primary/5 via-background to-background">
        <div className="mx-auto w-full max-w-md">
          {/* Logo */}
          <div className="mb-10 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <img 
                src={logo} 
                alt="Idea Verdict" 
                className="h-12 w-auto"
                style={{ filter: 'hue-rotate(-10deg)' }}
              />
            </Link>
          </div>

          {/* Heading */}
          <h1 className="mb-2 text-2xl font-bold text-foreground">
            {isSignUp ? "Create an account" : "Welcome back"}
          </h1>
          <p className="mb-8 text-muted-foreground">
            {isSignUp ? "Sign up to start evaluating your ideas" : "Sign in to continue evaluating your ideas"}
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-10 border-border/60 focus:border-primary/50"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-foreground">
                  Password
                </label>
                {!isSignUp && (
                  <a href="#" className="text-sm text-primary hover:underline font-medium">
                    Forgot password?
                  </a>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={isSignUp ? "Create a password" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pl-10 pr-10 border-border/60 focus:border-primary/50"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {!isSignUp && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  className="border-border/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <label htmlFor="remember" className="text-sm text-muted-foreground">
                  Remember me for 30 days
                </label>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-11 rounded-lg shadow-md hover:shadow-lg transition-all" 
              variant="default"
              disabled={isLoading}
            >
              {isLoading ? "Please wait..." : (isSignUp ? "Sign up →" : "Sign in →")}
            </Button>
          </form>

          {/* Toggle Sign Up / Sign In */}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {isSignUp ? (
              <>
                Already have an account?{" "}
                <button 
                  onClick={() => setIsSignUp(false)} 
                  className="font-medium text-primary hover:underline"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <button 
                  onClick={() => setIsSignUp(true)} 
                  className="font-medium text-primary hover:underline"
                >
                  Sign up for free
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Right Panel - Branding */}
      <div className="hidden lg:flex flex-col justify-center bg-gradient-to-br from-primary/15 via-primary/8 to-background px-12 xl:px-20">
        <div className="mx-auto max-w-lg text-center">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
              <span className="text-3xl font-bold text-primary-foreground">IV</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground">Idea Verdict</h2>
            <p className="mt-2 text-muted-foreground">Know if your startup idea deserves to exist</p>
          </div>

          {/* Stats */}
          <div className="mb-10 flex justify-center gap-10">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">12K+</p>
              <p className="text-sm text-muted-foreground">Ideas Evaluated</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">89%</p>
              <p className="text-sm text-muted-foreground">Accuracy Rate</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">4.8/5</p>
              <p className="text-sm text-muted-foreground">User Rating</p>
            </div>
          </div>

          {/* Features */}
          <div className="space-y-4 text-left">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="mt-1 h-3 w-3 rounded-full bg-primary flex-shrink-0 shadow-sm" />
              <div>
                <p className="font-medium text-foreground">Opinionated Analysis</p>
                <p className="text-sm text-muted-foreground">No sugar-coating, just honest verdicts</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="mt-1 h-3 w-3 rounded-full bg-primary flex-shrink-0 shadow-sm" />
              <div>
                <p className="font-medium text-foreground">Quick Decisions</p>
                <p className="text-sm text-muted-foreground">Get clarity in minutes, not months</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="mt-1 h-3 w-3 rounded-full bg-primary flex-shrink-0 shadow-sm" />
              <div>
                <p className="font-medium text-foreground">Actionable Insights</p>
                <p className="text-sm text-muted-foreground">Clear next steps to strengthen your idea</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
