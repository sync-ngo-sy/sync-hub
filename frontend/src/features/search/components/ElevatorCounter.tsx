type ElevatorCounterProps = {
  value: number;
  className?: string;
};

export function ElevatorCounter({ value, className = "" }: ElevatorCounterProps) {
  const digits = String(value).split("");

  return (
    <span className={`inline-flex overflow-hidden h-4 items-center ${className}`}>
      {digits.map((digit, idx) => {
        const isNum = !isNaN(Number(digit));
        if (!isNum) {
          return <span key={idx}>{digit}</span>;
        }
        return (
          <span key={idx} className="relative w-[0.65em] h-4 overflow-hidden inline-block">
            <span
              className="absolute left-0 right-0 flex flex-col transition-transform duration-500 ease-in-out"
              style={{ transform: `translateY(-${Number(digit) * 10}%)`, top: 0 }}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <span key={n} className="h-4 flex items-center justify-center select-none font-bold">
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
