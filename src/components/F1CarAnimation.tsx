import { useState, useEffect } from "react";

const F1CarAnimation = () => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 7500);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10" aria-hidden="true">
      <div className="f1-car-animation absolute top-[40%] md:top-[35%]">
        <svg
          width="120"
          height="40"
          viewBox="0 0 120 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-20 h-auto md:w-28 lg:w-32 opacity-60"
        >
          {/* F1 Car Silhouette */}
          <path
            d="M5 28C5 28 8 26 12 26H18L22 20H35L40 18H55L60 14H75L85 12H100L110 14L115 18L112 24L105 26H95L92 28H75L72 26H55L52 28H35L30 26H18L12 28H5Z"
            fill="hsl(168 60% 42%)"
          />
          {/* Front Wing */}
          <path
            d="M2 30L8 28L12 30L8 32L2 30Z"
            fill="hsl(168 60% 42%)"
          />
          {/* Rear Wing */}
          <path
            d="M110 10L118 8L118 16L110 14V10Z"
            fill="hsl(168 60% 42%)"
          />
          {/* Front Wheel */}
          <circle cx="25" cy="30" r="6" fill="hsl(168 50% 25%)" />
          <circle cx="25" cy="30" r="3" fill="hsl(168 60% 42%)" />
          {/* Rear Wheel */}
          <circle cx="90" cy="30" r="7" fill="hsl(168 50% 25%)" />
          <circle cx="90" cy="30" r="3.5" fill="hsl(168 60% 42%)" />
          {/* Cockpit */}
          <ellipse cx="65" cy="16" rx="8" ry="4" fill="hsl(168 50% 30%)" />
        </svg>
      </div>
    </div>
  );
};

export default F1CarAnimation;
