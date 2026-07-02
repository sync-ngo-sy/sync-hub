import { useState, useEffect } from "react";

type AnimatedPlaceholderProps = {
  placeholders: string[];
};

export function AnimatedPlaceholder({ placeholders }: AnimatedPlaceholderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [placeholders.length]);

  return (
    <span className="relative inline-block h-6 overflow-hidden align-middle w-64 pointer-events-none select-none">
      {placeholders.map((text, i) => (
        <span
          key={text}
          className="absolute inset-0 transition-all duration-500 ease-in-out text-[var(--text-muted)] font-medium text-base whitespace-nowrap flex items-center"
          style={{
            opacity: i === currentIndex ? 0.9 : 0,
            transform:
              i === currentIndex
                ? "translateY(0)"
                : i < currentIndex
                  ? "translateY(-100%)"
                  : "translateY(100%)",
          }}
        >
          {text}
        </span>
      ))}
    </span>
  );
}
