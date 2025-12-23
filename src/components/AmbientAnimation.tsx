const AmbientAnimation = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Subtle horizontal line */}
      <div className="absolute top-1/2 left-0 right-0 flex items-center justify-center">
        <div 
          className="ambient-line h-px w-full max-w-md bg-gradient-to-r from-transparent via-primary/30 to-transparent"
        />
      </div>
      
      {/* Soft glowing dots */}
      <div className="absolute top-1/3 left-1/4 hidden md:block">
        <div className="ambient-glow h-2 w-2 rounded-full bg-primary/20 blur-sm" />
      </div>
      <div className="absolute bottom-1/3 right-1/4 hidden md:block" style={{ animationDelay: '4s' }}>
        <div className="ambient-glow h-1.5 w-1.5 rounded-full bg-primary/15 blur-sm" />
      </div>
    </div>
  );
};

export default AmbientAnimation;
